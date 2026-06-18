"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  ServerStackIcon,
  CheckBadgeIcon,
  XCircleIcon,
  ArrowPathIcon,
  RocketLaunchIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import Layout from "@/components/Layout";
import { operatorAPI } from "@/lib/api";

interface SPOStatus {
  hasRole: boolean;
  isConfigured: boolean;
  balance: string;
  exchangeRate: string;
  treasury: string;
  stakeAmount: string;
}

interface V4Status {
  paymasterAddress: string | null;
  balance: string;
  hasRole: boolean;
}

interface Dashboard {
  address: string;
  isSPO: boolean;
  isV4Operator: boolean;
  gtokenBalance: string;
  spoStatus: SPOStatus | null;
  v4Status: V4Status;
  registryAddress: string;
  superPaymasterAddress: string;
  paymasterFactoryAddress: string;
  stakingAddress: string;
}

function shortenAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        active
          ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
          : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
      }`}
    >
      {active ? (
        <CheckBadgeIcon className="h-3.5 w-3.5" />
      ) : (
        <XCircleIcon className="h-3.5 w-3.5" />
      )}
      {label}
    </span>
  );
}

function MetricCard({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-white">
        {parseFloat(value || "0").toFixed(4)}
      </p>
      {unit && <p className="text-xs text-gray-400">{unit}</p>}
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function OperatorPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [spoList, setSpoList] = useState<string[]>([]);
  const [v4List, setV4List] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      operatorAPI.getDashboard().then(r => setDashboard(r.data)),
      operatorAPI.getSPOList().then(r => setSpoList(r.data)),
      operatorAPI.getV4List().then(r => setV4List(r.data)),
    ])
      .catch(err => {
        if (err.response?.status === 401) router.push("/auth/login");
        else setError(t("operatorDashboard.loadError"));
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

  return (
    <Layout requireAuth>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ServerStackIcon className="h-7 w-7 text-slate-700 dark:text-emerald-400" />
          {t("operatorDashboard.title")}
        </h1>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Quick Actions — entry points to the operator write flows */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => router.push("/operator/deploy")}
            className="text-left bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 hover:border-emerald-400 dark:hover:border-emerald-500 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <RocketLaunchIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span className="font-semibold text-gray-900 dark:text-white">
                {t("operatorHub.onboard.title")}
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("operatorHub.onboard.desc")}
            </p>
          </button>
          <button
            type="button"
            onClick={() => router.push("/operator/manage")}
            className="text-left bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 hover:border-emerald-400 dark:hover:border-emerald-500 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <WrenchScrewdriverIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span className="font-semibold text-gray-900 dark:text-white">
                {t("operatorHub.manage.title")}
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("operatorHub.manage.desc")}
            </p>
          </button>
        </section>

        {/* My Operator Status */}
        {dashboard && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("operatorDashboard.myStatusTitle")}
              </h2>
              <div className="flex gap-2">
                <StatusBadge active={dashboard.isSPO} label={t("operatorDashboard.spoBadge")} />
                <StatusBadge
                  active={dashboard.isV4Operator}
                  label={t("operatorDashboard.v4OperatorBadge")}
                />
              </div>
            </div>

            {/* GToken Balance */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <MetricCard
                label={t("operatorDashboard.gtokenBalance")}
                value={dashboard.gtokenBalance}
                unit="GTOKEN"
              />

              {dashboard.isSPO && dashboard.spoStatus && (
                <>
                  <MetricCard
                    label={t("operatorDashboard.spoStake")}
                    value={dashboard.spoStatus.stakeAmount}
                    unit="GTOKEN"
                  />
                  <MetricCard
                    label={t("operatorDashboard.spBalance")}
                    value={dashboard.spoStatus.balance}
                    unit="aPNTs"
                    sub={
                      dashboard.spoStatus.isConfigured
                        ? t("operatorDashboard.configured")
                        : t("operatorDashboard.notConfigured")
                    }
                  />
                  <MetricCard
                    label={t("operatorDashboard.exchangeRate")}
                    value={dashboard.spoStatus.exchangeRate}
                    unit="aPNTs/GWEI"
                  />
                </>
              )}

              {dashboard.v4Status.paymasterAddress && (
                <MetricCard
                  label={t("operatorDashboard.v4PaymasterEth")}
                  value={dashboard.v4Status.balance}
                  unit="ETH"
                  sub={shortenAddr(dashboard.v4Status.paymasterAddress)}
                />
              )}
            </div>

            {/* SPO Registration Guide */}
            {!dashboard.isSPO && (
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
                  {t("operatorDashboard.registerSpoTitle")}
                </p>
                <ol className="text-xs text-blue-600 dark:text-blue-400 space-y-1 list-decimal list-inside">
                  <li>{t("operatorDashboard.registerSpoStep1")}</li>
                  <li>
                    {t("operatorDashboard.registerSpoStep2Prefix")}{" "}
                    <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">
                      registerRoleSelf
                    </code>{" "}
                    {t("operatorDashboard.registerSpoStep2Suffix")}
                  </li>
                  <li>{t("operatorDashboard.registerSpoStep3")}</li>
                  <li>{t("operatorDashboard.registerSpoStep4")}</li>
                </ol>
              </div>
            )}

            {/* SPO configured but not V4 */}
            {!dashboard.v4Status.paymasterAddress && (
              <div className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
                  {t("operatorDashboard.deployV4Title")}
                </p>
                <ol className="text-xs text-amber-600 dark:text-amber-400 space-y-1 list-decimal list-inside">
                  <li>
                    {t("operatorDashboard.deployV4Step1Prefix")}{" "}
                    <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">
                      deployPaymaster
                    </code>{" "}
                    {t("operatorDashboard.deployV4Step1Suffix")}
                  </li>
                  <li>
                    {t("operatorDashboard.deployV4Step2Prefix")}{" "}
                    <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">
                      ROLE_PAYMASTER_SUPER
                    </code>{" "}
                    {t("operatorDashboard.deployV4Step2Suffix")}
                  </li>
                </ol>
              </div>
            )}

            {/* Contract Addresses */}
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500 mb-2">
                {t("operatorDashboard.contractAddresses")}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                {[
                  ["Registry", dashboard.registryAddress],
                  ["SuperPaymaster", dashboard.superPaymasterAddress],
                  ["PaymasterFactory", dashboard.paymasterFactoryAddress],
                  ["GTokenStaking", dashboard.stakingAddress],
                ].map(([label, addr]) => (
                  <div key={label} className="flex gap-2 text-gray-600 dark:text-gray-400">
                    <span className="text-gray-400 w-32 shrink-0">{label}:</span>
                    <span className="truncate">{addr}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Operator Lists */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              {t("operatorDashboard.spoOperatorsTitle")}
              <span className="ml-2 text-sm font-normal text-gray-400">({spoList.length})</span>
            </h2>
            {spoList.length === 0 ? (
              <p className="text-sm text-gray-400">{t("operatorDashboard.noneRegistered")}</p>
            ) : (
              <ul className="space-y-1">
                {spoList.map(addr => (
                  <li key={addr} className="text-xs font-mono text-gray-600 dark:text-gray-300">
                    {addr}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              {t("operatorDashboard.v4OperatorsTitle")}
              <span className="ml-2 text-sm font-normal text-gray-400">({v4List.length})</span>
            </h2>
            {v4List.length === 0 ? (
              <p className="text-sm text-gray-400">{t("operatorDashboard.noneRegistered")}</p>
            ) : (
              <ul className="space-y-1">
                {v4List.map(addr => (
                  <li key={addr} className="text-xs font-mono text-gray-600 dark:text-gray-300">
                    {addr}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}
