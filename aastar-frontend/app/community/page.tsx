"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  BuildingOfficeIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  CheckBadgeIcon,
  XCircleIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import Layout from "@/components/Layout";
import { communityAPI } from "@/lib/api";

interface CommunityMeta {
  name: string;
  ensName: string;
  website: string;
  description: string;
  logoURI: string;
  stakeAmount: string;
}

interface TokenInfo {
  name: string;
  symbol: string;
  totalSupply: string;
  communityName: string;
  communityOwner: string;
}

interface CommunityEntry {
  address: string;
  metadata: CommunityMeta | null;
  tokenAddress: string | null;
  tokenInfo: TokenInfo | null;
}

interface Dashboard {
  address: string;
  isAdmin: boolean;
  metadata: CommunityMeta | null;
  gtokenBalance: string;
  tokenAddress: string | null;
  tokenInfo: TokenInfo | null;
  xpntsBalance: string | null;
}

function shortenAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function resolveImageUrl(url: string): string {
  if (url.startsWith("ipfs://")) {
    return url.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/");
  }
  return url;
}

function CommunityCard({ entry }: { entry: CommunityEntry }) {
  const { t } = useTranslation();
  // Name source priority: on-chain Registry metadata → token's communityName → address.
  const name =
    entry.metadata?.name || entry.tokenInfo?.communityName || shortenAddr(entry.address);
  const ens = entry.metadata?.ensName;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-start gap-3">
        {entry.metadata?.logoURI ? (
          <img
            src={resolveImageUrl(entry.metadata.logoURI)}
            alt={name}
            className="w-10 h-10 rounded-full"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
            <span className="text-indigo-600 dark:text-indigo-300 font-bold text-sm">
              {name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white truncate">{name}</p>
          {ens && <p className="text-xs text-indigo-500 truncate">{ens}</p>}
          <p className="text-xs text-gray-500 font-mono truncate">
            owner {shortenAddr(entry.address)}
          </p>
          {entry.metadata?.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{entry.metadata.description}</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        {entry.tokenInfo ? (
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <CheckBadgeIcon className="h-4 w-4" />
            {entry.tokenInfo.name} ({entry.tokenInfo.symbol})
          </span>
        ) : entry.tokenAddress ? (
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <CheckBadgeIcon className="h-4 w-4" />
            {t("communityPage.card.tokenDeployed")}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-gray-400">
            <XCircleIcon className="h-4 w-4" />
            {t("communityPage.card.noToken")}
          </span>
        )}
        {entry.metadata?.stakeAmount && (
          <span>
            {t("communityPage.card.staked", {
              amount: parseFloat(entry.metadata.stakeAmount).toFixed(0),
            })}
          </span>
        )}
      </div>
    </div>
  );
}

export default function CommunityPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [communities, setCommunities] = useState<CommunityEntry[]>([]);
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<{
    address: string;
    metadata: CommunityMeta | null;
    tokenAddress: string | null;
    tokenInfo: TokenInfo | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      communityAPI.getDashboard().then(r => setDashboard(r.data)),
      communityAPI.getList().then(r => setCommunities(r.data)),
    ])
      .catch(err => {
        if (err.response?.status === 401) {
          router.push("/auth/login");
        } else {
          setError(t("communityPage.loadError"));
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  const handleSearch = async () => {
    const addr = search.trim();
    if (!addr || addr.length < 10) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const r = await communityAPI.getInfo(addr);
      setSearchResult(r.data);
    } catch {
      setError(t("communityPage.searchError"));
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return (
      <Layout requireAuth>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600 dark:border-emerald-400" />
        </div>
      </Layout>
    );
  }

  const myName =
    dashboard?.metadata?.name || (dashboard?.address ? shortenAddr(dashboard.address) : "—");

  return (
    <Layout requireAuth>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <UserGroupIcon className="h-7 w-7 text-slate-700 dark:text-emerald-400" />
          {t("communityPage.title")}
        </h1>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* My Community Dashboard */}
        {dashboard && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("communityPage.myStatusTitle")}
              </h2>
              {dashboard.isAdmin ? (
                <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-semibold">
                  {t("communityPage.communityAdminBadge")}
                </span>
              ) : (
                <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full text-xs">
                  {t("communityPage.notCommunityAdminBadge")}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">{t("communityPage.gtokenBalance")}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {parseFloat(dashboard.gtokenBalance || "0").toFixed(2)}
                </p>
                <p className="text-xs text-gray-400">GTOKEN</p>
              </div>

              {dashboard.isAdmin && dashboard.metadata && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">{t("communityPage.communityName")}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white truncate">
                    {myName}
                  </p>
                  <p className="text-xs text-gray-400">
                    {t("communityPage.staked", {
                      amount: parseFloat(dashboard.metadata.stakeAmount).toFixed(0),
                    })}
                  </p>
                </div>
              )}

              {dashboard.isAdmin && dashboard.tokenAddress && dashboard.tokenInfo && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">{t("communityPage.xpntsToken")}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {dashboard.tokenInfo.symbol}
                  </p>
                  <p className="text-xs text-gray-400">
                    {t("communityPage.supply", {
                      amount: parseFloat(dashboard.tokenInfo.totalSupply).toLocaleString(),
                    })}
                  </p>
                </div>
              )}
            </div>

            {dashboard.isAdmin && !dashboard.tokenAddress && (
              <div className="mt-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  {t("communityPage.noTokenTitle")}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  {t("communityPage.noTokenDesc")}
                </p>
              </div>
            )}

            {!dashboard.isAdmin && (
              <div className="mt-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  {t("communityPage.registerTitle")}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  {t("communityPage.registerDescPrefix")}{" "}
                  <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">ROLE_COMMUNITY</code>{" "}
                  {t("communityPage.registerDescSuffix")}
                </p>
              </div>
            )}
          </section>
        )}

        {/* Address Lookup */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            {t("communityPage.lookupTitle")}
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="0x..."
              className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm rounded-lg disabled:opacity-50"
            >
              {searching ? t("communityPage.searching") : t("communityPage.search")}
            </button>
          </div>

          {searchResult && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <p className="font-semibold text-gray-900 dark:text-white text-sm">
                  {searchResult.metadata?.name || shortenAddr(searchResult.address)}
                </p>
                {searchResult.metadata ? (
                  <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded text-xs">
                    {t("communityPage.communityAdminBadge")}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded text-xs">
                    {t("communityPage.notRegistered")}
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-gray-500">{searchResult.address}</p>
              {searchResult.metadata?.description && (
                <p className="text-xs text-gray-500 mt-1">{searchResult.metadata.description}</p>
              )}
              {searchResult.tokenAddress && searchResult.tokenInfo && (
                <div className="mt-2 flex items-center gap-2">
                  <CurrencyDollarIcon className="h-4 w-4 text-green-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-300">
                    {t("communityPage.supplyInline", {
                      symbol: searchResult.tokenInfo.symbol,
                      amount: parseFloat(searchResult.tokenInfo.totalSupply).toLocaleString(),
                    })}
                  </span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Community List */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <BuildingOfficeIcon className="h-5 w-5 text-gray-400" />
            {t("communityPage.allAdminsTitle")}
            <span className="ml-1 text-sm text-gray-400 font-normal">({communities.length})</span>
          </h2>
          {communities.length === 0 ? (
            <p className="text-sm text-gray-500">{t("communityPage.noCommunities")}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {communities.map(c => (
                <CommunityCard key={c.address} entry={c} />
              ))}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
