"use client";

/**
 * Step 7 (AOA+) — deposit aPNTs collateral to the SuperPaymaster so the
 * operator can sponsor gas. Uses PaymasterOperatorClient.depositCollateral,
 * which approves aPNTs and calls SuperPaymaster.deposit under the hood.
 *
 * @module app/operator/deploy/steps/Step7DepositAPNTs
 */
import { useState } from "react";
import { BanknotesIcon } from "@heroicons/react/24/outline";
import { parseEther } from "viem";
import { buildPaymasterOperatorClient } from "@/lib/sdk/operator";
import type { StepProps } from "./types";
import { useTxStep } from "../components/useTxStep";
import StepCard from "../components/StepCard";
import WizardButton from "../components/WizardButton";
import FormField from "../components/FormField";

export default function Step7DepositAPNTs({ walletClient, data, update, onNext, onBack, refreshResources }: StepProps) {
  const tx = useTxStep();
  const [amount, setAmount] = useState(data.aPNTsDeposit);
  const valid = parseFloat(amount || "0") > 0;

  const deposit = async () => {
    update({ aPNTsDeposit: amount });
    const hash = await tx.run(
      async () => {
        const client = buildPaymasterOperatorClient(walletClient);
        return client.depositCollateral(parseEther(amount || "0"));
      },
      { loadingMsg: "Depositing aPNTs collateral…", successMsg: "aPNTs collateral deposited" }
    );
    if (hash) await refreshResources?.();
  };

  return (
    <StepCard
      title="Deposit aPNTs collateral"
      description="Fund your SuperPaymaster balance so you can sponsor user operations."
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
              {tx.status === "error" ? "Retry" : "Deposit aPNTs"}
            </WizardButton>
          )}
        </>
      }
    >
      <FormField label="Deposit amount (aPNTs)" type="number" value={amount} onChange={setAmount} hint="Minimum 1000 aPNTs" />
    </StepCard>
  );
}
