"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import TokenSelector from "@/components/TokenSelector";
import TransferSkeleton from "@/components/TransferSkeleton";
import { useDashboard } from "@/contexts/DashboardContext";
import { transferAPI, tokenAPI, paymasterAPI, addressBookAPI } from "@/lib/api";
import { GasEstimate, Token, TokenBalance } from "@/lib/types";
import toast from "react-hot-toast";
import { startAuthentication } from "@simplewebauthn/browser";
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  WalletIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

export default function TransferPage() {
  const { data, refreshBalance: contextRefreshBalance } = useDashboard();
  const { account } = data;

  const [formData, setFormData] = useState({
    to: "",
    amount: "",
    usePaymaster: false,
    paymasterAddress: "",
  });
  const [selectedToken, setSelectedToken] = useState<Token | null>(null); // null means ETH
  const [tokenBalance, setTokenBalance] = useState<TokenBalance | null>(null);
  const [_loadingTokenBalance, setLoadingTokenBalance] = useState(false);
  const [gasEstimate, setGasEstimate] = useState<GasEstimate | null>(null);
  const [savedPaymasters, setSavedPaymasters] = useState<any[]>([]);
  const [showPaymasterDropdown, setShowPaymasterDropdown] = useState(false);
  const [addressBook, setAddressBook] = useState<any[]>([]);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [loading, setLoading] = useState({
    page: true,
    estimate: false,
    transfer: false,
  });
  const [transferResult, setTransferResult] = useState<any>(null);
  const [transferStatus, setTransferStatus] = useState<any>(null);
  const [pullToRefresh, setPullToRefresh] = useState({
    pulling: false,
    distance: 0,
    refreshing: false,
  });
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);
  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    loadPageData();
  }, []);

  const loadPageData = async () => {
    setLoading(prev => ({ ...prev, page: true }));
    try {
      // Load saved paymasters
      try {
        const paymasterResponse = await paymasterAPI.getAvailable();
        setSavedPaymasters(paymasterResponse.data);
      } catch (error) {
        console.error("Failed to load saved paymasters:", error);
        setSavedPaymasters([]);
      }

      // Load address book + recent transfer recipients
      try {
        const [addressBookResponse, historyResponse] = await Promise.all([
          addressBookAPI.getAddressBook().catch(() => ({ data: [] })),
          transferAPI.getHistory(1, 50).catch(() => ({ data: { transfers: [] } })),
        ]);

        const bookEntries = addressBookResponse.data || [];
        const bookAddresses = new Set(bookEntries.map((e: any) => e.address.toLowerCase()));

        // Extract unique recent recipients not already in address book
        const recentAddresses: any[] = [];
        const seen = new Set<string>();
        for (const tx of historyResponse.data.transfers || []) {
          const lower = tx.to.toLowerCase();
          if (!bookAddresses.has(lower) && !seen.has(lower)) {
            seen.add(lower);
            recentAddresses.push({
              address: tx.to,
              name: "",
              lastUsed: tx.createdAt,
              usageCount: 1,
              isRecent: true,
            });
          }
        }

        setAddressBook([...bookEntries, ...recentAddresses]);
      } catch (error) {
        console.error("Failed to load address book:", error);
        setAddressBook([]);
      }
    } catch (error: any) {
      console.error("Transfer page error:", error);
      toast.error("Failed to load transfer page data");
    } finally {
      setLoading(prev => ({ ...prev, page: false }));
    }
  };

  const loadTokenBalance = async (token: Token | null) => {
    if (!token || token.address === "ETH") {
      setTokenBalance(null);
      return;
    }

    setLoadingTokenBalance(true);
    try {
      const response = await tokenAPI.getTokenBalance(token.address);
      setTokenBalance(response.data);
    } catch (error) {
      console.error("Failed to load token balance:", error);
      setTokenBalance(null);
    } finally {
      setLoadingTokenBalance(false);
    }
  };

  // Load token balance when selected token changes
  useEffect(() => {
    loadTokenBalance(selectedToken);
  }, [selectedToken]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, type, checked } = e.target;
    let { value } = e.target;

    // Handle amount input with decimal validation based on token decimals
    if (name === "amount") {
      // Get the decimals for the selected token
      const decimals = selectedToken ? selectedToken.decimals : 18; // ETH has 18 decimals

      // If token has 0 decimals, don't allow decimal point
      if (decimals === 0) {
        const isValidAmount = value === "" || /^\d+$/.test(value);
        if (!isValidAmount) {
          return; // Prevent decimal input for tokens with 0 decimals
        }
      } else {
        // Replace various decimal separators with English period
        // 12290 = Chinese period (。), 65294 = fullwidth period (．)
        value = value.replace(/[。．]/g, ".");

        // Also handle comma as decimal separator (common in some locales)
        // But only if there's no period already and it looks like a decimal
        if (!value.includes(".") && value.match(/^\d+,\d*$/)) {
          value = value.replace(",", ".");
        }

        // Handle special case: user types just "."
        if (value === ".") {
          value = "0.";
        }

        // Check for valid number format with optional decimal point
        const isValidAmount = value === "" || /^\d*\.?\d*$/.test(value);
        if (!isValidAmount) {
          return; // Prevent invalid input
        }

        // Check if there's a decimal point and limit decimal places
        if (value.includes(".")) {
          const parts = value.split(".");
          // Allow the decimal point even if there are no digits after it yet
          if (parts.length > 2) {
            return; // Prevent multiple decimal points
          }
          if (parts[1] && parts[1].length > decimals) {
            return; // Prevent more decimal places than allowed
          }
        }
      }
    }

    setFormData(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    // Clear gas estimate when form changes
    if (gasEstimate) {
      setGasEstimate(null);
    }
  };

  const estimateGas = async () => {
    if (!formData.to || !formData.amount) {
      toast.error("Please fill in recipient address and amount");
      return;
    }

    setLoading(prev => ({ ...prev, estimate: true }));
    try {
      const response = await transferAPI.estimate({
        to: formData.to,
        amount: formData.amount,
        tokenAddress: selectedToken?.address, // undefined = ETH transfer
      });
      setGasEstimate(response.data);
      toast.success("Gas estimated successfully");
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to estimate gas";
      toast.error(message);
    } finally {
      setLoading(prev => ({ ...prev, estimate: false }));
    }
  };

  const executeTransfer = async () => {
    if (!formData.to || !formData.amount) {
      toast.error("Please fill in recipient address and amount");
      return;
    }

    // Check if amount exceeds available balance (skip when using paymaster)
    const transferAmount = parseFloat(formData.amount);

    if (!formData.usePaymaster) {
      if (!selectedToken || selectedToken.address === "ETH") {
        // ETH transfer validation
        const availableBalance = parseFloat(account?.balance || "0");
        if (transferAmount > availableBalance) {
          toast.error(
            `Insufficient balance: Trying to send ${transferAmount} ETH but only ${availableBalance} ETH available`
          );
          return;
        }
      } else {
        // Token transfer validation
        const availableBalance = parseFloat(tokenBalance?.formattedBalance || "0");
        if (transferAmount > availableBalance) {
          toast.error(
            `Insufficient balance: Trying to send ${transferAmount} ${selectedToken.symbol} but only ${availableBalance} ${selectedToken.symbol} available`
          );
          return;
        }
      }
    }

    // Stop any existing polling and clear previous results
    stopPolling();
    setTransferResult(null);
    setTransferStatus(null);

    setLoading(prev => ({ ...prev, transfer: true }));

    let loadingToast: string | null = null;

    try {
      // Phase 1: prepare. The backend (via the SDK) builds the UserOp, derives the
      // tier-aware payload, calls KMS BeginAuthentication, and returns
      // publicKeyOptions whose `challenge` is already the WYSIWYS commitment. We
      // never compute commitChallenge or talk to KMS directly here.
      loadingToast = toast.loading("Preparing transaction...");
      const prep = await transferAPI.prepare({
        to: formData.to,
        amount: formData.amount,
        usePaymaster: formData.usePaymaster,
        paymasterAddress:
          formData.usePaymaster && formData.paymasterAddress
            ? formData.paymasterAddress
            : undefined,
        tokenAddress: selectedToken?.address === "ETH" ? undefined : selectedToken?.address,
      });

      // Phase 2: browser ceremony — the user's device passkey signs the
      // SDK-computed commitment. Use publicKeyOptions verbatim.
      toast.dismiss(loadingToast);
      loadingToast = toast.loading("Please verify with your passkey...");
      const credential = await startAuthentication({
        optionsJSON: prep.data.publicKeyOptions as any,
      });

      // Phase 3: submit. The committed digest matches what prepare bound, so the
      // KMS accepts the assertion under strict mode.
      toast.dismiss(loadingToast);
      loadingToast = toast.loading("Processing transfer...");
      const response = await transferAPI.submit({
        transferId: prep.data.transferId,
        challengeId: prep.data.challengeId,
        credential,
      });
      setTransferResult(response.data);

      if (loadingToast) {
        toast.dismiss(loadingToast);
      }
      toast.success("Transfer submitted! Tracking status...");

      // Start polling for status
      startStatusPolling(response.data.transferId);

      // Clear form - keep selectedToken as null (defaults to ETH in selector)
      setFormData({
        to: "",
        amount: "",
        usePaymaster: false,
        paymasterAddress: "",
      });
      setSelectedToken(null);
      setGasEstimate(null);
    } catch (error: any) {
      if (loadingToast) {
        toast.dismiss(loadingToast);
      }

      // Handle passkey verification errors
      if (error.name === "NotAllowedError") {
        toast.error("Transaction verification was cancelled");
        setLoading(prev => ({ ...prev, transfer: false }));
        return;
      } else if (error.name === "NotSupportedError") {
        toast.error("Passkeys are not supported on this device");
        setLoading(prev => ({ ...prev, transfer: false }));
        return;
      } else if (error.name === "SecurityError") {
        toast.error("Security error during verification");
        setLoading(prev => ({ ...prev, transfer: false }));
        return;
      }

      // Extract detailed error information
      const errorData = error.response?.data;

      if (
        errorData?.error === "PaymasterSponsorshipRejected" ||
        errorData?.error === "PaymasterSponsorshipFailed"
      ) {
        // Show detailed Paymaster error
        const details =
          errorData.details || errorData.message || "Paymaster could not sponsor this transaction";

        // Create a more detailed error toast for Paymaster failures
        toast.error(
          <div>
            <div className="mb-1 font-semibold">Paymaster Sponsorship Failed</div>
            <div className="text-sm whitespace-pre-line">{details}</div>
          </div>,
          {
            duration: 8000, // Show for longer since it has more info
            style: {
              maxWidth: "500px",
            },
          }
        );
      } else {
        // Regular error message
        const message = errorData?.message || error.message || "Transfer failed";
        toast.error(message);
      }
    } finally {
      setLoading(prev => ({ ...prev, transfer: false }));
    }
  };

  const startStatusPolling = (transferId: string) => {
    // Clear any existing polling
    stopPolling();

    // Set polling flag
    isPollingRef.current = true;

    // Poll immediately
    checkTransferStatus(transferId);

    // Set up polling interval (every 2 seconds)
    const interval = setInterval(() => {
      if (!isPollingRef.current) {
        clearInterval(interval);
        return;
      }
      checkTransferStatus(transferId);
    }, 2000);

    pollingIntervalRef.current = interval;
  };

  const stopPolling = () => {
    isPollingRef.current = false;
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const checkTransferStatus = async (transferId: string) => {
    // Skip if not polling
    if (!isPollingRef.current) {
      return;
    }

    try {
      const response = await transferAPI.getStatus(transferId);
      setTransferStatus(response.data);

      // Stop polling if transfer is completed or failed
      if (response.data.status === "completed" || response.data.status === "failed") {
        const wasPolling = isPollingRef.current;
        stopPolling();

        // Only show toast once when polling was active
        if (wasPolling) {
          if (response.data.status === "completed") {
            toast.success("Transfer completed successfully!");
          } else {
            toast.error(`Transfer failed: ${response.data.error || "Unknown error"}`);
          }
        }
      }
    } catch (error) {
      console.error("Failed to check transfer status:", error);
    }
  };

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  const formatGwei = (wei: string) => {
    return (parseInt(wei, 16) / 1e9).toFixed(2);
  };

  // Format balance to avoid display issues with too many decimals
  const formatBalance = (balance: string | undefined) => {
    if (!balance) return "0";
    const num = parseFloat(balance);
    if (num === 0) return "0";
    if (num >= 1) return num.toFixed(4);
    if (num >= 0.0001) return num.toFixed(6);
    return num.toFixed(8);
  };

  // Check if transfer should be disabled
  const isTransferDisabled = () => {
    if (!formData.to || !formData.amount || loading.transfer) {
      return true;
    }

    const transferAmount = parseFloat(formData.amount);
    if (transferAmount < 0) return true;

    // When using paymaster, skip balance checks (paymaster sponsors gas)
    if (formData.usePaymaster) return false;

    // For ETH transfers, check ETH balance
    if (!selectedToken || selectedToken.address === "ETH") {
      const availableBalance = parseFloat(account?.balance || "0");
      return transferAmount > availableBalance;
    }

    // For token transfers, check token balance
    const availableBalance = parseFloat(tokenBalance?.formattedBalance || "0");
    return transferAmount > availableBalance;
  };

  // Refresh account balance
  const refreshBalance = async () => {
    try {
      await contextRefreshBalance();

      // Reload token balance if a token is selected
      if (selectedToken && selectedToken.address !== "ETH") {
        await loadTokenBalance(selectedToken);
      }

      toast.success("Balance updated");
    } catch {
      toast.error("Failed to refresh balance");
    }
  };

  // Pull to refresh handlers
  const _handleTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0 && !pullToRefresh.refreshing) {
      touchStartY.current = e.touches[0].clientY;
    }
  };

  const _handleTouchMove = (e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0 && !pullToRefresh.refreshing) {
      const touchY = e.touches[0].clientY;
      const distance = touchY - touchStartY.current;

      if (distance > 0 && distance < 150) {
        setPullToRefresh({ pulling: true, distance, refreshing: false });
      }
    }
  };

  const _handleTouchEnd = async () => {
    if (pullToRefresh.distance > 80 && !pullToRefresh.refreshing) {
      // Keep the pull state and show refreshing
      setPullToRefresh({ pulling: false, distance: 80, refreshing: true });

      try {
        await refreshBalance();
      } finally {
        // After refresh completes, bounce back
        setPullToRefresh({ pulling: false, distance: 0, refreshing: false });
      }
    } else {
      // Bounce back immediately if threshold not reached
      setPullToRefresh({ pulling: false, distance: 0, refreshing: false });
    }
  };

  // Save address to address book
  const _saveToAddressBook = async () => {
    if (!formData.to) {
      toast.error("No address to save");
      return;
    }

    // Validate address format
    if (!formData.to.match(/^0x[a-fA-F0-9]{40}$/)) {
      toast.error("Invalid address format");
      return;
    }

    // Prompt user for a name
    const name = prompt("Enter a name for this address (optional):");

    try {
      await addressBookAPI.setAddressName(formData.to, name || "");

      // Refresh address book
      const addressBookResponse = await addressBookAPI.getAddressBook();
      setAddressBook(addressBookResponse.data);

      toast.success("Address saved to address book! 📖");
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to save address";
      toast.error(message);
    }
  };

  if (loading.page) {
    return (
      <Layout requireAuth={true}>
        <TransferSkeleton />
      </Layout>
    );
  }

  // Show account creation prompt if no account exists
  if (!account) {
    return (
      <Layout requireAuth={true}>
        <div className="max-w-2xl px-3 py-4 mx-auto sm:px-4 sm:py-6 lg:px-8">
          {/* Header - Desktop only */}
          <div className="hidden md:block mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Send Transfer</h1>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Send ETH using ERC-4337 account abstraction
              </p>
            </div>
          </div>

          {/* Account Creation Required */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="p-6 sm:p-8 text-center">
              <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-slate-100 dark:bg-slate-800/50 rounded-full">
                <WalletIcon className="w-8 h-8 text-slate-900 dark:text-emerald-400" />
              </div>
              <h2 className="mb-2 text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
                Create Your Smart Account First
              </h2>
              <p className="mb-6 text-sm sm:text-base text-gray-600 dark:text-gray-400">
                You need to create a smart account before you can send transfers. Your account will
                be deployed automatically with your first transaction.
              </p>
              <button
                onClick={() => router.push("/dashboard")}
                className="inline-flex items-center px-4 py-3 sm:py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 border border-transparent rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-500 touch-manipulation active:scale-95"
              >
                <WalletIcon className="w-4 h-4 mr-2" />
                Go to Dashboard to Create Account
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout requireAuth={true}>
      <div ref={containerRef} className="relative overflow-hidden">
        <div className="relative">
          <div className="max-w-2xl px-3 py-4 mx-auto sm:px-4 sm:py-6 lg:px-8">
            {/* Header - Desktop only */}
            <div className="hidden md:block mb-8">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Send Transfer</h1>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Send ETH using ERC-4337 account abstraction - gas fees handled automatically
                </p>
              </div>
            </div>

            {/* Asset Selection - Moved to top */}
            <div className="mb-6">
              <label className="block mb-3 text-base font-semibold text-gray-900 dark:text-white">
                Select Asset
              </label>

              <TokenSelector
                selectedToken={selectedToken}
                onTokenChange={setSelectedToken}
                accountAddress={account?.address}
                ethBalance={formatBalance(account?.balance)}
                includeEth={true}
                showBalances={true}
                showSearch={true}
                showOnlyWithBalance={false}
              />

              <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                💡 Tip: ETH transfers work best with Paymaster sponsorship. ERC20 transfers may not
                be sponsored by all paymasters.
              </p>
            </div>

            {/* Account Balance - Now linked to selected asset */}
            <div className="p-4 mb-6 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-200">
                    Available Balance
                  </p>
                  <div className="relative group">
                    <div className="text-lg font-semibold text-slate-900 dark:text-emerald-400">
                      {selectedToken && selectedToken.address !== "ETH"
                        ? `${tokenBalance?.formattedBalance || "0"} ${selectedToken.symbol}`
                        : `${formatBalance(account?.balance)} ETH`}
                    </div>
                    {/* Tooltip */}
                    <div className="absolute left-0 z-10 invisible px-3 py-2 mb-2 text-sm text-white transition-all duration-200 bg-gray-900 dark:bg-gray-800 rounded-lg opacity-0 bottom-full group-hover:opacity-100 group-hover:visible whitespace-nowrap">
                      <div className="font-mono">
                        {selectedToken && selectedToken.address !== "ETH"
                          ? `${tokenBalance?.balance || "0"} ${selectedToken.symbol}`
                          : `${account?.balance || "0"} ETH`}
                      </div>
                      <div className="absolute w-0 h-0 border-t-4 border-l-4 border-r-4 top-full left-4 border-l-transparent border-r-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-700 dark:text-slate-300">Account Address</p>
                  <p className="font-mono text-sm text-slate-900 dark:text-slate-200">
                    {account?.address.slice(0, 10)}...{account?.address.slice(-8)}
                  </p>
                  {/* Refresh button - Desktop only */}
                  <div className="hidden md:flex justify-end mt-2 space-x-2">
                    <button
                      onClick={refreshBalance}
                      className="inline-flex items-center px-2 py-1 text-xs font-medium text-slate-900 dark:text-emerald-400 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 rounded-xl hover:bg-slate-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-400 transition-all"
                    >
                      <svg
                        className="w-3 h-3 mr-1"
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
                      Refresh
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Transfer Status */}
            {transferResult && (
              <div
                className={`border rounded-xl p-4 mb-6 ${
                  transferStatus?.status === "completed"
                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                    : transferStatus?.status === "failed"
                      ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700"
                      : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                }`}
              >
                <div className="flex">
                  {transferStatus?.status === "completed" ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-400" />
                  ) : transferStatus?.status === "failed" ? (
                    <InformationCircleIcon className="w-5 h-5 text-red-400" />
                  ) : (
                    <div className="w-5 h-5 border-b-2 border-slate-900 dark:border-emerald-500 rounded-full animate-spin"></div>
                  )}
                  <div className="flex-1 ml-3">
                    <h3
                      className={`text-sm font-medium ${
                        transferStatus?.status === "completed"
                          ? "text-green-800 dark:text-green-200"
                          : transferStatus?.status === "failed"
                            ? "text-red-800 dark:text-red-200"
                            : "text-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {transferStatus?.statusDescription || "Transfer Submitted"}
                    </h3>
                    <div className="mt-2 space-y-1 text-sm">
                      <p className="text-gray-700 dark:text-gray-300">
                        Status:{" "}
                        <span className="font-medium">
                          {transferStatus?.status || transferResult.status}
                        </span>
                        {transferStatus?.elapsedSeconds && (
                          <span className="ml-2 text-gray-600 dark:text-gray-400">
                            ({transferStatus.elapsedSeconds}s elapsed)
                          </span>
                        )}
                      </p>
                      <p className="font-mono text-xs text-gray-600 dark:text-gray-400">
                        Transfer ID: {transferResult.transferId}
                      </p>
                      {transferStatus?.transactionHash && (
                        <p className="font-mono text-xs text-gray-700 dark:text-gray-300">
                          Transaction:
                          <a
                            href={transferStatus.explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 text-slate-900 dark:text-emerald-400 underline hover:text-slate-700 dark:hover:text-emerald-300 transition-all"
                          >
                            {transferStatus.transactionHash.slice(0, 20)}...
                          </a>
                        </p>
                      )}
                      {transferStatus?.actualGasUsed && (
                        <p className="font-mono text-xs text-gray-600 dark:text-gray-400">
                          Gas used: {parseInt(transferStatus.actualGasUsed, 16).toLocaleString()}
                          {transferStatus.actualGasCost && (
                            <span className="ml-2">
                              Cost: {(parseInt(transferStatus.actualGasCost, 16) / 1e18).toFixed(8)}{" "}
                              ETH
                            </span>
                          )}
                          {transferStatus.retryCount > 0 && (
                            <span className="ml-2 text-amber-600 dark:text-amber-400">
                              (retried {transferStatus.retryCount}x)
                            </span>
                          )}
                        </p>
                      )}
                      {transferStatus?.bundlerUserOpHash && !transferStatus?.transactionHash && (
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Bundler processing transaction...
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Transfer Form */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
              <div className="p-6 space-y-6">
                {/* Recipient */}
                <div>
                  <label
                    htmlFor="to"
                    className="block mb-2 text-base font-semibold text-gray-900 dark:text-white"
                  >
                    Recipient Address
                  </label>

                  {/* Address Book Selection */}
                  {addressBook.length > 0 && (
                    <div className="mb-3">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowAddressDropdown(!showAddressDropdown)}
                          className="flex items-center justify-between w-full px-4 py-3 text-base bg-gray-50 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-400 transition-all touch-manipulation active:scale-[0.98]"
                        >
                          <span className="text-gray-700 dark:text-gray-300 font-medium">
                            Choose from saved & recent addresses ({addressBook.length})
                          </span>
                          <svg
                            className={`w-5 h-5 transition-transform ${
                              showAddressDropdown ? "rotate-180" : ""
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </button>
                        {showAddressDropdown && (
                          <div className="absolute z-10 w-full mt-2 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                            {addressBook.map(entry => (
                              <button
                                key={entry.address}
                                type="button"
                                onClick={() => {
                                  setFormData(prev => ({
                                    ...prev,
                                    to: entry.address,
                                  }));
                                  setShowAddressDropdown(false);
                                }}
                                className="block w-full px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 touch-manipulation active:scale-[0.98]"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    {entry.name ? (
                                      <div className="font-semibold text-gray-900 dark:text-white truncate text-base">
                                        {entry.name}
                                      </div>
                                    ) : entry.isRecent ? (
                                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                        Recent
                                      </div>
                                    ) : null}
                                    <div className="text-sm text-gray-500 dark:text-gray-400 font-mono truncate">
                                      {entry.address}
                                    </div>
                                    {entry.usageCount > 0 && entry.lastUsed && (
                                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                        Last used:{" "}
                                        {new Date(entry.lastUsed).toLocaleDateString("en-US", {
                                          month: "short",
                                          day: "numeric",
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="relative">
                    <input
                      type="text"
                      name="to"
                      id="to"
                      value={formData.to}
                      onChange={handleChange}
                      placeholder="0x..."
                      className="block w-full px-4 py-4 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl shadow-sm focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-400 focus:border-slate-900 dark:focus:border-emerald-400 text-base placeholder-gray-400 dark:placeholder-gray-500 transition-all font-mono"
                      autoComplete="off"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck="false"
                    />
                    {formData.to && (
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, to: "" }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 touch-manipulation"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                  {!formData.to && addressBook.length === 0 && (
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      Enter Ethereum address starting with 0x
                    </p>
                  )}
                </div>

                {/* Amount */}
                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <label
                      htmlFor="amount"
                      className="block text-base font-semibold text-gray-900 dark:text-white"
                    >
                      Amount
                    </label>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Available:{" "}
                      {selectedToken && selectedToken.address !== "ETH"
                        ? (tokenBalance?.formattedBalance || "0") + " " + selectedToken.symbol
                        : parseFloat(account?.balance || "0").toFixed(4) + " ETH"}
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      name="amount"
                      id="amount"
                      value={formData.amount}
                      onChange={handleChange}
                      placeholder="0.00"
                      className="block w-full px-4 py-4 pr-24 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl shadow-sm focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-400 focus:border-slate-900 dark:focus:border-emerald-400 text-2xl font-semibold placeholder-gray-300 dark:placeholder-gray-600 transition-all"
                      autoComplete="off"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      <span className="text-lg font-semibold text-gray-600 dark:text-gray-400">
                        {selectedToken && selectedToken.address !== "ETH"
                          ? selectedToken.symbol
                          : "ETH"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const maxAmount =
                            selectedToken && selectedToken.address !== "ETH"
                              ? tokenBalance?.formattedBalance || "0"
                              : account?.balance || "0";
                          setFormData(prev => ({ ...prev, amount: maxAmount }));
                        }}
                        className="px-2 py-1 text-xs font-semibold text-slate-900 dark:text-emerald-400 bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-all touch-manipulation"
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  {selectedToken &&
                    selectedToken.address !== "ETH" &&
                    selectedToken.decimals === 0 && (
                      <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                        ⚠️ This token only accepts whole numbers
                      </p>
                    )}
                  {selectedToken &&
                    selectedToken.address !== "ETH" &&
                    selectedToken.decimals > 0 && (
                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        Up to {selectedToken.decimals} decimal places
                      </p>
                    )}
                  {/* Show insufficient balance warning */}
                  {formData.amount &&
                    (() => {
                      const inputAmount = parseFloat(formData.amount);
                      let availableAmount = 0;
                      let symbol = "";

                      if (!selectedToken || selectedToken.address === "ETH") {
                        // ETH
                        availableAmount = parseFloat(account?.balance || "0");
                        symbol = "ETH";
                      } else {
                        // ERC20 Token
                        availableAmount = parseFloat(tokenBalance?.formattedBalance || "0");
                        symbol = selectedToken.symbol;
                      }

                      if (inputAmount > availableAmount) {
                        return (
                          <div className="flex items-center mt-1 text-sm text-red-600 dark:text-red-400">
                            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                                clipRule="evenodd"
                              />
                            </svg>
                            Insufficient balance. Available: {availableAmount} {symbol}
                          </div>
                        );
                      }
                      return null;
                    })()}

                  {/* AirAccount guard indicator — only for ETH transfers when a daily limit is set */}
                  {formData.amount &&
                    (!selectedToken || selectedToken.address === "ETH") &&
                    account?.dailyLimit &&
                    (() => {
                      const inputAmount = parseFloat(formData.amount);
                      if (isNaN(inputAmount) || inputAmount <= 0) return null;

                      // dailyLimit is stored in wei (decimal string) — convert to ETH for comparison.
                      const dailyLimitEth = parseFloat(account.dailyLimit) / 1e18;
                      // Tier 3 is triggered when a single transfer exceeds the on-chain daily limit guard.
                      // Tier 1 vs Tier 2 thresholds (tier1Limit / tier2Limit) are separate contract-level
                      // storage variables not available client-side — do not approximate them from dailyLimit.
                      const exceedsDailyLimit = inputAmount > dailyLimitEth;

                      return (
                        <div
                          className={`mt-3 p-3 border rounded-xl text-sm ${
                            exceedsDailyLimit
                              ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-700 dark:text-red-400"
                              : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-400"
                          }`}
                        >
                          <div className="flex items-center gap-2 font-semibold">
                            {exceedsDailyLimit ? (
                              <>
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200">
                                  3
                                </span>
                                Tier 3 — Guardian approval required
                              </>
                            ) : (
                              <>
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200">
                                  ✓
                                </span>
                                Tiered signing active
                              </>
                            )}
                          </div>
                          <p className="mt-1 text-xs opacity-80">
                            {exceedsDailyLimit
                              ? `Transfer exceeds daily limit (${dailyLimitEth} ETH). Passkey + BLS + guardian ECDSA triple signature required.`
                              : `Passkey + BLS signing active. Daily limit: ${dailyLimitEth} ETH. Exact tier (1 or 2) is determined by contract-level thresholds.`}
                          </p>
                          {exceedsDailyLimit && (
                            <p className="mt-2 text-xs font-medium">
                              Guardian at <span className="font-mono">0x51eD...2E114</span> must
                              co-sign this transaction.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                </div>

                {/* Paymaster Option */}
                <div className="p-4 border border-purple-200 dark:border-purple-600 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20">
                  <div className="flex items-start">
                    <div className="flex items-center h-5">
                      <input
                        id="usePaymaster"
                        name="usePaymaster"
                        type="checkbox"
                        checked={formData.usePaymaster}
                        onChange={handleChange}
                        className="w-4 h-4 text-purple-600 dark:text-purple-400 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-purple-500 dark:focus:ring-purple-400"
                      />
                    </div>
                    <div className="ml-3 flex-1">
                      <label
                        htmlFor="usePaymaster"
                        className="text-sm font-medium text-gray-900 dark:text-white"
                      >
                        Use Paymaster (Sponsored Gas) ✨
                      </label>

                      {/* Paymaster Address Input - Only show when paymaster is enabled */}
                      {formData.usePaymaster && (
                        <div className="mt-3">
                          <div className="mb-1">
                            <label
                              htmlFor="paymasterAddress"
                              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                            >
                              Paymaster Contract Address (Optional)
                            </label>
                          </div>

                          {/* Saved Paymaster Selection */}
                          {savedPaymasters.length > 0 && (
                            <div className="mb-2">
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setShowPaymasterDropdown(!showPaymasterDropdown)}
                                  className="flex items-center justify-between w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 transition-all"
                                >
                                  <span className="text-gray-600 dark:text-gray-400">
                                    Choose from saved paymasters ({savedPaymasters.length})
                                  </span>
                                  <svg
                                    className={`w-4 h-4 transition-transform ${
                                      showPaymasterDropdown ? "rotate-180" : ""
                                    }`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 9l-7 7-7-7"
                                    />
                                  </svg>
                                </button>
                                {showPaymasterDropdown && (
                                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                    {savedPaymasters.map(paymaster => (
                                      <button
                                        key={paymaster.address}
                                        type="button"
                                        onClick={() => {
                                          setFormData(prev => ({
                                            ...prev,
                                            paymasterAddress: paymaster.address,
                                          }));
                                          setShowPaymasterDropdown(false);
                                        }}
                                        className="block w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-700"
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="font-medium">{paymaster.name}</span>
                                          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                            {paymaster.address.slice(0, 8)}...
                                            {paymaster.address.slice(-6)}
                                          </span>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          <input
                            type="text"
                            name="paymasterAddress"
                            id="paymasterAddress"
                            value={formData.paymasterAddress}
                            onChange={handleChange}
                            placeholder="0x... or select from saved paymasters above"
                            className="block w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl shadow-sm focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-purple-500 dark:focus:border-purple-400 text-sm placeholder-gray-400 dark:placeholder-gray-500 transition-all font-mono"
                            autoComplete="off"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck="false"
                          />
                          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                            Enter your paymaster contract address to sponsor gas fees. Leave empty
                            for no paymaster.
                          </p>
                          {formData.paymasterAddress && (
                            <div className="mt-2">
                              <div className="p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300">
                                💡 Using custom paymaster: {formData.paymasterAddress.slice(0, 10)}
                                ...
                                {formData.paymasterAddress.slice(-8)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Dynamic description based on asset selection */}
                      {selectedToken && selectedToken.address !== "ETH" ? (
                        <div className="mt-2">
                          <p className="inline-block px-2 py-1 text-xs rounded text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30">
                            ⚠️ ERC20 transfers may not be sponsored by all paymasters
                          </p>
                          <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">
                            Some paymasters don&apos;t support token transfers. Try ETH transfer if
                            this fails.
                          </p>
                        </div>
                      ) : (
                        <div className="mt-2">
                          <p className="inline-block px-2 py-1 text-xs text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 rounded">
                            ✅ ETH transfers work best with paymaster sponsorship
                          </p>
                          <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">
                            {formData.paymasterAddress
                              ? "Using your custom paymaster for gas sponsorship."
                              : "No paymaster specified - gas fees will not be sponsored."}
                          </p>
                        </div>
                      )}

                      {formData.usePaymaster && (
                        <div className="inline-block px-2 py-1 mt-2 text-xs text-purple-700 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 rounded">
                          🎉 Attempting gas sponsorship...
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Gas Estimation */}
                {gasEstimate && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                    <h3 className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
                      Gas Estimation
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Call Gas:</span>
                        <span className="ml-2 font-mono">
                          {parseInt(gasEstimate.callGasLimit, 16).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Verification Gas:</span>
                        <span className="ml-2 font-mono">
                          {parseInt(gasEstimate.verificationGasLimit, 16).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Pre-verification:</span>
                        <span className="ml-2 font-mono">
                          {parseInt(gasEstimate.preVerificationGas, 16).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Max Fee:</span>
                        <span className="ml-2 font-mono">
                          {formatGwei(gasEstimate.maxFeePerGas)} Gwei
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={estimateGas}
                    disabled={loading.estimate || !formData.to || !formData.amount}
                    className="inline-flex items-center justify-center flex-1 px-4 py-3 sm:py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all touch-manipulation active:scale-95"
                  >
                    {loading.estimate ? (
                      <div className="w-4 h-4 mr-2 border-b-2 border-slate-900 dark:border-emerald-500 rounded-full animate-spin"></div>
                    ) : null}
                    Estimate Gas
                  </button>

                  <button
                    type="button"
                    onClick={executeTransfer}
                    disabled={isTransferDisabled()}
                    className={`flex-1 inline-flex justify-center items-center px-4 py-3 sm:py-2 border border-transparent text-sm font-medium rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 touch-manipulation active:scale-95 ${
                      isTransferDisabled()
                        ? "bg-gray-400 text-gray-100 cursor-not-allowed"
                        : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 focus:ring-slate-900 dark:focus:ring-emerald-500"
                    }`}
                  >
                    {loading.transfer ? (
                      <div className="w-4 h-4 mr-2 border-b-2 border-white rounded-full animate-spin"></div>
                    ) : (
                      <ArrowTopRightOnSquareIcon className="w-4 h-4 mr-2" />
                    )}
                    {(() => {
                      if (!formData.amount) return "Send Transfer";
                      const transferAmount = parseFloat(formData.amount);
                      const symbol =
                        !selectedToken || selectedToken.address === "ETH"
                          ? "ETH"
                          : selectedToken.symbol;

                      // When using paymaster, always show send button
                      if (formData.usePaymaster) return `Send ${symbol}`;

                      if (symbol === "ETH") {
                        return transferAmount > parseFloat(account?.balance || "0")
                          ? "Insufficient ETH Balance"
                          : "Send ETH";
                      }

                      const availableTokenBalance = parseFloat(
                        tokenBalance?.formattedBalance || "0"
                      );
                      return transferAmount > availableTokenBalance
                        ? `Insufficient ${selectedToken!.symbol} Balance`
                        : `Send ${selectedToken!.symbol}`;
                    })()}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
