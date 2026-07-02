/**
 * Client-side AAStar API-key store (zero-backend migration — foundation prep).
 *
 * The zero-backend model authorizes the browser's KMS + bundler calls with the user's
 * OWN API key (a free-tier or provided key, scoped to their wallet / community identity)
 * instead of a shared server secret. This holds that key (and optional endpoint overrides)
 * in localStorage so the direct-KMS / direct-bundler paths can read it once the flows are
 * switched over. Nothing load-bearing yet — the transfer/auth flows still use the backend
 * until the KMS Origin+API-key infra is live.
 *
 * Per-device (not per-account): the key is the user's credential for this install.
 */
const API_KEY = "yaa.apiKey";
const KMS_URL_KEY = "yaa.kmsUrl";
const BUNDLER_URL_KEY = "yaa.bundlerUrl";
const RPC_URL_KEY = "yaa.rpcUrl";
const RELAY_URL_KEY = "yaa.relayUrl";

function get(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / quota — best effort */
  }
}

function remove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getApiKey(): string | null {
  return get(API_KEY);
}
export function setApiKey(key: string): void {
  set(API_KEY, key.trim());
}
export function clearApiKey(): void {
  remove(API_KEY);
}
export function hasApiKey(): boolean {
  return !!getApiKey();
}

/** Optional KMS endpoint override (blank → default). */
export function getKmsUrl(): string | null {
  return get(KMS_URL_KEY);
}
export function setKmsUrl(url: string): void {
  const u = url.trim();
  if (u) set(KMS_URL_KEY, u);
  else remove(KMS_URL_KEY);
}

/** Optional bundler endpoint override (blank → default). */
export function getBundlerUrl(): string | null {
  return get(BUNDLER_URL_KEY);
}
export function setBundlerUrl(url: string): void {
  const u = url.trim();
  if (u) set(BUNDLER_URL_KEY, u);
  else remove(BUNDLER_URL_KEY);
}

/** Optional RPC endpoint override (blank → default). Consumed by getPublicClient(). */
export function getRpcUrl(): string | null {
  return get(RPC_URL_KEY);
}
export function setRpcUrl(url: string): void {
  const u = url.trim();
  if (u) set(RPC_URL_KEY, u);
  else remove(RPC_URL_KEY);
}

/** Optional account-deploy relay endpoint override (blank → default; see RELAY_SERVICE_PROPOSAL). */
export function getRelayUrl(): string | null {
  return get(RELAY_URL_KEY);
}
export function setRelayUrl(url: string): void {
  const u = url.trim();
  if (u) set(RELAY_URL_KEY, u);
  else remove(RELAY_URL_KEY);
}
