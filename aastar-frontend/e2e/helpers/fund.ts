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
  xPNTsTokenActions,
} from "@aastar/sdk/core";
import { PaymasterClient, PaymasterOperator } from "@aastar/sdk/paymaster";

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

// Retry a flaky RPC op (timeouts / transient errors). Each attempt is bounded by
// the op's own timeout; we just re-try the same call (idempotent — same tx hash).
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 5,
  delayMs = 4_000
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(delayMs);
    }
  }
  throw last;
}

// Wait for a receipt, surviving RPC blips: short per-attempt timeout, retried.
async function confirmTx(
  pc: ReturnType<typeof client>,
  hash: `0x${string}`,
  label = "tx"
): Promise<void> {
  const receipt = await withRetry(() =>
    pc.waitForTransactionReceipt({ hash, timeout: 90_000, pollingInterval: 4_000 })
  );
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
}

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
    maxFeePerGas: parseGwei("20"),
    maxPriorityFeePerGas: parseGwei("2"),
  });
  await confirmTx(pc, hash, "fund");
  return hash;
}

export async function getEthBalance(addr: Address): Promise<bigint> {
  return client().getBalance({ address: addr });
}

// On-chain tier-2 limit — used to poll until a profile-arming UserOp has actually mined
// (the apply toast fires on submit, before the self-call lands), so a follow-on transfer's
// resolveTransfer reads the armed tiers rather than the still-zero pre-arm state.
export async function getTier2Limit(account: Address): Promise<bigint> {
  try {
    return (await client().readContract({
      address: account,
      abi: AAStarAirAccountV7ABI,
      functionName: "tier2Limit",
    })) as bigint;
  } catch {
    return 0n; // not deployed / not armed yet
  }
}

/**
 * Onboard an account for gasless ops via the SDK's V4 PaymasterClient: refresh the cached price,
 * then mint aPNTs (env admin = aPNTs communityOwner) and depositFor() into the account's INTERNAL
 * PaymasterV4 balance (balances[account][aPNTs]) — what validatePaymasterUserOp actually charges.
 * Without it a fresh account's gasless UserOp reverts AA33 Paymaster__InsufficientBalance.
 */
export async function onboardAPNTsGas(account: Address, amount: string): Promise<void> {
  const key = env("TEST_EOA_PRIVATE_KEY");
  if (!key) throw new Error("TEST_EOA_PRIVATE_KEY unset");
  const acct = privateKeyToAccount(key as `0x${string}`);
  const transport = http(env("ETH_RPC_URL"));
  const pc = createPublicClient({ chain: sepolia, transport });
  const wc = createWalletClient({ account: acct, chain: sepolia, transport });
  applyConfig({ chainId: 11155111 });
  const C = getCanonicalAddresses(11155111)!;
  const amt = parseEther(amount);
  const pm = C.paymasterV4 as Address;
  const apnts = C.aPNTs as Address;
  // PaymasterV4 is DEPOSIT-ONLY: validatePaymasterUserOp charges balances[sender][token] (the
  // account's INTERNAL paymaster balance), NOT the account's own aPNTs token balance, and prices
  // gas via a cached oracle. This is the V4 flow (distinct from the SuperPaymaster/permit flow),
  // so use the SDK's V4 PaymasterClient — never hand-rolled contract calls. Onboarding = refresh
  // the cached price (the updater cron is off in test → a stale price reverts the cost calc, AA33),
  // mint aPNTs to the admin (the aPNTs communityOwner), approve, then depositFor into the
  // account's internal balance.
  try {
    await confirmTx(
      pc,
      (await PaymasterOperator.updatePrice(wc, pm)) as `0x${string}`,
      "updatePrice"
    );
  } catch (e) {
    // updatePrice reverts when the cached price is still within the staleness window — expected,
    // skip. But log anything else (RPC down, wrong PM, not the price updater) so a real failure
    // isn't silently swallowed — the same lesson as the SDK's #229 silent-catch.
    console.warn(`onboardAPNTsGas: updatePrice skipped (${(e as Error)?.message ?? String(e)})`);
  }
  await confirmTx(
    pc,
    await xPNTsTokenActions(apnts)(wc).mint({ token: apnts, to: acct.address, amount: amt }),
    "aPNTs mint"
  );
  await confirmTx(
    pc,
    (await PaymasterClient.approveGasToken(wc, apnts, pm, amt)) as `0x${string}`,
    "approveGasToken"
  );
  await confirmTx(
    pc,
    (await PaymasterClient.depositFor(wc, pm, account, apnts, amt)) as `0x${string}`,
    "depositFor"
  );
}

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

/** Fund an address with GToken (ERC-20 transfer from the test EOA). `amount` in GT. */
export async function fundGToken(to: Address, amount: string): Promise<string> {
  const key = env("TEST_EOA_PRIVATE_KEY");
  if (!key) throw new Error("TEST_EOA_PRIVATE_KEY unset");
  const acct = privateKeyToAccount(key as `0x${string}`);
  const transport = http(env("ETH_RPC_URL"));
  const pc = createPublicClient({ chain: sepolia, transport });
  const wc = createWalletClient({ account: acct, chain: sepolia, transport });
  const gToken = getCanonicalAddresses(11155111)!.gToken as Address;
  const hash = await wc.writeContract({
    address: gToken,
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [to, parseEther(amount)],
    maxFeePerGas: parseGwei("20"),
    maxPriorityFeePerGas: parseGwei("2"),
  });
  await confirmTx(pc, hash, "GToken transfer");
  return hash;
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
  const entryPoint = getCanonicalAddresses(11155111)!.entryPoint as Address;
  const hash = await wc.writeContract({
    address: entryPoint,
    abi: ENTRYPOINT_ABI,
    functionName: "depositTo",
    args: [account],
    value: parseEther(eth),
    maxFeePerGas: parseGwei("20"),
    maxPriorityFeePerGas: parseGwei("2"),
  });
  await confirmTx(pc, hash, "depositTo");
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
