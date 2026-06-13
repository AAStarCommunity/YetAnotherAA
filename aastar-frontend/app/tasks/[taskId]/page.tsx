"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Layout from "@/components/Layout";
import { useTask } from "@/contexts/TaskContext";
import { useDashboard } from "@/contexts/DashboardContext";
import { getStoredAuth } from "@/lib/auth";
import { type ParsedTask, TaskStatus, TASK_STATUS_COLORS } from "@/lib/task-types";
import {
  DEFAULT_REWARD_TOKEN_SYMBOL,
  X402_API_URL,
  isX402Configured,
} from "@/lib/contracts/task-config";
import { fetchReceiptDetails, type X402ReceiptDetails } from "@/lib/x402-client";
import {
  ArrowLeftIcon,
  CurrencyDollarIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ReceiptRefundIcon,
} from "@heroicons/react/24/outline";
import { formatDate, formatDateTime } from "@/lib/date-utils";
import toast from "react-hot-toast";
import type { WalletClient } from "viem";

function AddressRow({ label, addr }: { label: string; addr: string }) {
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return null;
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-mono text-gray-900 dark:text-white">
        {addr.slice(0, 8)}…{addr.slice(-6)}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function TaskDetailPage() {
  const router = useRouter();
  const { taskId } = useParams<{ taskId: string }>();
  const {
    getTask,
    acceptTask,
    submitWork,
    approveWork,
    finalizeTask,
    cancelTask,
    getTaskReceipts,
    linkReceipt,
  } = useTask();
  const { data } = useDashboard();

  const [task, setTask] = useState<ParsedTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [eoaAddress, setEoaAddress] = useState<string>("");
  const [actionLoading, setActionLoading] = useState(false);
  const [evidenceUri, setEvidenceUri] = useState("");
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  // T06: receipts
  const [receipts, setReceipts] = useState<`0x${string}`[]>([]);
  const [receiptDetails, setReceiptDetails] = useState<Record<string, X402ReceiptDetails | null>>(
    {}
  );
  const [showLinkReceiptForm, setShowLinkReceiptForm] = useState(false);
  const [receiptInput, setReceiptInput] = useState("");
  const [receiptUriInput, setReceiptUriInput] = useState("");

  // Use MetaMask EOA for role checks — contract stores EOA, not YAA smart account
  const myAddress = (eoaAddress || (data.account?.address ?? "")).toLowerCase();
  const isCommunity = task?.community.toLowerCase() === myAddress;
  const isTaskor = task?.taskor.toLowerCase() === myAddress;
  const isZeroAddress = (addr: string) => addr === "0x0000000000000000000000000000000000000000";

  useEffect(() => {
    const { token } = getStoredAuth();
    if (!token) router.push("/auth/login");
  }, [router]);

  useEffect(() => {
    async function loadWallet() {
      if (typeof window === "undefined") return;
      const { createWalletClient, custom } = await import("viem");
      const { SUPPORTED_CHAIN } = await import("@/lib/contracts/task-config");
      const provider = (window as Window & { ethereum?: unknown }).ethereum;
      if (!provider) return;
      const client = createWalletClient({
        chain: SUPPORTED_CHAIN,
        transport: custom(provider as Parameters<typeof custom>[0]),
      });
      setWalletClient(client);
      // Fetch EOA address for role comparison (contract stores EOA, not YAA smart account)
      try {
        const addrs = await client.getAddresses();
        if (addrs[0]) setEoaAddress(addrs[0].toLowerCase());
      } catch {
        // not connected yet — will be resolved on first requestAddresses()
      }
    }
    loadWallet();
  }, []);

  useEffect(() => {
    if (!taskId) return;
    setLoading(true);
    getTask(taskId)
      .then(t => setTask(t))
      .finally(() => setLoading(false));
  }, [taskId, getTask]);

  const refresh = async () => {
    if (!taskId) return;
    const [t, r] = await Promise.all([getTask(taskId), getTaskReceipts(taskId)]);
    setTask(t);
    setReceipts(r);
  };

  // T06: load receipts on mount, then fetch details from API
  useEffect(() => {
    if (!taskId) return;
    getTaskReceipts(taskId).then(async ids => {
      setReceipts(ids);
      if (!isX402Configured() || ids.length === 0) return;
      const details = await Promise.all(ids.map(id => fetchReceiptDetails(X402_API_URL, id)));
      const map: Record<string, X402ReceiptDetails | null> = {};
      ids.forEach((id, i) => {
        map[id] = details[i];
      });
      setReceiptDetails(map);
    });
  }, [taskId, getTaskReceipts]);

  const switchWallet = async () => {
    if (!walletClient) return;
    try {
      const addrs = await walletClient.requestAddresses();
      if (addrs[0]) setEoaAddress(addrs[0].toLowerCase());
    } catch {
      toast.error("Failed to switch wallet");
    }
  };

  async function runAction(fn: () => Promise<boolean>, successMsg: string) {
    if (!walletClient) {
      toast.error("No wallet connected");
      return;
    }
    setActionLoading(true);
    const toastId = toast.loading("Sending transaction...");
    try {
      const ok = await fn();
      toast.dismiss(toastId);
      if (ok) {
        toast.success(successMsg);
        await refresh();
      } else {
        toast.error("Transaction failed");
      }
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setActionLoading(false);
    }
  }

  function getTitle(uri: string): string {
    try {
      return JSON.parse(uri).title ?? "Untitled Task";
    } catch {
      return uri.slice(0, 60) || "Untitled Task";
    }
  }

  function getDescription(uri: string): string {
    try {
      return JSON.parse(uri).description ?? "";
    } catch {
      return uri;
    }
  }

  if (loading) {
    return (
      <Layout requireAuth>
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
        </div>
      </Layout>
    );
  }

  if (!task) {
    return (
      <Layout requireAuth>
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">Task not found</p>
          <button
            onClick={() => router.push("/tasks")}
            className="mt-4 text-emerald-600 dark:text-emerald-400 hover:underline text-sm"
          >
            ← Back to market
          </button>
        </div>
      </Layout>
    );
  }

  const isOpen = task.status === TaskStatus.Open;
  const isAccepted = task.status === TaskStatus.Accepted || task.status === TaskStatus.InProgress;
  const isSubmitted = task.status === TaskStatus.Submitted;
  const isFinalized = task.status === TaskStatus.Finalized;
  const isRefunded = task.status === TaskStatus.Refunded;

  return (
    <Layout requireAuth>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <button
            onClick={() => router.push("/tasks")}
            className="mt-1 p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {getTitle(task.metadataUri)}
              </h1>
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${TASK_STATUS_COLORS[task.status]}`}
              >
                {task.statusLabel}
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {task.taskTypeLabel} · Posted {formatDate(task.createdAt)}
            </p>
          </div>
        </div>

        {/* Wallet indicator */}
        <div className="flex items-center justify-between px-1 text-xs text-gray-500 dark:text-gray-400">
          <span>
            Wallet:{" "}
            {eoaAddress ? (
              <span className="font-mono">
                {eoaAddress.slice(0, 6)}…{eoaAddress.slice(-4)}
              </span>
            ) : (
              <span className="italic">not connected</span>
            )}
          </span>
          <button
            onClick={switchWallet}
            className="text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            {eoaAddress ? "Switch wallet" : "Connect wallet"}
          </button>
        </div>

        {/* Description */}
        <Section title="Description">
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
            {getDescription(task.metadataUri) || "No description provided."}
          </p>
        </Section>

        {/* Reward & Deadline */}
        <Section title="Details">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <CurrencyDollarIcon className="w-4 h-4" />
                Reward
              </div>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {task.rewardFormatted} {DEFAULT_REWARD_TOKEN_SYMBOL}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <ClockIcon className="w-4 h-4" />
                Deadline
              </div>
              <span
                className={`text-sm font-medium ${
                  task.isExpired ? "text-red-500" : "text-gray-900 dark:text-white"
                }`}
              >
                {formatDateTime(task.deadline)}
                {task.isExpired && " (expired)"}
              </span>
            </div>
            {task.challengeDeadline && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <ExclamationTriangleIcon className="w-4 h-4" />
                  Challenge period ends
                </div>
                <span className="text-sm text-gray-900 dark:text-white">
                  {formatDateTime(task.challengeDeadline)}
                </span>
              </div>
            )}
          </div>
        </Section>

        {/* Participants */}
        <Section title="Participants">
          <AddressRow label="Community (Publisher)" addr={task.community} />
          {!isZeroAddress(task.taskor) && (
            <AddressRow label="Taskor (Executor)" addr={task.taskor} />
          )}
          {!isZeroAddress(task.supplier) && <AddressRow label="Supplier" addr={task.supplier} />}
        </Section>

        {/* Evidence (if submitted) */}
        {task.evidenceUri && (
          <Section title="Submitted Evidence">
            <p className="text-sm text-gray-700 dark:text-gray-300 break-words">
              {task.evidenceUri}
            </p>
          </Section>
        )}

        {/* T06: x402 Receipts */}
        {(receipts.length > 0 || (eoaAddress && (isCommunity || isTaskor))) && (
          <Section title="x402 Receipts">
            {receipts.length > 0 ? (
              <div className="space-y-3">
                {receipts.map(rid => {
                  const detail = receiptDetails[rid];
                  return (
                    <div
                      key={rid}
                      className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 space-y-1.5"
                    >
                      {/* Receipt ID */}
                      <div className="flex items-center gap-2">
                        <ReceiptRefundIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="text-xs font-mono text-gray-600 dark:text-gray-300 break-all">
                          {rid.slice(0, 14)}…{rid.slice(-10)}
                        </span>
                      </div>
                      {/* Details from API (if available) */}
                      {detail ? (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 pl-6 text-xs text-gray-500 dark:text-gray-400">
                          <span>Payer</span>
                          <span className="font-mono text-gray-700 dark:text-gray-300">
                            {detail.payer.slice(0, 8)}…{detail.payer.slice(-6)}
                          </span>
                          <span>Time</span>
                          <span className="text-gray-700 dark:text-gray-300">
                            {new Date(detail.createdAt).toLocaleString()}
                          </span>
                        </div>
                      ) : isX402Configured() ? (
                        <p className="pl-6 text-xs text-gray-400 dark:text-gray-500 italic">
                          Loading details…
                        </p>
                      ) : null}
                    </div>
                  );
                })}
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {receipts.length} receipt{receipts.length > 1 ? "s" : ""} linked on-chain
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No receipts linked yet.</p>
            )}

            {eoaAddress && (isCommunity || isTaskor) && (
              <div className="mt-3">
                {!showLinkReceiptForm ? (
                  <button
                    onClick={() => setShowLinkReceiptForm(true)}
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    + Link receipt manually
                  </button>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={receiptInput}
                      onChange={e => setReceiptInput(e.target.value)}
                      placeholder="Receipt ID (bytes32, 0x…)"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <input
                      type="text"
                      value={receiptUriInput}
                      onChange={e => setReceiptUriInput(e.target.value)}
                      placeholder="Receipt URI (https://…)"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowLinkReceiptForm(false);
                          setReceiptInput("");
                          setReceiptUriInput("");
                        }}
                        className="flex-1 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          if (!receiptInput.trim() || !receiptUriInput.trim() || !walletClient)
                            return;
                          const ok = await linkReceipt(
                            task!.taskId,
                            receiptInput.trim(),
                            receiptUriInput.trim(),
                            walletClient
                          );
                          if (ok) {
                            toast.success("Receipt linked!");
                            setShowLinkReceiptForm(false);
                            setReceiptInput("");
                            setReceiptUriInput("");
                            await refresh();
                          } else {
                            toast.error("Failed to link receipt");
                          }
                        }}
                        disabled={!receiptInput.trim() || !receiptUriInput.trim() || actionLoading}
                        className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-medium"
                      >
                        Link
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Section>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {/* Claim task (Open → Accepted) */}
          {isOpen && !isCommunity && !task.isExpired && (
            <button
              onClick={() =>
                runAction(() => acceptTask(task.taskId, walletClient!), "Task claimed!")
              }
              disabled={actionLoading}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm transition-colors"
            >
              {actionLoading ? "Processing..." : "Claim This Task"}
            </button>
          )}

          {/* Submit evidence (Accepted → Submitted) */}
          {isAccepted && isTaskor && (
            <>
              {!showEvidenceForm ? (
                <button
                  onClick={() => setShowEvidenceForm(true)}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors"
                >
                  Submit Work
                </button>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Submit your evidence
                  </p>
                  <textarea
                    value={evidenceUri}
                    onChange={e => setEvidenceUri(e.target.value)}
                    placeholder="Describe your work, or paste a link to your deliverable..."
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowEvidenceForm(false)}
                      className="flex-1 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (!evidenceUri.trim()) return;
                        runAction(
                          () => submitWork(task.taskId, evidenceUri.trim(), walletClient!),
                          "Work submitted!"
                        );
                        setShowEvidenceForm(false);
                      }}
                      disabled={!evidenceUri.trim() || actionLoading}
                      className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium transition-colors"
                    >
                      Submit
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Community: approve work (Submitted → Finalized) */}
          {isSubmitted && isCommunity && (
            <div className="space-y-2">
              <button
                onClick={() =>
                  runAction(
                    () => approveWork(task.taskId, walletClient!),
                    "Work approved! Reward distributed."
                  )
                }
                disabled={actionLoading}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircleIcon className="w-5 h-5" />
                {actionLoading ? "Processing..." : "Approve & Pay Out"}
              </button>
              <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                Or wait for the 3-day challenge period to expire for auto-settlement
              </p>
            </div>
          )}

          {/* Anyone: finalize after challenge period */}
          {task.canFinalize && (
            <button
              onClick={() =>
                runAction(() => finalizeTask(task.taskId, walletClient!), "Task finalized!")
              }
              disabled={actionLoading}
              className="w-full py-3 rounded-xl bg-gray-700 hover:bg-gray-600 disabled:opacity-60 text-white font-semibold text-sm transition-colors"
            >
              {actionLoading ? "Processing..." : "Finalize (Challenge Period Expired)"}
            </button>
          )}

          {/* Community: cancel open task */}
          {isOpen && isCommunity && (
            <button
              onClick={() =>
                runAction(
                  () => cancelTask(task.taskId, walletClient!),
                  "Task cancelled. Reward refunded."
                )
              }
              disabled={actionLoading}
              className="w-full py-3 rounded-xl border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium text-sm transition-colors"
            >
              Cancel Task
            </button>
          )}

          {/* Finalized */}
          {isFinalized && (
            <div className="flex items-center justify-center gap-2 py-4 text-emerald-600 dark:text-emerald-400">
              <CheckCircleIcon className="w-5 h-5" />
              <span className="font-medium text-sm">Task completed and reward distributed</span>
            </div>
          )}

          {/* Refunded */}
          {isRefunded && (
            <div className="flex items-center justify-center gap-2 py-4 text-gray-500 dark:text-gray-400">
              <span className="text-sm">Task cancelled — reward returned to publisher</span>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
