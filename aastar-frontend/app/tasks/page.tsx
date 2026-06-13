"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import { useTask } from "@/contexts/TaskContext";
import { useDashboard } from "@/contexts/DashboardContext";
import { getStoredAuth } from "@/lib/auth";
import { type ParsedTask, TaskStatus, TASK_STATUS_COLORS } from "@/lib/task-types";
import { DEFAULT_REWARD_TOKEN_SYMBOL } from "@/lib/contracts/task-config";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { formatDistanceToNow } from "@/lib/date-utils";

type FilterStatus = "all" | "open" | "mine" | "claimed";

function TaskCard({ task }: { task: ParsedTask }) {
  const router = useRouter();
  const { data } = useDashboard();
  // Contract stores EOA (signerAddress), not the YAA smart account address
  const myAddress = data.account?.signerAddress?.toLowerCase();
  const isMine = task.community.toLowerCase() === myAddress;
  const isClaimed = task.taskor.toLowerCase() === myAddress;

  return (
    <div
      onClick={() => router.push(`/tasks/${task.taskId}`)}
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 cursor-pointer hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-600 transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white text-base leading-tight truncate">
            {getTitle(task.metadataUri)}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            by {shortenAddress(task.community)}
            {isMine && (
              <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-medium">(you)</span>
            )}
          </p>
        </div>
        <span
          className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${TASK_STATUS_COLORS[task.status]}`}
        >
          {task.statusLabel}
        </span>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 line-clamp-2">
        {getDescription(task.metadataUri)}
      </p>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
          <CurrencyDollarIcon className="w-4 h-4" />
          {task.rewardFormatted} {DEFAULT_REWARD_TOKEN_SYMBOL}
        </div>
        <div className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-xs">
          <ClockIcon className="w-3.5 h-3.5" />
          {task.isExpired ? "Expired" : `Ends ${formatDistanceToNow(task.deadline)}`}
        </div>
      </div>

      {isClaimed && task.status !== TaskStatus.Finalized && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
            You claimed this task
          </span>
        </div>
      )}
    </div>
  );
}

function getTitle(metadataUri: string): string {
  try {
    const parsed = JSON.parse(metadataUri);
    return parsed.title ?? "Untitled Task";
  } catch {
    return metadataUri.slice(0, 60) || "Untitled Task";
  }
}

function getDescription(metadataUri: string): string {
  try {
    const parsed = JSON.parse(metadataUri);
    return parsed.description ?? "";
  } catch {
    return "";
  }
}

function shortenAddress(addr: string): string {
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function TasksPage() {
  const router = useRouter();
  const {
    tasks,
    myTasks,
    claimedTasks,
    loading,
    error,
    loadAllTasks,
    loadMyTasks,
    contractConfigured,
  } = useTask();
  const { data } = useDashboard();
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const { token } = getStoredAuth();
    if (!token) {
      router.push("/auth/login");
      return;
    }
    if (data.account?.address) {
      loadMyTasks(data.account.address);
    }
  }, [data.account?.address, loadMyTasks, router]);

  const displayTasks = (() => {
    let list: ParsedTask[];
    switch (filter) {
      case "open":
        list = tasks.filter(t => t.status === TaskStatus.Open);
        break;
      case "mine":
        list = myTasks;
        break;
      case "claimed":
        list = claimedTasks;
        break;
      default:
        list = tasks;
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(t => {
      const title = getTitle(t.metadataUri).toLowerCase();
      const desc = getDescription(t.metadataUri).toLowerCase();
      return title.includes(q) || desc.includes(q);
    });
  })();

  const openCount = tasks.filter(t => t.status === TaskStatus.Open).length;

  return (
    <Layout requireAuth>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Task Market</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {openCount} open {openCount === 1 ? "task" : "tasks"} available
            </p>
          </div>
          <button
            onClick={() => router.push("/tasks/create")}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            Post Task
          </button>
        </div>

        {/* Contract not configured warning */}
        {!contractConfigured && (
          <div className="mb-4 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-400 text-sm">
            Contract address not configured. Set{" "}
            <code className="font-mono bg-yellow-100 dark:bg-yellow-900/40 px-1 rounded">
              NEXT_PUBLIC_TASK_ESCROW_ADDRESS
            </code>{" "}
            in your .env.local to connect to the blockchain.
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {(
            [
              { key: "all", label: `All (${tasks.length})` },
              { key: "open", label: `Open (${openCount})` },
              { key: "mine", label: `Posted (${myTasks.length})` },
              { key: "claimed", label: `Claimed (${claimedTasks.length})` },
            ] as { key: FilterStatus; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === key
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => loadAllTasks()}
            disabled={loading}
            className="shrink-0 ml-auto p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Refresh"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Task Grid */}
        {loading && displayTasks.length === 0 ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
          </div>
        ) : displayTasks.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <p className="text-lg font-medium">No tasks found</p>
            <p className="text-sm mt-1">
              {filter === "all"
                ? "Be the first to post a task"
                : "Try switching to a different filter"}
            </p>
            {filter === "all" && (
              <button
                onClick={() => router.push("/tasks/create")}
                className="mt-4 text-emerald-600 dark:text-emerald-400 hover:underline text-sm font-medium"
              >
                Post a task →
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {displayTasks.map(task => (
              <TaskCard key={task.taskId} task={task} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
