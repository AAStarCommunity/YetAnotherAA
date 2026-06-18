"use client";

/**
 * Operator wallet context for the operations portal.
 *
 * Operator/community actions are signed by the operator's own EOA (MetaMask /
 * injected) in the browser — never by the backend-held AirAccount key. Exposes
 * the connected address + a viem WalletClient for the @aastar/* write actions.
 *
 * NOTE: Gnosis Safe multisig (registry's useSafeApp) is a planned follow-up; for
 * now only injected EOAs are wired. Kept intentionally framework-light and
 * client-only (no SSR), consistent with the static-export direction.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Address, WalletClient } from "viem";
import { connectWallet, getInjectedProvider } from "@/lib/sdk/client";

interface WalletContextType {
  address: Address | null;
  walletClient: WalletClient | null;
  isConnecting: boolean;
  hasInjectedWallet: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<Address | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [hasInjectedWallet, setHasInjectedWallet] = useState(false);
  // Monotonic token guarding against stale connect() resolutions: a late
  // connectWallet() promise that resolves after a disconnect (or a newer
  // connect) must not write back state. disconnect() bumps it to invalidate
  // any in-flight connect.
  const connectSeq = useRef(0);
  const connectedRef = useRef(false);

  useEffect(() => {
    setHasInjectedWallet(!!getInjectedProvider());
  }, []);

  const connect = useCallback(async () => {
    const seq = ++connectSeq.current;
    setIsConnecting(true);
    try {
      const { address: addr, walletClient: wc } = await connectWallet();
      if (seq !== connectSeq.current) return; // superseded by a newer connect/disconnect
      setAddress(addr);
      setWalletClient(wc);
      connectedRef.current = true;
    } finally {
      if (seq === connectSeq.current) setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    connectSeq.current++; // invalidate any in-flight connect
    connectedRef.current = false;
    setAddress(null);
    setWalletClient(null);
  }, []);

  // Reflect account switches from the injected wallet.
  useEffect(() => {
    const provider = getInjectedProvider() as
      | {
          on?: (e: string, cb: (a: string[]) => void) => void;
          removeListener?: (e: string, cb: (a: string[]) => void) => void;
        }
      | undefined;
    if (!provider?.on) return;
    const onAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else if (connectedRef.current) {
        // Reflect an account switch only while connected; the viem WalletClient
        // (unpinned account) follows the provider's active account at send time.
        setAddress(accounts[0] as Address);
      }
    };
    provider.on("accountsChanged", onAccountsChanged);
    return () => provider.removeListener?.("accountsChanged", onAccountsChanged);
  }, [disconnect]);

  return (
    <WalletContext.Provider
      value={{ address, walletClient, isConnecting, hasInjectedWallet, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextType {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
