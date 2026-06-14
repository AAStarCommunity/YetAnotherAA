"use client";

/**
 * Operator "Manage" hub — entry point to the browser-signed management flows:
 *   - xPNTs management (registry flow 3)
 *   - AOA daily ops: PaymasterV4 (flow 6)
 *   - AOA+ daily ops: SuperPaymaster operator account (flow 7)
 *
 * All transactions are signed by the operator's own injected EOA via WalletContext.
 */
import Link from "next/link";
import { useTranslation } from "react-i18next";
import {
  Cog6ToothIcon,
  CurrencyDollarIcon,
  CreditCardIcon,
  ServerStackIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import Layout from "@/components/Layout";
import { useWallet } from "@/contexts/WalletContext";
import { ConnectGate, shortAddr, addrUrl } from "./_components/shared";

interface FlowCardProps {
  href: string;
  title: string;
  description: string;
  flow: string;
  icon: React.ReactNode;
}

function FlowCard({ href, title, description, flow, icon }: FlowCardProps) {
  return (
    <Link
      href={href}
      className="group block bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 hover:border-emerald-400 dark:hover:border-emerald-500 transition"
    >
      <div className="flex items-start justify-between">
        <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          {icon}
        </div>
        <span className="text-xs text-gray-400">{flow}</span>
      </div>
      <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-white flex items-center gap-1">
        {title}
        <ArrowRightIcon className="h-4 w-4 opacity-0 group-hover:opacity-100 transition" />
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
    </Link>
  );
}

export default function OperatorManagePage() {
  const { t } = useTranslation();
  const { address } = useWallet();

  return (
    <Layout requireAuth>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Cog6ToothIcon className="h-7 w-7 text-slate-700 dark:text-emerald-400" />
            {t("operatorManage.hub.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("operatorManage.hub.subtitle")}
          </p>
          {address && (
            <p className="mt-2 text-xs text-gray-400">
              {t("operatorManage.hub.operator")}{" "}
              <a
                href={addrUrl(address)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                {shortAddr(address)}
              </a>
            </p>
          )}
        </div>

        <ConnectGate>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FlowCard
              href="/operator/manage/xpnts"
              title={t("operatorManage.hub.xpntsTitle")}
              description={t("operatorManage.hub.xpntsDescription")}
              flow="Flow 3"
              icon={<CurrencyDollarIcon className="h-6 w-6" />}
            />
            <FlowCard
              href="/operator/manage/paymaster"
              title={t("operatorManage.hub.paymasterTitle")}
              description={t("operatorManage.hub.paymasterDescription")}
              flow="Flow 6"
              icon={<CreditCardIcon className="h-6 w-6" />}
            />
            <FlowCard
              href="/operator/manage/superpaymaster"
              title={t("operatorManage.hub.superTitle")}
              description={t("operatorManage.hub.superDescription")}
              flow="Flow 7"
              icon={<ServerStackIcon className="h-6 w-6" />}
            />
          </div>
        </ConnectGate>
      </div>
    </Layout>
  );
}
