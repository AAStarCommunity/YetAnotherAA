#!/usr/bin/env node
/**
 * #3b on-chain e2e — raise tier limits via guardian co-signing (self-hosted guardians).
 *
 * Proves the SDK consumption path delivered in aastar-sdk#188 end to end:
 *   1. createAccountWithDefaults(owner, salt, g1, g1Sig, g2, g2Sig, dailyLimit) — deploy an
 *      account that actually HAS guardians (YAA's backend uses the free-form createAccount,
 *      which leaves guardians empty, so raise-limit can't work on those — see #382).
 *   2. modifyTierLimitsGuardianDigestFromChain(...) — reads tierLimitNonce, builds the digest;
 *      VERIFIED to equal the contract's _guardianOpHash('MODIFY_TIER_LIMITS', ...).
 *   3. Each guardian signs the digest with eth-prefixed signMessage (toEthSignedMessageHash —
 *      NOT raw); RECOVERY_THRESHOLD = 2 distinct guardians.
 *   4. encodeModifyTierLimitsWithGuardians(account, t1, t2, deadline, [sig1, sig2]).
 *   5. simulate then REALLY submit modifyTierLimitsWithGuardians — it's onlyOwner, so the
 *      account's owner (here an EOA) calls it directly with the guardian sigs in calldata.
 *      Asserts tier1Limit rises and tierLimitNonce increments on-chain.
 *
 * NB for the UI (#382): a real YAA account's owner is a passkey, not an EOA — wiring the
 * owner-call path (UserOp vs direct) is the remaining UI work; the mechanism here is proven.
 *
 * Run: node scripts/test/onchain/raise-tier-limits.mjs  (spends Sepolia ETH — deploys an account)
 */
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseGwei,
  keccak256,
  encodePacked,
  formatEther,
} from "viem";
import { sepolia } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  applyConfig,
  getCanonicalAddresses,
  AAStarAirAccountFactoryV7ABI,
  AAStarAirAccountV7ABI,
} from "@aastar/sdk/core";
import {
  modifyTierLimitsGuardianDigestFromChain,
  encodeModifyTierLimitsWithGuardians,
} from "@aastar/sdk/airaccount";

const CHAIN_ID = 11155111n;
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

