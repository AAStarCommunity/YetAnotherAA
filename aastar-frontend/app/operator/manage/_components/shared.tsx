"use client";

/**
 * Shared primitives for the operator "Manage" flows.
 *
 * - `reader()` returns a viem PublicClient for @aastar/core read actions. Because
 *   @aastar/core bundles its OWN viem copy, its PublicClient/WalletClient type
 *   identities differ from the frontend's; the handles are structurally identical
 *   at runtime, so we hand them in as `any` (see lib/resources/resourceChecker.ts
 *   `pc()`). The SDK action arg/return signatures stay fully type-checked.
 * - `ensureSdkConfig()` must run before touching any `*_ADDRESS` constant; `reader()`
 *   does it for reads, and each write path calls it before reading address consts.
 *
 * Files in `_components` are underscore-prefixed → excluded from Next.js routing.
 *
 * @module app/operator/manage/_components/shared
 */
import { ReactNode } from "react";
import { ArrowPathIcon, CheckBadgeIcon, XCircleIcon, WalletIcon } from "@heroicons/react/24/outline";
import { useWallet } from "@/contexts/WalletContext";
import { ensureSdkConfig, getPublicClient } from "@/lib/sdk/client";

/** PublicClient handle for @aastar/core read actions (untyped on purpose — see module doc). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function reader(): any {
  ensureSdkConfig();
  return getPublicClient();
}

export const EXPLORER_BASE = "https://sepolia.etherscan.io";
export const txUrl = (hash: string) => `${EXPLORER_BASE}/tx/${hash}`;
export const addrUrl = (addr: string) => `${EXPLORER_BASE}/address/${addr}`;

export function shortAddr(addr?: string | null): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function errMsg(e: unknown): string {
  if (e && typeof e === "object") {
    const anyE = e as { shortMessage?: string; message?: string };
    return anyE.shortMessage || anyE.message || String(e);
  }
  return String(e);
}

export function eqAddr(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

// ── Presentational primitives ────────────────────────────────────────────────

interface SectionProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

export function Section({ title, action, children }: SectionProps) {
  return (
    <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  mono?: boolean;
}

export function MetricCard({ label, value, unit, sub, mono }: MetricCardProps) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p
        className={`font-bold text-gray-900 dark:text-white break-all ${
          mono ? "text-sm font-mono" : "text-xl"
        }`}
      >
        {value}
      </p>
      {unit && <p className="text-xs text-gray-400">{unit}</p>}
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

interface StatusBadgeProps {
  active: boolean;
  label: string;
}

export function StatusBadge({ active, label }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        active
          ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
          : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
      }`}
    >
      {active ? <CheckBadgeIcon className="h-3.5 w-3.5" /> : <XCircleIcon className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <ArrowPathIcon className="h-8 w-8 animate-spin text-slate-600 dark:text-emerald-400" />
    </div>
  );
}

interface ErrorBoxProps {
  message: string;
}

export function ErrorBox({ message }: ErrorBoxProps) {
  if (!message) return null;
  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
      {message}
    </div>
  );
}

interface TxLinkProps {
  hash: string;
}

export function TxLink({ hash }: TxLinkProps) {
  if (!hash) return null;
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs font-mono text-emerald-600 dark:text-emerald-400 hover:underline break-all"
    >
      Tx: {shortAddr(hash)} ↗
    </a>
  );
}

/**
 * Gate that requires an injected EOA connection before rendering children.
 * Renders a Connect button (or a "no wallet" notice) otherwise.
 */
export function ConnectGate({ children }: { children: ReactNode }) {
  const { address, isConnecting, hasInjectedWallet, connect } = useWallet();

  if (address) return <>{children}</>;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center space-y-4">
      <WalletIcon className="h-10 w-10 mx-auto text-slate-400 dark:text-emerald-400" />
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Connect your operator wallet to manage on-chain resources.
      </p>
      {hasInjectedWallet ? (
        <button
          onClick={() => void connect()}
          disabled={isConnecting}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium"
        >
          {isConnecting ? (
            <ArrowPathIcon className="h-4 w-4 animate-spin" />
          ) : (
            <WalletIcon className="h-4 w-4" />
          )}
          {isConnecting ? "Connecting…" : "Connect Wallet"}
        </button>
      ) : (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          No injected wallet found. Install MetaMask or a compatible wallet.
        </p>
      )}
    </div>
  );
}
