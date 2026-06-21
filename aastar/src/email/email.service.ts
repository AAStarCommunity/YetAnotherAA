import { Injectable, Logger, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ResendMailer } from "@aastar/sdk/email";

/**
 * Thin wrapper over @aastar/sdk/email's ResendMailer.
 *
 * The mailer is constructed lazily on first send so the app boots even without
 * RESEND_API_KEY (only OTP delivery fails, with a clear error). Sends from the
 * verified aastar.io domain (hi@aastar.io by default; override with EMAIL_FROM).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private mailer: ResendMailer | null = null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.from = this.config.get<string>("emailFrom") || process.env.EMAIL_FROM || "hi@aastar.io";
  }

  private getMailer(): ResendMailer {
    if (!this.mailer) {
      const key = this.config.get<string>("resendApiKey") || process.env.RESEND_API_KEY;
      if (!key) {
        throw new InternalServerErrorException(
          "RESEND_API_KEY is not configured — cannot send verification email."
        );
      }
      this.mailer = new ResendMailer(key);
    }
    return this.mailer;
  }

  /** Send a 6-digit sign-in / verification code. */
  async sendOtp(to: string, code: string): Promise<void> {
    const subject = `${code} is your AAStar code`;
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#0f172a">
        <h2 style="margin:0 0 8px;font-size:18px">Your sign-in code</h2>
        <p style="margin:0 0 20px;color:#475569;font-size:14px">Enter this code to verify your email and sign in. It expires in 10 minutes.</p>
        <div style="font-size:34px;font-weight:700;letter-spacing:10px;background:#f1f5f9;border-radius:12px;padding:16px;text-align:center">${code}</div>
        <p style="margin:20px 0 0;color:#94a3b8;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
        <p style="margin:16px 0 0;color:#94a3b8;font-size:12px">— AAStar · hi@aastar.io</p>
      </div>`;
    try {
      await this.getMailer().send({
        from: this.from,
        to,
        subject,
        html,
        text: `Your AAStar sign-in code is ${code}. It expires in 10 minutes.`,
      });
      this.logger.log(`OTP sent to ${to}`);
    } catch (e) {
      this.logger.error(`Failed to send OTP to ${to}: ${(e as Error).message}`);
      throw new InternalServerErrorException(
        "Failed to send verification email. Please try again."
      );
    }
  }
}
