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
  title: string;
  subtitle: string;
  bullets: string[];
  icon: typeof ServerStackIcon;
}

const MODES: ModeMeta[] = [
  {
    id: "aoa",
    title: "AOA — Self-hosted Paymaster",
    subtitle: "Run your own Paymaster V4 node",
    bullets: [
      "Deploy & register a dedicated Paymaster V4",
      "Stake 30 GT (+30 GT to register community)",
      "Fund the paymaster on EntryPoint with ETH",
      "Full control, you maintain the node",
    ],
    icon: ServerStackIcon,
  },
  {
    id: "aoa+",
    title: "AOA+ — Shared SuperPaymaster",
    subtitle: "Use the protocol SuperPaymaster",
    bullets: [
      "No node to deploy or maintain",
      "Stake 50 GT (+30 GT to register community)",
      "Deposit aPNTs collateral (≥ 1000)",
      "Lower entry barrier, protocol-managed",
    ],
    icon: BoltIcon,
  },
];

export default function Step1ConnectSelect({ data, update, onNext }: Step1Props) {
  const { address, isConnecting, hasInjectedWallet, connect } = useWallet();
  const [selected, setSelected] = useState<StakeMode | null>(data.mode);

  const handleContinue = () => {
    if (!selected) return;
    update({ mode: selected, treasury: data.treasury || (address ?? "") });
    onNext();
  };

  return (
    <StepCard
      title="Connect wallet & choose mode"
      description="Operator transactions are signed in your own browser wallet on Sepolia."
      icon={<WalletIcon className="h-6 w-6" />}
      footer={
        <>
          <span className="text-xs text-gray-400">
            {address ? (
              <span className="font-mono">
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            ) : (
              "Wallet not connected"
            )}
          </span>
          {address ? (
            <WizardButton onClick={handleContinue} disabled={!selected}>
              Continue
            </WizardButton>
          ) : (
            <WizardButton onClick={connect} loading={isConnecting} disabled={!hasInjectedWallet}>
              {hasInjectedWallet ? "Connect Wallet" : "No wallet found"}
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
                <span className="font-semibold text-gray-900 dark:text-white">{m.title}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{m.subtitle}</p>
              <ul className="space-y-1">
                {m.bullets.map(b => (
                  <li key={b} className="text-xs text-gray-600 dark:text-gray-300 flex gap-1.5">
                    <span className="text-slate-400 dark:text-emerald-500">•</span>
                    {b}
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
