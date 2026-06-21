import { Injectable, Inject, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { AirAccountServerClient as YAAAServerClient } from "@aastar/sdk/kms";
import { YAAA_SERVER_CLIENT } from "../sdk/sdk.providers";
import { CreateAccountDto, EntryPointVersionDto } from "./dto/create-account.dto";
import {
  GuardianSetupPrepareDto,
  CreateWithGuardiansDto,
  CreateWithP256GuardiansDto,
} from "./dto/guardian-setup.dto";
import { DatabaseService } from "../database/database.service";
import { ConfigService } from "@nestjs/config";
import { ethers } from "ethers";

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

    this.logger.log(
      `createWithP256Guardians: userId=${userId} guardians=${dto.p256Guardians.length} ` +
        `version=${version} dailyLimitWei=${dailyLimitWei} salt=${dto.salt ?? "random"}`
    );

    try {
      const account = await this.client.accounts.createAccountWithP256Guardians(userId, {
        p256Guardians: dto.p256Guardians.map(g => ({
          x: g.x as `0x${string}`,
          y: g.y as `0x${string}`,
        })),
        dailyLimit: dailyLimitWei,
        salt: dto.salt,
        entryPointVersion: version,
      });
      this.logger.log(
        `createWithP256Guardians OK: address=${account.address} deployed=${account.deployed}`
      );
      return account;
    } catch (err: any) {
      // Surface the real SDK/KMS/on-chain failure (otherwise it bubbles up as an
      // opaque 500). Includes the KMS "No pending challenge" challenge-binding case.
      this.logger.error(
        `createWithP256Guardians FAILED: ${err?.message ?? err}`,
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
