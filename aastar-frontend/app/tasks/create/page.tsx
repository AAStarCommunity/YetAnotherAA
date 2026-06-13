"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import { useTask } from "@/contexts/TaskContext";
import { useDashboard } from "@/contexts/DashboardContext";
import { getStoredAuth } from "@/lib/auth";
import {
  ALL_TASK_TYPES,
  DEFAULT_REWARD_TOKEN_SYMBOL,
  TASK_TYPE_GENERAL,
  X402_API_URL,
  isX402Configured,
  REWARD_TOKEN_NAME,
  REWARD_TOKEN_VERSION,
} from "@/lib/contracts/task-config";
import { postTaskWithX402, type X402Receipt } from "@/lib/x402-client";
import { type CreateTaskForm } from "@/lib/task-types";
import { ArrowLeftIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";

const DEADLINE_OPTIONS = [
  { label: "3 days", value: 3 },
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
];

export default function CreateTaskPage() {
  const router = useRouter();
  const { createTask, approveToken, checkAllowance, contractConfigured, linkReceipt } = useTask();
  useDashboard();

  const [form, setForm] = useState<CreateTaskForm>({
    title: "",
    description: "",
    rewardAmount: "",
    deadlineDays: 7,
    taskType: TASK_TYPE_GENERAL,
  });
  const [step, setStep] = useState<"form" | "x402" | "approve" | "submit" | "linking">("form");
  const [submitting, setSubmitting] = useState(false);
  const [walletClient, setWalletClient] = useState<import("viem").WalletClient | null>(null);

  useEffect(() => {
    const { token } = getStoredAuth();
    if (!token) {
      router.push("/auth/login");
    }
  }, [router]);

  // Get wallet client from browser provider (MetaMask / injected)
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
    }
    loadWallet();
  }, []);

  const handleUpdate = <K extends keyof CreateTaskForm>(key: K, value: CreateTaskForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const isValid =
    form.title.trim().length > 0 &&
    form.description.trim().length > 0 &&
    parseFloat(form.rewardAmount) > 0;

  async function handleSubmit() {
    if (!isValid || !walletClient) return;
    if (!contractConfigured) {
      toast.error("Contract not configured. Check NEXT_PUBLIC_TASK_ESCROW_ADDRESS.");
      return;
    }

    setSubmitting(true);
    let x402Receipt: X402Receipt | null = null;

    try {
      const { parseUnits, createPublicClient, http } = await import("viem");
      const {
        DEFAULT_REWARD_TOKEN_DECIMALS,
        DEFAULT_REWARD_TOKEN,
        TASK_ESCROW_ADDRESS,
        SUPPORTED_CHAIN,
        RPC_URL,
      } = await import("@/lib/contracts/task-config");
      const { ERC20_ABI, TASK_ESCROW_ABI } = await import("@/lib/contracts/task-escrow-abi");

      const rewardWei = parseUnits(form.rewardAmount, DEFAULT_REWARD_TOKEN_DECIMALS);
      const addresses = await walletClient.requestAddresses();
      const ownerAddress = addresses[0];
      const chainId = await walletClient.getChainId();

      const metadata = JSON.stringify({
        title: form.title,
        description: form.description,
        createdAt: Math.floor(Date.now() / 1000),
      });
      const deadlineBig = BigInt(Math.floor(Date.now() / 1000) + form.deadlineDays * 86400);

      const publicClient = createPublicClient({ chain: SUPPORTED_CHAIN, transport: http(RPC_URL) });

      // ── Step 1: x402 payment (if API server is configured) ──────────────
      if (isX402Configured()) {
        setStep("x402");
        toast.loading("Signing x402 payment...", { id: "x402" });
        try {
          x402Receipt = await postTaskWithX402(
            X402_API_URL,
            {
              title: form.title,
              description: form.description,
              rewardAmount: form.rewardAmount,
              deadlineDays: form.deadlineDays,
              taskType: form.taskType,
            },
            walletClient,
            DEFAULT_REWARD_TOKEN,
            REWARD_TOKEN_NAME,
            REWARD_TOKEN_VERSION,
            chainId
          );
          toast.dismiss("x402");
          toast.success("x402 payment signed");
        } catch (x402Err) {
          toast.dismiss("x402");
          // Non-fatal: warn and continue with on-chain creation
          console.warn("[x402] Payment failed, continuing without receipt:", x402Err);
          toast.error(
            `x402 skipped: ${x402Err instanceof Error ? x402Err.message : "unknown error"}`,
            { duration: 4000 }
          );
        }
      }

      // ── Step 2: on-chain task creation (permit or approve+create) ────────
      let taskId: `0x${string}` | null = null;
      let usedPermit = false;

      try {
        const [tokenName, nonce] = await Promise.all([
          publicClient.readContract({
            address: DEFAULT_REWARD_TOKEN,
            abi: ERC20_ABI,
            functionName: "name",
          }),
          publicClient.readContract({
            address: DEFAULT_REWARD_TOKEN,
            abi: ERC20_ABI,
            functionName: "nonces",
            args: [ownerAddress],
          }),
        ]);

        const permitDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

        const permitSig = await walletClient.signTypedData({
          account: ownerAddress,
          domain: {
            name: tokenName as string,
            version: REWARD_TOKEN_VERSION,
            chainId,
            verifyingContract: DEFAULT_REWARD_TOKEN,
          },
          types: {
            Permit: [
              { name: "owner", type: "address" },
              { name: "spender", type: "address" },
              { name: "value", type: "uint256" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          primaryType: "Permit",
          message: {
            owner: ownerAddress,
            spender: TASK_ESCROW_ADDRESS,
            value: rewardWei,
            nonce: nonce as bigint,
            deadline: permitDeadline,
          },
        });

        const r = `0x${permitSig.slice(2, 66)}` as `0x${string}`;
        const s = `0x${permitSig.slice(66, 130)}` as `0x${string}`;
        const v = parseInt(permitSig.slice(130, 132), 16);

        setStep("submit");
        toast.loading("Creating task on-chain (single tx)...", { id: "create" });

        const hash = await walletClient.writeContract({
          address: TASK_ESCROW_ADDRESS,
          abi: TASK_ESCROW_ABI,
          functionName: "createTaskWithPermit",
          args: [
            DEFAULT_REWARD_TOKEN,
            rewardWei,
            deadlineBig,
            metadata,
            form.taskType,
            permitDeadline,
            v,
            r,
            s,
          ],
          account: ownerAddress,
          chain: SUPPORTED_CHAIN,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        const log = receipt.logs.find(
          l => l.address.toLowerCase() === TASK_ESCROW_ADDRESS.toLowerCase()
        );
        if (log?.topics[1]) {
          taskId = log.topics[1] as `0x${string}`;
          usedPermit = true;
        }
      } catch {
        // Permit not supported — fall back to approve + createTask
      }

      if (!usedPermit) {
        const currentAllowance = await checkAllowance(ownerAddress);
        if (currentAllowance < rewardWei) {
          setStep("approve");
          toast.loading("Approving token spend...", { id: "approve" });
          const approved = await approveToken(rewardWei, walletClient);
          toast.dismiss("approve");
          if (!approved) {
            toast.error("Token approval failed");
            setStep("form");
            return;
          }
          toast.success("Token approved");
        }

        setStep("submit");
        toast.loading("Creating task on-chain...", { id: "create" });
        taskId = await createTask(form, walletClient);
      }

      toast.dismiss("create");

      // ── Step 3: auto-link x402 receipt (if we have both) ─────────────────
      if (taskId && x402Receipt) {
        setStep("linking");
        toast.loading("Linking x402 receipt on-chain...", { id: "link" });
        const linked = await linkReceipt(
          taskId,
          x402Receipt.receiptId,
          x402Receipt.receiptUri,
          walletClient
        );
        toast.dismiss("link");
        if (!linked) {
          // Non-fatal: task was created, receipt just wasn't linked
          toast.error("Receipt linking failed — you can link it manually on the task page", {
            duration: 5000,
          });
        }
      }

      if (taskId) {
        toast.success("Task created successfully!");
        router.push(`/tasks/${taskId}`);
      } else {
        toast.error("Failed to create task");
        setStep("form");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unexpected error");
      setStep("form");
    } finally {
      setSubmitting(false);
    }
  }

  const hasEthereum =
    typeof window !== "undefined" && !!(window as Window & { ethereum?: unknown }).ethereum;

  return (
    <Layout requireAuth>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Post a Task</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Describe what you need done and set a reward
            </p>
          </div>
        </div>

        {/* No wallet warning */}
        {!hasEthereum && (
          <div className="mb-5 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-sm text-yellow-800 dark:text-yellow-400 flex gap-2">
            <InformationCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
            <p>
              No wallet detected. Install MetaMask or another Web3 wallet to create tasks on-chain.
            </p>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => handleUpdate("title", e.target.value)}
              placeholder="e.g. Design a landing page for our community"
              maxLength={100}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.description}
              onChange={e => handleUpdate("description", e.target.value)}
              placeholder="Describe what needs to be done, any requirements or constraints..."
              rows={5}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Task Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_TASK_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => handleUpdate("taskType", t.value)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    form.taskType === t.value
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reward */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Reward ({DEFAULT_REWARD_TOKEN_SYMBOL}) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                value={form.rewardAmount}
                onChange={e => handleUpdate("rewardAmount", e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full px-3 py-2.5 pr-16 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400 font-medium">
                {DEFAULT_REWARD_TOKEN_SYMBOL}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Distribution: 70% to taskor, 20% to supplier (if any), 10% to jury
            </p>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Deadline
            </label>
            <div className="flex gap-2">
              {DEADLINE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleUpdate("deadlineDays", opt.value)}
                  className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
                    form.deadlineDays === opt.value
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          {isValid && (
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 text-sm space-y-1.5">
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">Summary</p>
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Reward locked in escrow</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {form.rewardAmount} {DEFAULT_REWARD_TOKEN_SYMBOL}
                </span>
              </div>
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Deadline</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {form.deadlineDays} days from now
                </span>
              </div>
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Challenge period after submission</span>
                <span className="font-medium text-gray-900 dark:text-white">3 days</span>
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting || !walletClient}
            className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white disabled:text-gray-500 font-medium text-sm transition-colors"
          >
            {submitting
              ? step === "x402"
                ? "Signing x402 payment..."
                : step === "approve"
                  ? "Approving token..."
                  : step === "linking"
                    ? "Linking receipt..."
                    : "Creating task..."
              : !walletClient
                ? "Connect wallet to post"
                : isX402Configured()
                  ? "Post Task (x402 + Permit)"
                  : "Post Task (EIP-2612 Permit)"}
          </button>
        </div>
      </div>
    </Layout>
  );
}
