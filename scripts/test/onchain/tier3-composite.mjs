#!/usr/bin/env node
/**
 * Tier-3 WebAuthn cumulative composite (algId 0x0a) — on-chain regression on Sepolia (v0.21.0).
 *
 * YAA-side port of the SDK's authoritative reference
 * (`tier3-webauthn-composite-e2e.ts`). Proves YAA can assemble — using ONLY the published
 * `@aastar/sdk` packers — a Tier-3 composite signature (on-chain WebAuthn P256 passkey + DVT BLS
 * aggregate + guardian ECDSA) that the deployed v0.21.0 AirAccount ACCEPTS (validateUserOp == 0).
 *
 * The "device passkey" is simulated with a software P-256 key (registered via setP256Key) and a
 * SYNTHETIC WebAuthn assertion built exactly as `navigator.credentials.get()` produces it:
 *   - clientDataJSON = `{"type":"webauthn.get","challenge":"` + base64url(userOpHash) + suffix
 *   - the key signs sha256(authenticatorData ‖ sha256(clientDataJSON))  (ECDSA-SHA256, prehash=false)
 * so the on-chain WebAuthn reconstruction + P256VERIFY (0x100 precompile) passes — no browser needed.
 *
 * Flow (all live): deploy via the v0.21.0 factory (approvedAlgIds=[0x0a]) → setValidator + setP256Key
 * → build userOp + userOpHash → WebAuthn assertion → packWebAuthnBlob → DVT BLS aggregate → guardian
 * → packCumulativeT3WA → eth_call validateUserOp == 0. Negative: a tampered challenge is rejected.
 *
 *   node scripts/test/onchain/tier3-composite.mjs   (spends a little Sepolia ETH on first deploy)
 *
 * Requires: ETH_RPC_URL + TEST_EOA_PRIVATE_KEY (loaded from scripts/test/.env.test then aastar/.env)
 * and the three DVT nodes (dvt1/2/3.aastar.io) live & registered on-chain.
 *
 * Imports are from the PUBLISHED SDK only:
 *   @aastar/sdk/kms  → packWebAuthnBlob, packCumulativeT3WA, packBlsPayload, ALG_CUMULATIVE_T3_WA
 *   @aastar/sdk/core → CANONICAL_ADDRESSES, applyConfig, buildInitConfig, encodeG2Point,
 *                      airAccountFactoryActions, entryPointActions,
 *                      EntryPointABI, AAStarAirAccountV7ABI, AAStarBLSAlgorithmABI
 * BLS is fetched from the DVT nodes and aggregated locally with @noble/curves v2 (G2.Point),
 * because the SDK's BLSSignatureService needs full server DI (config/ethereum/storage/signer)
 * and is not usable standalone here.
 */
import { readFileSync } from "node:fs";
import { bls12_381 as noble } from "@noble/curves/bls12-381.js";
import { p256 } from "@noble/curves/nist.js";
import {
  createPublicClient,
  createWalletClient,
  http,
  sha256,
  concat,
  numberToHex,
  keccak256,
  toBytes,
  stringToBytes,
  bytesToHex,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  CANONICAL_ADDRESSES,
  applyConfig,
  buildInitConfig,
  encodeG2Point,
  airAccountFactoryActions,
  entryPointActions,
  EntryPointABI,
  AAStarAirAccountV7ABI,
  AAStarBLSAlgorithmABI,
} from "@aastar/sdk/core";
import {
  packWebAuthnBlob,
  packCumulativeT3WA,
  packBlsPayload,
  ALG_CUMULATIVE_T3_WA,
} from "@aastar/sdk/kms";

const CHAIN_ID = 11155111;

function env(key) {
  for (const p of ["scripts/test/.env.test", "aastar/.env"]) {
    try {
      const m = readFileSync(p, "utf8").match(new RegExp(`^${key}=([^\\s#]+)`, "m"));
      if (m) return m[1];
    } catch {
      /* ignore */
    }
  }
  return process.env[key];
}

const ZERO_BYTES32 = `0x${"00".repeat(32)}`;
const norm = h => (h.startsWith("0x") ? h : `0x${h}`).toLowerCase();