async function main() {
  applyConfig({ chainId: 11155111 });
  const C = getCanonicalAddresses(11155111);
  const factory = C.airAccountFactoryV7;
  const transport = http(env("ETH_RPC_URL"));
  const pc = createPublicClient({ chain: sepolia, transport });
  const owner = privateKeyToAccount(env("TEST_EOA_PRIVATE_KEY"));
  const wc = createWalletClient({ account: owner, chain: sepolia, transport });
  const gas = { maxFeePerGas: parseGwei("15"), maxPriorityFeePerGas: parseGwei("2") };

  // Two self-hosted guardians (fresh keys this run).
  const g1 = privateKeyToAccount(generatePrivateKey());
  const g2 = privateKeyToAccount(generatePrivateKey());
  const salt = BigInt(Math.floor(Date.now() / 1000));
  const dailyLimit = parseEther("0.1");
  console.log("owner:", owner.address);
  console.log("guardians:", g1.address, g2.address, "| salt:", salt.toString());

  // Predict address + guardian acceptance signatures (ACCEPT_GUARDIAN, eth-signed-message).
  const account = await pc.readContract({
    address: factory,
    abi: AAStarAirAccountFactoryV7ABI,
    functionName: "getAddressWithDefaults",
    args: [owner.address, salt, g1.address, g2.address, dailyLimit],
  });
  console.log("predicted account:", account);
  const acceptHash = keccak256(
    encodePacked(
      ["string", "uint256", "address", "address", "uint256", "uint256"],
      ["ACCEPT_GUARDIAN", CHAIN_ID, factory, owner.address, salt, dailyLimit]
    )
  );
  const g1Sig = await g1.signMessage({ message: { raw: acceptHash } });
  const g2Sig = await g2.signMessage({ message: { raw: acceptHash } });

  // 1) Deploy the account with guardians.
  let hash = await wc.writeContract({
    address: factory,
    abi: AAStarAirAccountFactoryV7ABI,
    functionName: "createAccountWithDefaults",
    args: [owner.address, salt, g1.address, g1Sig, g2.address, g2Sig, dailyLimit],
    ...gas,
  });
  await pc.waitForTransactionReceipt({ hash, timeout: 120_000, pollingInterval: 3_000 });
  const code = await pc.getBytecode({ address: account });
  console.log("① account deployed:", code && code !== "0x" ? "✅" : "❌", "tx:", hash);
  const gc = await pc.readContract({
    address: account,
    abi: AAStarAirAccountV7ABI,
    functionName: "guardianCount",
  });
  console.log("   guardianCount:", gc.toString());

  // 2) Build the raise-limit digest (read nonce from chain).
  const newTier1 = parseEther("0.5");
  const newTier2 = parseEther("2");
  const deadline = salt + 86_400n; // +1 day, deterministic (no Date.now in the digest)
  const digest = await modifyTierLimitsGuardianDigestFromChain({
    client: pc,
    account,
    chainId: CHAIN_ID,
    tier1Limit: newTier1,
    tier2Limit: newTier2,
    deadline,
  });
  console.log("② digest:", digest);

  // 3) Two guardians sign the digest. The contract recovers via ECDSA.recover on a
  // bytes32 — OZ's recover does NOT prefix, but the guardian op path may use
  // toEthSignedMessageHash. Try eth-prefixed (signMessage) first.
  const sig1 = await g1.signMessage({ message: { raw: digest } });
  const sig2 = await g2.signMessage({ message: { raw: digest } });

  // 4) Encode the call.
  const call = encodeModifyTierLimitsWithGuardians(account, newTier1, newTier2, deadline, [
    sig1,
    sig2,
  ]);
  console.log("③ encoded call to:", call.to, "data:", call.data.slice(0, 14) + "…");

  // 5) Simulate as the account (onlyAccount) — a pass proves digest + sigs + call are correct.
  try {
    await pc.simulateContract({
      address: account,
      abi: AAStarAirAccountV7ABI,
      functionName: "modifyTierLimitsWithGuardians",
      args: [newTier1, newTier2, deadline, [sig1, sig2]],
      account: owner.address, // the account's owner calls it (with the guardian sigs in calldata)
    });
    console.log("④ simulate modifyTierLimitsWithGuardians: ✅ PASS");
  } catch (e) {
    const meta = (e.metaMessages || []).filter(m => /Error|[A-Z]\w+\(/.test(m)).join(" | ");
    console.log("④ simulate: ❌", meta || (e.shortMessage ?? e.message).slice(0, 120));
    process.exitCode = 1;
    return;
  }

  // 6) REAL on-chain submission — owner calls it directly (onlyOwner; owner is the EOA).
  const before = await pc.readContract({
    address: account,
    abi: AAStarAirAccountV7ABI,
    functionName: "tier1Limit",
  });
  hash = await wc.writeContract({
    address: account,
    abi: AAStarAirAccountV7ABI,
    functionName: "modifyTierLimitsWithGuardians",
    args: [newTier1, newTier2, deadline, [sig1, sig2]],
    ...gas,
  });
  const rcpt = await pc.waitForTransactionReceipt({
    hash,
    timeout: 120_000,
    pollingInterval: 3_000,
  });
  const after = await pc.readContract({
    address: account,
    abi: AAStarAirAccountV7ABI,
    functionName: "tier1Limit",
  });
  const nonceAfter = await pc.readContract({
    address: account,
    abi: AAStarAirAccountV7ABI,
    functionName: "tierLimitNonce",
  });
  const ok = rcpt.status === "success" && after === newTier1 && nonceAfter === 1n;
  console.log(`⑤ on-chain raise: ${ok ? "✅ PASS" : "❌ FAIL"} tx: ${hash}`);
  console.log(
    `   tier1Limit ${formatEther(before)} → ${formatEther(after)} ETH | tierLimitNonce → ${nonceAfter}`
  );
  if (!ok) process.exitCode = 1;
}

main().catch(e => {
  console.error("FAILED:", e.shortMessage ?? e.message);
  process.exitCode = 1;
});
