#!/usr/bin/env node
/**
 * Test prerequisite checker — see docs/TEST_PREPARATION.md.
 * Verifies env vars, services (RPC/bundler/KMS/DVT), and the test EOA's balances.
 * Exit non-zero if any CRITICAL (❌) item is missing — testing should not start.
 *
 *   node scripts/test/check-prereqs.mjs            # Sepolia (default)
 *   node scripts/test/check-prereqs.mjs --mainnet  # mainnet (needs MAINNET_ENABLED)
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, http, formatEther, formatUnits } from "viem";
import { sepolia, mainnet, optimism } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { getDvtRelayerUrlsForChain, checkDvtConnectivity } from "@aastar/sdk/core";
import { TokenSaleClient } from "@aastar/sdk/tokens";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadEnv(p) {
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    // Strip an unquoted inline comment ( # …), then surrounding quotes.
    if (!/^["']/.test(v)) v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v.replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

const env = {
  ...loadEnv(join(ROOT, "aastar", ".env")),
  ...loadEnv(join(ROOT, "scripts", "test", ".env.test")),
  ...process.env,
};

const mainnetMode = process.argv.includes("--mainnet");
const chainId = mainnetMode ? Number(env.MAINNET_CHAIN_ID || 1) : 11155111;
const chain = chainId === 1 ? mainnet : chainId === 10 ? optimism : sepolia;

let critical = 0;
let warned = 0;
const rows = [];
const ok = (name, detail = "") => rows.push(["✅", name, detail]);
const bad = (name, detail = "") => {
  critical++;
  rows.push(["❌", name, detail]);
};
const wrn = (name, detail = "") => {
  warned++;
  rows.push(["⚠️ ", name, detail]);
};

// ── 1. Env vars ───────────────────────────────────────────────
for (const k of ["JWT_SECRET", "ETH_RPC_URL", "BUNDLER_RPC_URL", "CHAIN_ID"]) {
  env[k] ? ok(`env ${k}`) : bad(`env ${k}`, "missing (aastar/.env)");
}
if (!env.USER_ENCRYPTION_KEY) bad("env USER_ENCRYPTION_KEY", "missing");
else if (env.USER_ENCRYPTION_KEY.length !== 32)
  bad("USER_ENCRYPTION_KEY length", `must be 32 chars, got ${env.USER_ENCRYPTION_KEY.length}`);
else ok("env USER_ENCRYPTION_KEY", "32 chars");
env.KMS_API_KEY ? ok("env KMS_API_KEY") : wrn("env KMS_API_KEY", "needed for passkey/KMS flows");
if (mainnetMode && env.MAINNET_ENABLED !== "true")
  bad("MAINNET_ENABLED", "set true in scripts/test/.env.test to run mainnet cases");

// ── 2. RPC + bundler ──────────────────────────────────────────
const pc = createPublicClient({ chain, transport: http(env.ETH_RPC_URL) });
try {
  const id = await pc.getChainId();
  id === chainId
    ? ok("RPC reachable", `chainId ${id}`)
    : bad("RPC chainId", `expected ${chainId}, got ${id}`);
} catch (e) {
  bad("RPC reachable", String(e.message || e).slice(0, 80));
}
if (env.BUNDLER_RPC_URL) {
  try {
    const r = await fetch(env.BUNDLER_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_supportedEntryPoints",
        params: [],
      }),
    });
    r.ok ? ok("Bundler reachable") : wrn("Bundler reachable", `HTTP ${r.status}`);
  } catch (e) {
    wrn("Bundler reachable", String(e.message || e).slice(0, 60));
  }
}

// ── 3. KMS ────────────────────────────────────────────────────
if (env.KMS_ENABLED === "true" && env.KMS_ENDPOINT) {
  try {
    const r = await fetch(`${env.KMS_ENDPOINT.replace(/\/$/, "")}/version`, {
      headers: env.KMS_API_KEY ? { "x-api-key": env.KMS_API_KEY } : {},
    });
    r.ok ? ok("KMS reachable", env.KMS_ENDPOINT) : wrn("KMS reachable", `HTTP ${r.status}`);
  } catch (e) {
    wrn("KMS reachable", String(e.message || e).slice(0, 60));
  }
} else {
  wrn("KMS", "KMS_ENABLED!=true — passkey flows (login/transfer/guard write) unavailable");
}

// ── 4. DVT relays (gasless buy) — Sepolia only ────────────────
try {
  const urls = getDvtRelayerUrlsForChain(chainId);
  if (urls.length === 0) {
    wrn("DVT relays", `none for chain ${chainId} (sale/gasless not on this chain)`);
  } else {
    const nodes = await checkDvtConnectivity();
    const online = nodes.filter(n => n.ok).length;
    online === nodes.length
      ? ok("DVT relays", `${online}/${nodes.length} online`)
      : wrn("DVT relays", `${online}/${nodes.length} online`);
  }
} catch (e) {
  wrn("DVT relays", String(e.message || e).slice(0, 60));
}

// ── 5. Test EOA + balances ────────────────────────────────────
if (!env.TEST_EOA_PRIVATE_KEY || !/^0x[0-9a-fA-F]{64}$/.test(env.TEST_EOA_PRIVATE_KEY)) {
  bad("TEST_EOA_PRIVATE_KEY", "set a funded test EOA key in scripts/test/.env.test (L1 on-chain)");
} else {
  try {
    const acct = privateKeyToAccount(env.TEST_EOA_PRIVATE_KEY);
    ok("TEST_EOA", acct.address);
    const sale = new TokenSaleClient(pc, undefined, { chainId });
    const b = await sale.getBalances(acct.address);
    const check = (label, val, dec, min) => {
      const human = Number(formatUnits(val, dec));
      human >= min
        ? ok(`balance ${label}`, `${human}`)
        : wrn(`balance ${label}`, `${human} (< ${min} suggested)`);
    };
    check("ETH", b.eth, 18, 0.05);
    check("USDC", b.usdc, 6, 10);
    check("USDT", b.usdt, 6, 5);
    check("GToken", b.gToken, 18, 1);
    check("aPNTs", b.aPNTs, 18, 10);
  } catch (e) {
    bad("Test EOA balances", String(e.message || e).slice(0, 80));
  }
}

// ── 6. Test AirAccount has a guard (D3) ───────────────────────
if (env.TEST_AIR_ACCOUNT && /^0x[0-9a-fA-F]{40}$/.test(env.TEST_AIR_ACCOUNT)) {
  try {
    const g = await pc.readContract({
      address: env.TEST_AIR_ACCOUNT,
      abi: [
        {
          type: "function",
          name: "guard",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "address" }],
        },
      ],
      functionName: "guard",
    });
    g && g !== "0x0000000000000000000000000000000000000000"
      ? ok("TEST_AIR_ACCOUNT guard", g)
      : wrn("TEST_AIR_ACCOUNT guard", "no guard (D3 Guard-write cases will be skipped)");
  } catch {
    wrn("TEST_AIR_ACCOUNT", "not deployed / guard() unreadable");
  }
} else {
  wrn("TEST_AIR_ACCOUNT", "unset — D3 Guard-write cases need a deployed account with a guard");
}

// ── 7. Services (optional) ────────────────────────────────────
for (const [name, url] of [
  ["Backend :3000", "http://localhost:3000/api-docs"],
  ["Frontend :5173", "http://localhost:5173/tokens"],
]) {
  try {
    const r = await fetch(url);
    r.ok ? ok(name) : wrn(name, `HTTP ${r.status} (start it before L2/L3)`);
  } catch {
    wrn(name, "down (start before L2/L3)");
  }
}

// ── Report ────────────────────────────────────────────────────
console.log(`\nTest prerequisites — chain ${chainId} (${chain.name})\n`);
for (const [icon, name, detail] of rows)
  console.log(`  ${icon} ${name}${detail ? "  —  " + detail : ""}`);
console.log(`\n${rows.length} checks · ${critical} critical(❌) · ${warned} warning(⚠️)`);
if (critical > 0) {
  console.log(
    "\n⛔ Critical prerequisites missing — fix the ❌ items before testing (see docs/TEST_PREPARATION.md).\n"
  );
  process.exit(1);
}
console.log("\n✅ Ready to test (review ⚠️ — some domains may be limited).\n");
