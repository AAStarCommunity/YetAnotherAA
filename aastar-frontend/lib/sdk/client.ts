/**
 * Client-side SDK bootstrap for the operations portal.
 *
 * All operator/community writes are signed in the browser by the operator's own
 * wallet (MetaMask / injected EOA), so we build viem clients from
 * `window.ethereum` and drive the `@aastar/*` packages with them — no SSR, no
 * server-held keys. Reads use a plain RPC `PublicClient`.
 *
 * @module lib/sdk/client
 */
import { createPublicClient, createWalletClient, custom, http } from "viem";
import type { Address, Chain, PublicClient, WalletClient } from "viem";
import { sepolia } from "viem/chains";
import { applyConfig, CHAIN_SEPOLIA } from "@aastar/sdk/core";
import { TokenSaleClient } from "@aastar/sdk/tokens";
import { GuardClient } from "@aastar/sdk/core";
import { getRpcUrl } from "@/lib/api-key-store";

let sdkConfigured = false;

/**
 * Point the `@aastar/core` canonical addresses at the portal chain. Must run
 * before reading any `*_ADDRESS` constant or building an action. Idempotent.
 */
export function ensureSdkConfig(chainId: number = CHAIN_SEPOLIA): void {
  if (!sdkConfigured) {
    applyConfig({ chainId });
    sdkConfigured = true;
  }
}

/** The injected EIP-1193 provider (MetaMask etc.), or undefined during SSR / when absent. */
export function getInjectedProvider(): unknown | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { ethereum?: unknown }).ethereum;
}

/** Read-only viem client over a public RPC (defaults to the chain's public endpoint). */
export function getPublicClient(rpcUrl?: string, chain: Chain = sepolia): PublicClient {
  // Precedence: explicit arg → user-configured RPC (Settings, decentralization choice) →
  // viem's default public RPC. Lets a user point reads at their own node without code.
  const url = rpcUrl ?? getRpcUrl() ?? undefined;
  return createPublicClient({ chain, transport: url ? http(url) : http() });
}

/**
 * Connect the injected wallet and return the selected account plus a viem
 * `WalletClient` for signing portal transactions. Throws if no wallet is present.
 */
export async function connectWallet(
  chain: Chain = sepolia
): Promise<{ address: Address; walletClient: WalletClient }> {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new Error("No injected wallet found. Please install MetaMask or a compatible wallet.");
  }
  const transport = custom(provider as Parameters<typeof custom>[0]);
  // Resolve the selected account first, then bind it to the wallet client so
  // SDK actions that sign / send (TokenSaleClient.buy*, operator writes) don't
  // need the account threaded through every call.
  const [address] = await createWalletClient({ chain, transport }).requestAddresses();
  const walletClient = createWalletClient({ account: address, chain, transport });
  return { address, walletClient };
}

/**
 * Build the SDK's launch-sale client (buy GToken / aPNTs — gasless USDC via the
 * relayer, or self-pay USDC/USDT). viem is a single hoisted version across the
 * monorepo (both workspaces on ^2.47 + a root `viem` override), and
 * @aastar/sdk@0.26.4 declares viem as a peerDependency, so the SDK's types
 * resolve against that one viem — no version-drift cast needed.
 */
export function buildTokenSaleClient(
  publicClient: PublicClient,
  walletClient?: WalletClient,
  chainId: number = CHAIN_SEPOLIA
): TokenSaleClient {
  return new TokenSaleClient(publicClient, walletClient, { chainId });
}

/**
 * Build the SDK's GuardClient (read/encode an account's AAStarGlobalGuard spending
 * policy). Its `ReadClient` param is a narrowed viem read-client type the app's
 * `PublicClient` is runtime-compatible with but doesn't nominally satisfy; bridge
 * the gap here in the SDK boundary, not in business code.
 */
export function buildGuardClient(publicClient: PublicClient, guardAddress: Address): GuardClient {
  return new GuardClient(publicClient as never, guardAddress);
}

/** Ensure the injected wallet is on the expected chain; prompts a switch if not. */
export async function ensureChain(chainId: number = CHAIN_SEPOLIA): Promise<boolean> {
  const provider = getInjectedProvider() as
    | { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
    | undefined;
  if (!provider) return false;
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (parseInt(current, 16) === chainId) return true;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + chainId.toString(16) }],
    });
    return true;
  } catch {
    return false;
  }
}
