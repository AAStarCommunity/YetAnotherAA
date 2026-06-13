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
import { applyConfig, CHAIN_SEPOLIA } from "@aastar/core";

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
  return createPublicClient({ chain, transport: rpcUrl ? http(rpcUrl) : http() });
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
  const walletClient = createWalletClient({
    chain,
    transport: custom(provider as Parameters<typeof custom>[0]),
  });
  const [address] = await walletClient.requestAddresses();
  return { address, walletClient };
}
