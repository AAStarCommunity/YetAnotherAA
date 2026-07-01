/**
 * Persisted "default paymaster" preference (client-side only).
 *
 * There is no server-side default-paymaster concept — which paymaster sponsors a
 * transfer is chosen per-transaction. This stores a per-device preference so the
 * transfer page can auto-select (and auto-enable) a paymaster the user configured
 * once. The value is the paymaster CONTRACT ADDRESS (lowercased), since that's the
 * stable identity the transfer flow sends as `paymasterAddress`.
 */
const KEY = "yaa.defaultPaymaster";

export function getDefaultPaymaster(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setDefaultPaymaster(address: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, address.toLowerCase());
  } catch {
    /* localStorage unavailable (private mode / quota) — preference just won't persist */
  }
}

export function clearDefaultPaymaster(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function isDefaultPaymaster(address: string | null | undefined): boolean {
  if (!address) return false;
  return getDefaultPaymaster() === address.toLowerCase();
}
