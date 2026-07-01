/**
 * Client-side user token list (zero-backend migration, step 1c).
 *
 * Replaces the backend `/user-tokens*` endpoints + DB with per-account localStorage.
 * Only the three methods the UI actually used are implemented: getUserTokens,
 * addUserToken, initializeDefaultTokens. Balances are attached via the client-side
 * on-chain reader (step 1b), never from a server.
 *
 * NOTE: the default token list mirrors the old backend PRESET_TOKENS verbatim — they
 * are Optimism (chainId 10) contracts, a pre-existing mismatch with this Sepolia app
 * (their balances won't resolve on Sepolia). Preserved as-is to keep the migration
 * behavior-identical; fixing the default set to Sepolia tokens is a separate change.
 */
import { UserToken, UserTokenWithBalance } from "@/lib/types";
import { getTokenBalance, getTokenMetadata } from "@/lib/token-balance";

const BASE_KEY = "yaa.userTokens";

// Verbatim copy of the backend PRESET_TOKENS (address/symbol/name/decimals/logoUrl/chainId).
const DEFAULT_TOKENS: Omit<UserToken, "id" | "userId" | "isActive" | "sortOrder" | "createdAt">[] =
  [
    {
      address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
      logoUrl: "https://s2.coinmarketcap.com/static/img/coins/32x32/825.png",
      isCustom: false,
      chainId: 10,
    },
    {
      address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      logoUrl: "https://s2.coinmarketcap.com/static/img/coins/32x32/3408.png",
      isCustom: false,
      chainId: 10,
    },
    {
      address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
      symbol: "DAI",
      name: "Dai Stablecoin",
      decimals: 18,
      logoUrl: "https://s2.coinmarketcap.com/static/img/coins/32x32/4943.png",
      isCustom: false,
      chainId: 10,
    },
    {
      address: "0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6",
      symbol: "LINK",
      name: "ChainLink Token",
      decimals: 18,
      logoUrl: "https://s2.coinmarketcap.com/static/img/coins/32x32/1975.png",
      isCustom: false,
      chainId: 10,
    },
    {
      address: "0x6fd9d7AD17242c41f7131d257212c54A0e816691",
      symbol: "UNI",
      name: "Uniswap Token",
      decimals: 18,
      logoUrl: "https://s2.coinmarketcap.com/static/img/coins/32x32/7083.png",
      isCustom: false,
      chainId: 10,
    },
    {
      address: "0x4200000000000000000000000000000000000042",
      symbol: "OP",
      name: "Optimism",
      decimals: 18,
      logoUrl: "https://s2.coinmarketcap.com/static/img/coins/32x32/11840.png",
      isCustom: false,
      chainId: 10,
    },
  ];

function storageKey(account?: string | null): string {
  return account ? `${BASE_KEY}:${account.toLowerCase()}` : BASE_KEY;
}

function load(account?: string | null): UserToken[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(account));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(account: string | null | undefined, tokens: UserToken[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(account), JSON.stringify(tokens));
  } catch {
    /* private mode / quota — best effort */
  }
}

/** Seed the default preset tokens (idempotent — no-op if the store is non-empty). */
export function initializeDefaultTokens(account?: string | null): UserToken[] {
  const existing = load(account);
  if (existing.length) return existing;
  const now = new Date().toISOString();
  const tokens: UserToken[] = DEFAULT_TOKENS.map((t, i) => ({
    ...t,
    id: `${t.address}-${i}`,
    userId: "local",
    isActive: true,
    sortOrder: i,
    createdAt: now,
  }));
  save(account, tokens);
  return tokens;
}

/** List the account's tokens (sorted by sortOrder); optionally active-only and with on-chain balances. */
export async function getUserTokens(
  account: string | null | undefined,
  opts?: { activeOnly?: boolean; withBalances?: boolean }
): Promise<UserTokenWithBalance[]> {
  const tokens = load(account);
  const filtered = (opts?.activeOnly ? tokens.filter(t => t.isActive) : tokens)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (opts?.withBalances && account) {
    return Promise.all(
      filtered.map(async t => {
        try {
          return { ...t, balance: await getTokenBalance(account, t.address) };
        } catch {
          return { ...t };
        }
      })
    );
  }
  return filtered;
}

/** Add a custom token by address (metadata resolved on-chain). Returns the existing entry if already present. */
export async function addUserToken(
  account: string | null | undefined,
  address: string
): Promise<UserToken> {
  const tokens = load(account);
  const existing = tokens.find(t => t.address.toLowerCase() === address.toLowerCase());
  if (existing) return existing;
  const meta = await getTokenMetadata(address);
  const token: UserToken = {
    id: `${meta.address}-${tokens.length}-custom`,
    userId: "local",
    address: meta.address,
    symbol: meta.symbol,
    name: meta.name,
    decimals: meta.decimals,
    isCustom: true,
    isActive: true,
    sortOrder: tokens.length,
    createdAt: new Date().toISOString(),
  };
  save(account, [...tokens, token]);
  return token;
}
