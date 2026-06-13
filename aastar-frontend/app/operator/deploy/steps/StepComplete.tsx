"use client";

/**
 * Final step — onboarding summary with links to the deployed artifacts.
 *
 * @module app/operator/deploy/steps/StepComplete
 */
import { CheckBadgeIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import type { WizardData } from "./types";
import StepCard, { explorerAddr } from "../components/StepCard";
import WizardButton from "../components/WizardButton";

interface StepCompleteProps {
  data: WizardData;
  onDone: () => void;
  onRestart: () => void;
}

function AddrRow({ label, addr }: { label: string; addr?: string }) {
  if (!addr) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-sm py-1">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <a
        href={explorerAddr(addr)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-mono text-xs text-slate-700 dark:text-emerald-400 hover:underline"
      >
        {addr.slice(0, 8)}…{addr.slice(-6)}
        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

export default function StepComplete({ data, onDone, onRestart }: StepCompleteProps) {
  return (
    <StepCard
      title="Onboarding complete"
      description={`Your ${data.mode?.toUpperCase()} operator setup is live on Sepolia.`}
      icon={<CheckBadgeIcon className="h-6 w-6" />}
      footer={
        <>
          <WizardButton variant="secondary" onClick={onRestart}>
            Start over
          </WizardButton>
          <WizardButton onClick={onDone}>Go to Operator Portal</WizardButton>
        </>
      }
    >
      <div className="rounded-xl bg-gray-50 dark:bg-gray-900 p-4">
        <AddrRow label="xPNTs token" addr={data.xPNTsAddress} />
        {data.mode === "aoa" && <AddrRow label="Paymaster V4" addr={data.paymasterAddress} />}
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {data.mode === "aoa"
          ? "Your paymaster is funded on the EntryPoint and ready to sponsor gas."
          : "Your SuperPaymaster collateral is funded and your operator is configured."}
      </p>
    </StepCard>
  );
}
