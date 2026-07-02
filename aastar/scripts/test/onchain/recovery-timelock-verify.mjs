#!/usr/bin/env node
/**
 * Social-recovery timelock verification (headless L1, real Sepolia txs).
 *
 * Proves the recovery security property without waiting out the 48h timelock:
 *   1. guardian1 proposeRecovery(newOwner)     — msg.sender must be a guardian
 *   2. guardian2 approveRecovery()             — reaches M-of-N quorum (=2)
 *   3. anyone   executeRecovery()              — MUST REVERT (timelock not elapsed)  ← the assertion
 *   4. guardian1 cancelRecovery()              — clears the active proposal
 * The one thing this can NOT cover is the *successful* execute, which by design needs
 * ~48h of real chain time (RECOVERY_DELAY_MS = 48h) — run that once before mainnet.
 *
 * PREREQUISITE (not created here — see docs/REPLAY_AND_RECOVERY_VERIFICATION.md): an
 * AirAccount that already has ECDSA guardians = the two funded EOAs below. Account creation
 * is passkey/KMS-owned, so set the guardians once via the app, then point this at the account.
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
    let v = m[1].trim().replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
    return v ? (v.startsWith("0x") ? v : "0x" + v) : null;
  } catch {
    return null;
  }
}

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

(async () => {
  console.log(`Account ${ACCOUNT}\nGuardian1 ${g1.address}  Guardian2 ${g2.address}\nNewOwner ${NEW_OWNER}\n`);
  let pass = true;

  console.log("0. activeRecovery() should be empty:");
  let a = await readActive();
  console.log(`   newOwner=${a[0]} proposedAt=${a[1]}`);
  if (a[1] !== 0n) {
    console.log("   ⚠ a recovery is already active — cancelling first.");
    await send(w1, "cancelRecovery").catch(e => console.log("   (cancel failed: " + e.shortMessage + ")"));
  }

  console.log("1. guardian1 proposeRecovery:");
  await send(w1, "proposeRecovery", [NEW_OWNER]);
  a = await readActive();
  if (getAddress(a[0]) !== NEW_OWNER || a[1] === 0n) {
    pass = false;
    console.log(`   ✗ proposal not recorded (newOwner=${a[0]}, proposedAt=${a[1]})`);
  } else console.log(`   ✓ proposed (proposedAt=${a[1]})`);

  console.log("2. guardian2 approveRecovery (reach quorum):");
  await send(w2, "approveRecovery");

  console.log("3. executeRecovery BEFORE timelock — MUST revert:");
  try {
    await send(w1, "executeRecovery");
    pass = false;
    console.log("   ✗ execute SUCCEEDED before the 48h timelock — SECURITY FAILURE");
  } catch (e) {
    console.log(`   ✓ reverted as expected: ${e.shortMessage || e.message.split("\n")[0]}`);
  }

  console.log("4. guardian1 cancelRecovery:");
  await send(w1, "cancelRecovery");
  a = await readActive();
  if (a[1] !== 0n) {
    pass = false;
    console.log(`   ✗ proposal not cleared (proposedAt=${a[1]})`);
  } else console.log("   ✓ cleared");

  console.log(`\n${pass ? "PASS" : "FAIL"} — recovery timelock ${pass ? "enforced" : "NOT enforced"}.`);
  process.exit(pass ? 0 : 1);
})().catch(e => {
  console.error("ERROR:", e.shortMessage || e.message);
  process.exit(1);
});
