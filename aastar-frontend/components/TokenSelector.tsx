"use client";

import { useState, useEffect, Fragment } from "react";
import { Listbox, Transition, Dialog } from "@headlessui/react";
import {
  ChevronUpDownIcon,
  CheckIcon,
  PlusIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { Token, UserTokenWithBalance } from "@/lib/types";
import { getUserTokens, addUserToken, initializeDefaultTokens } from "@/lib/user-token-store";
import TokenIcon from "@/components/TokenIcon";
import toast from "react-hot-toast";

interface TokenSelectorProps {
  selectedToken: Token | null;
  onTokenChange: (token: Token | null) => void;
  accountAddress?: string;
  showBalances?: boolean;
  className?: string;
  showSearch?: boolean;
  showOnlyWithBalance?: boolean;
  ethBalance?: string; // ETH balance from account
  includeEth?: boolean; // Whether to include ETH in the selector
}

export default function TokenSelector({
  selectedToken,
  onTokenChange,
  accountAddress,
  showBalances = true,
  className = "",
  showSearch = false,
  showOnlyWithBalance = false,
  ethBalance = "0",
  includeEth = true,
}: TokenSelectorProps) {
  const [userTokens, setUserTokens] = useState<UserTokenWithBalance[]>([]);
  const [filteredTokens, setFilteredTokens] = useState<UserTokenWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [refreshingBalances, setRefreshingBalances] = useState<{ [address: string]: boolean }>({});
  const [showCustomTokenModal, setShowCustomTokenModal] = useState(false);
  const [customTokenAddress, setCustomTokenAddress] = useState("");
  const [validatingToken, setValidatingToken] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Create ETH token object
  const ethToken: UserTokenWithBalance = {
    id: "eth-native",
    userId: "",
    address: "ETH",
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
    isCustom: false,
    isActive: true,
    sortOrder: -1, // Ensure ETH is always first
    createdAt: new Date().toISOString(),
    balance: {
      balance: ethBalance,
      formattedBalance: ethBalance,
      decimals: 18,
    },
  };

  useEffect(() => {
    loadTokens();
  }, [accountAddress]);

  useEffect(() => {
    applyFilters();
  }, [userTokens, searchQuery, showOnlyWithBalance, ethBalance, includeEth]);

  const loadTokens = async () => {
    setLoading(true);
    try {
      const opts = { activeOnly: true, withBalances: !!accountAddress && showBalances };
      let tokens = await getUserTokens(accountAddress, opts);
      // First use: seed the default preset tokens, then reload.
      if (tokens.length === 0) {
        initializeDefaultTokens(accountAddress);
        tokens = await getUserTokens(accountAddress, opts);
      }
      setUserTokens(tokens);
    } catch (error) {
      console.error("Failed to load tokens:", error);
      toast.error("Failed to load tokens");
    } finally {
      setLoading(false);
    }
  };

  const loadBalances = async () => {
    if (!accountAddress) return;

    setBalancesLoading(true);
    try {
      setUserTokens(await getUserTokens(accountAddress, { activeOnly: true, withBalances: true }));
    } catch (error) {
      console.error("Failed to load token balances:", error);
      // Don't show error toast for balances, as it's supplementary info
    } finally {
      setBalancesLoading(false);
    }
  };

  const addCustomToken = async () => {
    if (!customTokenAddress) {
      toast.error("Please enter a token address");
      return;
    }

    setValidatingToken(true);
    try {
      const token = await addUserToken(accountAddress, customTokenAddress);
      toast.success(`Added ${token.symbol} token`);
      setCustomTokenAddress("");
      setShowCustomTokenModal(false);
      await loadTokens();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to add token");
    } finally {
      setValidatingToken(false);
    }
  };

  const refreshSingleTokenBalance = async (token: Token) => {
    if (!accountAddress || !showBalances || token.address === "ETH") return;

    setRefreshingBalances(prev => ({ ...prev, [token.address]: true }));
    try {
      // Refresh all user tokens with updated balances
      await loadBalances();
      toast.success(`${token.symbol} balance refreshed`);
    } catch (error) {
      console.error(`Failed to refresh ${token.symbol} balance:`, error);
      toast.error(`Failed to refresh ${token.symbol} balance`);
    } finally {
      setRefreshingBalances(prev => ({ ...prev, [token.address]: false }));
    }
  };

  const _formatBalance = (balance?: string, decimals?: number) => {
    if (!balance || !decimals) return "0";
    try {
      const num = parseFloat(balance);
      if (num === 0) return "0";
      if (num >= 1) return num.toFixed(4);
      if (num >= 0.0001) return num.toFixed(6);
      return num.toExponential(2);
    } catch {
      return "0";
    }
  };

  const getTokenBalance = (token: UserTokenWithBalance | Token) => {
    if ("balance" in token) {
      return (token as UserTokenWithBalance).balance?.formattedBalance || null;
    }
    return null;
  };

  const applyFilters = () => {
    // Start with user tokens, and prepend ETH if includeEth is true
    const allTokens = includeEth ? [ethToken, ...userTokens] : [...userTokens];
    let filtered = allTokens;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        token =>
          token.symbol.toLowerCase().includes(query) ||
          token.name.toLowerCase().includes(query) ||
          token.address.toLowerCase().includes(query)
      );
    }

    // Balance filter
    if (showOnlyWithBalance) {
      filtered = filtered.filter(token => {
        const balance = token.balance;
        return balance && parseFloat(balance.formattedBalance) > 0;
      });
    }

    // Sort: by sortOrder first, tokens with balance, then alphabetically
    filtered.sort((a, b) => {
      // First by sort order (ETH will always be -1, so it stays on top)
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }

      // Then by balance
      const aBalance = getTokenBalance(a);
      const bBalance = getTokenBalance(b);
      const aHasBalance = aBalance && parseFloat(aBalance) > 0;
      const bHasBalance = bBalance && parseFloat(bBalance) > 0;

      if (aHasBalance && !bHasBalance) return -1;
      if (!aHasBalance && bHasBalance) return 1;

      return a.symbol.localeCompare(b.symbol);
    });

    setFilteredTokens(filtered);
  };

  if (loading) {
    return (
      <div className={`relative ${className}`}>
        <div className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center justify-center">
            <div className="w-4 h-4 border-b-2 border-blue-500 dark:border-blue-400 rounded-full animate-spin"></div>
            <span className="ml-2 text-sm text-gray-600 dark:text-gray-300">Loading tokens...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`relative ${className}`}>
        <Listbox value={selectedToken} onChange={onTokenChange}>
          <div className="relative">
            <Listbox.Button className="relative w-full py-3 pl-3 pr-10 text-left bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm cursor-default focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 sm:text-sm">
              <div className="flex items-center">
                {selectedToken ? (
                  <>
                    <TokenIcon token={selectedToken} size="md" className="mr-3" />
                    <div className="flex-1">
                      <span className="block font-medium text-gray-900 dark:text-gray-100">
                        {selectedToken.symbol}
                      </span>
                      <span className="block text-sm text-gray-600 dark:text-gray-400">
                        {selectedToken.name}
                      </span>
                    </div>
                    {showBalances && accountAddress && (
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {getTokenBalance(selectedToken) || "0"}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="block text-gray-500 dark:text-gray-400">
                    {includeEth ? "Select asset" : "Select an ERC20 token (optional)"}
                  </span>
                )}
              </div>
              <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                <ChevronUpDownIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </span>
            </Listbox.Button>

            <Transition
              as={Fragment}
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <Listbox.Options className="absolute z-10 w-full py-1 mt-1 overflow-auto text-base bg-white dark:bg-gray-800 rounded-md shadow-lg max-h-96 ring-1 ring-black dark:ring-gray-600 ring-opacity-5 dark:ring-opacity-50 focus:outline-none sm:text-sm">
                {/* Search and Filter Section */}
                {showSearch && (
                  <div className="p-3 border-b border-gray-200 dark:border-gray-600 space-y-2">
                    {/* Search Input */}
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search tokens..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        onClick={e => e.stopPropagation()}
                      />
                    </div>

                    {/* Balance Info */}
                    {balancesLoading && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                        <ArrowPathIcon className="h-3 w-3 mr-1 animate-spin" />
                        Loading balances...
                      </div>
                    )}

                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {filteredTokens.length} of{" "}
                      {includeEth ? userTokens.length + 1 : userTokens.length} tokens
                    </div>
                  </div>
                )}

                {filteredTokens.map(token => (
                  <Listbox.Option
                    key={token.address}
                    className={({ active }) =>
                      `relative cursor-default select-none py-2 pl-3 pr-9 ${
                        active
                          ? "bg-blue-600 dark:bg-blue-600 text-white"
                          : "text-gray-900 dark:text-gray-100"
                      }`
                    }
                    value={token}
                  >
                    {({ selected, active }) => (
                      <>
                        <div className="flex items-center">
                          <TokenIcon token={token} size="md" className="mr-3" />
                          <div className="flex-1">
                            <span
                              className={`block font-medium ${
                                selected ? "font-semibold" : "font-normal"
                              }`}
                            >
                              {token.symbol}
                            </span>
                            <span
                              className={`block text-sm ${
                                active
                                  ? "text-blue-200 dark:text-blue-200"
                                  : "text-gray-600 dark:text-gray-400"
                              }`}
                            >
                              {token.name}
                            </span>
                          </div>
                          {showBalances && accountAddress && (
                            <div className="flex items-center space-x-2">
                              <span
                                className={`text-sm ${active ? "text-blue-200 dark:text-blue-200" : "text-gray-600 dark:text-gray-400"}`}
                              >
                                {getTokenBalance(token) || "0"}
                              </span>
                              {token.address !== "ETH" && (
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    refreshSingleTokenBalance(token);
                                  }}
                                  disabled={refreshingBalances[token.address]}
                                  className={`p-1 rounded hover:bg-opacity-20 disabled:opacity-50 disabled:cursor-not-allowed ${
                                    active
                                      ? "text-blue-200 dark:text-blue-200 hover:bg-white dark:hover:bg-gray-700"
                                      : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                                  }`}
                                  title={`Refresh ${token.symbol} balance`}
                                >
                                  <ArrowPathIcon
                                    className={`w-4 h-4 ${
                                      refreshingBalances[token.address] ? "animate-spin" : ""
                                    }`}
                                  />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {selected ? (
                          <span
                            className={`absolute inset-y-0 right-0 flex items-center pr-4 ${
                              active ? "text-white" : "text-blue-600 dark:text-blue-400"
                            }`}
                          >
                            <CheckIcon className="w-5 h-5" />
                          </span>
                        ) : null}
                      </>
                    )}
                  </Listbox.Option>
                ))}

                {/* Empty State */}
                {filteredTokens.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    {searchQuery ? (
                      <>
                        <MagnifyingGlassIcon className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                        <div>No tokens found</div>
                        <div className="text-xs mt-1">Try adjusting your search</div>
                      </>
                    ) : (
                      <div>No tokens available</div>
                    )}
                  </div>
                )}

                {/* Add Custom Token Option */}
                <div className="border-t border-gray-200 dark:border-gray-600">
                  <button
                    onClick={() => setShowCustomTokenModal(true)}
                    className="relative flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <PlusIcon className="w-5 h-5 mr-3 text-gray-500 dark:text-gray-400" />
                    <span>Add Custom Token</span>
                  </button>
                </div>
              </Listbox.Options>
            </Transition>
          </div>
        </Listbox>
      </div>

      {/* Custom Token Modal */}
      <Transition appear show={showCustomTokenModal} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => !validatingToken && setShowCustomTokenModal(false)}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black dark:bg-black bg-opacity-25 dark:bg-opacity-50" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex items-center justify-center min-h-full p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md p-6 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-2xl">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100"
                  >
                    Add Custom Token
                  </Dialog.Title>

                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Token Contract Address
                    </label>
                    <input
                      type="text"
                      value={customTokenAddress}
                      onChange={e => setCustomTokenAddress(e.target.value)}
                      placeholder="0x..."
                      className="block w-full mt-1 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-md shadow-sm focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 sm:text-sm"
                    />
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                      Enter the contract address of an ERC20 token
                    </p>
                  </div>

                  <div className="flex justify-end mt-6 space-x-3">
                    <button
                      type="button"
                      onClick={() => setShowCustomTokenModal(false)}
                      disabled={validatingToken}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={addCustomToken}
                      disabled={validatingToken || !customTokenAddress}
                      className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 dark:bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 dark:hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {validatingToken ? (
                        <>
                          <div className="w-4 h-4 mr-2 border-b-2 border-white dark:border-white rounded-full animate-spin"></div>
                          Validating...
                        </>
                      ) : (
                        "Add Token"
                      )}
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}
