import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http, parseEther, type Address } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// Fund a fresh AirAccount with Sepolia ETH (for self-pay deploy + transfer gas in
// S4). Uses the same TEST_EOA_PRIVATE_KEY as the L1 harness. See docs/TEST_PLAN.md S4.
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

export async function fundWithEth(to: Address, eth: string): Promise<string> {
  const key = env("TEST_EOA_PRIVATE_KEY");
  const rpc = env("ETH_RPC_URL");
  if (!key) throw new Error("TEST_EOA_PRIVATE_KEY unset (scripts/test/.env.test)");
  const account = privateKeyToAccount(key as `0x${string}`);
  const transport = http(rpc);
  const pc = createPublicClient({ chain: sepolia, transport });
  const wc = createWalletClient({ account, chain: sepolia, transport });
  const hash = await wc.sendTransaction({ to, value: parseEther(eth) });
  await pc.waitForTransactionReceipt({ hash, timeout: 120_000, pollingInterval: 5_000 });
  return hash;
}
