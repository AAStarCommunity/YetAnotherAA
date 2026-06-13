"use client";

/**
 * Shared step shell: title + description, body, and a footer that surfaces the
 * tx hash (Etherscan link) / error and the primary action button.
 *
 * @module app/operator/deploy/components/StepCard
 */
import type { ReactNode } from "react";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import type { Hash } from "viem";
import type { TxStatus } from "./useTxStep";

const EXPLORER = "https://sepolia.etherscan.io";

export function explorerTx(hash: string) {
  return `${EXPLORER}/tx/${hash}`;
}
export function explorerAddr(addr: string) {
  return `${EXPLORER}/address/${addr}`;
}

interface StepCardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
  status?: TxStatus;
  txHash?: Hash;
  error?: string;
  /** Footer action area (buttons). */
  footer?: ReactNode;
}

export default function StepCard({
  title,
  description,
  icon,
  children,
  status,
  txHash,
  error,
  footer,
}: StepCardProps) {
  return (
    <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
      <div className="flex items-start gap-3">
        {icon && <div className="text-slate-700 dark:text-emerald-400 shrink-0 mt-0.5">{icon}</div>}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          {description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>}
        </div>
      </div>

      {children && <div className="space-y-4">{children}</div>}

      {txHash && (
        <div className="flex items-center gap-2 text-sm rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2">
          {status === "pending" ? (
            <ArrowPathIcon className="h-4 w-4 animate-spin text-emerald-600 dark:text-emerald-400" />
          ) : (
            <CheckCircleIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          )}
          <span className="text-emerald-700 dark:text-emerald-300">
            {status === "pending" ? "Pending" : "Confirmed"}
          </span>
          <a
            href={explorerTx(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 font-mono text-xs text-emerald-700 dark:text-emerald-300 hover:underline"
          >
            {txHash.slice(0, 10)}…{txHash.slice(-8)}
            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-red-700 dark:text-red-300">
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {footer && <div className="flex items-center justify-between gap-3 pt-1">{footer}</div>}
    </section>
  );
}
