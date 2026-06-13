import { YAAAClient } from "@aastar/airaccount";
import { KmsManager, LegacyPasskeyAssertion } from "@aastar/airaccount/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";

// In the browser, KMS calls are proxied through Next.js to avoid CORS issues.
// The proxy is configured in next.config.ts: /kms-api/* → KMS_PROXY_URL/*
const KMS_ENDPOINT =
  typeof window !== "undefined"
    ? "/kms-api"
    : process.env.NEXT_PUBLIC_KMS_URL || "https://kms1.aastar.io";

export const yaaa = new YAAAClient({
  apiURL: API_BASE_URL,
  tokenProvider: () => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token");
  },
  bls: {
    seedNodes: [
      process.env.NEXT_PUBLIC_BLS_SEED_NODE || "https://yetanotheraa-validator.onrender.com",
    ],
  },
});

export const kmsClient = new KmsManager({
  kmsEndpoint: KMS_ENDPOINT,
  kmsEnabled: true,
  kmsApiKey: process.env.NEXT_PUBLIC_KMS_API_KEY,
});

// ── extractLegacyAssertion ────────────────────────────────────────
// Browser-side utility: extracts raw assertion bytes from a WebAuthn
// authentication response into the Legacy hex format used by KMS SignHash.
// This is browser glue code (requires crypto.subtle) and is not part of the SDK.

function base64urlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
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

export async function extractLegacyAssertion(credential: {
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
  };
}): Promise<LegacyPasskeyAssertion> {
  const authenticatorDataBytes = base64urlToBytes(credential.response.authenticatorData);
  const clientDataJSONBytes = base64urlToBytes(credential.response.clientDataJSON);
  const signatureBytes = base64urlToBytes(credential.response.signature);

  const jsonArrayBuffer = new ArrayBuffer(clientDataJSONBytes.byteLength);
  new Uint8Array(jsonArrayBuffer).set(clientDataJSONBytes);
  const clientDataHash = new Uint8Array(await crypto.subtle.digest("SHA-256", jsonArrayBuffer));

  return {
    AuthenticatorData: bytesToHex(authenticatorDataBytes),
    ClientDataHash: bytesToHex(clientDataHash),
    Signature: bytesToHex(signatureBytes),
  };
}
