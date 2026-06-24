// Shared helpers for L1 on-chain test cases. See docs/TEST_PLAN.md / TEST_PREPARATION.md.
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, createWalletClient, http } from "viem";
import { sepolia, mainnet, optimism } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export function loadEnv() {
  const out = {};
  for (const p of [join(ROOT, "aastar", ".env"), join(ROOT, "scripts", "test", ".env.test")]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      if (line.trim().startsWith("#")) continue;
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if (!/^["']/.test(v)) v = v.replace(/\s+#.*$/, "");
      out[m[1]] = v.replace(/^["']|["']$/g, "").trim();
    }
  }
  return { ...out, ...process.env };
}

export function chainFor(id) {
  return id === 1 ? mainnet : id === 10 ? optimism : sepolia;
}

export function ctx() {
  const env = loadEnv();
  const mainnetMode = process.argv.includes("--mainnet");
  const chainId = mainnetMode ? Number(env.MAINNET_CHAIN_ID || 1) : 11155111;
  const chain = chainFor(chainId);
  if (mainnetMode && env.MAINNET_ENABLED !== "true") {
    throw new Error("Mainnet cases blocked: set MAINNET_ENABLED=true in scripts/test/.env.test");
  }
  if (!env.TEST_EOA_PRIVATE_KEY)
    throw new Error("TEST_EOA_PRIVATE_KEY unset (scripts/test/.env.test)");
  const account = privateKeyToAccount(env.TEST_EOA_PRIVATE_KEY);
  const transport = http(env.ETH_RPC_URL);
  return {
    env,
    chainId,
    chain,
    account,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ account, chain, transport }),
    explorer: chain.blockExplorers?.default?.url ?? "https://sepolia.etherscan.io",
  };
}

// Append a real, queryable record to docs/test-evidence/<net>/<caseId>.json.
export function writeEvidence(caseId, chainId, record) {
  const net = chainId === 1 ? "mainnet" : chainId === 10 ? "optimism" : "sepolia";
  const dir = join(ROOT, "docs", "test-evidence", net);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${caseId}.json`);
  const payload = { caseId, network: net, chainId, ...record, runAt: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}
