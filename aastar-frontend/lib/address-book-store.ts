/**
 * Client-side address book (zero-backend migration, step 1).
 *
 * Replaces the backend `/address-book*` endpoints + JSON store with per-account
 * localStorage. Mirrors the previous server logic exactly (sort by usage then recency,
 * keep the last 5 tx hashes, case-insensitive address match). Scoped by AA account
 * address — a small semantic change from the old per-JWT-user store, consistent with
 * how the default-paymaster preference is scoped.
 */
export interface AddressBookEntry {
  address: string;
  name?: string;
  lastUsed: string; // ISO timestamp
  usageCount: number;
  firstUsed: string; // ISO timestamp
  transactionHashes: string[];
}

const BASE_KEY = "yaa.addressBook";

function storageKey(account?: string | null): string {
  return account ? `${BASE_KEY}:${account.toLowerCase()}` : BASE_KEY;
}

function load(account?: string | null): AddressBookEntry[] {
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

function save(account: string | null | undefined, entries: AddressBookEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(account), JSON.stringify(entries));
  } catch {
    /* private mode / quota — best effort */
  }
}

/** Frequently-used addresses, sorted by usage count then recency (matches old backend). */
export function getAddressBook(account?: string | null): AddressBookEntry[] {
  return load(account).sort((a, b) => {
    if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount;
    return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
  });
}

/** Add or update a display name for an address (creates a zero-usage entry if new). */
export function setAddressName(
  account: string | null | undefined,
  address: string,
  name: string
): void {
  const entries = load(account);
  const entry = entries.find(e => e.address.toLowerCase() === address.toLowerCase());
  if (entry) {
    entry.name = name;
  } else {
    const now = new Date().toISOString();
    entries.push({
      address,
      name,
      lastUsed: now,
      firstUsed: now,
      usageCount: 0,
      transactionHashes: [],
    });
  }
  save(account, entries);
}

/** Remove an address; returns true if something was removed. */
export function removeAddress(account: string | null | undefined, address: string): boolean {
  const entries = load(account);
  const filtered = entries.filter(e => e.address.toLowerCase() !== address.toLowerCase());
  if (filtered.length < entries.length) {
    save(account, filtered);
    return true;
  }
  return false;
}

/** Partial match over address or name. */
export function searchAddresses(
  account: string | null | undefined,
  query: string
): AddressBookEntry[] {
  const q = query.toLowerCase();
  return getAddressBook(account).filter(
    e => e.address.toLowerCase().includes(q) || (e.name && e.name.toLowerCase().includes(q))
  );
}

/** Record a confirmed transfer to an address (usage++, keep the last 5 tx hashes). */
export function recordSuccessfulTransfer(
  account: string | null | undefined,
  toAddress: string,
  transactionHash: string
): void {
  if (!toAddress) return;
  const entries = load(account);
  const now = new Date().toISOString();
  const entry = entries.find(e => e.address.toLowerCase() === toAddress.toLowerCase());
  if (entry) {
    entry.lastUsed = now;
    entry.usageCount += 1;
    if (transactionHash) {
      entry.transactionHashes.unshift(transactionHash);
      entry.transactionHashes = entry.transactionHashes.slice(0, 5);
    }
  } else {
    entries.push({
      address: toAddress,
      lastUsed: now,
      firstUsed: now,
      usageCount: 1,
      transactionHashes: transactionHash ? [transactionHash] : [],
    });
  }
  save(account, entries);
}
