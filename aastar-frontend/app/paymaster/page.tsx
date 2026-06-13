"use client";

import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { paymasterAPI } from "@/lib/api";
import SwipeableListItem from "@/components/SwipeableListItem";
import toast from "react-hot-toast";
import { PlusIcon, CheckCircleIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";
interface Paymaster {
  name: string;
  address: string;
  configured: boolean;
}

export default function PaymasterPage() {
  const [paymasters, setPaymasters] = useState<Paymaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPaymaster, setNewPaymaster] = useState({
    name: "",
    address: "",
    type: "custom" as "pimlico" | "stackup" | "alchemy" | "custom",
    apiKey: "",
    endpoint: "",
  });

  useEffect(() => {
    loadPaymasters();
  }, []);

  const loadPaymasters = async () => {
    setLoading(true);
    try {
      const response = await paymasterAPI.getAvailable();
      setPaymasters(response.data);
    } catch (error) {
      console.error("Failed to load paymasters:", error);
      toast.error("Failed to load paymasters");
    } finally {
      setLoading(false);
    }
  };

  const handleAddPaymaster = async () => {
    if (!newPaymaster.name || !newPaymaster.address) {
      toast.error("Name and address are required");
      return;
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(newPaymaster.address)) {
      toast.error("Invalid address format");
      return;
    }

    setActionLoading("add");
    try {
      await paymasterAPI.addCustom({
        name: newPaymaster.name,
        address: newPaymaster.address,
        type: newPaymaster.type,
        apiKey: newPaymaster.apiKey || undefined,
        endpoint: newPaymaster.endpoint || undefined,
      });

      toast.success("Paymaster added successfully!");
      setNewPaymaster({
        name: "",
        address: "",
        type: "custom",
        apiKey: "",
        endpoint: "",
      });
      setShowAddForm(false);
      await loadPaymasters();
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
        "Failed to add paymaster";
      toast.error(message);
    } finally {
      setActionLoading("");
    }
  };

  const handleRemovePaymaster = async (name: string) => {
    if (!confirm(`Are you sure you want to remove paymaster "${name}"?`)) {
      return;
    }

    setActionLoading(`remove-${name}`);
    try {
      await paymasterAPI.remove(name);
      toast.success("Paymaster removed successfully!");
      await loadPaymasters();
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
        "Failed to remove paymaster";
      toast.error(message);
    } finally {
      setActionLoading("");
    }
  };

  if (loading) {
    return (
      <Layout requireAuth={true}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-32 h-32 border-b-2 border-slate-900 dark:border-emerald-500 rounded-full animate-spin"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout requireAuth={true}>
      <div className="max-w-4xl px-3 py-4 sm:px-4 sm:py-6 mx-auto lg:px-8">
        {/* Header - Desktop only */}
        <div className="hidden md:block mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Paymaster Management
              </h1>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Manage your saved paymaster contracts for gas sponsorship
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center px-4 py-3 sm:py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 border border-transparent rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-500 touch-manipulation active:scale-95"
            >
              <PlusIcon className="w-4 h-4 mr-2" />
              Add Paymaster
            </button>
          </div>
        </div>

        {/* Mobile Add Button - Fixed position */}
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="md:hidden fixed bottom-24 right-6 z-50 inline-flex items-center justify-center w-14 h-14 text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 border border-transparent rounded-full shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-500 touch-manipulation active:scale-95"
            aria-label="Add Paymaster"
          >
            <PlusIcon className="w-6 h-6" />
          </button>
        )}

        {/* Add Paymaster Form */}
        {showAddForm && (
          <div className="md:p-6 md:sm:p-8 md:mb-6 bg-white md:border md:border-gray-200 md:rounded-2xl md:shadow-xl dark:bg-gray-800 md:dark:border-gray-700 fixed md:relative inset-0 md:inset-auto z-40 md:z-auto overflow-y-auto md:overflow-visible">
            {/* Mobile Header */}
            <div className="md:hidden sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center z-10">
              <button
                onClick={() => setShowAddForm(false)}
                className="mr-3 p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                Add New Paymaster
              </h2>
            </div>

            {/* Desktop Header */}
            <h2 className="hidden md:block mb-4 text-lg sm:text-xl font-medium text-gray-900 dark:text-white">
              Add New Paymaster
            </h2>

            <div className="p-4 md:p-0">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    value={newPaymaster.name}
                    onChange={e => setNewPaymaster(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="My Paymaster"
                    autoComplete="off"
                    className="block w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 text-sm placeholder-gray-400 dark:placeholder-gray-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Contract Address
                  </label>
                  <input
                    type="text"
                    value={newPaymaster.address}
                    onChange={e => setNewPaymaster(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="0x..."
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck="false"
                    className="block w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 text-sm placeholder-gray-400 dark:placeholder-gray-500 transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Type
                  </label>
                  <select
                    value={newPaymaster.type}
                    onChange={e =>
                      setNewPaymaster(prev => ({
                        ...prev,
                        type: e.target.value as "pimlico" | "stackup" | "alchemy" | "custom",
                      }))
                    }
                    className="block w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 text-sm transition-all"
                  >
                    <option value="custom">Custom</option>
                    <option value="pimlico">Pimlico</option>
                    <option value="stackup">StackUp</option>
                    <option value="alchemy">Alchemy</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    API Key (Optional)
                  </label>
                  <input
                    type="text"
                    value={newPaymaster.apiKey}
                    onChange={e => setNewPaymaster(prev => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="For API-based paymasters"
                    autoComplete="off"
                    className="block w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 text-sm placeholder-gray-400 dark:placeholder-gray-500 transition-all"
                  />
                </div>
                {newPaymaster.type !== "custom" && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Endpoint (Optional)
                    </label>
                    <input
                      type="text"
                      value={newPaymaster.endpoint}
                      onChange={e =>
                        setNewPaymaster(prev => ({ ...prev, endpoint: e.target.value }))
                      }
                      placeholder="API endpoint URL"
                      autoComplete="off"
                      className="block w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 text-sm placeholder-gray-400 dark:placeholder-gray-500 transition-all"
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-col sm:flex-row justify-end mt-4 gap-3">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="hidden md:inline-flex items-center px-4 py-3 sm:py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl shadow-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-400 transition-all touch-manipulation active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddPaymaster}
                  disabled={actionLoading === "add"}
                  className="inline-flex items-center justify-center w-full md:w-auto px-4 py-3 sm:py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 border border-transparent rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-500 disabled:opacity-50 touch-manipulation active:scale-95"
                >
                  {actionLoading === "add" ? (
                    <div className="w-4 h-4 mr-2 border-b-2 border-white rounded-full animate-spin"></div>
                  ) : (
                    <PlusIcon className="w-4 h-4 mr-2" />
                  )}
                  Add Paymaster
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Paymasters List */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800">
          <div className="p-6 sm:p-8">
            <h2 className="mb-4 text-lg sm:text-xl font-medium text-gray-900 dark:text-white">
              Saved Paymasters ({paymasters.length})
            </h2>

            {paymasters.length === 0 ? (
              <div className="py-12 text-center">
                <ExclamationCircleIcon className="w-12 h-12 mx-auto text-gray-400" />
                <h3 className="mt-2 text-lg sm:text-xl font-medium text-gray-900 dark:text-white">
                  No paymasters saved
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Add your first paymaster to start using gas sponsorship
                </p>
                <div className="mt-6">
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="inline-flex items-center px-4 py-3 sm:py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 border border-transparent rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-500 touch-manipulation active:scale-95"
                  >
                    <PlusIcon className="w-4 h-4 mr-2" />
                    Add Paymaster
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {paymasters.map(paymaster => (
                  <SwipeableListItem
                    key={paymaster.address}
                    onDelete={() => handleRemovePaymaster(paymaster.name)}
                    onDeleteStart={() => setActionLoading(`remove-${paymaster.name}`)}
                    onDeleteEnd={() => setActionLoading("")}
                    deleteText="Remove"
                    className="rounded-xl"
                  >
                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl dark:border-gray-700 bg-white dark:bg-gray-800">
                      <div className="flex-1">
                        <div className="flex items-center">
                          {paymaster.configured ? (
                            <CheckCircleIcon className="w-5 h-5 mr-2 text-green-500" />
                          ) : (
                            <ExclamationCircleIcon className="w-5 h-5 mr-2 text-yellow-500" />
                          )}
                          <div>
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                              {paymaster.name}
                            </h3>
                            <p className="text-xs text-gray-600 dark:text-gray-400 font-mono break-all">
                              {paymaster.address}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          {paymaster.configured ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                              API Configured
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                              Address Only
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </SwipeableListItem>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="p-4 mt-6 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <div className="flex">
            <ExclamationCircleIcon className="w-5 h-5 text-slate-900 dark:text-emerald-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">
                About Paymasters
              </h3>
              <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                <ul className="space-y-1 list-disc list-inside">
                  <li>Paymasters sponsor gas fees for your transactions</li>
                  <li>Address-only paymasters work without API keys</li>
                  <li>API-configured paymasters provide better sponsorship reliability</li>
                  <li>You can use multiple paymasters and choose per transaction</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