// Deterministic test material (so reruns reuse the same deployed account — idempotent).
const SALT = BigInt(keccak256(toBytes("yaa/tier3-webauthn-composite/v0.21.0")));
const P256_PRIV = toBytes(keccak256(toBytes("yaa/tier3-webauthn/p256")));
const GUARDIAN_PK = keccak256(toBytes("yaa/tier3-webauthn/guardian"));
const DVT_NODES = ["https://dvt1.aastar.io", "https://dvt2.aastar.io", "https://dvt3.aastar.io"];

function base64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Synthetic WebAuthn assertion over `userOpHash`, signed by software P-256 key `priv` (Uint8Array). */
function makeWebAuthnAssertion(userOpHash, priv) {
  const clientDataJSON =
    '{"type":"webauthn.get","challenge":"' +
    base64Url(toBytes(userOpHash)) +
    '","origin":"https://aastar.io","crossOrigin":false}';
  const clientDataBytes = stringToBytes(clientDataJSON);
  const authenticatorData = toBytes(`0x${"ab".repeat(32)}05${"00000001"}`); // rpIdHash + UP|UV + signCount
  const payloadHash = sha256(concat([bytesToHex(authenticatorData), sha256(clientDataBytes)]));
  // ECDSA-SHA256 over the already-final digest → prehash:false (noble v2 default would re-hash).
  const signature = p256.sign(toBytes(payloadHash), priv, { lowS: true, prehash: false, format: "der" });
  return { authenticatorData, clientDataJSON, signature };
}

