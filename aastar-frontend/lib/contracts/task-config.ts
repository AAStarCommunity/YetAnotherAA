import { createPublicClient, createWalletClient, custom, http } from "viem";
import { sepolia, anvil } from "viem/chains";

// ====== Chain Configuration ======

const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");

export const SUPPORTED_CHAIN = CHAIN_ID === 31337 ? anvil : sepolia;

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ??
  (CHAIN_ID === 31337 ? "http://127.0.0.1:8545" : "https://rpc.sepolia.org");

// ====== Contract Addresses ======

export const TASK_ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_TASK_ESCROW_ADDRESS ??
  "") as `0x${string}`;

export const JURY_CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_JURY_CONTRACT_ADDRESS ??
  "") as `0x${string}`;

export const MYSBT_ADDRESS = (process.env.NEXT_PUBLIC_MYSBT_ADDRESS ?? "") as `0x${string}`;

// Default reward token (OpenPNTs-compatible ERC-20)
export const DEFAULT_REWARD_TOKEN = (process.env.NEXT_PUBLIC_REWARD_TOKEN_ADDRESS ??
  "") as `0x${string}`;

export const DEFAULT_REWARD_TOKEN_SYMBOL = process.env.NEXT_PUBLIC_REWARD_TOKEN_SYMBOL ?? "USDC";

export const DEFAULT_REWARD_TOKEN_DECIMALS = parseInt(
  process.env.NEXT_PUBLIC_REWARD_TOKEN_DECIMALS ?? "6"
);

// ====== Viem Clients ======

export function getPublicClient() {
  return createPublicClient({
    chain: SUPPORTED_CHAIN,
    transport: http(RPC_URL),
  });
}

export function getWalletClient(provider: unknown) {
  return createWalletClient({
    chain: SUPPORTED_CHAIN,
    transport: custom(provider as Parameters<typeof custom>[0]),
  });
}

// ====== Task Type Constants ======
// bytes32 task type identifiers
export const TASK_TYPE_GENERAL =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`;
export const TASK_TYPE_DESIGN =
  "0x0000000000000000000000000000000000000000000000000000000000000002" as `0x${string}`;
export const TASK_TYPE_DEVELOPMENT =
  "0x0000000000000000000000000000000000000000000000000000000000000003" as `0x${string}`;
export const TASK_TYPE_MARKETING =
  "0x0000000000000000000000000000000000000000000000000000000000000004" as `0x${string}`;
export const TASK_TYPE_RESEARCH =
  "0x0000000000000000000000000000000000000000000000000000000000000005" as `0x${string}`;

export const TASK_TYPE_LABELS: Record<string, string> = {
  [TASK_TYPE_GENERAL]: "General",
  [TASK_TYPE_DESIGN]: "Design",
  [TASK_TYPE_DEVELOPMENT]: "Development",
  [TASK_TYPE_MARKETING]: "Marketing",
  [TASK_TYPE_RESEARCH]: "Research",
};

export const ALL_TASK_TYPES = [
  { value: TASK_TYPE_GENERAL, label: "General" },
  { value: TASK_TYPE_DESIGN, label: "Design" },
  { value: TASK_TYPE_DEVELOPMENT, label: "Development" },
  { value: TASK_TYPE_MARKETING, label: "Marketing" },
  { value: TASK_TYPE_RESEARCH, label: "Research" },
];

// ====== x402 API Server ======

/** Base URL of the MyTask x402 API server. Empty string = not configured. */
export const X402_API_URL = (process.env.NEXT_PUBLIC_X402_API_URL ?? "").replace(/\/$/, ""); // strip trailing slash

export const REWARD_TOKEN_NAME = process.env.NEXT_PUBLIC_REWARD_TOKEN_NAME ?? "USDC";

export const REWARD_TOKEN_VERSION = process.env.NEXT_PUBLIC_REWARD_TOKEN_VERSION ?? "2";

export function isX402Configured(): boolean {
  return X402_API_URL.length > 0;
}

export function isContractsConfigured(): boolean {
  return !!TASK_ESCROW_ADDRESS && TASK_ESCROW_ADDRESS !== "0x" && TASK_ESCROW_ADDRESS.length === 42;
}
