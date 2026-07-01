/**
 * Persisted "default paymaster" preference (client-side only).
 *
 * There is no server-side default-paymaster concept — which paymaster sponsors a
 * transfer is chosen per-transaction. This stores a per-device preference so the
 * transfer page can auto-select (and auto-enable) a paymaster the user configured
 * once. The value is the paymaster CONTRACT ADDRESS (lowercased), since that's the
 * stable identity the transfer flow sends as `paymasterAddress`.
 *
 * The preference is scoped by account address so switching accounts on the same
 * device does not silently carry (and auto-enable) another account's default.
 * Callers pass the active account address; absent one, a device-global key is used.
 */
const BASE_KEY = "yaa.defaultPaymaster";

function storageKey(account?: string | null): string {
  return account ? `${BASE_KEY}:${account.toLowerCase()}` : BASE_KEY;
}

export function getDefaultPaymaster(account?: string | null): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey(account));
  } catch {
    return null;
  }
}

export function setDefaultPaymaster(address: string, account?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(account), address.toLowerCase());
  } catch {
    /* localStorage unavailable (private mode / quota) — preference just won't persist */
  }
}

export function clearDefaultPaymaster(account?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(account));
  } catch {
    /* ignore */
  }
}

export function isDefaultPaymaster(address: string | null | undefined, account?: string | null): boolean {
  if (!address) return false;
  return getDefaultPaymaster(account) === address.toLowerCase();
}
