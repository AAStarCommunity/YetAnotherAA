/**
 * Operations-portal resource pre-check — ported from the registry app, rebuilt
 * on the `@aastar/core` SDK (viem read actions) instead of raw ethers contracts.
 *
 * Client-side only. Concurrently checks operator onboarding prerequisites.
 * Positive on-chain *lookups* (registered / token-deployed / paymaster-deployed)
 * are cached 60 min; *balances* are always fetched fresh (they gate the
 * "enough GT/aPNTs/ETH" decision and must not go stale). Cache keys are scoped
 * by chainId so switching chains never reuses another chain's state.
 * See registry docs/CORE_FLOWS.md (flow 8) for the original logic.
 *
 * @module lib/resources/resourceChecker
 */
import { formatEther } from "viem";
import {
  registryActions,
  tokenActions,
  xPNTsFactoryActions,
  paymasterFactoryActions,
  superPaymasterActions,
  ROLE_COMMUNITY,
  REGISTRY_ADDRESS,
  GTOKEN_ADDRESS,
  XPNTS_FACTORY_ADDRESS,
  PAYMASTER_FACTORY_ADDRESS,
  SUPER_PAYMASTER_ADDRESS,
  APNTS_ADDRESS,
  CHAIN_SEPOLIA,
} from "@aastar/core";
import type { Address } from "viem";
import { ensureSdkConfig, getPublicClient } from "../sdk/client";
import { clearCache, loadFromCache, saveToCache } from "./cache";

const CACHE_DURATION_MS = 60 * 60 * 1000; // 60 min (positive lookups only)
const POSITIVE_TTL = 3600; // 60 min, seconds

// Chain the portal currently operates on (also drives ensureSdkConfig). Included
// in every cache key so a chain switch can never read another chain's cache.
const PORTAL_CHAIN = CHAIN_SEPOLIA;
const cacheKey = (type: string, addr: string) => `resource_${type}_${PORTAL_CHAIN}_${addr}`;

/** Cache positive results long; never cache a negative (so it re-checks next time). */
async function getCachedOrFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  isSuccess: (value: T) => boolean
): Promise<T> {
  const cached = loadFromCache<T>(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) return cached.data;
  const result = await fetchFn();
  if (isSuccess(result)) saveToCache(key, result, POSITIVE_TTL);
  return result;
}

export interface ResourceStatus {
  isCommunityRegistered: boolean;
  hasXPNTs: boolean;
  xPNTsAddress?: string;
  hasPaymaster: boolean;
  paymasterAddress?: string;
  hasAOAPaymaster: boolean;
  hasSuperPaymasterRegistered: boolean;
  hasSBTBinding: boolean;
  gTokenBalance: string;
  requiredGToken: string;
  hasEnoughGToken: boolean;
  aPNTsBalance: string;
  requiredAPNTs: string;
  hasEnoughAPNTs: boolean;
  ethBalance: string;
  requiredETH: string;
  hasEnoughETH: boolean;
}

export type StakeMode = "aoa" | "aoa+";

const REQUIRED_ETH = "0.05";
const REQUIRED_APNTS = "1000";

// ── Individual on-chain checks (SDK read actions) ────────────────────────────

// Returns `any` deliberately: @aastar/core bundles its own viem copy, so its
// PublicClient type identity differs from the frontend's. The client is
// structurally identical at runtime; the SDK action method signatures
// (args/returns) remain fully type-checked — only the client handle is untyped.
function pc(): any {
  ensureSdkConfig();
  return getPublicClient();
}

async function isCommunityRegistered(address: Address): Promise<boolean> {
  try {
    return await registryActions(REGISTRY_ADDRESS)(pc()).hasRole({
      roleId: ROLE_COMMUNITY,
      user: address,
    });
  } catch (err) {
    console.warn("[resourceChecker] community registration read failed:", err);
    return false;
  }
}

async function checkXPNTs(address: Address): Promise<{ hasToken: boolean; tokenAddress?: string }> {
  try {
    const factory = xPNTsFactoryActions(XPNTS_FACTORY_ADDRESS)(pc());
    const hasToken = await factory.hasToken({ community: address });
    if (!hasToken) return { hasToken: false };
    const tokenAddress = await factory.getTokenAddress({ community: address });
    return { hasToken: true, tokenAddress };
  } catch (err) {
    console.warn("[resourceChecker] xPNTs read failed:", err);
    return { hasToken: false };
  }
}

async function checkPaymaster(
  address: Address
): Promise<{ hasPaymaster: boolean; paymasterAddress?: string }> {
  try {
    const factory = paymasterFactoryActions(PAYMASTER_FACTORY_ADDRESS)(pc());
    const hasPaymaster = await factory.hasPaymaster({ owner: address });
    if (!hasPaymaster) return { hasPaymaster: false };
    const paymasterAddress = await factory.getPaymasterByOperator({ operator: address });
    return { hasPaymaster: true, paymasterAddress };
  } catch (err) {
    console.warn("[resourceChecker] paymaster read failed:", err);
    return { hasPaymaster: false };
  }
}

async function isSuperPaymasterRegistered(address: Address): Promise<boolean> {
  try {
    const config = await superPaymasterActions(SUPER_PAYMASTER_ADDRESS)(pc()).operators({
      operator: address,
    });
    // `isConfigured` is the v5 SuperPaymaster operator-registration flag.
    return Boolean(config?.isConfigured);
  } catch (err) {
    console.warn("[resourceChecker] SuperPaymaster read failed:", err);
    return false;
  }
}

