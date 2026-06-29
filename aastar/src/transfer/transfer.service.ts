import { Injectable, Inject, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AirAccountServerClient as YAAAServerClient,
  DvtPendingConfirmationError,
} from "@aastar/sdk/kms";
import { getCanonicalAddresses } from "@aastar/sdk/core";
import { YAAA_SERVER_CLIENT } from "../sdk/sdk.providers";
import { AddressBookService } from "./address-book.service";
import { PrepareTransferDto } from "./dto/prepare-transfer.dto";
import { SubmitTransferDto } from "./dto/submit-transfer.dto";
import { EstimateGasDto } from "./dto/estimate-gas.dto";

@Injectable()
export class TransferService {
  private readonly logger = new Logger(TransferService.name);

  constructor(
    @Inject(YAAA_SERVER_CLIENT) private client: YAAAServerClient,
    private addressBookService: AddressBookService,
    private configService: ConfigService
  ) {}

  /**
   * Phase 1 of the strict device-passkey transfer. The SDK builds the UserOp,
   * derives the tier-aware payload, calls KMS BeginAuthentication, and returns
   * `publicKeyOptions` whose `challenge` is ALREADY the WYSIWYS commitment over
   * the correct payload. We never compute commitChallenge or build the UserOp
   * ourselves — the SDK owns all of it. No passkey signature yet.
   */
  async prepareTransfer(userId: string, dto: PrepareTransferDto) {
    const paymasterTokenAddress = this.resolvePaymasterToken(dto);
    this.logger.log(
      `prepareTransfer: userId=${userId} to=${dto.to} amount=${dto.amount} ` +
        `token=${dto.tokenAddress || "ETH"} usePaymaster=${!!dto.usePaymaster}`
    );
    try {
      // useAirAccountTiering: true is REQUIRED here — a one-time device-passkey
      // ceremony assertion can only produce a single owner signature, which is
      // exactly what the tiered path needs. (Non-tiered legacy BLS dual-signing
      // cannot be prepared.)
      const prep = await this.client.transfers.prepareTransfer(userId, {
        to: dto.to,
        amount: dto.amount,
        data: dto.data,
        tokenAddress: dto.tokenAddress,
        usePaymaster: dto.usePaymaster,
        paymasterAddress: dto.paymasterAddress,
        paymasterData: dto.paymasterData,
        paymasterTokenAddress,
        useAirAccountTiering: true,
        // Tier-2/3 device-passkey path (#234): when the frontend's resolveTransfer says
        // this transfer is Tier-2/3, the on-chain factor is the device WebAuthn passkey
        // (algId 0x09/0x0a), so there is NO KMS owner ceremony — prepare returns no
        // challengeId/publicKeyOptions and the browser signs the userOpHash directly.
        // The SDK rejects this flag for Tier-1, so the frontend only sets it for tier>=2.
        useWebAuthnPasskey: dto.useWebAuthnPasskey === true,
      });
      // Hand the frontend exactly what the ceremony needs. publicKeyOptions.challenge
      // must be used verbatim (it is the SDK-computed commitment); challengeId is
      // paired back with the credential in submit. The passkey signs the commitment,
      // NOT the userOpHash. We also surface tier/requiredSigs/userOpHash so the UI
      // knows whether a guardian co-sign is needed (Tier 3) and what to sign for it.
      return {
        transferId: prep.transferId,
        challengeId: prep.challengeId,
        publicKeyOptions: prep.publicKeyOptions,
        tier: prep.tier,
        requiredSigs: prep.requiredSigs,
        userOpHash: prep.userOpHash,
      };
    } catch (err: any) {
      this.logger.error(`prepareTransfer FAILED: ${err?.message ?? err}`, err?.stack);
      throw err;
    }
  }

