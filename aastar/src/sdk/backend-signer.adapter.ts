import { Injectable, Logger } from "@nestjs/common";
import { ISignerAdapter, PasskeyAssertionContext } from "@aastar/sdk/kms";
import { AuthService } from "../auth/auth.service";

/**
 * SDK 0.20.x ISignerAdapter — narrowed to EIP-191 personal-sign + address read
 * (the ethers Signer surface was dropped in the SDK's ethers→viem migration).
 *
 * Backed by the KMS: signing requires a Passkey assertion, threaded through the
 * optional PasskeyAssertionContext into the KmsSigner's assertionProvider.
 */
@Injectable()
export class BackendSignerAdapter implements ISignerAdapter {
  private readonly logger = new Logger(BackendSignerAdapter.name);

  constructor(private authService: AuthService) {}

  async getAddress(userId: string): Promise<`0x${string}`> {
    // No assertion needed: KmsSigner.getAddress() just returns the bound address.
    const signer = await this.authService.getUserWallet(userId);
    return (await signer.getAddress()) as `0x${string}`;
  }

  async signMessage(
    userId: string,
    message: `0x${string}` | Uint8Array,
    ctx?: PasskeyAssertionContext
  ): Promise<`0x${string}`> {
    // Callers pass a 32-byte digest (raw bytes / 0x hex); KmsSigner.signMessage
    // applies EIP-191 personal-sign semantics. The assertion gates the KMS sign.
    // No assertion here ⇒ the KMS SignHash will fail (challenge-binding: assertion
    // required / "No pending challenge"), so log its presence to pinpoint such 500s.
    const hasAssertion = !!ctx?.assertion;
    this.logger.debug(`signMessage: userId=${userId} hasAssertion=${hasAssertion}`);
    if (!hasAssertion) {
      this.logger.warn(
        `signMessage called WITHOUT a passkey assertion (userId=${userId}); ` +
          `the KMS SignHash will be rejected (challenge-binding requires a fresh assertion).`
      );
    }
    const assertionProvider = ctx?.assertion ? () => Promise.resolve(ctx.assertion) : undefined;
    const signer = await this.authService.getUserWallet(userId, assertionProvider);
    return (await signer.signMessage(message)) as `0x${string}`;
  }

  async ensureSigner(userId: string): Promise<{ address: `0x${string}` }> {
    const signer = await this.authService.ensureUserWallet(userId);
    const address = (await signer.getAddress()) as `0x${string}`;
    this.logger.debug(`ensureSigner: userId=${userId} address=${address}`);
    return { address };
  }
}
