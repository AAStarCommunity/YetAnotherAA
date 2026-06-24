import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { createPublicClient, createWalletClient, http, parseGwei, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { withRetry } from "./fund";

// An injected EIP-1193 wallet (a window.ethereum shim) for S5 operator/community
// WRITE flows that are signed by the operator's own EOA via MetaMask. The private
// key + signing stay in Node (exposed to the page via bound functions); the browser
// only gets a thin provider. See docs/TEST_PLAN.md S5.
const ROOT = join(process.cwd(), "..");
const SEPOLIA_HEX = "0xaa36a7";

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

export async function installTestWallet(page: Page, privateKey?: string): Promise<string> {
  const key = privateKey || env("TEST_EOA_PRIVATE_KEY");
  if (!key) throw new Error("TEST_EOA_PRIVATE_KEY unset (scripts/test/.env.test)");
  const account = privateKeyToAccount(key as Hex);
  const transport = http(env("ETH_RPC_URL"));
  const wc = createWalletClient({ account, chain: sepolia, transport });
  const pc = createPublicClient({ chain: sepolia, transport });

  // Node-side handlers (key never enters the browser).
  await page.exposeFunction("__walletSendTx", async (tx: Record<string, string>) =>
    wc.sendTransaction({
      account,
      chain: sepolia,
      to: tx.to as Hex,
      data: tx.data as Hex | undefined,
      value: tx.value ? BigInt(tx.value) : undefined,
      gas: tx.gas ? BigInt(tx.gas) : undefined,
      // Healthy gas fallback so wizard writes are included promptly on Sepolia when
      // the dapp doesn't set fees (otherwise viem's estimate can stall the tx).
      maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : parseGwei("25"),
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas
        ? BigInt(tx.maxPriorityFeePerGas)
        : parseGwei("3"),
    })
  );
  await page.exposeFunction("__walletSign", async (method: string, params: string[]) => {
    if (method === "personal_sign")
      return account.signMessage({ message: { raw: params[0] as Hex } });
    if (method === "eth_signTypedData_v4") return account.signTypedData(JSON.parse(params[1]));
    throw new Error(`unsupported sign method: ${method}`);
  });
  await page.exposeFunction("__walletRpc", async (method: string, params: unknown[]) =>
    withRetry(() => pc.request({ method: method as never, params: params as never }), 4, 2_000)
  );

  // Inject the provider before any app script runs.
  await page.addInitScript(
    ({ address, chainIdHex }) => {
      const provider = {
        isMetaMask: true,
        request: async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
          const w = window as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
          switch (method) {
            case "eth_requestAccounts":
            case "eth_accounts":
              return [address];
            case "eth_chainId":
              return chainIdHex;
            case "net_version":
              return String(parseInt(chainIdHex, 16));
            case "wallet_switchEthereumChain":
            case "wallet_addEthereumChain":
            case "wallet_watchAsset":
              return null;
            case "eth_sendTransaction":
              return w.__walletSendTx((params as unknown[])[0]);
            case "personal_sign":
            case "eth_signTypedData_v4":
              return w.__walletSign(method, params);
            default:
              return w.__walletRpc(method, params);
          }
        },
        on: () => {},
        removeListener: () => {},
        removeAllListeners: () => {},
      };
      (window as unknown as { ethereum: unknown }).ethereum = provider;
    },
    { address: account.address, chainIdHex: SEPOLIA_HEX }
  );

  return account.address;
}
