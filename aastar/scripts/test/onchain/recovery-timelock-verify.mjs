#!/usr/bin/env node
/**
 * Social-recovery timelock verification (headless L1, real Sepolia txs).
 *
 * Proves the recovery security property without waiting out the 48h timelock:
 *   1. guardian1 proposeRecovery(newOwner)   — msg.sender must be a guardian
 *   2. guardian2 approveRecovery()           — reach M-of-N quorum; ASSERTED via approvalBitmap
 *   3. anyone   executeRecovery()            — MUST revert with the TIMELOCK selector
 *                                              (0xaa40cfc6) — any other revert / success = FAIL
 *   4. cancelRecovery() is a 2-of-N quorum VOTE — single guardian leaves it active (asserted);
 *      both guardians clear it (asserted).
 * The one thing this can NOT cover is the *successful* execute, which by design needs
 * ~48h of real chain time (RECOVERY_DELAY = 48h) — run that once before mainnet.
 *
 * PREREQUISITE: a DEPLOYED AirAccount with two ECDSA guardians = the two funded EOAs below.
 * Create it via the app's guardian flow OR headlessly via the factory `createAccount` with an
 * ECDSA owner — see docs/SOCIAL_RECOVERY_TEST_REPORT.md §3.
 *
 * Usage:
 *   RPC_URL=... ACCOUNT=0x<airaccount> NEW_OWNER=0x<any> \
 *   GUARDIAN1_PK=0x.. GUARDIAN2_PK=0x.. node aastar/scripts/test/onchain/recovery-timelock-verify.mjs
 * (GUARDIAN{1,2}_PK default to PRIVATE_KEY_BOB / PRIVATE_KEY_ANNI from aastar/.env.)
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, getAddress, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

// TimelockNotExpired custom-error selector observed on-chain (AAStarAirAccountBase). The
// executeRecovery assertion requires EXACTLY this — so a revert for any other reason
// (quorum not met, wrong caller, bad state) does NOT get mis-counted as "timelock enforced".
const TIMELOCK_SELECTOR = "0xaa40cfc6";
const QUORUM = 2n;

const ABI = parseAbi([
  "function proposeRecovery(address _newOwner) external",
  "function approveRecovery() external",
  "function executeRecovery() external",
  "function cancelRecovery() external",
  "function activeRecovery() view returns (address newOwner, uint256 proposedAt, uint256 approvalBitmap, uint256 cancellationBitmap)",
]);

function fromEnvFile(key) {
  try {
    const m = readFileSync(new URL("../../../.env", import.meta.url), "utf8").match(
      new RegExp(`^${key}=(.+)$`, "m")
    );
    if (!m) return null;
    const v = m[1].trim().replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
    return v ? (v.startsWith("0x") ? v : "0x" + v) : null;
  } catch {
    return null;
  }
}

// Extract the 4-byte revert selector from a viem error, walking the cause chain and
// preferring structured fields over the message string.
function revertSelector(err) {
  const seen = new Set();
  for (let e = err; e && !seen.has(e); e = e.cause) {
    seen.add(e);
    for (const v of [e.signature, e.raw, typeof e.data === "string" ? e.data : undefined]) {
      if (typeof v === "string") {
        const m = v.match(/^0x[0-9a-fA-F]{8}/);
        if (m) return m[0].toLowerCase();
      }
    }
  }
  const m = (err.message ?? "").match(/reverted with the following signature:\s*(0x[0-9a-fA-F]{8})/);
  return m ? m[1].toLowerCase() : null;
}

const popcount = n => {
  let c = 0n;
  for (let x = n; x > 0n; x >>= 1n) c += x & 1n;
  return c;
};

const RPC_URL =
  process.env.RPC_URL || fromEnvFile("SEPOLIA_RPC_URL") || "https://ethereum-sepolia-rpc.publicnode.com";
const ACCOUNT = process.env.ACCOUNT && getAddress(process.env.ACCOUNT);
const NEW_OWNER = getAddress(process.env.NEW_OWNER || "0x000000000000000000000000000000000000dEaD");
const G1_PK = process.env.GUARDIAN1_PK || fromEnvFile("PRIVATE_KEY_BOB");
const G2_PK = process.env.GUARDIAN2_PK || fromEnvFile("PRIVATE_KEY_ANNI");

if (!ACCOUNT || !G1_PK || !G2_PK) {
  console.error(
    "Missing required input. Need ACCOUNT + two guardian keys (GUARDIAN1_PK/GUARDIAN2_PK or PRIVATE_KEY_BOB/ANNI in .env)."
  );
  process.exit(2);
}

const transport = http(RPC_URL);
const pub = createPublicClient({ chain: sepolia, transport });
const g1 = privateKeyToAccount(G1_PK);
const g2 = privateKeyToAccount(G2_PK);
const w1 = createWalletClient({ account: g1, chain: sepolia, transport });
const w2 = createWalletClient({ account: g2, chain: sepolia, transport });

const readActive = () => pub.readContract({ address: ACCOUNT, abi: ABI, functionName: "activeRecovery" });
const send = async (wallet, fn, args = []) => {
  const hash = await wallet.writeContract({ address: ACCOUNT, abi: ABI, functionName: fn, args });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  console.log(`   ${fn}(${args.join(",")}) by ${wallet.account.address} → ${hash} [${rcpt.status}]`);
  if (rcpt.status !== "success") throw new Error(`${fn} reverted on-chain`);
  return hash;
};

const fail = (checks, msg) => {
  checks.pass = false;
  console.log(`   ✗ ${msg}`);
};

(async () => {
  console.log(`Account ${ACCOUNT}\nGuardian1 ${g1.address}  Guardian2 ${g2.address}\nNewOwner ${NEW_OWNER}\n`);
  const checks = { pass: true };

  console.log("0. activeRecovery() must start empty (2-of-N cancel any stale proposal):");
  let a = await readActive();
  console.log(`   newOwner=${a[0]} proposedAt=${a[1]}`);
  if (a[1] !== 0n) {
    console.log("   stale recovery active — casting both guardians' cancel votes …");
    await send(w1, "cancelRecovery");
    await send(w2, "cancelRecovery");
    a = await readActive();
    if (a[1] !== 0n) {
      console.error("   ✗ could not clear a pre-existing recovery — aborting.");
      process.exit(1);
    }
  }
  console.log("   ✓ clean start");

  console.log("1. guardian1 proposeRecovery:");
  await send(w1, "proposeRecovery", [NEW_OWNER]);
  a = await readActive();
  if (getAddress(a[0]) !== NEW_OWNER || a[1] === 0n)
    fail(checks, `proposal not recorded (newOwner=${a[0]}, proposedAt=${a[1]})`);
  else console.log(`   ✓ proposed (proposedAt=${a[1]}, approvals=${popcount(a[2])})`);

  console.log("2. guardian2 approveRecovery — must reach quorum (assert approvalBitmap):");
  await send(w2, "approveRecovery");
  a = await readActive();
  const approvals = popcount(a[2]);
  if (a[1] === 0n || approvals < QUORUM)
    fail(checks, `quorum NOT reached before execute (proposedAt=${a[1]}, approvals=${approvals}/${QUORUM})`);
  else console.log(`   ✓ quorum reached (approvals=${approvals} ≥ ${QUORUM})`);

  console.log(`3. executeRecovery BEFORE timelock — MUST revert with ${TIMELOCK_SELECTOR}:`);
  try {
    await send(w1, "executeRecovery");
    fail(checks, "execute SUCCEEDED before the 48h timelock — SECURITY FAILURE");
  } catch (e) {
    const sel = revertSelector(e);
    if (sel === TIMELOCK_SELECTOR) console.log(`   ✓ reverted with timelock selector ${sel}`);
    else fail(checks, `reverted, but selector was ${sel ?? "unknown"} (expected ${TIMELOCK_SELECTOR}) — not proven to be the timelock`);
  }

  console.log("4. cancelRecovery is a 2-of-N quorum VOTE:");
  await send(w1, "cancelRecovery");
  a = await readActive();
  if (a[1] === 0n) fail(checks, "single-guardian cancel cleared the proposal (expected a quorum VOTE)");
  else console.log(`   ✓ after guardian1 cancel, still active (proposedAt=${a[1]}, cancels=${popcount(a[3])}) — one vote is not enough`);
  await send(w2, "cancelRecovery");
  a = await readActive();
  if (a[1] !== 0n) fail(checks, `proposal not cleared after 2-of-N cancel (proposedAt=${a[1]})`);
  else console.log("   ✓ cleared after both guardians cancelled");

  console.log(`\n${checks.pass ? "PASS" : "FAIL"} — recovery timelock ${checks.pass ? "enforced" : "NOT enforced"}.`);
  process.exit(checks.pass ? 0 : 1);
})().catch(e => {
  console.error("ERROR:", e.shortMessage || e.message);
  process.exit(1);
});
