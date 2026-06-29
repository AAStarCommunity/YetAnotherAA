import { Controller, Post, Body, Get, UseGuards, Request, HttpCode } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { RequestOtpDto, VerifyOtpDto } from "./dto/otp.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { OtpRateLimit } from "./guards/otp-rate-limit.guard";

// Per-email OTP limits (15-min sliding window): cap code sends (anti-spam/cost) and verify
// attempts (anti-brute-force; the code is also single-use + TTL'd in the service).
const OTP_WINDOW_MS = 15 * 60_000;
const OTP_REQUEST_MAX = 5;
const OTP_VERIFY_MAX = 10;

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("otp/request")
  @HttpCode(200)
  @UseGuards(OtpRateLimit("request", OTP_REQUEST_MAX, OTP_WINDOW_MS))
  @ApiOperation({
    summary: "Send a 6-digit sign-in code to an email (passwordless register + login)",
  })
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Post("otp/verify")
  @HttpCode(200)
  @UseGuards(OtpRateLimit("verify", OTP_VERIFY_MAX, OTP_WINDOW_MS))
  @ApiOperation({
    summary: "Verify the email code → create/login the user and return a JWT",
    description:
      "On first sight the user is created (passwordless, email verified). Returns " +
      "{ access_token, user, isNewUser, needsWallet }; run passkey/KMS wallet setup when needsWallet.",
  })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Get("profile")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get user profile" })
  async getProfile(@Request() req) {
    return this.authService.getProfile(req.user.sub);
  }

  @Post("refresh")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Refresh token" })
  async refresh(@Request() req) {
    return {
      access_token: this.authService["generateToken"](req.user),
    };
  }

  // ── KMS Passkey Login ──────────────────────────────────────────

  @Post("login/kms/begin")
  @ApiOperation({
    summary: "Begin KMS Passkey login",
    description:
      "Returns a loginHash and walletAddress. Frontend uses walletAddress " +
      "to call KMS BeginAuthentication, then submits the credential back.",
  })
  async beginKmsLogin(@Body() body: { email: string }) {
    return this.authService.generateLoginChallenge(body.email);
  }

  @Post("login/kms/complete")
  @ApiOperation({
    summary: "Complete KMS Passkey login",
    description:
      "Backend calls KMS SignHash with the WebAuthn credential to verify " +
      "the user's identity, then issues a JWT.",
  })
  async completeKmsLogin(@Body() body: { address: string; challengeId: string; credential: any }) {
    return this.authService.verifyKmsLogin(body.address, body.challengeId, body.credential);
  }

  // ── Wallet Linking ─────────────────────────────────────────────

  @Post("wallet/link")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Link KMS wallet to user account",
    description:
      "Called after KMS key creation and address derivation. " +
      "Associates the KMS key with the authenticated user.",
  })
  async linkWallet(
    @Request() req,
    @Body()
    body: {
      kmsKeyId: string;
      address: string;
      credentialId?: string;
      // The device WebAuthn credential's secp256r1 public key (x, y), captured from the
      // registration attestation. Persisted so a Tier-2/3-capable account can register it
      // on-chain via setP256Key — it is the cumulative on-chain passkey factor (#234).
      passkeyX?: string;
      passkeyY?: string;
    }
  ) {
    return this.authService.linkWallet(req.user.sub, body.kmsKeyId, body.address, {
      credentialId: body.credentialId,
      passkeyX: body.passkeyX,
      passkeyY: body.passkeyY,
    });
  }
}
