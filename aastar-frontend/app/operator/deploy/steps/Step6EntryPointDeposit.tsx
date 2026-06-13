"use client";

/**
 * Step 6 (AOA) — fund the freshly-deployed Paymaster V4 on the EntryPoint so it
 * can sponsor gas. Calls `entryPointActions.depositTo({ account: paymaster,
 * amount })` (payable — `amount` is forwarded as msg.value).
 *
 * @module app/operator/deploy/steps/Step6EntryPointDeposit
 */
import { useState } from "react";
import { BanknotesIcon } from "@heroicons/react/24/outline";
import { parseEther } from "viem";
import { entryPointActions, ENTRY_POINT_ADDRESS } from "@aastar/core";
import { ensureSdkConfig } from "@/lib/sdk/client";
import type { StepProps } from "./types";
import { useTxStep } from "../components/useTxStep";
import StepCard from "../components/StepCard";
import WizardButton from "../components/WizardButton";
import FormField from "../components/FormField";

export default function Step6EntryPointDeposit({ data, walletClient, update, onNext, onBack }: StepProps) {
  const paymaster = data.paymasterAddress;
  const tx = useTxStep();
  const [eth, setEth] = useState(data.ethDeposit);
  const valid = !!paymaster && parseFloat(eth || "0") > 0;

  const deposit = async () => {
    update({ ethDeposit: eth });
    await tx.run(
      async () => {
        ensureSdkConfig();
        return entryPointActions(ENTRY_POINT_ADDRESS)(walletClient as any).depositTo({
          account: paymaster!,
          amount: parseEther(eth || "0"),
        });
      },
      { loadingMsg: "Depositing to EntryPoint…", successMsg: "Paymaster funded on EntryPoint" }
    );
  };

  return (
    <StepCard
      title="Fund paymaster on EntryPoint"
      description="Deposit ETH so your paymaster can sponsor user operations."
      icon={<BanknotesIcon className="h-6 w-6" />}
      status={tx.status}
      txHash={tx.txHash}
      error={tx.error}
      footer={
        <>
          <WizardButton variant="secondary" onClick={onBack} disabled={tx.isBusy}>
            Back
          </WizardButton>
          {tx.status === "success" ? (
            <WizardButton onClick={onNext}>Finish</WizardButton>
          ) : (
            <WizardButton onClick={deposit} loading={tx.isBusy} disabled={!valid}>
              {tx.status === "error" ? "Retry" : "Deposit ETH"}
            </WizardButton>
          )}
        </>
      }
    >
      {!paymaster ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          No paymaster address available. Complete the deploy step first.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Paymaster: <span className="font-mono">{paymaster}</span>
          </p>
          <FormField label="Deposit amount (ETH)" type="number" value={eth} onChange={setEth} hint="Recommended ≥ 0.05 ETH" />
        </div>
      )}
    </StepCard>
  );
}
