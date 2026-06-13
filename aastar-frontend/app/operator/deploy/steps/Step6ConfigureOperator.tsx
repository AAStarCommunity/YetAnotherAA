"use client";

/**
 * Step 6 (AOA+) — configure operator parameters on the SuperPaymaster: bind the
 * xPNTs gas token, treasury, and exchange rate via
 * PaymasterOperatorClient.configureOperator (which maps to
 * SuperPaymaster.configureOperator).
 *
 * @module app/operator/deploy/steps/Step6ConfigureOperator
 */
import { useState } from "react";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { parseEther, isAddress, type Address } from "viem";
import { buildPaymasterOperatorClient } from "@/lib/sdk/operator";
import type { StepProps } from "./types";
import { useTxStep } from "../components/useTxStep";
import StepCard from "../components/StepCard";
import WizardButton from "../components/WizardButton";
import FormField from "../components/FormField";

export default function Step6ConfigureOperator({ address, walletClient, data, update, onNext, onBack }: StepProps) {
  const tx = useTxStep();
  const [treasury, setTreasury] = useState(data.treasury || address);
  const [rate, setRate] = useState(data.exchangeRate);
  const xPNTs = data.xPNTsAddress;
  const valid = !!xPNTs && isAddress(treasury) && parseFloat(rate || "0") > 0;

  const configure = async () => {
    update({ treasury, exchangeRate: rate });
    await tx.run(
      async () => {
        const client = buildPaymasterOperatorClient(walletClient);
        return client.configureOperator(xPNTs as Address, treasury as Address, parseEther(rate || "1"));
      },
      { loadingMsg: "Configuring operator…", successMsg: "Operator configured" }
    );
  };

  return (
    <StepCard
      title="Configure operator"
      description="Bind your xPNTs token, treasury, and exchange rate on the SuperPaymaster."
      icon={<Cog6ToothIcon className="h-6 w-6" />}
      status={tx.status}
      txHash={tx.txHash}
      error={tx.error}
      footer={
        <>
          <WizardButton variant="secondary" onClick={onBack} disabled={tx.isBusy}>
            Back
          </WizardButton>
          {tx.status === "success" ? (
            <WizardButton onClick={onNext}>Continue</WizardButton>
          ) : (
            <WizardButton onClick={configure} loading={tx.isBusy} disabled={!valid}>
              {tx.status === "error" ? "Retry" : "Configure"}
            </WizardButton>
          )}
        </>
      }
    >
      {!xPNTs ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          No xPNTs token address available. Complete the xPNTs deploy step first.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            xPNTs token: <span className="font-mono break-all">{xPNTs}</span>
          </p>
          <FormField label="Treasury Address" value={treasury} onChange={setTreasury} mono placeholder="0x…" hint="Receives operator service fees" />
          <FormField label="Exchange Rate (1 aPNTs = ? xPNTs)" type="number" value={rate} onChange={setRate} hint="Default 1:1" />
        </div>
      )}
    </StepCard>
  );
}
