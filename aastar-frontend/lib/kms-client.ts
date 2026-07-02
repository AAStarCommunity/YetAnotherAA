/**
 * Frontend KMS client — communicates directly with the STM32 KMS
 * for WebAuthn registration/authentication ceremonies and key status queries.
 *
 * Signing operations go through the backend (which calls KMS internally),
 * but WebAuthn ceremonies must happen in the browser.
 */
import { getApiKey, getKmsUrl } from "./api-key-store";

// ── Types ────────────────────────────────────────────────────────

export interface LegacyPasskeyAssertion {
  AuthenticatorData: string; // "0x..."
  ClientDataHash: string; // "0x..."
  Signature: string; // "0x..."
}

export interface KmsBeginRegistrationRequest {
  Description?: string;
  UserName?: string;
  UserDisplayName?: string;
}

export interface KmsBeginRegistrationResponse {
  ChallengeId: string;
  Options: PublicKeyCredentialCreationOptions;
}

export interface KmsCompleteRegistrationRequest {
  ChallengeId: string;
  Credential: unknown;
  Description?: string;
}

export interface KmsCompleteRegistrationResponse {
  KeyId: string;
  CredentialId: string;
  Status: string;
}

export interface KmsBeginAuthenticationRequest {
  Address?: string;
  KeyId?: string;
}

export interface KmsBeginAuthenticationResponse {
  ChallengeId: string;
  Options: PublicKeyCredentialRequestOptions;
}

export interface KmsKeyStatusResponse {
  KeyId: string;
  Status: "creating" | "deriving" | "ready" | "error";
  Address?: string;
  PublicKey?: string;
  DerivationPath?: string;
  Error?: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function base64urlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return (
    "0x" +
    Array.from(bytes)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

// ── KmsClient ────────────────────────────────────────────────────

export class KmsClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`KMS ${path} failed (${response.status}): ${text}`);
    }

    return response.json() as Promise<T>;
  }

  // ── WebAuthn Ceremonies ───────────────────────────────────────

  async beginRegistration(
    params: KmsBeginRegistrationRequest
  ): Promise<KmsBeginRegistrationResponse> {
    return this.request("/BeginRegistration", params);
  }

  async completeRegistration(
    params: KmsCompleteRegistrationRequest
  ): Promise<KmsCompleteRegistrationResponse> {
    return this.request("/CompleteRegistration", params);
  }

  async beginAuthentication(
    params: KmsBeginAuthenticationRequest
  ): Promise<KmsBeginAuthenticationResponse> {
    return this.request("/BeginAuthentication", params);
  }

  // ── Key Status ────────────────────────────────────────────────

  async getKeyStatus(keyId: string): Promise<KmsKeyStatusResponse> {
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }

    const response = await fetch(`${this.baseUrl}/KeyStatus?KeyId=${encodeURIComponent(keyId)}`, {
      headers,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`KMS /KeyStatus failed (${response.status}): ${text}`);
    }

    return response.json() as Promise<KmsKeyStatusResponse>;
  }

  /**
   * Poll KeyStatus until the key is ready (address derived).
   * STM32 key derivation takes 60-75 seconds on first creation.
   */
  async pollUntilReady(
    keyId: string,
    timeoutMs: number = 120_000,
    intervalMs: number = 3_000
  ): Promise<KmsKeyStatusResponse> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const status = await this.getKeyStatus(keyId);

      if (status.Status === "ready") {
        return status;
      }
      if (status.Status === "error") {
        throw new Error(`KMS key derivation failed: ${status.Error ?? "unknown error"}`);
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error(`KMS key derivation timed out after ${timeoutMs}ms`);
  }

  // ── Legacy Assertion Extraction ───────────────────────────────

  /**
   * Extract raw assertion data from a WebAuthn authentication response
   * into Legacy hex format. Legacy assertions are reusable (no challenge
   * consumption), enabling BLS dual-signing with a single Passkey prompt.
   */
  async extractLegacyAssertion(credential: {
    response: {
      authenticatorData: string; // base64url
      clientDataJSON: string; // base64url
      signature: string; // base64url
    };
  }): Promise<LegacyPasskeyAssertion> {
    const authenticatorDataBytes = base64urlToBytes(credential.response.authenticatorData);
    const clientDataJSONBytes = base64urlToBytes(credential.response.clientDataJSON);
    const signatureBytes = base64urlToBytes(credential.response.signature);

    // SHA-256 hash of clientDataJSON — copy to a plain ArrayBuffer for SubtleCrypto
    const jsonArrayBuffer = new ArrayBuffer(clientDataJSONBytes.byteLength);
    new Uint8Array(jsonArrayBuffer).set(clientDataJSONBytes);
    const clientDataHash = new Uint8Array(await crypto.subtle.digest("SHA-256", jsonArrayBuffer));

    return {
      AuthenticatorData: bytesToHex(authenticatorDataBytes),
      ClientDataHash: bytesToHex(clientDataHash),
      Signature: bytesToHex(signatureBytes),
    };
  }
}

// ── Direct-KMS seam (zero-backend migration — foundation prep) ────────────────
//
// Today the app reaches KMS through the server-side `/kms-api` proxy (which injects the
// shared KMS_API_KEY). The zero-backend target is to call KMS DIRECTLY from the browser,
// authorized by the user's OWN API key (from api-key-store) + the browser Origin. These
// helpers wire the existing KmsClient to that model. NOT yet used by the transfer/auth
// flows — they keep using `/kms-api` until the KMS Origin+API-key path is live (revised
// plan step 2). The Settings page uses them to configure + test the key.

export const DEFAULT_KMS_URL = "https://kms.aastar.io";

/** The KMS base URL: a user override (Settings), else the build-time default. */
export function kmsBaseUrl(): string {
  return getKmsUrl() || process.env.NEXT_PUBLIC_KMS_URL || DEFAULT_KMS_URL;
}

/** True once the user has supplied an API key (the direct-KMS path is configured). */
export function isDirectKmsReady(): boolean {
  return !!getApiKey();
}

/** A KmsClient wired for DIRECT browser→KMS access with the user's API key. */
export function directKmsClient(): KmsClient {
  return new KmsClient(kmsBaseUrl(), getApiKey() ?? undefined);
}

/**
 * Best-effort KMS health probe — no infra assumption. Settings uses it to sanity-check the
 * endpoint (and, once Origin-auth is live, whether the browser is allowed). Never throws.
 */
export async function pingKms(): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch(`${kmsBaseUrl().replace(/\/$/, "")}/health`, { method: "GET" });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
