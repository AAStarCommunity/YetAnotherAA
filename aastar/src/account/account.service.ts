import { Injectable, Inject, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import {
  AirAccountServerClient as YAAAServerClient,
  ALG_ECDSA,
  ALG_P256,
  ALG_CUMULATIVE_T2,
  ALG_CUMULATIVE_T2_WA,
  ALG_CUMULATIVE_T3,
  ALG_CUMULATIVE_T3_WA,
} from "@aastar/sdk/kms";
import { YAAA_SERVER_CLIENT } from "../sdk/sdk.providers";
import { CreateAccountDto, EntryPointVersionDto } from "./dto/create-account.dto";
import {
  GuardianSetupPrepareDto,
  CreateWithGuardiansDto,
  CreateWithP256GuardiansDto,
  SubmitCreateWithPasskeyDto,
} from "./dto/guardian-setup.dto";
import { DatabaseService } from "../database/database.service";
import { ConfigService } from "@nestjs/config";
import { ethers } from "ethers";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    @Inject(YAAA_SERVER_CLIENT) private client: YAAAServerClient,
    private databaseService: DatabaseService,
    private configService: ConfigService
  ) {}

  /**
   * Converts an ETH amount string (e.g. "1.0") to wei as bigint.
   * Returns undefined when value is empty/zero (no guard enforcement).
   */
  private parseDailyLimitToWei(value: string | undefined): bigint | undefined {
    if (!value || parseFloat(value) <= 0) return undefined;
    try {
      return ethers.parseEther(value);
    } catch {
      throw new BadRequestException(
        `Invalid dailyLimit value: "${value}". Expected a valid ETH amount (e.g. "1.0").`
      );
    }
  }

  async createAccount(userId: string, createAccountDto: CreateAccountDto) {
    const versionDto = createAccountDto.entryPointVersion || EntryPointVersionDto.V0_6;

    const versionMap: Record<string, "0.6" | "0.7" | "0.8"> = {
      "0.6": "0.6",
      "0.7": "0.7",
      "0.8": "0.8",
    };

    const dailyLimitWei = this.parseDailyLimitToWei(createAccountDto.dailyLimit);

    return this.client.accounts.createAccount(userId, {
      entryPointVersion: versionMap[versionDto] as any,
      salt: createAccountDto.salt,
      ...(dailyLimitWei !== undefined ? { dailyLimit: dailyLimitWei } : {}),
    });
  }

  async getAccount(userId: string) {
    return this.client.accounts.getAccount(userId);
  }

  async getAccountAddress(userId: string): Promise<string> {
    return this.client.accounts.getAccountAddress(userId);
  }

  async getAccountBalance(userId: string) {
    const result = await this.client.accounts.getAccountBalance(userId);
    return {
      address: result.address,
      balance: result.balance,
      balanceInWei: ethers.parseEther(result.balance).toString(),
    };
  }

  async getAccountNonce(userId: string) {
    return this.client.accounts.getAccountNonce(userId);
  }

  async getAccountByUserId(userId: string) {
    return this.client.accounts.getAccountByUserId(userId);
  }

  /**
   * Step 1 of guardian setup: generate acceptance hash + QR payload.
   * The returned qrPayload should be encoded as a QR code and scanned by guardian devices.
   */
  async prepareGuardianSetup(
    userId: string,
    dto: GuardianSetupPrepareDto
  ): Promise<{
    owner: string;
    salt: number;
    chainId: number;
    factoryAddress: string;
    acceptanceHash: string;
    qrPayload: string;
    dailyLimit: string;
  }> {
    const versionDto = dto.entryPointVersion || EntryPointVersionDto.V0_7;
    const versionMap: Record<string, "0.6" | "0.7" | "0.8"> = {
      "0.6": "0.6",
      "0.7": "0.7",
      "0.8": "0.8",
    };
    const version = versionMap[versionDto] as any;

    // Resolve signer address (owner of the future account)
    const { address: owner } = await this.client.wallets.ensureSigner(userId);

    // Pick factory + chainId from ethereum provider
    const factoryAddress = this.client.ethereum.getFactoryAddress(version);
    const chainId = this.configService.get<number>("chainId") || 11155111;

    // Determine salt (use provided or generate random)
    const salt = dto.salt ?? Math.floor(Math.random() * 1_000_000);

    // SDK 0.20.x binds dailyLimit into the acceptance hash — it MUST equal the
    // value submitted in createWithGuardians, so compute it the same way here.
    const dailyLimitWei = this.parseDailyLimitToWei(dto.dailyLimit) ?? 0n;

    // Build acceptance hash
    const acceptanceHash = this.client.accounts.buildGuardianAcceptanceHash(
      owner,
      salt,
      factoryAddress,
      chainId,
      dailyLimitWei
    );

    // Build QR payload — everything guardian phone needs to reconstruct and sign.
    // dailyLimit is echoed (as wei string) so the create step submits the exact
    // same value the hash was built with.
    const qrPayload = JSON.stringify({
      acceptanceHash,
      factory: factoryAddress,
      chainId,
      owner,
      salt,
      dailyLimit: dailyLimitWei.toString(),
    });

    return {
      owner,
      salt,
      chainId,
      factoryAddress,
      acceptanceHash,
      qrPayload,
      dailyLimit: dailyLimitWei.toString(),
    };
  }

  /**
   * Step 2 of guardian setup: create account with two guardian signatures collected from QR scan.
   */
  async createWithGuardians(userId: string, dto: CreateWithGuardiansDto) {
    if (dto.guardian1.toLowerCase() === dto.guardian2.toLowerCase()) {
      throw new BadRequestException("Guardian 1 and Guardian 2 must be different addresses");
    }

    const versionDto = dto.entryPointVersion || EntryPointVersionDto.V0_7;
    const versionMap: Record<string, "0.6" | "0.7" | "0.8"> = {
      "0.6": "0.6",
      "0.7": "0.7",
      "0.8": "0.8",
    };
    const version = versionMap[versionDto] as any;

    const dailyLimitWei = this.parseDailyLimitToWei(dto.dailyLimit) ?? 0n;

    return this.client.accounts.createAccountWithGuardians(userId, {
      guardian1: dto.guardian1,
      guardian1Sig: dto.guardian1Sig,
      guardian2: dto.guardian2,
      guardian2Sig: dto.guardian2Sig,
      dailyLimit: dailyLimitWei,
      salt: dto.salt,
      entryPointVersion: version,
    });
  }

  /**
   * Create an account with P-256 (WebAuthn passkey) guardian(s) — @aastar/sdk >= 0.23.0.
   *
   * A passkey guardian is a secp256r1 pubkey (x, y), NOT an address, and is an
   * owner-bootstrap: registered at deploy time with NO acceptance signature (unlike
   * the ECDSA path's QR-scan flow). The SDK's createAccountWithP256Guardians uses the
   * factory's full-config `createAccount(owner, salt, config)` path — the only
   * entrypoint that accepts the 8-field InitConfig (guardianP256X/Y). dailyLimit MUST
   * be > 0: a guardian set enables the on-chain guard.
   */
  async createWithP256Guardians(userId: string, dto: CreateWithP256GuardiansDto) {
    const dailyLimitWei = this.parseDailyLimitToWei(dto.dailyLimit);
    if (dailyLimitWei === undefined || dailyLimitWei <= 0n) {
      throw new BadRequestException(
        "dailyLimit must be > 0 for a P-256 guardian account (a guardian set enables the on-chain guard)."
      );
    }

    const seen = new Set<string>();
    for (const g of dto.p256Guardians) {
      const key = `${g.x.toLowerCase()}:${g.y.toLowerCase()}`;
      if (seen.has(key)) {
        throw new BadRequestException("Duplicate P-256 guardian public key");
      }
      seen.add(key);
    }

    const versionDto = dto.entryPointVersion || EntryPointVersionDto.V0_7;
    const versionMap: Record<string, "0.6" | "0.7" | "0.8"> = {
      "0.6": "0.6",
      "0.7": "0.7",
      "0.8": "0.8",
    };
    const version = versionMap[versionDto] as any;

    // Approve the full Tier-1/2/3 algorithm set so this account can validate every tier:
    //   0x02 ECDSA (Tier-1 / KMS owner + deploy), 0x03 P-256 (the device-passkey factor),
    //   0x09 WebAuthn cumulative Tier-2, 0x0a WebAuthn cumulative Tier-3 (#234).
    // buildInitConfig would otherwise default to just [0x02(, 0x03)], leaving Tier-2/3
    // un-approved. Keep ECDSA so Tier-1 and the lazy first-UserOp deploy still work.
    // Approve BOTH the base cumulative (0x04 T2 / 0x05 T3) AND the WebAuthn variants (0x09 / 0x0a).
    // On-chain validateUserOp uses the actual signature algId (0x0a for the device-passkey path) and
    // only needs 0x09/0x0a. But the SDK's off-chain guard pre-check (GuardChecker) still maps
    // tier→algId via algIdForTier (0x05 for T3, no WebAuthn branch) and checks approvedAlgorithms[0x05]
    // — even though the on-chain guard NO LONGER enforces algId approval (moved to validateUserOp,
    // contract v0.17.2-beta.4). Approving 0x04/0x05 satisfies that stale pre-check; it's harmless (a
    // device passkey is WebAuthn-only and cannot produce a valid non-WA raw-P256 0x05 signature).
    // Tracked as the SDK pre-check bug; remove the base algIds once the pre-check uses the real algId.
    const approvedAlgIds = [
      ALG_ECDSA,
      ALG_P256,
      ALG_CUMULATIVE_T2,
      ALG_CUMULATIVE_T2_WA,
      ALG_CUMULATIVE_T3,
      ALG_CUMULATIVE_T3_WA,
    ];

    const ecdsaGuardians = dto.ecdsaGuardians?.map(a => a as `0x${string}`);

    this.logger.log(
      `createWithP256Guardians: userId=${userId} p256Guardians=${dto.p256Guardians.length} ` +
        `ecdsaGuardians=${ecdsaGuardians?.length ?? 0} approvedAlgIds=[${approvedAlgIds.join(",")}] ` +
        `version=${version} dailyLimitWei=${dailyLimitWei} salt=${dto.salt ?? "random"}`
    );

    try {
      const user = await this.databaseService.findUserById(userId);
      const ownerP256X = user?.passkeyX as `0x${string}` | undefined;
      const ownerP256Y = user?.passkeyY as `0x${string}` | undefined;
      const deployerKey =
        this.configService.get<string>("deployerPrivateKey") || process.env.DEPLOYER_PRIVATE_KEY;

      const p256Guardians = dto.p256Guardians.map(g => ({
        x: g.x as `0x${string}`,
        y: g.y as `0x${string}`,
      }));
      void ownerP256X;
      void ownerP256Y;
      void deployerKey;

      // This single-shot endpoint is the LEGACY path (no owner device passkey at birth → Tier-1 only).
      // Tier-2/3 passkey-at-birth needs the KMS owner to sign the CREATE_ACCOUNT digest, which requires
      // a one-time WebAuthn ceremony whose challenge commits to that digest — a chicken-and-egg that
      // forces a two-phase flow (aastar-sdk#249). Use prepareCreateWithPasskey + submitCreateWithPasskey
      // (mirrors transfer prepare/submit) for Tier-2/3.
      const account = await this.client.accounts.createAccountWithP256Guardians(userId, {
        p256Guardians,
        ...(ecdsaGuardians && ecdsaGuardians.length > 0 ? { ecdsaGuardians } : {}),
        approvedAlgIds,
        dailyLimit: dailyLimitWei,
        salt: dto.salt,
        entryPointVersion: version,
      });
      this.logger.log(
        `createWithP256Guardians OK (legacy): address=${account.address} deployed=${account.deployed}`
      );
      return account;
    } catch (err: any) {
      // Surface the real SDK/KMS/on-chain failure (otherwise it bubbles up as an
      // opaque 500). Includes the KMS "No pending challenge" challenge-binding case.
      this.logger.error(`createWithP256Guardians FAILED: ${err?.message ?? err}`, err?.stack);
      throw err;
    }
  }

  /**
   * Tier-2/3 passkey-at-birth — PHASE 1 (aastar-sdk#249). The SDK pins nonce/deadline, builds the
   * CREATE_ACCOUNT digest, and (KMS path) begins a one-time WebAuthn ceremony whose challenge commits
   * to that digest. The owner device passkey (ownerP256X/Y) is read from the user's registration record
   * (NOT a guardian). The frontend then runs navigator.credentials.get(publicKeyOptions) and calls
   * submitCreateWithPasskey. Mirrors transfer prepare/submit.
   */
  async prepareCreateWithPasskey(userId: string, dto: CreateWithP256GuardiansDto) {
    const dailyLimitWei = this.parseDailyLimitToWei(dto.dailyLimit);
    if (dailyLimitWei === undefined || dailyLimitWei <= 0n) {
      throw new BadRequestException(
        "dailyLimit must be > 0 for a passkey-at-birth account (a guardian set enables the on-chain guard)."
      );
    }
    const user = await this.databaseService.findUserById(userId);
    const ownerP256X = user?.passkeyX as `0x${string}` | undefined;
    const ownerP256Y = user?.passkeyY as `0x${string}` | undefined;
    if (!ownerP256X || !ownerP256Y) {
      throw new BadRequestException(
        "No registered device passkey on this account — register a passkey (Face ID / fingerprint) first."
      );
    }

    const versionDto = dto.entryPointVersion || EntryPointVersionDto.V0_7;
    const version = ({ "0.6": "0.6", "0.7": "0.7", "0.8": "0.8" }[versionDto] ?? "0.7") as any;
    // Approve BOTH the base cumulative (0x04 T2 / 0x05 T3) AND the WebAuthn variants (0x09 / 0x0a).
    // On-chain validateUserOp uses the actual signature algId (0x0a for the device-passkey path) and
    // only needs 0x09/0x0a. But the SDK's off-chain guard pre-check (GuardChecker) still maps
    // tier→algId via algIdForTier (0x05 for T3, no WebAuthn branch) and checks approvedAlgorithms[0x05]
    // — even though the on-chain guard NO LONGER enforces algId approval (moved to validateUserOp,
    // contract v0.17.2-beta.4). Approving 0x04/0x05 satisfies that stale pre-check; it's harmless (a
    // device passkey is WebAuthn-only and cannot produce a valid non-WA raw-P256 0x05 signature).
    // Tracked as the SDK pre-check bug; remove the base algIds once the pre-check uses the real algId.
    const approvedAlgIds = [
      ALG_ECDSA,
      ALG_P256,
      ALG_CUMULATIVE_T2,
      ALG_CUMULATIVE_T2_WA,
      ALG_CUMULATIVE_T3,
      ALG_CUMULATIVE_T3_WA,
    ];
    const ecdsaGuardians = dto.ecdsaGuardians?.map(a => a as `0x${string}`);
    const p256Guardians = dto.p256Guardians.map(g => ({
      x: g.x as `0x${string}`,
      y: g.y as `0x${string}`,
    }));
    // Per-token tier ceilings baked at birth (a tier profile → resolveTierProfile). Strings
    // over the wire → bigint for the SDK/InitConfig.
    const initialTokens = dto.initialTokens?.map(a => a as `0x${string}`);
    const initialTokenConfigs = dto.initialTokenConfigs?.map(c => ({
      tier1Limit: BigInt(c.tier1Limit),
      tier2Limit: BigInt(c.tier2Limit),
      dailyLimit: BigInt(c.dailyLimit),
    }));

    try {
      const prep = await this.client.accounts.prepareCreateAccountWithPasskey(userId, {
        ownerP256X,
        ownerP256Y,
        ...(p256Guardians.length > 0 ? { p256Guardians } : {}),
        ...(ecdsaGuardians && ecdsaGuardians.length > 0 ? { ecdsaGuardians } : {}),
        ...(initialTokens && initialTokens.length > 0
          ? { initialTokens, initialTokenConfigs }
          : {}),
        approvedAlgIds,
        dailyLimit: dailyLimitWei,
        salt: dto.salt,
        entryPointVersion: version,
      } as any);
      this.logger.log(
        `prepareCreateWithPasskey: createId=${prep.createId} predicted=${prep.predictedAddress} ` +
          `alreadyDeployed=${prep.alreadyDeployed}`
      );
      return {
        createId: prep.createId,
        predictedAddress: prep.predictedAddress,
        challenge: prep.challenge,
        challengeId: prep.challengeId,
        publicKeyOptions: prep.publicKeyOptions,
        alreadyDeployed: prep.alreadyDeployed,
      };
    } catch (err: any) {
      this.logger.error(`prepareCreateWithPasskey FAILED: ${err?.message ?? err}`, err?.stack);
      throw err;
    }
  }

  /**
   * Tier-2/3 passkey-at-birth — PHASE 3 (aastar-sdk#249). Signs the prepared CREATE_ACCOUNT digest with
   * the user's one-time WebAuthn ceremony assertion (KMS owner) and relays the deploy via a funded
   * backend deployer (msg.sender == deployer). Returns the DEPLOYED account (validator + passkey at birth).
   */
  async submitCreateWithPasskey(userId: string, dto: SubmitCreateWithPasskeyDto) {
    // Security model: `createId` is a prepare-session handle the SDK bound to the caller
    // at prepareCreateWithPasskey time, and submitPreparedCreateAccount deploys THAT
    // session's account regardless of who submits — so a leaked createId can't be used to
    // deploy an account the submitter controls (it deploys the original user's account,
    // at most wasting deployer gas). The real gate is the one-time WebAuthn assertion below,
    // which requires the user's physical device. `userId` is therefore not a security check
    // here (a strict createId↔userId assertion needs an SDK-exposed binding getter); it is
    // recorded for audit. See PR #399 review H1.
    const deployerKey =
      this.configService.get<string>("deployerPrivateKey") || process.env.DEPLOYER_PRIVATE_KEY;
    if (!deployerKey) {
      throw new BadRequestException(
        "DEPLOYER_PRIVATE_KEY unset — cannot relay the account deploy."
      );
    }
    const deployerWallet = createWalletClient({
      account: privateKeyToAccount(
        (deployerKey.startsWith("0x") ? deployerKey : `0x${deployerKey}`) as `0x${string}`
      ),
      chain: sepolia,
      transport: http(this.configService.get<string>("ethRpcUrl")),
    });

    try {
      const account = await this.client.accounts.submitPreparedCreateAccount(dto.createId, {
        deployerWallet: deployerWallet as any,
        signerCtx: {
          webAuthnAssertion: { ChallengeId: dto.challengeId, Credential: dto.credential },
        } as any,
      });
      this.logger.log(
        `submitCreateWithPasskey OK: user=${userId} address=${account.address} deployed=${account.deployed}`
      );
      return account;
    } catch (err: any) {
      this.logger.error(
        `submitCreateWithPasskey FAILED (user=${userId}): ${err?.message ?? err}`,
        err?.stack
      );
      throw err;
    }
  }

  /**
   * Phase 1: Owner rotation — update the off-chain signerAddress record.
   * The on-chain signer update requires a separate UserOp calling updateSigner().
   */
  async rotateSigner(userId: string, newSignerAddress: string) {
    if (!ethers.isAddress(newSignerAddress)) {
      throw new BadRequestException("Invalid Ethereum address for newSignerAddress");
    }

    const account = await this.databaseService.findAccountByUserId(userId);
    if (!account) {
      throw new NotFoundException("Account not found");
    }

    const oldSignerAddress = account.signerAddress;

    if (oldSignerAddress?.toLowerCase() === newSignerAddress.toLowerCase()) {
      throw new BadRequestException("New signer address is the same as the current signer");
    }

    await this.databaseService.updateAccount(userId, { signerAddress: newSignerAddress });

    return {
      message: "Signer address updated successfully",
      accountAddress: account.address,
      oldSignerAddress,
      newSignerAddress,
      note: "Off-chain record updated. Submit a UserOp calling updateSigner() to synchronize on-chain.",
    };
  }
}
