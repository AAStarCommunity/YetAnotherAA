// Browser glue for the P-256 (WebAuthn) guardian channel — airaccount-contract v0.20.0.
//
// A P-256 guardian is identified by its secp256r1 public key (x, y), NOT an address:
// the account contract stores the sentinel 0x7026 in the guardian address slot and the
// real pubkey in parallel storage. Here we provision a platform passkey (stored in
// iCloud Keychain / Google Password Manager so it syncs across the guardian's devices)
// and extract (x, y) for the owner to register via addP256Guardian / InitConfig.
//
// SDK-independent on purpose: this is the same kind of browser ceremony glue as
// extractLegacyAssertion() in lib/yaaa.ts. The on-chain submission and the recovery
// signing (WebAuthn assertion → calldata, EIP-7212 verified) are wrapped by the SDK
// (aastar-sdk#110) and are NOT done here.

import { startRegistration } from "@simplewebauthn/browser";

export interface GuardianPasskey {
  /** 0x-prefixed 32-byte secp256r1 X coordinate. */
  x: string;
  /** 0x-prefixed 32-byte secp256r1 Y coordinate. */
  y: string;
  /** base64url credential id — the guardian needs this to sign recoveries later. */
  credentialId: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return (
    "0x" +
    Array.from(bytes)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

function b64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlToBytes(b64url: string): Uint8Array {
  const b64 =
    b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64url.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Extract (x, y) from an ES256 SPKI DER public key. The SPKI for a P-256 key ends with
// the uncompressed EC point: 0x04 || X(32) || Y(32).
function xyFromSpki(spki: Uint8Array): { x: string; y: string } {
  if (spki.length < 65) throw new Error("Unexpected P-256 public key length");
  const point = spki.slice(spki.length - 65);
  if (point[0] !== 0x04) throw new Error("P-256 public key is not in uncompressed form");
  return { x: bytesToHex(point.slice(1, 33)), y: bytesToHex(point.slice(33, 65)) };
}

/**
 * Provision a platform passkey (ES256 / secp256r1) and return its public key (x, y).
 * The challenge is irrelevant for a guardian key — we only need the pubkey — so a random
 * one is used; the ceremony just creates the credential on the device.
 */
export async function createGuardianPasskey(opts: {
  userName: string;
  userDisplayName?: string;
}): Promise<GuardianPasskey> {
  if (typeof window === "undefined") throw new Error("createGuardianPasskey is browser-only");

  const credential = await startRegistration({
    optionsJSON: {
      challenge: b64urlEncode(crypto.getRandomValues(new Uint8Array(32))),
      rp: { id: window.location.hostname, name: "AAStar Guardian" },
      user: {
        id: b64urlEncode(crypto.getRandomValues(new Uint8Array(16))),
        name: opts.userName,
        displayName: opts.userDisplayName ?? opts.userName,
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }], // ES256 / secp256r1 only
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
      attestation: "none",
      timeout: 120000,
    },
  });

  const spkiB64 = credential.response.publicKey;
  if (!spkiB64) {
    throw new Error(
      "This device/browser didn't return a passkey public key. Use a platform passkey (Face ID / fingerprint) that syncs via iCloud or Google."
    );
  }
  const { x, y } = xyFromSpki(b64urlToBytes(spkiB64));
  return { x, y, credentialId: credential.id };
}
