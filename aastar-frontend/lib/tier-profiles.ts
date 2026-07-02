import { REFERENCE_ETH_PROFILES } from "@aastar/sdk/kms";
import type { Address } from "viem";
import { parseUnits } from "viem";

/**
 * Account tier profiles — the business config a user picks ONCE at account creation to set
 * their T1/T2/T3 ceilings for ETH + stablecoins in one shot (see docs/CREATE_FLOW_BETA_BUG.md
 * and memory create-with-tier-profile). ETH ceilings come from the SDK's REFERENCE_ETH_PROFILES;
 * the USDC/USDT ceilings below are AAStar defaults (user-confirmed) kept here so they can later
 * move to the config center (#8) and be edited per deployment.
 *
 * tier1 = passkey-only · tier2 = + DVT/BLS · over dailyLimit is hard-blocked (needs a guardian).
 * A profile → resolveTierProfile() → { dailyLimit, initialTokens, initialTokenConfigs } baked at
 * birth + { ethTierLimits } applied post-deploy via setTierLimits.
 */

// Sepolia stablecoins (6 decimals).
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address;
const USDT = "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0" as Address;

// Same USD ceilings for USDC + USDT (6-decimal). Args are dollar strings.
const stables = (t1: string, t2: string, daily: string) =>
  [USDC, USDT].map(address => ({
    address,
    tier1: parseUnits(t1, 6),
    tier2: parseUnits(t2, 6),
    dailyLimit: parseUnits(daily, 6),
  }));

export type ProfileKey = "beginner" | "trader" | "conservative";

export interface AccountTierProfile {
  key: ProfileKey;
  name: string;
  blurb: string;
  /** Passed to resolveTierProfile(): native-ETH ceilings + per-stablecoin ceilings. */
  profile: {
    eth: { tier1: bigint; tier2: bigint; dailyLimit: bigint };
    tokens: { address: Address; tier1: bigint; tier2: bigint; dailyLimit: bigint }[];
  };
}

export const TIER_PROFILES: Record<ProfileKey, AccountTierProfile> = {
  beginner: {
    key: "beginner",
    name: "Web3 Beginner",
    blurb: "Small caps, maximum security",
    profile: { eth: REFERENCE_ETH_PROFILES.beginner, tokens: stables("20", "200", "200") },
  },
  trader: {
    key: "trader",
    name: "Trader",
    blurb: "Higher caps for frequent use",
    profile: { eth: REFERENCE_ETH_PROFILES.trader, tokens: stables("500", "5000", "5000") },
  },
  conservative: {
    key: "conservative",
    name: "Conservative",
    blurb: "Tight caps, experienced",
    profile: { eth: REFERENCE_ETH_PROFILES.conservative, tokens: stables("10", "50", "100") },
  },
};

export const PROFILE_ORDER: ProfileKey[] = ["beginner", "trader", "conservative"];
