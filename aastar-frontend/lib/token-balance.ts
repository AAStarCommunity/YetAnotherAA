/**
 * Client-side ERC-20 balance read (zero-backend migration, step 1b).
 *
 * Replaces the backend `GET /tokens/balance/:address` endpoint with a direct on-chain
 * read via viem, returning the same `TokenBalance` shape the UI already consumes. Uses
 * a lazily-created public client (same Sepolia config as the transfer flow) so callers
 * only pass the account + token address.
 */
import { erc20Abi, formatUnits, type PublicClient } from "viem";
import { CHAIN_SEPOLIA } from "@aastar/sdk/core";
import { ensureSdkConfig, getPublicClient } from "@/lib/sdk/client";
import { Token, TokenBalance } from "@/lib/types";

let cachedClient: PublicClient | null = null;

function publicClient(): PublicClient {
  if (!cachedClient) {
    ensureSdkConfig(CHAIN_SEPOLIA);
    cachedClient = getPublicClient();
  }
  return cachedClient;
}

/** Read an ERC-20 balance (+ decimals/symbol/name) for `accountAddress` on-chain. */
export async function getTokenBalance(
  accountAddress: string,
  tokenAddress: string
): Promise<TokenBalance> {
  const pc = publicClient();
  const token = tokenAddress as `0x${string}`;
  const owner = accountAddress as `0x${string}`;
  const [raw, decimalsRaw, symbol, name] = await Promise.all([
    pc.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
    pc.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
    pc.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
    pc.readContract({ address: token, abi: erc20Abi, functionName: "name" }),
  ]);
  const decimals = Number(decimalsRaw);
  const tokenInfo: Token = {
    address: tokenAddress,
    symbol: symbol as string,
    name: name as string,
    decimals,
  };
  return {
    token: tokenInfo,
    balance: (raw as bigint).toString(),
    formattedBalance: formatUnits(raw as bigint, decimals),
    decimals,
  };
}

/** Read only an ERC-20's metadata (no balance) — used when adding a custom token. */
export async function getTokenMetadata(tokenAddress: string): Promise<Token> {
  const pc = publicClient();
  const token = tokenAddress as `0x${string}`;
  const [decimalsRaw, symbol, name] = await Promise.all([
    pc.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
    pc.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
    pc.readContract({ address: token, abi: erc20Abi, functionName: "name" }),
  ]);
  return {
    address: tokenAddress,
    symbol: symbol as string,
    name: name as string,
    decimals: Number(decimalsRaw),
  };
}
