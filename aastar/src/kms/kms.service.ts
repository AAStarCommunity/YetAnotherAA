import { createHash } from "crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KmsManager, KmsSigner, LegacyPasskeyAssertion } from "@aastar/airaccount/server";
import { ethers } from "ethers";

export type { LegacyPasskeyAssertion };

@Injectable()
export class KmsService {
  private readonly kmsManager: KmsManager;

  constructor(private configService: ConfigService) {
    this.kmsManager = new KmsManager({
      kmsEndpoint: configService.get<string>("kmsEndpoint") ?? "https://kms1.aastar.io",
      kmsEnabled: configService.get<boolean>("kmsEnabled") === true,
      kmsApiKey: configService.get<string>("kmsApiKey"),
    });

    if (this.kmsManager.isKmsEnabled()) {
      const endpoint = configService.get<string>("kmsEndpoint") ?? "https://kms1.aastar.io";
      console.log(`[KmsService] KMS service enabled with endpoint: ${endpoint}`);
      this.installDiagnosticInterceptors();
    } else {
      console.log("[KmsService] KMS service disabled");
    }
  }

  /** Attach axios request/response interceptors to log full KMS traffic for debugging. */
  private installDiagnosticInterceptors() {
    const http = (this.kmsManager as any).http;
    if (!http) return;

    http.interceptors.request.use((config: any) => {
      const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
      // Decode rpIdHash from authenticatorData if present (first 32 bytes = SHA-256 of rpId)
      const authData = body?.WebAuthn?.Credential?.response?.authenticatorData;
      let rpIdHashHex = "";
      if (authData) {
        try {
          const buf = Buffer.from(authData.replace(/-/g, "+").replace(/_/g, "/"), "base64");
          rpIdHashHex = buf.subarray(0, 32).toString("hex");
        } catch {
          // ignore parse errors; rpIdHashHex stays empty
        }
      }
      console.log(
        `[KMS DIAG] ▶ ${config.method?.toUpperCase()} ${config.baseURL}${config.url}\n` +
          `  Body: ${JSON.stringify(body, null, 2)}\n` +
          (rpIdHashHex
            ? `  rpIdHash (from authenticatorData): ${rpIdHashHex}\n` +
              `  (SHA256("localhost") = ${createHash("sha256").update("localhost").digest("hex")})\n` +
              `  (SHA256("aastar.io") = ${createHash("sha256").update("aastar.io").digest("hex")})`
            : "")
      );
      return config;
    });

    http.interceptors.response.use(
      (response: any) => {
        console.log(
          `[KMS DIAG] ◀ HTTP ${response.status} ${response.config?.url}\n` +
            `  Response: ${JSON.stringify(response.data)}`
        );
        return response;
      },
      (error: any) => {
        const status = error.response?.status ?? "network error";
        const body = error.response?.data ?? error.message;
        console.error(
          `[KMS DIAG] ✗ HTTP ${status} ${error.config?.url}\n` +
            `  Error response: ${JSON.stringify(body)}`
        );
        return Promise.reject(error);
      }
    );
  }

  isKmsEnabled(): boolean {
    return this.kmsManager.isKmsEnabled();
  }

  async createKey(description: string, passkeyPublicKey?: string) {
    return this.kmsManager.createKey(description, passkeyPublicKey ?? "");
  }

  async getKeyStatus(keyId: string) {
    return this.kmsManager.getKeyStatus(keyId);
  }

  async describeKey(keyId: string) {
    return this.kmsManager.describeKey(keyId);
  }

  /** Sign a hash using a Legacy Passkey assertion. */
  async signHashWithAssertion(address: string, hash: string, assertion: LegacyPasskeyAssertion) {
    return this.kmsManager.signHash(hash, assertion, { Address: address });
  }

  /** Sign a hash using a WebAuthn ceremony (one-time ChallengeId). */
  async signHashWithWebAuthn(
    address: string,
    hash: string,
    challengeId: string,
    credential: unknown
  ) {
    return this.kmsManager.signHashWithWebAuthn(hash, challengeId, credential, {
      Address: address,
    });
  }

  async beginAuthentication(params: { Address?: string; KeyId?: string }) {
    return this.kmsManager.beginAuthentication(params);
  }

  createKmsSigner(
    keyId: string,
    address: string,
    assertionProvider?: () => Promise<LegacyPasskeyAssertion>,
    provider?: ethers.Provider
  ): KmsSigner {
    const ap =
      assertionProvider ??
      (() => {
        throw new Error("Passkey assertion is required for signing. Provide an assertionProvider.");
      });
    return this.kmsManager.createKmsSigner(keyId, address, ap, provider as any);
  }
}
