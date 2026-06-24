import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseGwei,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  AAStarAirAccountV7ABI,
  GuardClient,
  applyConfig,
  getCanonicalAddresses,
} from "@aastar/sdk/core";

const ENTRYPOINT_ABI = [
  {
    type: "function",
    name: "depositTo",
    stateMutability: "payable",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
  },
] as const;

// On-chain helpers for S4 (fund a fresh AirAccount, read balances/code, wait for an
// effect). Uses the same TEST_EOA_PRIVATE_KEY as the L1 harness. See TEST_PLAN S4.
const ROOT = join(process.cwd(), "..");

function env(key: string): string | undefined {
  for (const p of [join(ROOT, "scripts", "test", ".env.test"), join(ROOT, "aastar", ".env")]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      if (line.trim().startsWith("#")) continue;
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[1] === key)
        return m[2]
          .replace(/\s+#.*$/, "")
          .replace(/^["']|["']$/g, "")
          .trim();
    }
  }
  return process.env[key];
}

const client = () => createPublicClient({ chain: sepolia, transport: http(env("ETH_RPC_URL")) });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function fundWithEth(to: Address, eth: string): Promise<string> {
  const key = env("TEST_EOA_PRIVATE_KEY");
  if (!key) throw new Error("TEST_EOA_PRIVATE_KEY unset (scripts/test/.env.test)");
  const account = privateKeyToAccount(key as `0x${string}`);
  const transport = http(env("ETH_RPC_URL"));
  const pc = createPublicClient({ chain: sepolia, transport });
  const wc = createWalletClient({ account, chain: sepolia, transport });
  // Explicit, healthy gas so the fund tx is included promptly (Sepolia mempools
  // drop / stall under-priced txs).
  const hash = await wc.sendTransaction({
    to,
    value: parseEther(eth),
    maxFeePerGas: parseGwei("12"),
    maxPriorityFeePerGas: parseGwei("2"),
  });
  const receipt = await pc.waitForTransactionReceipt({
    hash,
    timeout: 120_000,
    pollingInterval: 3_000,
  });
  if (receipt.status !== "success") throw new Error(`fund tx reverted: ${hash}`);
  return hash;
}

export async function getEthBalance(addr: Address): Promise<bigint> {
  return client().getBalance({ address: addr });
}

/**
 * Pre-fund the account's EntryPoint DEPOSIT (EntryPoint.depositTo). A guard
 * account's first/deploy UserOp fails AA21 paying prefund from its plain balance;
 * a deposit covers the prefund directly.
 */
export async function depositToEntryPoint(account: Address, eth: string): Promise<string> {
  const key = env("TEST_EOA_PRIVATE_KEY");
  if (!key) throw new Error("TEST_EOA_PRIVATE_KEY unset");
  const acct = privateKeyToAccount(key as `0x${string}`);
  const transport = http(env("ETH_RPC_URL"));
  const pc = createPublicClient({ chain: sepolia, transport });
  const wc = createWalletClient({ account: acct, chain: sepolia, transport });
  const entryPoint = getCanonicalAddresses(11155111).entryPoint as Address;
  const hash = await wc.writeContract({
    address: entryPoint,
    abi: ENTRYPOINT_ABI,
    functionName: "depositTo",
    args: [account],
    value: parseEther(eth),
    maxFeePerGas: parseGwei("12"),
    maxPriorityFeePerGas: parseGwei("2"),
  });
  const r = await pc.waitForTransactionReceipt({ hash, timeout: 120_000, pollingInterval: 3_000 });
  if (r.status !== "success") throw new Error(`depositTo reverted: ${hash}`);
  return hash;
}

export async function getCode(addr: Address): Promise<string> {
  return (await client().getBytecode({ address: addr })) ?? "0x";
}

const ZERO = "0x0000000000000000000000000000000000000000";

/** The account's AAStarGlobalGuard address (0x0…0 if it has none). */
export async function getGuardAddress(account: Address): Promise<Address> {
  return (await client().readContract({
    address: account,
    abi: AAStarAirAccountV7ABI,
    functionName: "guard",
  })) as Address;
}

export function hasGuard(guard: Address): boolean {
  return !!guard && guard.toLowerCase() !== ZERO;
}

/** Read the guard's strict-mode flag via the SDK GuardClient. */
export async function getStrictMode(guard: Address): Promise<boolean> {
  applyConfig({ chainId: 11155111 });
  const gc = new GuardClient(client() as never, guard);
  return (await gc.getConfig()).strictMode;
}

/**
 * Poll until `addr`'s ETH balance has risen by at least `minDelta` from `baseline`.
 * This is the real proof a transfer EXECUTED — an ERC-4337 account can be deployed
 * (initCode) while the inner call reverts, so "has bytecode" alone is not enough
 * (Codex review). Returns the new balance; throws on timeout.
 */
export async function waitForBalanceIncrease(
  addr: Address,
  baseline: bigint,
  minDelta: bigint,
  timeoutMs = 150_000
): Promise<bigint> {
  const pc = client();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const bal = await pc.getBalance({ address: addr });
    if (bal - baseline >= minDelta) return bal;
    await sleep(4_000);
  }
  throw new Error(`${addr} balance did not rise by ${minDelta} wei within ${timeoutMs}ms`);
}