// Balances are always read fresh (never cached) — see module doc.
async function tokenBalance(token: Address, account: Address): Promise<string> {
  try {
    const balance = await tokenActions(token)(pc()).balanceOf({ token, account });
    return formatEther(balance);
  } catch (err) {
    console.warn(`[resourceChecker] token balance read failed (${token}):`, err);
    return "0";
  }
}

async function ethBalance(address: Address): Promise<string> {
  try {
    return formatEther(await pc().getBalance({ address }));
  } catch (err) {
    console.warn("[resourceChecker] ETH balance read failed:", err);
    return "0";
  }
}

// ── Cache management ──────────────────────────────────────────────────────────

/**
 * Clear cached resource lookups for one wallet (manual refresh button).
 * Pattern-clears every cache key containing this address (across chainIds and
 * resource types) via the cache module — no prefix duplicated here.
 */
export function clearResourceCaches(walletAddress: string): void {
  clearCache(walletAddress.toLowerCase());
}

// ── Main entry points ─────────────────────────────────────────────────────────

/**
 * AOA mode: 30 GT (paymaster) + 30 GT (community, if unregistered) = 30/60 GT,
 * 0.05 ETH. aPNTs not required.
 */
async function checkAOAResources(walletAddress: string): Promise<ResourceStatus> {
  const address = walletAddress as Address;
  const addr = walletAddress.toLowerCase();

  const [registered, xpnts, paymaster, gToken, eth] = await Promise.all([
    getCachedOrFetch(cacheKey("community", addr), () => isCommunityRegistered(address), r => r),
    getCachedOrFetch(cacheKey("xpnts", addr), () => checkXPNTs(address), r => r.hasToken),
    getCachedOrFetch(cacheKey("paymaster", addr), () => checkPaymaster(address), r => r.hasPaymaster),
    tokenBalance(GTOKEN_ADDRESS, address), // fresh, never cached
    ethBalance(address), // fresh, never cached
  ]);

  const requiredGToken = registered ? "30" : "60";
  return {
    isCommunityRegistered: registered,
    hasXPNTs: xpnts.hasToken,
    xPNTsAddress: xpnts.tokenAddress,
    hasPaymaster: paymaster.hasPaymaster,
    paymasterAddress: paymaster.paymasterAddress,
    hasAOAPaymaster: paymaster.hasPaymaster,
    hasSuperPaymasterRegistered: false,
    // SBT binding lives in Registry.getCommunityProfile().supportedSBTs, not yet
    // exposed by @aastar/core — see aastar-sdk#52. Optional step; default false.
    hasSBTBinding: false,
    gTokenBalance: gToken,
    requiredGToken,
    hasEnoughGToken: parseFloat(gToken) >= parseFloat(requiredGToken),
    aPNTsBalance: "0",
    requiredAPNTs: "0",
    hasEnoughAPNTs: true,
    ethBalance: eth,
    requiredETH: REQUIRED_ETH,
    hasEnoughETH: parseFloat(eth) >= parseFloat(REQUIRED_ETH),
  };
}

/**
 * AOA+ mode (shared SuperPaymaster): 50 GT (register) + 30 GT (community, if
 * unregistered) = 50/80 GT, 1000 aPNTs, 0.05 ETH. Mutually exclusive with an
 * already-deployed AOA paymaster.
 */
async function checkAOAPlusResources(walletAddress: string): Promise<ResourceStatus> {
  const address = walletAddress as Address;
  const addr = walletAddress.toLowerCase();

  const [registered, xpnts, aoaPaymaster, superRegistered, gToken, aPNTs, eth] = await Promise.all([
    getCachedOrFetch(cacheKey("community", addr), () => isCommunityRegistered(address), r => r),
    getCachedOrFetch(cacheKey("xpnts", addr), () => checkXPNTs(address), r => r.hasToken),
    // Only cache when there is NO conflict (no AOA paymaster / not yet registered).
    getCachedOrFetch(cacheKey("aoa_paymaster", addr), () => checkPaymaster(address), r => !r.hasPaymaster),
    getCachedOrFetch(cacheKey("superpaymaster", addr), () => isSuperPaymasterRegistered(address), r => !r),
    tokenBalance(GTOKEN_ADDRESS, address), // fresh, never cached
    tokenBalance(APNTS_ADDRESS, address), // fresh, never cached
    ethBalance(address), // fresh, never cached
  ]);

  const requiredGToken = registered ? "50" : "80";
  return {
    isCommunityRegistered: registered,
    hasXPNTs: xpnts.hasToken,
    xPNTsAddress: xpnts.tokenAddress,
    hasPaymaster: false,
    hasAOAPaymaster: aoaPaymaster.hasPaymaster,
    hasSuperPaymasterRegistered: superRegistered,
    hasSBTBinding: false,
    gTokenBalance: gToken,
    requiredGToken,
    hasEnoughGToken: parseFloat(gToken) >= parseFloat(requiredGToken),
    aPNTsBalance: aPNTs,
    requiredAPNTs: REQUIRED_APNTS,
    hasEnoughAPNTs: parseFloat(aPNTs) >= parseFloat(REQUIRED_APNTS),
    ethBalance: eth,
    requiredETH: REQUIRED_ETH,
    hasEnoughETH: parseFloat(eth) >= parseFloat(REQUIRED_ETH),
  };
}

/** Resource pre-check for the operator onboarding wizard, by mode. */
export async function checkResources(
  walletAddress: string,
  mode: StakeMode
): Promise<ResourceStatus> {
  return mode === "aoa" ? checkAOAResources(walletAddress) : checkAOAPlusResources(walletAddress);
}
