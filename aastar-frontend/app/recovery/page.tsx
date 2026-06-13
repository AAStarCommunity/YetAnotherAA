"use client";

import { useState } from "react";
import Layout from "@/components/Layout";
import { guardianAPI } from "@/lib/api";
import toast from "react-hot-toast";

type Step = "setup" | "initiate" | "support" | "execute" | "done";

interface RecoveryState {
  accountAddress: string;
  newSignerAddress: string;
  guardian1Address: string;
  guardian2Address: string;
}

const ZERO: RecoveryState = {
  accountAddress: "",
  newSignerAddress: "",
  guardian1Address: "",
  guardian2Address: "",
};

function isAddress(v: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(v);
}

export default function RecoveryPage() {
  const [step, setStep] = useState<Step>("setup");
  const [form, setForm] = useState<RecoveryState>(ZERO);
  const [loading, setLoading] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState<any>(null);

  const set = (field: keyof RecoveryState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value.trim() }));

  // ── Step 1: register guardians + move to initiate ──────────────────────
  const handleSetup = async () => {
    if (!isAddress(form.accountAddress)) return toast.error("Invalid account address");
    if (!isAddress(form.newSignerAddress)) return toast.error("Invalid new signer address");
    if (!isAddress(form.guardian1Address)) return toast.error("Invalid guardian 1 address");
    if (!isAddress(form.guardian2Address)) return toast.error("Invalid guardian 2 address");
    if (form.guardian1Address.toLowerCase() === form.guardian2Address.toLowerCase())
      return toast.error("Guardian 1 and Guardian 2 must be different addresses");

    setLoading(true);
    try {
      // Register both guardians in the database (idempotent — duplicate calls are safe)
      await guardianAPI.addGuardian({ guardianAddress: form.guardian1Address });
      await guardianAPI.addGuardian({ guardianAddress: form.guardian2Address });
      toast.success("Guardians registered");
      setStep("initiate");
    } catch (err: unknown) {
      const msg =
        (err as any)?.response?.data?.message ||
        (err as Error).message ||
        "Failed to register guardians";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: guardian 1 initiates recovery ─────────────────────────────
  const handleInitiate = async () => {
    setLoading(true);
    try {
      const res = await guardianAPI.initiateRecovery({
        accountAddress: form.accountAddress,
        newSignerAddress: form.newSignerAddress,
      });
      setPendingRecovery(res.data);
      toast.success("Recovery initiated");
      setStep("support");
    } catch (err: unknown) {
      const msg =
        (err as any)?.response?.data?.message ||
        (err as Error).message ||
        "Failed to initiate recovery";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: guardian 2 supports recovery ──────────────────────────────
  const handleSupport = async () => {
    setLoading(true);
    try {
      const res = await guardianAPI.supportRecovery({ accountAddress: form.accountAddress });
      setPendingRecovery(res.data);
      toast.success("Recovery supported");
      setStep("execute");
    } catch (err: unknown) {
      const msg =
        (err as any)?.response?.data?.message ||
        (err as Error).message ||
        "Failed to support recovery";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 4: execute recovery (after timelock) ──────────────────────────
  const handleExecute = async () => {
    setLoading(true);
    try {
      await guardianAPI.executeRecovery({ accountAddress: form.accountAddress });
      toast.success("Account recovered successfully!");
      setStep("done");
    } catch (err: unknown) {
      const msg =
        (err as any)?.response?.data?.message ||
        (err as Error).message ||
        "Failed to execute recovery";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel this recovery request?")) return;
    setLoading(true);
    try {
      await guardianAPI.cancelRecovery({ accountAddress: form.accountAddress });
      toast.success("Recovery cancelled");
      setStep("setup");
      setPendingRecovery(null);
    } catch (err: unknown) {
      const msg =
        (err as any)?.response?.data?.message ||
        (err as Error).message ||
        "Failed to cancel recovery";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const stepLabels: Record<Step, string> = {
    setup: "1. Setup",
    initiate: "2. Initiate",
    support: "3. Support",
    execute: "4. Execute",
    done: "Done",
  };

  const stepKeys: Step[] = ["setup", "initiate", "support", "execute"];
  const currentIdx = stepKeys.indexOf(step);

  return (
    <Layout requireAuth={true}>
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Social Recovery</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Recover an AirAccount by collecting 2-of-3 guardian approvals.
        </p>

        {/* Step progress */}
        {step !== "done" && (
          <div className="flex items-center space-x-2 mb-8">
            {stepKeys.map((s, idx) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    idx < currentIdx
                      ? "bg-green-500 text-white"
                      : idx === currentIdx
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 dark:bg-gray-600 text-gray-500"
                  }`}
                >
                  {idx < currentIdx ? "✓" : idx + 1}
                </div>
                {idx < stepKeys.length - 1 && (
                  <div
                    className={`w-8 h-0.5 mx-1 ${idx < currentIdx ? "bg-green-500" : "bg-gray-200 dark:bg-gray-600"}`}
                  />
                )}
              </div>
            ))}
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
              {stepLabels[step]}
            </span>
          </div>
        )}

        {/* ── Step 1: Setup ── */}
        {step === "setup" && (
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 text-sm text-amber-800 dark:text-amber-300">
              Enter the account to recover, the new owner address, and the two guardian addresses.
              The guardians will each need to approve the recovery.
            </div>

            {[
              {
                label: "Account Address (to recover)",
                field: "accountAddress" as const,
                placeholder: "0x... (the AirAccount)",
              },
              {
                label: "New Signer Address",
                field: "newSignerAddress" as const,
                placeholder: "0x... (new owner)",
              },
              {
                label: "Guardian 1 Address",
                field: "guardian1Address" as const,
                placeholder: "0x...",
              },
              {
                label: "Guardian 2 Address",
                field: "guardian2Address" as const,
                placeholder: "0x...",
              },
            ].map(({ label, field, placeholder }) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {label}
                </label>
                <input
                  type="text"
                  value={form[field]}
                  onChange={set(field)}
                  placeholder={placeholder}
                  disabled={loading}
                  className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
            ))}

            <button
              onClick={handleSetup}
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {loading ? "Registering..." : "Register Guardians & Continue"}
            </button>
          </div>
        )}

        {/* ── Step 2: Initiate (Guardian 1) ── */}
        {step === "initiate" && (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-300">
              <p className="font-semibold mb-1">Guardian 1 — Initiate Recovery</p>
              <p>
                Log in as <span className="font-mono">{form.guardian1Address}</span> and click
                Initiate. This records the recovery request with a 48-hour time lock.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Account</span>
                <span className="font-mono text-xs truncate max-w-[220px]">
                  {form.accountAddress}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">New Signer</span>
                <span className="font-mono text-xs truncate max-w-[220px]">
                  {form.newSignerAddress}
                </span>
              </div>
            </div>

            <button
              onClick={handleInitiate}
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {loading ? "Initiating..." : "Initiate Recovery (as Guardian 1)"}
            </button>

            <button
              onClick={() => setStep("setup")}
              disabled={loading}
              className="w-full py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Back
            </button>
          </div>
        )}

        {/* ── Step 3: Support (Guardian 2) ── */}
        {step === "support" && (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-300">
              <p className="font-semibold mb-1">Guardian 2 — Support Recovery</p>
              <p>
                Log in as <span className="font-mono">{form.guardian2Address}</span> and click
                Support. Once both guardians have approved and the 48-hour lock expires, recovery
                can be executed.
              </p>
            </div>

            {pendingRecovery && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Execute After</span>
                  <span>{new Date(Number(pendingRecovery.executeAfter)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Supporters</span>
                  <span>
                    {pendingRecovery.supportCount} / {pendingRecovery.quorumRequired}
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={handleSupport}
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {loading ? "Supporting..." : "Support Recovery (as Guardian 2)"}
            </button>

            <button
              onClick={handleCancel}
              disabled={loading}
              className="w-full py-2.5 rounded-lg border border-red-300 dark:border-red-700 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Cancel Recovery
            </button>
          </div>
        )}

        {/* ── Step 4: Execute ── */}
        {step === "execute" && (
          <div className="space-y-4">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-sm text-green-800 dark:text-green-300">
              <p className="font-semibold mb-1">Quorum Reached</p>
              <p>
                Both guardians have approved. After the 48-hour time lock expires, click Execute to
                complete the recovery on-chain.
              </p>
            </div>

            {pendingRecovery && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Execute After</span>
                  <span>{new Date(Number(pendingRecovery.executeAfter)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Time Lock</span>
                  <span>
                    {Date.now() >= Number(pendingRecovery.executeAfter) ? (
                      <span className="text-green-600 font-semibold">Expired — ready</span>
                    ) : (
                      <span className="text-amber-600">Not yet expired</span>
                    )}
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={handleExecute}
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {loading ? "Executing..." : "Execute Recovery"}
            </button>

            <button
              onClick={handleCancel}
              disabled={loading}
              className="w-full py-2.5 rounded-lg border border-red-300 dark:border-red-700 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Cancel Recovery
            </button>
          </div>
        )}

        {/* ── Done ── */}
        {step === "done" && (
          <div className="text-center space-y-4 py-8">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">Account Recovered</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              The account signer has been updated to{" "}
              <span className="font-mono">{form.newSignerAddress}</span>.
            </p>
            <button
              onClick={() => {
                setStep("setup");
                setForm(ZERO);
                setPendingRecovery(null);
              }}
              className="mt-4 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold"
            >
              Start Over
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
