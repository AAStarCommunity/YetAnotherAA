"use client";

/**
 * Step 1 — connect the operator wallet and pick the onboarding mode.
 *
 *  - AOA  (flow 1): operator runs its own Paymaster V4 node.
 *  - AOA+ (flow 2): operator shares the protocol SuperPaymaster (lower stake,
 *    aPNTs collateral, no node to maintain).
 *
 * Sets `data.mode` and advances. No on-chain writes here.
 *
 * @module app/operator/deploy/steps/Step1ConnectSelect
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ServerStackIcon, BoltIcon, WalletIcon } from "@heroicons/react/24/outline";
import { useWallet } from "@/contexts/WalletContext";
import type { StakeMode, WizardData } from "./types";
import StepCard from "../components/StepCard";
import WizardButton from "../components/WizardButton";

interface Step1Props {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
  onNext: () => void;
}

interface ModeMeta {
  id: StakeMode;
  ns: string;
  icon: typeof ServerStackIcon;
}

const MODES: ModeMeta[] = [
  { id: "aoa", ns: "operatorDeploy.step1.aoa", icon: ServerStackIcon },
  { id: "aoa+", ns: "operatorDeploy.step1.aoaPlus", icon: BoltIcon },
];

export default function Step1ConnectSelect({ data, update, onNext }: Step1Props) {
  const { t } = useTranslation();
  const { address, isConnecting, hasInjectedWallet, connect } = useWallet();
  const [selected, setSelected] = useState<StakeMode | null>(data.mode);

  const handleContinue = () => {
    if (!selected) return;
    update({ mode: selected, treasury: data.treasury || (address ?? "") });
    onNext();
  };

  return (
    <StepCard
      title={t("operatorDeploy.step1.title")}
      description={t("operatorDeploy.step1.description")}
      icon={<WalletIcon className="h-6 w-6" />}
      footer={
        <>
          <span className="text-xs text-gray-400">
            {address ? (
              <span className="font-mono">
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            ) : (
              t("operatorDeploy.step1.walletNotConnected")
            )}
          </span>
          {address ? (
            <WizardButton onClick={handleContinue} disabled={!selected}>
              {t("operatorDeploy.common.continue")}
            </WizardButton>
          ) : (
            <WizardButton onClick={connect} loading={isConnecting} disabled={!hasInjectedWallet}>
              {hasInjectedWallet
                ? t("operatorDeploy.step1.connectWallet")
                : t("operatorDeploy.step1.noWalletFound")}
            </WizardButton>
          )}
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MODES.map(m => {
          const active = selected === m.id;
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelected(m.id)}
              className={`text-left rounded-xl border p-4 transition ${
                active
                  ? "border-slate-700 dark:border-emerald-500 ring-2 ring-slate-200 dark:ring-emerald-500/30 bg-slate-50 dark:bg-emerald-900/10"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-5 w-5 text-slate-700 dark:text-emerald-400" />
                <span className="font-semibold text-gray-900 dark:text-white">
                  {t(`${m.ns}.title`)}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                {t(`${m.ns}.subtitle`)}
              </p>
              <ul className="space-y-1">
                {[1, 2, 3, 4].map(n => (
                  <li key={n} className="text-xs text-gray-600 dark:text-gray-300 flex gap-1.5">
                    <span className="text-slate-400 dark:text-emerald-500">•</span>
                    {t(`${m.ns}.bullet${n}`)}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
    </StepCard>
  );
}
