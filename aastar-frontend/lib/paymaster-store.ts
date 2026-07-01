/**
 * Client-side paymaster store + presets (zero-backend migration, step 2).
 *
 * The saved paymaster list was a frontend convenience: the transfer flow passes the
 * chosen `paymasterAddress` to the backend, which sponsors from that address (the saved
 * list / name lookup was never used for sponsorship, and `paymasterAPI.sponsor` was
 * unused). So the list moves to per-account localStorage, and the recommended presets
 * are built client-side from the SDK canonical table — no backend paymaster endpoints.
 *
 * Sponsorship itself still runs in the backend transfer flow (it uses the passed
 * address); it moves client-side with the transfer migration (step 4).
 */
import { getCanonicalAddresses, CHAIN_SEPOLIA } from "@aastar/sdk/core";

export interface SavedPaymaster {
  name: string;
  address: string;
  configured: boolean;
}

export interface PaymasterPreset {
  name: string;
  address: string;
  type: "custom";
  recommended: boolean;
  requiresCommunity: boolean;
  gasToken: string;
  gasTokenAddress: string | null;
  description: string;
}

interface StoredPaymaster {
  name: string;
  address: string;
  type?: string;
  apiKey?: string;
  endpoint?: string;
}

const BASE_KEY = "yaa.paymasters";

function storageKey(account?: string | null): string {
  return account ? `${BASE_KEY}:${account.toLowerCase()}` : BASE_KEY;
}

function load(account?: string | null): StoredPaymaster[] {
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

function save(account: string | null | undefined, list: StoredPaymaster[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(account), JSON.stringify(list));
  } catch {
    /* private mode / quota — best effort */
  }
}

/** The account's saved paymasters. `configured` = has an API key (vs address-only). */
export function getAvailablePaymasters(account?: string | null): SavedPaymaster[] {
  return load(account).map(p => ({
    name: p.name,
    address: p.address,
    configured: !!p.apiKey,
  }));
}

/** Add (or update, keyed by address) a saved paymaster. */
export function addCustomPaymaster(
  account: string | null | undefined,
  data: { name: string; address: string; type?: string; apiKey?: string; endpoint?: string }
): void {
  const list = load(account);
  const idx = list.findIndex(p => p.address.toLowerCase() === data.address.toLowerCase());
  const entry: StoredPaymaster = {
    name: data.name,
    address: data.address,
    type: data.type,
    apiKey: data.apiKey,
    endpoint: data.endpoint,
  };
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  save(account, list);
}

/** Remove a saved paymaster by name; returns true if something was removed. */
export function removeCustomPaymaster(account: string | null | undefined, name: string): boolean {
  const list = load(account);
  const next = list.filter(p => p.name !== name);
  if (next.length < list.length) {
    save(account, next);
    return true;
  }
  return false;
}

/**
 * Recommended presets, addresses from the SDK canonical table (mirrors the old backend
 * getPaymasterPresets copy verbatim). PaymasterV4 is a template (AAStar's instance,
 * pay with aPNTs); SuperPaymaster is one shared contract for any community's xPNTs.
 */
export function getPaymasterPresets(): PaymasterPreset[] {
  const a = getCanonicalAddresses(CHAIN_SEPOLIA) as Record<string, string> | undefined;
  if (!a) return [];
  const presets: PaymasterPreset[] = [];
  if (a.paymasterV4) {
    presets.push({
      name: "AAStar PaymasterV4",
      address: a.paymasterV4,
      type: "custom",
      recommended: true,
      requiresCommunity: false,
      gasToken: "aPNTs",
      gasTokenAddress: a.aPNTs ?? null,
      description:
        "PaymasterV4 is a template — any community can deploy its own V4 (own gas token + deposit) via the factory, so there can be many. This is the AAStar community's instance: buy aPNTs and it sponsors your gas. You're in the default AAStar community, so no separate join is needed — you just need aPNTs.",
    });
  }
  if (a.superPaymaster) {
    presets.push({
      name: "SuperPaymaster",
      address: a.superPaymaster,
      type: "custom",
      recommended: false,
      requiresCommunity: true,
      gasToken: "xPNTs (community points)",
      gasTokenAddress: null,
      description:
        "A single shared paymaster that accepts ANY community's points (xPNTs). Requires joining a community and earning its points by completing tasks — it will not work until you hold that community's points.",
    });
  }
  return presets;
}