  /**
   * Phase 3: finish a prepared transfer with the browser ceremony assertion. The
   * credential signed the commitment prepareTransfer bound, so the KMS accepts it
   * under strict. The prepared handle is single-use and ~10min TTL; on failure the
   * frontend must prepareTransfer again.
   */
  async submitPreparedTransfer(userId: string, dto: SubmitTransferDto) {
    this.logger.log(`submitPreparedTransfer: userId=${userId} transferId=${dto.transferId}`);
    // Tier-3 only: the client already collected the guardian's co-signature over the
    // prepared userOpHash (self-hosted guardian). Wrap it as the SDK's GuardianSigner —
    // signMessage returns the pre-collected sig verbatim (the SDK asks for exactly the
    // userOpHash the guardian signed; no re-derivation drift per #143). Omitted for
    // Tier 1/2; if a Tier-3 transfer arrives without it, the SDK fail-fasts before gas.
    const guardianSigner = dto.guardianSignature
      ? { signMessage: async () => dto.guardianSignature as string }
      : undefined;

    let result: Awaited<ReturnType<typeof this.client.transfers.submitPreparedTransfer>>;
    try {
      if (dto.deviceWebAuthn) {
        // Tier-2/3 WebAuthn passkey path (#234): the browser ran ONE
        // navigator.credentials.get() with challenge = userOpHash. Forward the three
        // assertion fields verbatim — the frontend already normalised them to the
        // encodings packWebAuthnBlob expects (authenticatorData/signature as 0x-hex,
        // clientDataJSON as raw JSON text). The SDK derives the on-chain passkey factor,
        // fetches + aggregates the DVT BLS co-signatures, and packs the 0x09/0x0a
        // composite — no KMS owner ceremony, no manual packing here.
        result = await this.client.transfers.submitPreparedTransfer(userId, {
          transferId: dto.transferId,
          deviceWebAuthn: {
            authenticatorData: dto.deviceWebAuthn.authenticatorData as `0x${string}`,
            clientDataJSON: dto.deviceWebAuthn.clientDataJSON,
            signature: dto.deviceWebAuthn.signature as `0x${string}`,
          },
          ...(guardianSigner ? { guardianSigner } : {}),
        });
      } else {
        // Tier-1 KMS owner-ceremony path: the credential signed the WYSIWYS commitment
        // prepareTransfer bound, so the KMS accepts it under strict.
        result = await this.client.transfers.submitPreparedTransfer(userId, {
          transferId: dto.transferId,
          webAuthnAssertion: { ChallengeId: dto.challengeId, Credential: dto.credential },
          ...(guardianSigner ? { guardianSigner } : {}),
        });
      }
    } catch (err: any) {
      // Scheme 2: a DVT node withheld its co-signature on a high-value op pending out-of-band
      // approval. Don't 500 — return a structured pending result so the client can drive the
      // passkey-over-userOpHash confirmation (confirmationCredentialRequest → submitDvtConfirmation)
      // and then resubmit. Carries the userOpHash + the node to confirm against.
      if (err instanceof DvtPendingConfirmationError) {
        this.logger.log(
          `submitPreparedTransfer pending confirmation: userOpHash=${err.userOpHash}`
        );
        return {
          success: false,
          pendingConfirmation: true,
          userOpHash: err.userOpHash,
          nodeEndpoint: err.nodeEndpoint,
        };
      }
      // Surface the real KMS/BLS/bundler failure (#68 commitment, TTL expiry, tier
      // drift, etc.) instead of an opaque 500.
      this.logger.error(`submitPreparedTransfer FAILED: ${err?.message ?? err}`, err?.stack);
      throw err;
    }

    // Record in address book after successful submission (fire-and-forget).
    // The recipient comes from the SDK result (we don't have it in the submit body).
    if (result.success && result.transferId && result.to) {
      this.recordAddressBookEntry(userId, result.to, result.transferId).catch(err => {
        console.error("Failed to record transfer in address book:", err);
      });
    }

    return result;
  }

  /**
   * PMv4 requires the ERC-20 gas token appended to paymasterData. Its contract has
   * no token() getter, so we supply it explicitly from the SDK's canonical set for
   * the configured chain — never hardcoded. `canonical` is undefined for an
   * unsupported CHAIN_ID; guard so a misconfig surfaces as "no paymaster token"
   * rather than a TypeError (strictNullChecks is off, so tsc won't catch this).
   */
  private resolvePaymasterToken(dto: PrepareTransferDto): string | undefined {
    const canonical = getCanonicalAddresses(this.configService.get<number>("chainId") ?? 11155111);
    return canonical && dto.paymasterAddress?.toLowerCase() === canonical.paymasterV4?.toLowerCase()
      ? canonical.aPNTs
      : undefined;
  }

  async estimateGas(userId: string, estimateDto: EstimateGasDto) {
    return this.client.transfers.estimateGas(userId, {
      to: estimateDto.to,
      amount: estimateDto.amount,
      data: estimateDto.data,
      tokenAddress: (estimateDto as any).tokenAddress,
    });
  }

  async getTransferStatus(userId: string, transferId: string) {
    return this.client.transfers.getTransferStatus(userId, transferId);
  }

  async getTransferHistory(userId: string, page: number = 1, limit: number = 10) {
    return this.client.transfers.getTransferHistory(userId, page, limit);
  }

  private async recordAddressBookEntry(
    userId: string,
    to: string,
    transferId: string
  ): Promise<void> {
    try {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const status = await this.client.transfers.getTransferStatus(userId, transferId);
      if (status && (status as any).transactionHash) {
        await this.addressBookService.recordSuccessfulTransfer(
          userId,
          to,
          (status as any).transactionHash
        );
      }
    } catch {
      // Address book update is best-effort
    }
  }
}
