"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import CopyButton from "@/components/CopyButton";
import CreateAccountDialog from "@/components/CreateAccountDialog";
import ReceiveModal from "@/components/ReceiveModal";
import { useDashboard } from "@/contexts/DashboardContext";
import { useTask } from "@/contexts/TaskContext";
import { User } from "@/lib/types";
import { getStoredAuth } from "@/lib/auth";
import { DEFAULT_REWARD_TOKEN_SYMBOL, isContractsConfigured } from "@/lib/contracts/task-config";
import toast from "react-hot-toast";
import {
  WalletIcon,
  PlusIcon,
  ArrowUpIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  CpuChipIcon,
  ArrowPathIcon,
  QrCodeIcon,
} from "@heroicons/react/24/outline";

function DashboardContent() {
  const {
    data,
    loading,
    loadDashboardData,
    refreshBalance: contextRefreshBalance,
  } = useDashboard();
  const { account, transfers, paymasters, tokenBalances, lastUpdated } = data;
  const { taskTokenBalance, taskTokenBalanceFormatted, loadTaskTokenBalance } = useTask();

  const [user, setUser] = useState<User | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [pullToRefresh, setPullToRefresh] = useState({
    pulling: false,
    distance: 0,
    refreshing: false,
  });
  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const { user: storedUser } = getStoredAuth();
    if (storedUser) {
      setUser(storedUser);
      loadDashboardData();
    }
  }, [loadDashboardData]);

  // T01: load task token balance when account is available
  useEffect(() => {
    if (account?.address && isContractsConfigured()) {
      loadTaskTokenBalance(account.address);
    }
  }, [account?.address, loadTaskTokenBalance]);

  const handleAccountCreated = () => {
    // Reload data to get updated balance
    setTimeout(() => loadDashboardData(true), 2000);
  };

  const getVersionBadge = (version?: string) => {
    if (!version) return null;

    const versionColors: Record<string, string> = {
      "0.6": "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
      "0.7": "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
      // "0.8": "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400", // Temporarily disabled
    };

    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${versionColors[version] || "bg-gray-100 text-gray-800"}`}
      >
        v{version}
      </span>
    );
  };

  const refreshBalance = async () => {
    if (!account) return;

    setRefreshingBalance(true);
    try {
      await contextRefreshBalance();
      toast.success("Balance refreshed!");
    } catch {
      toast.error("Failed to refresh balance");
    } finally {
      setRefreshingBalance(false);
    }
  };

  // Pull to refresh handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0 && !pullToRefresh.refreshing) {
      touchStartY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0 && !pullToRefresh.refreshing) {
      const touchY = e.touches[0].clientY;
      const distance = touchY - touchStartY.current;

      if (distance > 0 && distance < 150) {
        setPullToRefresh({ pulling: true, distance, refreshing: false });
      }
    }
  };

  const handleTouchEnd = async () => {
    if (pullToRefresh.distance > 80 && !pullToRefresh.refreshing) {
      // Keep the pull state and show refreshing
      setPullToRefresh({ pulling: false, distance: 80, refreshing: true });

      try {
        // Force refresh without showing skeleton screen
        await loadDashboardData(true);
      } finally {
        // After refresh completes, bounce back
        setPullToRefresh({ pulling: false, distance: 0, refreshing: false });
      }
    } else {
      // Bounce back immediately if threshold not reached
      setPullToRefresh({ pulling: false, distance: 0, refreshing: false });
    }
  };

  const handleReceive = () => {
    if (!account?.address) {
      toast.error("No account address found");
      return;
    }

    // Check if mobile view
    if (window.innerWidth < 768) {
      // Navigate to receive page on mobile
      router.push("/receive");
    } else {
      // Show modal on desktop
      setShowReceiveModal(true);
    }
  };

  const formatLastUpdated = () => {
    if (!lastUpdated) return "";

    const now = new Date();
    const diffMs = now.getTime() - lastUpdated.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);

    if (diffSecs < 60) return `Updated ${diffSecs}s ago`;
    if (diffMins < 60) return `Updated ${diffMins}m ago`;
    return `Updated at ${lastUpdated.toLocaleTimeString()}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case "failed":
        return <ExclamationCircleIcon className="w-5 h-5 text-red-500" />;
      case "pending":
      case "submitted":
        return <ClockIcon className="w-5 h-5 text-yellow-500" />;
      default:
        return <ClockIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />;
    }
  };

  // Skeleton component
  const Skeleton = () => (
    <div className="px-3 py-4 mx-auto max-w-7xl sm:px-4 sm:py-6 lg:px-8">
      {/* Account Card Skeleton */}
      <div className="grid grid-cols-1 gap-4 mb-6">
        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-2xl h-48"></div>
      </div>
      {/* Token Balances Skeleton */}
      <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-2xl h-32 mb-6"></div>
      {/* Paymaster Status Skeleton */}
      <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-2xl h-40 mb-6"></div>
      {/* Recent Transfers Skeleton */}
      <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-2xl h-64"></div>
    </div>
  );

  // Only show skeleton on initial load (when there's no data yet)
  if (loading && !account) {
    return (
      <Layout requireAuth={true}>
        <Skeleton />
      </Layout>
    );
  }

  return (
    <Layout requireAuth={true}>
      <div
        ref={containerRef}
        className="relative overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="relative"
          style={{
            transform:
              pullToRefresh.pulling || pullToRefresh.refreshing
                ? `translateY(${pullToRefresh.distance}px)`
                : "translateY(0)",
            transition: pullToRefresh.pulling ? "none" : "transform 0.3s ease",
          }}
        >
          {/* Pull to Refresh Indicator - Mobile only - At top of content */}
          <div
            className="md:hidden absolute left-0 right-0 flex items-center justify-center h-16 -top-16"
            style={{
              opacity: pullToRefresh.pulling || pullToRefresh.refreshing ? 1 : 0,
            }}
          >
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <ArrowPathIcon
                className={`w-5 h-5 transition-all ${
                  pullToRefresh.refreshing
                    ? "text-blue-600 dark:text-blue-400 animate-spin"
                    : pullToRefresh.distance > 80
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-500 dark:text-gray-400"
                }`}
                style={{
                  transform: pullToRefresh.refreshing
                    ? "none"
                    : pullToRefresh.distance > 80
                      ? "rotate(360deg)"
                      : `rotate(${pullToRefresh.distance * 4}deg)`,
                }}
              />
              <span
                className={
                  pullToRefresh.refreshing
                    ? "text-blue-600 dark:text-blue-400"
                    : pullToRefresh.distance > 80
                      ? "text-green-600 dark:text-green-400"
                      : ""
                }
              >
                {pullToRefresh.refreshing
                  ? "Refreshing..."
                  : pullToRefresh.distance > 80
                    ? "Release to refresh"
                    : "Pull down to refresh"}
              </span>
            </div>
          </div>

          <div className="px-3 py-4 mx-auto max-w-7xl sm:px-4 sm:py-6 lg:px-8">
            {/* Header - Desktop only */}
            <div className="hidden md:block mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Welcome back, {user?.username || user?.email}!
              </h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Manage your ERC-4337 smart account - no need to manage gas fees!
              </p>
            </div>

            {/* Account Status */}
            <div className="grid grid-cols-1 gap-4 mb-6 sm:gap-6 sm:mb-8 lg:grid-cols-3">
              {/* Account Card */}
              <div className="col-span-1 lg:col-span-2">
                <div className="overflow-hidden bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
                  <div className="p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <WalletIcon className="w-8 h-8 text-slate-900 dark:text-emerald-400" />
                      </div>
                      <div className="flex-1 ml-4">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                            Smart Account
                          </h3>
                          {account && getVersionBadge(account.entryPointVersion)}
                        </div>
                        {account ? (
                          <div className="mt-3 space-y-4">
                            {/* Balance - Prominent Display */}
                            <div className="p-4 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50 border border-slate-200 dark:border-slate-700">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                  Balance
                                </span>
                                <button
                                  onClick={refreshBalance}
                                  disabled={refreshingBalance}
                                  className="hidden md:inline-flex items-center text-xs text-slate-900 dark:text-emerald-400 hover:text-slate-700 dark:hover:text-emerald-300 disabled:opacity-50 transition-all"
                                  title="Refresh balance"
                                >
                                  <svg
                                    className={`w-4 h-4 ${refreshingBalance ? "animate-spin" : ""}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                    />
                                  </svg>
                                </button>
                              </div>
                              <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-bold text-slate-900 dark:text-emerald-400">
                                  {parseFloat(account.balance || "0").toFixed(4)}
                                </span>
                                <span className="text-lg font-semibold text-gray-600 dark:text-gray-400">
                                  ETH
                                </span>
                              </div>
                              {lastUpdated && (
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                                  {formatLastUpdated()}
                                </p>
                              )}
                            </div>

                            {/* Other Info */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                  Account Address:
                                </span>
                                <CopyButton text={account.address} className="flex-shrink-0" />
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                  Status:
                                </span>
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    account.deployed
                                      ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                                      : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
                                  }`}
                                >
                                  {account.deployed ? "Deployed" : "Not Deployed"}
                                </span>
                              </div>
                              {account.entryPointVersion && (
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-gray-600 dark:text-gray-400">
                                    <CpuChipIcon className="inline w-3 h-3 mr-1" />
                                    EntryPoint:
                                  </span>
                                  <span className="text-sm font-mono text-gray-800 dark:text-gray-200">
                                    v{account.entryPointVersion}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4">
                            {/* Empty State with Benefits */}
                            <div className="text-center py-6">
                              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800/50 mb-4">
                                <WalletIcon className="w-8 h-8 text-slate-600 dark:text-slate-400" />
                              </div>
                              <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                                No Smart Account Yet
                              </h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                Create your smart account to unlock these benefits:
                              </p>

                              {/* Benefits List */}
                              <div className="text-left space-y-2 mb-4">
                                <div className="flex items-start gap-2">
                                  <CheckCircleIcon className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                  <div className="text-sm text-gray-700 dark:text-gray-300">
                                    <span className="font-medium">Gas-Free Transactions</span>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                      No need to hold ETH for gas fees
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2">
                                  <CheckCircleIcon className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                  <div className="text-sm text-gray-700 dark:text-gray-300">
                                    <span className="font-medium">Enhanced Security</span>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                      Passkey authentication with WebAuthn
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2">
                                  <CheckCircleIcon className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                  <div className="text-sm text-gray-700 dark:text-gray-300">
                                    <span className="font-medium">Auto-Deployment</span>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                      Account deployed automatically with first transaction
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2">
                                  <CheckCircleIcon className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                  <div className="text-sm text-gray-700 dark:text-gray-300">
                                    <span className="font-medium">ERC-4337 Standard</span>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                      Full account abstraction support
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row mt-6 gap-3">
                      {!account ? (
                        <button
                          onClick={() => setShowCreateDialog(true)}
                          className="inline-flex items-center justify-center px-4 py-3 sm:py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 border border-transparent rounded-xl shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-500 transition-all duration-200 transform hover:-translate-y-0.5 touch-manipulation active:scale-95"
                        >
                          <PlusIcon className="w-4 h-4 mr-2" />
                          Create Account
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => router.push("/transfer")}
                            className="flex-1 inline-flex items-center justify-center px-4 py-3 sm:py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 border border-transparent rounded-xl shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-500 transition-all duration-200 transform hover:-translate-y-0.5 touch-manipulation active:scale-95"
                          >
                            <ArrowUpIcon className="w-4 h-4 mr-2" />
                            Send Transfer
                          </button>
                          <button
                            onClick={handleReceive}
                            className="flex-1 inline-flex items-center justify-center px-4 py-3 sm:py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-500 transition-all touch-manipulation active:scale-95"
                          >
                            <QrCodeIcon className="w-4 h-4 mr-2" />
                            Receive
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions - Desktop only */}
              <div className="hidden lg:block col-span-1">
                <div className="h-full overflow-hidden bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
                  <div className="p-6 h-full flex flex-col">
                    <h3 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
                      Quick Actions
                    </h3>
                    <div className="flex-1 flex flex-col justify-center space-y-2.5">
                      <button
                        onClick={() => router.push("/tokens")}
                        className="group inline-flex items-center w-full px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-500 transition-all"
                      >
                        <WalletIcon className="w-5 h-5 mr-3 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-emerald-400 transition-colors" />
                        <span>View Tokens</span>
                      </button>
                      <button
                        onClick={() => router.push("/transfer/history")}
                        className="group inline-flex items-center w-full px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-500 transition-all"
                      >
                        <ClockIcon className="w-5 h-5 mr-3 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-emerald-400 transition-colors" />
                        <span>Transaction History</span>
                      </button>
                      <button
                        onClick={() => router.push("/paymaster")}
                        className="group inline-flex items-center w-full px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-500 transition-all"
                      >
                        <CpuChipIcon className="w-5 h-5 mr-3 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-emerald-400 transition-colors" />
                        <span>Manage Paymasters</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Token Balances */}
            {account && tokenBalances.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 mb-6">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      Token Balances
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {tokenBalances
                      .filter(balance => parseFloat(balance.formattedBalance) > 0)
                      .map(tokenBalance => (
                        <div
                          key={tokenBalance.token?.address}
                          className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-slate-300 dark:hover:border-slate-600 transition-colors bg-slate-50/50 dark:bg-slate-800/30"
                        >
                          <div className="flex items-center">
                            {tokenBalance.token?.logoUrl && (
                              <img
                                src={tokenBalance.token.logoUrl}
                                alt={tokenBalance.token.symbol}
                                className="w-8 h-8 mr-3 rounded-full"
                                onError={e => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            )}
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {tokenBalance.token?.symbol}
                                </span>
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                  {parseFloat(tokenBalance.formattedBalance).toFixed(4)}
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                {tokenBalance.token?.name}
                              </p>
                              {tokenBalance.token?.isCustom && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                                  Custom
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                  {tokenBalances.filter(balance => parseFloat(balance.formattedBalance) > 0)
                    .length === 0 && (
                    <div className="text-center py-6">
                      <WalletIcon className="w-12 h-12 mx-auto text-gray-500 dark:text-gray-400" />
                      <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                        No token balances
                      </h3>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        Your account doesn&apos;t have any ERC20 tokens yet.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* T01: Task Reward Token Balance */}
            {isContractsConfigured() && taskTokenBalance !== null && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-emerald-200 dark:border-emerald-800 mb-6">
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Task Reward Balance
                      </p>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                          {parseFloat(taskTokenBalanceFormatted ?? "0").toFixed(4)}
                        </span>
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          {DEFAULT_REWARD_TOKEN_SYMBOL}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        ERC-20 balance of your smart account
                      </p>
                    </div>
                    <button
                      onClick={() => account?.address && loadTaskTokenBalance(account.address)}
                      className="p-2 rounded-lg text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      title="Refresh task balance"
                    >
                      <ArrowPathIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Paymaster Status */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 mb-6">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-slate-600 dark:text-emerald-400"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33a2.5 2.5 0 002.5 2.5c.36 0 .69-.08 1-.21V19c0 .55-.45 1-1 1s-1-.45-1-1v-3c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6C4.9 3 4 3.9 4 5v16h10v-7.5h1.5v5a2.5 2.5 0 005 0V9c0-.69-.28-1.32-.73-1.77zM12 10H6V5h6v5zm6 0a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                    Paymaster Status
                  </h3>
                </div>
                <div className="space-y-3">
                  {paymasters.filter(pm => pm.configured).length > 0 ? (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        Available gas sponsors for your transactions:
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {paymasters
                          .filter(pm => pm.configured)
                          .map(paymaster => (
                            <div
                              key={paymaster.name}
                              className="p-3 border border-emerald-200 dark:border-emerald-800 rounded-xl bg-emerald-50 dark:bg-emerald-900/20"
                            >
                              <div className="flex items-center">
                                <CheckCircleIcon className="w-5 h-5 text-emerald-500 mr-2" />
                                <div>
                                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    {paymaster.name === "pimlico-optimism" ||
                                    paymaster.name === "pimlico-sepolia"
                                      ? "Pimlico"
                                      : paymaster.name}
                                  </p>
                                  <p className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                                    {paymaster.address.slice(0, 10)}...{paymaster.address.slice(-8)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">
                        ✨ Enable &quot;Use Paymaster&quot; when sending transfers for sponsored
                        gas!
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                      <div className="flex items-start">
                        <ExclamationCircleIcon className="w-5 h-5 text-yellow-400 mr-3 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            No Paymaster configured
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 mb-3">
                            Transactions will use your account balance for gas. Configure a
                            Paymaster to enable sponsored transactions.
                          </p>
                          <button
                            onClick={() => router.push("/paymaster")}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg transition-all shadow-sm hover:shadow-md"
                          >
                            <CpuChipIcon className="w-3.5 h-3.5 mr-1.5" />
                            Configure Paymaster
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Recent Transfers */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Recent Transfers
                  </h3>
                  <button
                    onClick={() => router.push("/transfer/history")}
                    className="text-sm font-medium text-slate-900 dark:text-emerald-400 hover:text-slate-700 dark:hover:text-emerald-300 transition-colors"
                  >
                    View all
                  </button>
                </div>

                {transfers.length > 0 ? (
                  <div className="space-y-4">
                    {transfers.map(transfer => (
                      <div
                        key={transfer.id}
                        className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-slate-300 dark:hover:border-slate-600 transition-colors bg-slate-50/50 dark:bg-slate-800/30"
                      >
                        <div className="flex items-center">
                          <div className="mr-3">{getStatusIcon(transfer.status)}</div>
                          <div>
                            <div className="flex items-center space-x-1">
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                To:
                              </span>
                              <CopyButton text={transfer.to} className="text-sm" />
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {new Date(transfer.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            -{transfer.amount} {transfer.tokenSymbol || "ETH"}
                          </p>
                          <p
                            className={`text-xs capitalize ${
                              transfer.status === "completed"
                                ? "text-green-600"
                                : transfer.status === "failed"
                                  ? "text-red-600"
                                  : "text-yellow-600"
                            }`}
                          >
                            {transfer.status}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800/50 mb-4">
                      <ArrowUpIcon className="w-8 h-8 text-slate-600 dark:text-slate-400" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                      No transfers yet
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 max-w-sm mx-auto">
                      Send your first transfer to see your transaction history here. Transfers are
                      fast, secure, and can be gas-free with Paymaster!
                    </p>
                    <button
                      onClick={() => router.push("/transfer")}
                      disabled={!account?.deployed}
                      className="inline-flex items-center justify-center px-4 py-3 sm:py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 border border-transparent rounded-xl shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-500 transition-all duration-200 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none touch-manipulation active:scale-95"
                    >
                      <ArrowUpIcon className="w-4 h-4 mr-2" />
                      Send Your First Transfer
                    </button>
                    {!account?.deployed && (
                      <p className="mt-3 text-xs text-gray-500 dark:text-gray-500">
                        Create and deploy your account first to send transfers
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Create Account Dialog */}
        <CreateAccountDialog
          isOpen={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          onSuccess={handleAccountCreated}
        />

        {/* Receive Modal */}
        {account && (
          <ReceiveModal
            isOpen={showReceiveModal}
            onClose={() => setShowReceiveModal(false)}
            address={account.address}
          />
        )}
      </div>
    </Layout>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
