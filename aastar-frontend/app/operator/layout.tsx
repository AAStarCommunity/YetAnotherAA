"use client";

/**
 * Operator-segment layout. Mounts WalletProvider for all operator portal pages
 * (dashboard, deploy onboarding wizard, manage flows) — the operator's own EOA
 * signs every write in the browser. Client-only, no SSR (static-export ready).
 */
import { WalletProvider } from "@/contexts/WalletContext";

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
