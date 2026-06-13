import { Injectable, Inject, BadRequestException } from "@nestjs/common";
import { YAAAServerClient } from "@aastar/airaccount/server";
import { YAAA_SERVER_CLIENT } from "../sdk/sdk.providers";
import { AddressBookService } from "./address-book.service";
import { ExecuteTransferDto } from "./dto/execute-transfer.dto";
import { EstimateGasDto } from "./dto/estimate-gas.dto";

@Injectable()
export class TransferService {
  constructor(
    @Inject(YAAA_SERVER_CLIENT) private client: YAAAServerClient,
    private addressBookService: AddressBookService
  ) {}

  async executeTransfer(userId: string, transferDto: ExecuteTransferDto) {
    if (!transferDto.passkeyAssertion) {
      throw new BadRequestException("Passkey assertion is required for transactions");
    }

    // PMv4 requires the ERC-20 gas token address appended to paymasterData.
    // Its contract has no token() getter so we supply it explicitly.
    const PMV4_ADDRESS = "0xd0c82dc12b7d65b03df7972f67d13f1d33469a98";
    const APNTS_TOKEN = "0xDf669834F04988BcEE0E3B6013B6b867Bd38778d";
    const paymasterTokenAddress =
      transferDto.paymasterAddress?.toLowerCase() === PMV4_ADDRESS ? APNTS_TOKEN : undefined;

    // Pass the Legacy assertion through to the SDK, which forwards it
    // to BLSSignatureService → ISignerAdapter → KmsSigner → KMS SignHash.
    // The Legacy format is reusable, enabling the two ECDSA signs needed for BLS.
    //
    // useAirAccountTiering: true enables Tier 1/2/3 routing based on transfer amount.
    //   Tier 1 (<= tier1Limit): single passkey (P-256) signature
    //   Tier 2 (<= tier2Limit): P-256 + BLS dual signature
    //   Tier 3 (> tier2Limit):  P-256 + BLS + guardian ECDSA triple signature
    //
    // If the BLS seed node (https://v1.aastar.io) is unreachable the SDK will throw;
    // we catch that here and degrade gracefully to a legacy BLS-only path so the
    // transfer can still proceed.
    let result: Awaited<ReturnType<typeof this.client.transfers.executeTransfer>>;
    try {
      result = await this.client.transfers.executeTransfer(userId, {
        to: transferDto.to,
        amount: transferDto.amount,
        data: transferDto.data,
        tokenAddress: transferDto.tokenAddress,
        usePaymaster: transferDto.usePaymaster,
        paymasterAddress: transferDto.paymasterAddress,
        paymasterData: transferDto.paymasterData,
        paymasterTokenAddress,
        passkeyAssertion: transferDto.passkeyAssertion,
        p256Signature: transferDto.p256Signature,
        useAirAccountTiering: true,
      });
    } catch (tieringError: unknown) {
      const msg = tieringError instanceof Error ? tieringError.message : String(tieringError);
      // Detect BLS seed-node connectivity issues and fall back to legacy BLS path.
      // Known error patterns: ECONNREFUSED, ENOTFOUND, fetch failed, timeout, ETIMEDOUT.
      const isBLSNodeError =
        /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network error|timeout/i.test(msg);
      if (isBLSNodeError) {
        console.warn(
          `[TransferService] BLS seed node unreachable (${msg}). ` +
            `Falling back to legacy BLS-only signing. ` +
            `To resolve, ensure the BLS node at https://v1.aastar.io is reachable.`
        );
        try {
          result = await this.client.transfers.executeTransfer(userId, {
            to: transferDto.to,
            amount: transferDto.amount,
            data: transferDto.data,
            tokenAddress: transferDto.tokenAddress,
            usePaymaster: transferDto.usePaymaster,
            paymasterAddress: transferDto.paymasterAddress,
            paymasterData: transferDto.paymasterData,
            paymasterTokenAddress,
            passkeyAssertion: transferDto.passkeyAssertion,
            // useAirAccountTiering omitted → legacy BLS path
          });
        } catch (fallbackError: unknown) {
          const fallbackMsg =
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          throw new Error(
            `Transfer failed on both tiered and legacy BLS paths. ` +
              `Tiering error: ${msg}. Legacy BLS error: ${fallbackMsg}`
          );
        }
      } else {
        // Re-throw non-connectivity errors (guard pre-check failures, etc.)
        throw tieringError;
      }
    }

    // Record in address book after successful submission (fire-and-forget)
    if (result.success && result.transferId) {
      this.recordAddressBookEntry(userId, transferDto.to, result.transferId).catch(err => {
        console.error("Failed to record transfer in address book:", err);
      });
    }

    return result;
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
