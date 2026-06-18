"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  ShieldCheckIcon,
  ArrowPathIcon,
  CircleStackIcon,
  CurrencyDollarIcon,
} from "@heroicons/react/24/outline";
import Layout from "@/components/Layout";
import { adminAPI } from "@/lib/api";

interface RoleConfig {
  minStake: string;
  entryBurn: string;
  exitFeePercent: string;
  isActive: boolean;
  description: string;
  owner: string;
}

interface RoleEntry {
  name: string;
  roleId: string;
  config: RoleConfig;
  memberCount: string;
}

interface RegistryStats {
  registryAddress: string;
  owner: string;
  version: string;
  roleCounts: {
    communityAdmin: string;
    spo: string;
    v4Operator: string;
    endUser: string;
  };
}

interface GTokenStats {
  address: string;
  name: string;
  symbol: string;
  totalSupply: string;
  stakingContractBalance: string;
}

interface SystemAddresses {
  registry: string;
  gtoken: string;
  staking: string;
  superPaymaster: string;
  paymasterFactory: string;
  xpntsFactory: string;
  sbt: string;
}

interface Dashboard {
  isAdmin: boolean;
  userAddress: string | null;
  registryStats: RegistryStats;
  roleConfigs: RoleEntry[];
  gtokenStats: GTokenStats;
  systemAddresses: SystemAddresses;
  chainId: number;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    adminAPI
      .getDashboard()
      .then(r => setDashboard(r.data))
      .catch(err => {
        if (err.response?.status === 401) router.push("/auth/login");
        else setError(t("adminPage.loadError"));
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <Layout requireAuth>
        <div className="flex items-center justify-center min-h-[60vh]">
          <ArrowPathIcon className="h-8 w-8 animate-spin text-slate-600 dark:text-emerald-400" />
        </div>
      </Layout>
    );
  }

  if (!dashboard) return null;

  const { registryStats, roleConfigs, gtokenStats, systemAddresses } = dashboard;

  return (
    <Layout requireAuth>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheckIcon className="h-7 w-7 text-slate-700 dark:text-emerald-400" />
            {t("adminPage.title")}
          </h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {t("adminPage.chain", { chainId: dashboard.chainId })}
            </span>
            {dashboard.isAdmin ? (
              <span className="px-2 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-full text-xs font-semibold">
                {t("adminPage.protocolAdminBadge")}
              </span>
            ) : (
              <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded-full text-xs">
                {t("adminPage.readOnlyBadge")}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Registry Overview */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
            <CircleStackIcon className="h-5 w-5 text-gray-400" />
            {t("adminPage.registryOverview")}
          </h2>
          <p className="text-xs text-gray-400 font-mono mb-4">{registryStats.registryAddress}</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label={t("adminPage.communityAdmins")}
              value={registryStats.roleCounts.communityAdmin}
            />
            <StatCard label={t("adminPage.spoOperators")} value={registryStats.roleCounts.spo} />
            <StatCard
              label={t("adminPage.v4Operators")}
              value={registryStats.roleCounts.v4Operator}
            />
            <StatCard label={t("adminPage.endUsers")} value={registryStats.roleCounts.endUser} />
          </div>

          <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
            <span className="font-mono">
              {t("adminPage.owner", { address: `${registryStats.owner?.slice(0, 10)}…` })}
            </span>
            <span>{t("adminPage.version", { version: registryStats.version })}</span>
          </div>
        </section>

        {/* Role Configurations */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t("adminPage.roleConfigsTitle")}
          </h2>
          <div className="space-y-4">
            {roleConfigs.map(role => (
              <div
                key={role.roleId}
                className="rounded-xl border border-gray-100 dark:border-gray-700 p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-gray-900 dark:text-white text-sm">
                    {t(`roleNames.${role.name}`, { defaultValue: role.name })}
                  </p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        role.config.isActive
                          ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-500"
                      }`}
                    >
                      {role.config.isActive ? t("adminPage.active") : t("adminPage.inactive")}
                    </span>
                    <span className="text-xs text-gray-400">
                      {t("adminPage.members", { count: role.memberCount })}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-gray-400">{t("adminPage.minStake")}</p>
                    <p className="font-semibold text-gray-700 dark:text-gray-300">
                      {parseFloat(role.config.minStake).toFixed(0)} GTOKEN
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">{t("adminPage.entryBurn")}</p>
                    <p className="font-semibold text-gray-700 dark:text-gray-300">
                      {parseFloat(role.config.entryBurn).toFixed(0)} GTOKEN
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">{t("adminPage.exitFee")}</p>
                    <p className="font-semibold text-gray-700 dark:text-gray-300">
                      {role.config.exitFeePercent}%
                    </p>
                  </div>
                </div>
                <p className="text-xs font-mono text-gray-400 mt-2 truncate">
                  {t("adminPage.roleIdLabel", { roleId: role.roleId })}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* GToken Stats */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <CurrencyDollarIcon className="h-5 w-5 text-gray-400" />
            {t("adminPage.gtokenTitle", { symbol: gtokenStats.symbol })}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <StatCard
              label={t("adminPage.totalSupply")}
              value={parseFloat(gtokenStats.totalSupply).toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
              sub={gtokenStats.symbol}
            />
            <StatCard
              label={t("adminPage.stakingContractBalance")}
              value={parseFloat(gtokenStats.stakingContractBalance).toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
              sub={t("adminPage.lockedInStaking")}
            />
          </div>
          <p className="text-xs font-mono text-gray-400 mt-3">{gtokenStats.address}</p>
        </section>

        {/* System Contract Addresses */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t("adminPage.systemAddressesTitle")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(systemAddresses).map(([key, addr]) => (
              <div key={key} className="flex gap-2 text-xs">
                <span className="text-gray-400 w-32 shrink-0 capitalize">
                  {key.replace(/([A-Z])/g, " $1").trim()}:
                </span>
                <span className="font-mono text-gray-600 dark:text-gray-300 break-all">{addr}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}