/** Decode an EIP-2537 G2 signature (256 bytes) into a noble v2 G2.Point. */
function eip2537ToG2(sig256) {
  const raw = sig256.slice(2);
  const slot = i => raw.slice(i * 128, i * 128 + 128);
  const coord = h => BigInt("0x" + h.slice(32)); // drop the 16-byte zero pad → 48-byte Fp element
  const Fp2 = noble.fields.Fp2;
  const point = noble.G2.Point.fromAffine({
    x: Fp2.fromBigTuple([coord(slot(0)), coord(slot(1))]),
    y: Fp2.fromBigTuple([coord(slot(2)), coord(slot(3))]),
  });
  point.assertValidity();
  return point;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log(" YAA Tier-3 WebAuthn cumulative (0x0a) — passkey + DVT BLS + guardian, Sepolia v0.21.0");
  console.log("═══════════════════════════════════════════════════════════════════════════");

  const rpcUrl = env("ETH_RPC_URL");
  if (!rpcUrl) throw new Error("ETH_RPC_URL missing (scripts/test/.env.test or aastar/.env)");
  let testPk = env("TEST_EOA_PRIVATE_KEY");
  if (!testPk) throw new Error("TEST_EOA_PRIVATE_KEY missing");
  if (!testPk.startsWith("0x")) testPk = `0x${testPk}`;

  applyConfig({ chainId: CHAIN_ID });
  const C = CANONICAL_ADDRESSES[CHAIN_ID];
  const FACTORY = getAddress(C.airAccountFactoryV7); // v0.21.0
  const ENTRY_POINT = getAddress(C.entryPoint);
  const VALIDATOR_ROUTER = getAddress(C.aaStarValidator);
  const BLS_VERIFIER = getAddress(C.aaStarBLSAlgorithm);

  const transport = http(rpcUrl);
  const pc = createPublicClient({ chain: sepolia, transport });
  const owner = privateKeyToAccount(testPk);
  const walletClient = createWalletClient({ account: owner, chain: sepolia, transport });

  // Software P-256 "device passkey" + software ECDSA guardian.
  const p256Pub = p256.getPublicKey(P256_PRIV, false); // 65 bytes (0x04 ‖ X ‖ Y)
  const p256X = norm(Buffer.from(p256Pub.slice(1, 33)).toString("hex"));
  const p256Y = norm(Buffer.from(p256Pub.slice(33, 65)).toString("hex"));
  const guardian = privateKeyToAccount(GUARDIAN_PK);
  const guardianWallet = createWalletClient({ account: guardian, chain: sepolia, transport });
  console.log(`\n[0a] factory(v0.21.0)=${FACTORY}  owner=${owner.address}  guardian=${guardian.address}`);

  // ── Deploy a fresh account approving algId 0x0a, with the guardian ──────────────────────────
  const config = buildInitConfig({
    guardians: [{ ecdsa: guardian.address }],
    dailyLimit: 10n ** 18n,
    approvedAlgIds: [ALG_CUMULATIVE_T3_WA],
  });
  const account = await airAccountFactoryActions(FACTORY)(pc).getAddress({
    owner: owner.address,
    salt: SALT,
    config,
  });
  console.log(`[0b] account = ${account}`);
  const code = await pc.getCode({ address: account });
  if (code && code !== "0x") {
    console.log("     already deployed ✓");
  } else {
    const tx = await airAccountFactoryActions(FACTORY)(walletClient).createAccount({
      owner: owner.address,
      salt: SALT,
      config,
      account: owner,
    });
    const r = await pc.waitForTransactionReceipt({ hash: tx, timeout: 120_000, pollingInterval: 3_000 });
    console.log(`     deploy tx=${tx} status=${r.status}`);
    if (r.status !== "success") throw new Error("deploy reverted");
  }

  // ── setValidator (set-once) + register the passkey via setP256Key ───────────────────────────
  const curValidator = await pc.readContract({
    address: account,
    abi: AAStarAirAccountV7ABI,
    functionName: "validator",
  });
  if (curValidator === "0x0000000000000000000000000000000000000000") {
    const tx = await walletClient.writeContract({
      address: account,
      abi: AAStarAirAccountV7ABI,
      functionName: "setValidator",
      args: [VALIDATOR_ROUTER],
      chain: sepolia,
    });
    await pc.waitForTransactionReceipt({ hash: tx, timeout: 120_000, pollingInterval: 3_000 });
    console.log(`[0c] setValidator ✓`);
  } else {
    console.log(`[0c] validator already set`);
  }
  const curX = await pc.readContract({
    address: account,
    abi: AAStarAirAccountV7ABI,
    functionName: "p256KeyX",
  });
  if (curX === ZERO_BYTES32) {
    const tx = await walletClient.writeContract({
      address: account,
      abi: AAStarAirAccountV7ABI,
      functionName: "setP256Key",
      args: [p256X, p256Y],
      chain: sepolia,
    });
    await pc.waitForTransactionReceipt({ hash: tx, timeout: 120_000, pollingInterval: 3_000 });
    console.log(`     setP256Key ✓ (x=${p256X.slice(0, 14)}…)`);
  } else {
    console.log(`     p256Key already set`);
  }

  // ── Build userOp + userOpHash ───────────────────────────────────────────────────────────────
  const nonce = await entryPointActions(ENTRY_POINT)(pc).getNonce({ sender: account, key: 0n });
  const userOp = {
    sender: account,
    nonce,
    initCode: "0x",
    callData: "0x",
    accountGasLimits: ZERO_BYTES32,
    preVerificationGas: 0n,
    gasFees: ZERO_BYTES32,
    paymasterAndData: "0x",
    signature: "0x",
  };
  const userOpHash = await pc.readContract({
    address: ENTRY_POINT,
    abi: EntryPointABI,
    functionName: "getUserOpHash",
    args: [userOp],
  });
  console.log(`\n[1] userOpHash = ${userOpHash}`);

  // ── WebAuthn passkey assertion (challenge = userOpHash) → blob ──────────────────────────────
  const assertion = makeWebAuthnAssertion(userOpHash, P256_PRIV);
  const waBlob = packWebAuthnBlob(assertion, userOpHash);
  console.log(`[2] WebAuthn blob = ${(waBlob.length - 2) / 2} bytes (clientDataJSON challenge=userOpHash)`);

  // ── DVT BLS aggregate over userOpHash ───────────────────────────────────────────────────────
  const ownerAuth = await walletClient.signMessage({ account: owner, message: { raw: userOpHash } });
  const userOpRpc = {
    sender: userOp.sender,
    nonce: numberToHex(userOp.nonce),
    initCode: userOp.initCode,
    callData: userOp.callData,
    accountGasLimits: userOp.accountGasLimits,
    preVerificationGas: numberToHex(userOp.preVerificationGas),
    gasFees: userOp.gasFees,
    paymasterAndData: userOp.paymasterAndData,
    signature: userOp.signature,
  };
  const signed = [];
  for (const url of DVT_NODES) {
    try {
      const res = await fetch(`${url}/signature/sign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userOp: userOpRpc, ownerAuth }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.nodeId || !body.signature) {
        console.warn(`    ! ${url} -> ${res.status}`);
        continue;
      }
      const registered = await pc.readContract({
        address: BLS_VERIFIER,
        abi: AAStarBLSAlgorithmABI,
        functionName: "isRegistered",
        args: [norm(body.nodeId)],
      });
      if (!registered) {
        console.warn(`    ! ${url} not registered`);
        continue;
      }
      signed.push({ nodeId: norm(body.nodeId), signature: norm(body.signature) });
      console.log(`    ${url.replace("https://", "")}  registered`);
    } catch (e) {
      console.warn(`    ! ${url} ${(e.message || "").slice(0, 70)}`);
    }
  }
  if (signed.length < 2) throw new Error(`need >= 2 node co-signatures, got ${signed.length}`);
  const aggPoint = signed
    .slice(1)
    .reduce((acc, s) => acc.add(eip2537ToG2(s.signature)), eip2537ToG2(signed[0].signature));
  const blsSignature = encodeG2Point(`0x${aggPoint.toHex(false)}`);
  const blsPayload = packBlsPayload(
    signed.map(s => s.nodeId),
    blsSignature
  );
  console.log(`[3] aggregated ${signed.length} BLS co-signatures`);

  // ── Guardian ECDSA over userOpHash ──────────────────────────────────────────────────────────
  const guardianSignature = await guardianWallet.signMessage({ account: guardian, message: { raw: userOpHash } });

  // ── Pack the 0x0a WebAuthn composite + on-chain validate ────────────────────────────────────
  const composite = packCumulativeT3WA(waBlob, blsPayload, guardianSignature);
  console.log(`[4] packCumulativeT3WA = ${(composite.length - 2) / 2} bytes (algId=0x${composite.slice(2, 4)})`);

  async function validate(sigBytes) {
    try {
      const sim = await pc.simulateContract({
        address: account,
        abi: AAStarAirAccountV7ABI,
        functionName: "validateUserOp",
        args: [{ ...userOp, signature: sigBytes }, userOpHash, 0n],
        account: ENTRY_POINT,
      });
      return sim.result;
    } catch {
      return "revert";
    }
  }
  const accepted = await validate(composite);
  console.log(
    `\n[5] validateUserOp(0x0a WebAuthn composite) = ${accepted} -> ${accepted === 0n ? "0 ✅ ACCEPTED" : "❌ REJECTED"}`
  );

  // ── Negative: an assertion over a DIFFERENT hash must be rejected ───────────────────────────
  let negResult = "sdk-rejected";
  try {
    const badAssertion = makeWebAuthnAssertion(`0x${"ee".repeat(32)}`, P256_PRIV); // wrong challenge
    const badBlob = packWebAuthnBlob(badAssertion, userOpHash); // SDK should reject this
    negResult = await validate(packCumulativeT3WA(badBlob, blsPayload, guardianSignature));
  } catch {
    negResult = "sdk-rejected"; // packWebAuthnBlob's challenge!=userOpHash guard fired (correct)
  }
  console.log(
    `[6] negative (challenge != userOpHash) -> ${negResult === 0n ? "❌ accepted (BAD)" : `✅ rejected (${negResult})`}`
  );

  console.log("\n┌─────────────── EVIDENCE (Tier-3 WebAuthn composite, v0.21.0) ───────────────");
  console.log(`│ factory        : ${FACTORY} (v0.21.0)`);
  console.log(`│ account        : ${account}`);
  console.log(`│ userOpHash     : ${userOpHash}`);
  console.log(`│ waBlob bytes   : ${(waBlob.length - 2) / 2}`);
  console.log(`│ composite bytes: ${(composite.length - 2) / 2} (algId 0x0a)`);
  console.log(`│ validate(WA)   : ${accepted} ${accepted === 0n ? "= 0 ✅ ACCEPTED" : "❌"}`);
  console.log(`│ negative       : ${negResult} ${negResult !== 0n ? "✅ rejected" : "❌"}`);
  console.log("└──────────────────────────────────────────────────────────────────────────");

  if (accepted !== 0n) throw new Error("FAIL: WebAuthn 0x0a composite was NOT accepted on-chain");
  if (negResult === 0n) throw new Error("FAIL: wrong-challenge negative was accepted");
  console.log("\n🎉 PASS — Tier-3 WebAuthn composite ACCEPTED on-chain; wrong-challenge rejected.");
}

main().catch(e => {
  console.error(`\n❌ E2E FAILED: ${e.shortMessage ?? e.message}`);
  process.exit(1);
});
