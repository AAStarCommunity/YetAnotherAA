import { Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { DatabaseService } from "../database/database.service";
import { KmsService } from "../kms/kms.service";
import { ethers } from "ethers";
import { EmailService } from "../email/email.service";
import { RequestOtpDto, VerifyOtpDto } from "./dto/otp.dto";
import { v4 as uuidv4 } from "uuid";
import * as crypto from "crypto";

@Injectable()
export class AuthService {
  /** Temporary store for KMS login challenges (address → { loginHash, expiresAt }) */
  private loginChallengeStore = new Map<string, { loginHash: string; expiresAt: number }>();

  /** Temporary store for email OTP codes (email → { code, expiresAt, attempts }) */
  private otpStore = new Map<string, { code: string; expiresAt: number; attempts: number }>();

  private static readonly OTP_TTL_MS = 10 * 60 * 1000;
  private static readonly OTP_MAX_ATTEMPTS = 5;

  /** Cleanup interval for expired challenges */
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(
    private databaseService: DatabaseService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private kmsService: KmsService,
    private emailService: EmailService
  ) {
    // Clean up expired challenges every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanupExpiredChallenges(), 60_000);
  }

  // ── Email OTP (passwordless register + login) ──────────────────

  /**
   * Step 1: send a 6-digit code to the email. Used for BOTH first-time sign-up
   * and returning login — the code proves email ownership (so it doubles as email
   * verification) and there is no password anywhere in the system.
   * Always returns ok (don't leak whether an account exists).
   */
  async requestOtp(dto: RequestOtpDto) {
    const email = dto.email.toLowerCase().trim();
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    this.otpStore.set(email, {
      code,
      expiresAt: Date.now() + AuthService.OTP_TTL_MS,
      attempts: 0,
    });
    await this.emailService.sendOtp(email, code);
    // Test affordance (gated): expose the code so e2e (Playwright) can complete the
    // passwordless flow without a real inbox. Fail-CLOSED — active ONLY when
    // NODE_ENV === "test" AND OTP_TEST_MODE === "true" (not dev/staging/prod). The
    // boot guard in AppConfigModule additionally aborts prod startup with the flag.
    // See docs/TEST_PLAN.md S3.
    const testMode = process.env.NODE_ENV === "test" && process.env.OTP_TEST_MODE === "true";
    return { ok: true, message: "Verification code sent", ...(testMode ? { devCode: code } : {}) };
  }

  /**
   * Step 2: verify the code → create the user on first sight (passwordless,
   * email verified) or log the existing one in. Returns a JWT plus `needsWallet`
   * so the client knows to run the passkey/KMS wallet setup next.
   */
  async verifyOtp(dto: VerifyOtpDto) {
    const email = dto.email.toLowerCase().trim();
    const entry = this.otpStore.get(email);

    if (!entry) {
      throw new UnauthorizedException("No code was requested for this email, or it expired.");
    }
    if (Date.now() > entry.expiresAt) {
      this.otpStore.delete(email);
      throw new UnauthorizedException("Code expired. Please request a new one.");
    }
    if (entry.attempts >= AuthService.OTP_MAX_ATTEMPTS) {
      this.otpStore.delete(email);
      throw new UnauthorizedException("Too many attempts. Please request a new code.");
    }
    if (dto.code !== entry.code) {
      entry.attempts += 1;
      throw new UnauthorizedException("Invalid code.");
    }
    this.otpStore.delete(email);

    let user = await this.databaseService.findUserByEmail(email);
    let isNewUser = false;
    if (!user) {
      user = {
        id: uuidv4(),
        email,
        username: email.split("@")[0],
        emailVerified: true,
        walletAddress: undefined,
        kmsKeyId: undefined,
        kmsCredentialId: undefined,
        createdAt: new Date().toISOString(),
      };
      await this.databaseService.saveUser(user);
      isNewUser = true;
    } else if (!user.emailVerified) {
      await this.databaseService.updateUser(user.id, { emailVerified: true });
      user.emailVerified = true;
    }

    return {
      user,
      access_token: this.generateToken(user),
      isNewUser,
      needsWallet: !user.walletAddress,
    };
  }

  // ── Profile ────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.databaseService.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    return user;
  }

  // ── KMS Login Flow ─────────────────────────────────────────────

  /**
   * Step 1: Generate a random login challenge for KMS Passkey login.
   * Returns the loginHash and the user's wallet address (for frontend to
   * call KMS BeginAuthentication).
   */
  async generateLoginChallenge(email: string) {
    const user = await this.databaseService.findUserByEmail(email);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    if (!user.walletAddress) {
      throw new BadRequestException("User has no wallet linked. Please register a Passkey first.");
    }

    // Generate random 32-byte login hash
    const loginHash = "0x" + crypto.randomBytes(32).toString("hex");

    // Store with 5-minute expiry
    this.loginChallengeStore.set(user.walletAddress.toLowerCase(), {
      loginHash,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return {
      loginHash,
      walletAddress: user.walletAddress,
    };
  }

  /**
   * Step 2: Verify KMS login. Backend calls KMS SignHash with the WebAuthn
   * credential to sign the loginHash, then verifies the signature matches
   * the user's wallet address.
   */
  async verifyKmsLogin(address: string, challengeId: string, credential: unknown) {
    const normalizedAddress = address.toLowerCase();
    const challenge = this.loginChallengeStore.get(normalizedAddress);

    if (!challenge) {
      throw new UnauthorizedException("No pending login challenge for this address");
    }

    if (Date.now() > challenge.expiresAt) {
      this.loginChallengeStore.delete(normalizedAddress);
      throw new UnauthorizedException("Login challenge expired");
    }

    try {
      // Use KMS to sign the loginHash with the WebAuthn credential
      const signResponse = await this.kmsService.signHashWithWebAuthn(
        address,
        challenge.loginHash,
        challengeId,
        credential
      );

      // Verify the signature matches the expected address
      const sig = ethers.Signature.from("0x" + signResponse.Signature);
      const recoveredAddress = ethers.recoverAddress(challenge.loginHash, sig);

      if (recoveredAddress.toLowerCase() !== normalizedAddress) {
        throw new UnauthorizedException("Signature address mismatch");
      }

      // Clean up challenge
      this.loginChallengeStore.delete(normalizedAddress);

      // Find user by wallet address
      const user = await this.databaseService.findUserByWalletAddress(address);
      if (!user) {
        throw new UnauthorizedException("No user found for this wallet address");
      }

      return {
        user,
        access_token: this.generateToken(user),
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException(`KMS login verification failed: ${error.message}`);
    }
  }

  // ── Wallet Linking ─────────────────────────────────────────────

  /**
   * Link a KMS wallet to a user account. Called after KMS key creation
   * and address derivation are complete.
   */
  async linkWallet(
    userId: string,
    kmsKeyId: string,
    walletAddress: string,
    opts?: { credentialId?: string; passkeyX?: string; passkeyY?: string }
  ) {
    const user = await this.databaseService.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    await this.databaseService.updateUser(userId, {
      kmsKeyId,
      walletAddress,
      kmsCredentialId: opts?.credentialId,
      // Device WebAuthn passkey public key (x, y) — the on-chain cumulative passkey factor
      // a Tier-2/3 account registers via setP256Key. Only persisted when supplied.
      ...(opts?.passkeyX && opts?.passkeyY
        ? { passkeyX: opts.passkeyX, passkeyY: opts.passkeyY }
        : {}),
    });

    return {
      message: "Wallet linked successfully",
      walletAddress,
      kmsKeyId,
    };
  }

  // ── Wallet Access (for SDK signer adapter) ─────────────────────

  /**
   * Get a KMS signer for the user. Requires the user to have a linked wallet.
   * The returned signer needs a Passkey assertion for each signing operation.
   */
  async getUserWallet(userId: string, assertionProvider?: () => Promise<any>): Promise<any> {
    const user = await this.databaseService.findUserById(userId);
    if (!user) {
      throw new Error(`User not found for userId: ${userId}`);
    }

    if (!user.walletAddress || !user.kmsKeyId) {
      throw new Error(
        `User wallet not initialized for userId: ${userId}. Link a KMS wallet first.`
      );
    }

    return this.kmsService.createKmsSigner(user.kmsKeyId, user.walletAddress, assertionProvider);
  }

  /**
   * Resolve a userId to its KMS `{ keyId, address }` — the KmsKeyResolver the
   * SDK's KmsSignerAdapter needs. Throws if the user has no linked wallet.
   */
  async resolveKmsKey(userId: string): Promise<{ keyId: string; address: `0x${string}` }> {
    const user = await this.databaseService.findUserById(userId);
    if (!user) {
      throw new Error(`User not found for userId: ${userId}`);
    }
    if (!user.walletAddress || !user.kmsKeyId) {
      throw new Error(
        `User wallet not initialized for userId: ${userId}. Link a KMS wallet first.`
      );
    }
    return { keyId: user.kmsKeyId, address: user.walletAddress as `0x${string}` };
  }

  /**
   * Ensure user has a KMS wallet linked. For backward compatibility,
   * returns a KmsSigner if wallet exists, but NOTE: signing will fail
   * without a proper assertion provider.
   */
  async ensureUserWallet(userId: string): Promise<any> {
    const user = await this.databaseService.findUserById(userId);
    if (!user) {
      throw new Error(`User not found for userId: ${userId}`);
    }

    if (user.walletAddress && user.kmsKeyId) {
      // Return existing KMS signer (assertion must be provided later)
      return this.kmsService.createKmsSigner(user.kmsKeyId, user.walletAddress);
    }

    throw new Error(
      `User has no KMS wallet. Register a Passkey via KMS and call linkWallet first.`
    );
  }

  // ── Internal ───────────────────────────────────────────────────

  private generateToken(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      username: user.username,
    };
    return this.jwtService.sign(payload);
  }

  private cleanupExpiredChallenges() {
    const now = Date.now();
    for (const [key, value] of this.loginChallengeStore) {
      if (now > value.expiresAt) {
        this.loginChallengeStore.delete(key);
      }
    }
    for (const [key, value] of this.otpStore) {
      if (now > value.expiresAt) {
        this.otpStore.delete(key);
      }
    }
  }
}
