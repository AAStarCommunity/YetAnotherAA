"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import { getAddressBook, setAddressName, removeAddress } from "@/lib/address-book-store";
import { useDashboard } from "@/contexts/DashboardContext";
import SwipeableListItem from "@/components/SwipeableListItem";
import toast from "react-hot-toast";
import { PencilIcon, PlusIcon, BookOpenIcon } from "@heroicons/react/24/outline";

interface AddressBookEntry {
  address: string;
  name?: string;
  usageCount: number;
  firstUsed: string;
  lastUsed: string;
  transactionHashes: string[];
}

export default function AddressBookPage() {
  const router = useRouter();
  const { data } = useDashboard();
  const accountAddress = data?.account?.address ?? null;
  const [addressBook, setAddressBook] = useState<AddressBookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [newName, setNewName] = useState("");

  // Re-load when the (async) account resolves so the list is scoped to this account.
  useEffect(() => {
    loadAddressBook();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountAddress]);

  const loadAddressBook = () => {
    setLoading(true);
    try {
      setAddressBook(getAddressBook(accountAddress));
    } catch (error) {
      console.error("Failed to load address book:", error);
      toast.error("Failed to load address book");
    } finally {
      setLoading(false);
    }
  };

  const handleAddAddress = async () => {
    if (!newAddress) {
      toast.error("Please enter an address");
      return;
    }

    // Validate address format
    if (!newAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      toast.error("Invalid address format");
      return;
    }

    try {
      setAddressName(accountAddress, newAddress, newName || "");
      loadAddressBook();
      setShowAddForm(false);
      setNewAddress("");
      setNewName("");
      toast.success("Address added successfully! 📖");
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
        "Failed to add address";
      toast.error(message);
    }
  };

  const handleUpdateName = async (address: string) => {
    try {
      setAddressName(accountAddress, address, editingName);
      loadAddressBook();
      setEditingAddress(null);
      setEditingName("");
      toast.success("Name updated successfully!");
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
        "Failed to update name";
      toast.error(message);
    }
  };

  const handleDeleteAddress = async (address: string) => {
    if (!confirm("Are you sure you want to delete this address?")) {
      return;
    }

    try {
      removeAddress(accountAddress, address);
      loadAddressBook();
      toast.success("Address deleted successfully!");
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
        "Failed to delete address";
      toast.error(message);
    }
  };

  const startEdit = (entry: AddressBookEntry) => {
    setEditingAddress(entry.address);
    setEditingName(entry.name || "");
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
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 pb-24 px-4 sm:px-6 lg:px-8">
        {/* Mobile Header with Back Button */}
        <div className="md:hidden sticky top-0 bg-slate-100 dark:bg-slate-950 z-30 -mx-4 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="p-2 -ml-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white touch-manipulation active:scale-95"
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
            <div className="flex items-center gap-2 flex-1">
              <BookOpenIcon className="w-6 h-6 text-slate-900 dark:text-emerald-400 flex-shrink-0" />
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Address Book</h1>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto pt-4 md:pt-8">
          {/* Header - Desktop only */}
          <div className="hidden md:block mb-8">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center min-w-0 flex-1">
                <BookOpenIcon className="w-10 h-10 text-slate-900 dark:text-emerald-400 mr-3 flex-shrink-0" />
                <div className="min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                    Address Book
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm sm:text-base">
                    Manage your saved addresses
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="inline-flex items-center px-4 py-3 sm:py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 border border-transparent rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-500 touch-manipulation active:scale-95"
              >
                <PlusIcon className="w-4 h-4 mr-2" />
                Add Address
              </button>
            </div>
          </div>

          {/* Mobile Add Button - Fixed position */}
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="md:hidden fixed bottom-24 right-6 z-50 inline-flex items-center justify-center w-14 h-14 text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 border border-transparent rounded-full shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-500 touch-manipulation active:scale-95"
              aria-label="Add Address"
            >
              <PlusIcon className="w-6 h-6" />
            </button>
          )}

          {/* Add Address Form */}
          {showAddForm && (
            <div className="md:p-6 md:mb-6 bg-white md:border-2 md:border-slate-200 md:rounded-2xl md:shadow-lg dark:bg-gray-800 md:dark:border-slate-700 fixed md:relative inset-0 md:inset-auto z-40 md:z-auto overflow-y-auto md:overflow-visible">
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
                  Add New Address
                </h2>
              </div>

              {/* Desktop Header */}
              <h3 className="hidden md:block text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Add New Address
              </h3>

              <div className="p-4 md:p-0 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Address
                  </label>
                  <input
                    type="text"
                    value={newAddress}
                    onChange={e => setNewAddress(e.target.value)}
                    placeholder="0x..."
                    className="block w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl shadow-sm focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-400 focus:border-slate-900 dark:focus:border-emerald-400 text-sm placeholder-gray-400 dark:placeholder-gray-500 transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="e.g., Alice's Wallet"
                    className="block w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl shadow-sm focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-400 focus:border-slate-900 dark:focus:border-emerald-400 text-sm placeholder-gray-400 dark:placeholder-gray-500 transition-all"
                  />
                </div>
                <div className="flex gap-3 md:mt-4">
                  <button
                    onClick={handleAddAddress}
                    className="flex-1 px-4 py-3 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 transition-all touch-manipulation active:scale-95 shadow-lg hover:shadow-xl"
                  >
                    Add Address
                  </button>
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                      setNewAddress("");
                      setNewName("");
                    }}
                    className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-all touch-manipulation active:scale-95"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Address List */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800">
            <div className="p-6">
              <h2 className="mb-4 text-lg sm:text-xl font-medium text-gray-900 dark:text-white">
                Saved Addresses ({addressBook.length})
              </h2>

              {addressBook.length === 0 ? (
                <div className="text-center py-8">
                  <BookOpenIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2">
                    No saved addresses
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    Add addresses to quickly access them during transfers
                  </p>
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="inline-flex items-center px-6 py-3 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 transition-all touch-manipulation active:scale-95 shadow-lg hover:shadow-xl"
                  >
                    <PlusIcon className="w-5 h-5 mr-2" />
                    Add Your First Address
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {addressBook.map(entry => (
                    <SwipeableListItem
                      key={entry.address}
                      onDelete={() => handleDeleteAddress(entry.address)}
                      deleteText="Delete"
                      className="rounded-2xl"
                      enabled={editingAddress !== entry.address}
                    >
                      <div className="p-6 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl shadow-lg hover:shadow-xl transition-all">
                        {editingAddress === entry.address ? (
                          // Edit mode
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Name
                              </label>
                              <input
                                type="text"
                                value={editingName}
                                onChange={e => setEditingName(e.target.value)}
                                placeholder="Enter name"
                                className="block w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl shadow-sm focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-400 focus:border-slate-900 dark:focus:border-emerald-400 text-sm placeholder-gray-400 dark:placeholder-gray-500 transition-all"
                              />
                            </div>
                            <div className="flex gap-3">
                              <button
                                onClick={() => handleUpdateName(entry.address)}
                                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 transition-all touch-manipulation active:scale-95"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setEditingAddress(null);
                                  setEditingName("");
                                }}
                                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-all touch-manipulation active:scale-95"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          // View mode
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              {entry.name && (
                                <div className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                                  {entry.name}
                                </div>
                              )}
                              <div className="text-sm font-mono text-gray-600 dark:text-gray-400 break-all">
                                {entry.address}
                              </div>
                              <div className="mt-2 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                                {entry.usageCount > 0 ? (
                                  <>
                                    <span>Used {entry.usageCount} times</span>
                                    {entry.firstUsed && (
                                      <span>
                                        First used{" "}
                                        {new Date(entry.firstUsed).toLocaleDateString("en-US", {
                                          month: "short",
                                          day: "numeric",
                                          year: "numeric",
                                        })}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  entry.firstUsed && (
                                    <span>
                                      Added{" "}
                                      {new Date(entry.firstUsed).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                      })}
                                    </span>
                                  )
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2 ml-4">
                              <button
                                onClick={() => startEdit(entry)}
                                className="p-2 text-slate-900 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800/30 rounded-lg transition-all md:block"
                                title="Edit name"
                              >
                                <PencilIcon className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </SwipeableListItem>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
