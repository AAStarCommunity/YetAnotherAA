"use client";

/**
 * Primary / secondary wizard buttons with built-in loading + disabled states.
 *
 * @module app/operator/deploy/components/WizardButton
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

interface WizardButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: "primary" | "secondary";
  children: ReactNode;
}

export default function WizardButton({
  loading = false,
  variant = "primary",
  children,
  disabled,
  className = "",
  ...rest
}: WizardButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-slate-800 hover:bg-slate-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500"
      : "bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200";
  return (
    <button className={`${base} ${styles} ${className}`} disabled={disabled || loading} {...rest}>
      {loading && <ArrowPathIcon className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
