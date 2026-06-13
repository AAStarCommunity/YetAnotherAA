"use client";

/**
 * Transaction lifecycle hook for a single wizard step.
 *
 * Wraps a write action that returns a viem tx Hash, optionally waits for the
 * receipt (so the next step can rely on the on-chain effect / read back the
 * deployed address), and drives toast + button state. Errors are normalised to
 * a human-readable string (wallet rejections collapse to "Transaction rejected").
 *
 * @module app/operator/deploy/components/useTxStep
 */
import { useCallback, useState } from "react";
import type { Hash } from "viem";
import toast from "react-hot-toast";
import { getPublicClient } from "@/lib/sdk/client";

export type TxStatus = "idle" | "pending" | "success" | "error";

export interface UseTxStepResult {
  status: TxStatus;
  txHash?: Hash;
  error?: string;
  isBusy: boolean;
  /**
   * Run a write action. Returns the tx hash on success, or null on failure.
   * @param action returns the tx hash (e.g. an @aastar/core action call)
   * @param opts.waitReceipt await the receipt before resolving (default true)
   * @param opts.loadingMsg / successMsg toast copy
   */
  run: (
    action: () => Promise<Hash>,
    opts?: { waitReceipt?: boolean; loadingMsg?: string; successMsg?: string }
  ) => Promise<Hash | null>;
  reset: () => void;
}

function humanizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/user rejected|denied|rejected the request/i.test(raw)) return "Transaction rejected in wallet.";
  if (/insufficient funds/i.test(raw)) return "Insufficient funds for gas.";
  // viem stuffs the useful bit in the first line; keep it short for the UI.
  return raw.split("\n")[0].slice(0, 200);
}

export function useTxStep(): UseTxStepResult {
  const [status, setStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<Hash | undefined>();
  const [error, setError] = useState<string | undefined>();

  const reset = useCallback(() => {
    setStatus("idle");
    setTxHash(undefined);
    setError(undefined);
  }, []);

  const run = useCallback<UseTxStepResult["run"]>(async (action, opts) => {
    const { waitReceipt = true, loadingMsg = "Confirm in your wallet…", successMsg = "Transaction confirmed" } =
      opts ?? {};
    setStatus("pending");
    setError(undefined);
    setTxHash(undefined);
    const toastId = toast.loading(loadingMsg);
    try {
      const hash = await action();
      setTxHash(hash);
      if (waitReceipt) {
        toast.loading("Waiting for confirmation…", { id: toastId });
        const receipt = await getPublicClient().waitForTransactionReceipt({ hash });
        if (receipt.status === "reverted") throw new Error("Transaction reverted on-chain.");
      }
      setStatus("success");
      toast.success(successMsg, { id: toastId });
      return hash;
    } catch (err) {
      const msg = humanizeError(err);
      setError(msg);
      setStatus("error");
      toast.error(msg, { id: toastId });
      return null;
    }
  }, []);

  return { status, txHash, error, isBusy: status === "pending", run, reset };
}
