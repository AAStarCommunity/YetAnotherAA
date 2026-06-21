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

import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
// Browser-safe subpath: the root "@aastar/sdk" pulls in the server bundle (imports
// 'fs') and breaks the client build; "/core" is pure crypto.
import { coseToP256XY } from "@aastar/sdk/core";

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
  // The WebAuthn SPKI DER ends with the uncompressed SEC1 point (0x04 || X || Y);
  // hand the last 65 bytes to the SDK's coseToP256XY (validates + splits x/y) — no
  // bespoke coordinate parsing here.
  const spki = b64urlToBytes(spkiB64);
  if (spki.length < 65) throw new Error("Unexpected P-256 public key length");
  const { x, y } = coseToP256XY(spki.slice(spki.length - 65));
  return { x, y, credentialId: credential.id };
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0) throw new Error("Invalid hex length");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Parse a DER-encoded ECDSA signature (WebAuthn ES256) into 32-byte r and s.
// DER: 0x30 len 0x02 rLen r… 0x02 sLen s… — each integer may carry a leading 0x00
// sign byte or be shorter than 32 bytes, so normalise to fixed 32-byte big-endian.
function derToRS(der: Uint8Array): { r: string; s: string } {
  if (der[0] !== 0x30) throw new Error("Bad DER: not a sequence");
  let off = 2; // skip 0x30, total-length
  const readInt = (): Uint8Array => {
    if (der[off] !== 0x02) throw new Error("Bad DER: expected integer");
    const len = der[off + 1];
    let val = der.slice(off + 2, off + 2 + len);
    off += 2 + len;
    while (val.length > 32 && val[0] === 0x00) val = val.slice(1); // drop sign byte
    if (val.length > 32) throw new Error("Bad DER: scalar too long");
    const padded = new Uint8Array(32);
    padded.set(val, 32 - val.length); // left-pad to 32 bytes
    return padded;
  };
  const r = readInt();
  const s = readInt();
  return { r: bytesToHex(r), s: bytesToHex(s) };
}

export interface GuardianRecoveryAssertion {
  authenticatorData: string;
  clientDataJSON: string;
  r: string;
  s: string;
}

/**
 * Have the guardian's passkey sign a recovery challenge (the 32-byte digest from the
 * backend's buildProposeRecoveryChallenge). Runs the WebAuthn assertion ceremony and
 * returns the parts the contract verifies (authenticatorData, clientDataJSON, r, s).
 * The (low-S normalisation + ABI encoding into the on-chain sig blob is done server-side
 * by the SDK's encodeWebAuthnAssertion.)
 */
export async function signGuardianRecovery(opts: {
  challenge: string;
}): Promise<GuardianRecoveryAssertion> {
  if (typeof window === "undefined") throw new Error("signGuardianRecovery is browser-only");

  const challengeBytes = hexToBytes(opts.challenge);
  const assertion = await startAuthentication({
    optionsJSON: {
      challenge: b64urlEncode(challengeBytes),
      rpId: window.location.hostname,
      userVerification: "required",
      timeout: 120000,
    },
  });

  const r = assertion.response;
  return {
    authenticatorData: bytesToHex(b64urlToBytes(r.authenticatorData)),
    clientDataJSON: bytesToHex(b64urlToBytes(r.clientDataJSON)),
    ...derToRS(b64urlToBytes(r.signature)),
  };
}
