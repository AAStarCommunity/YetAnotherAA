"use client";

/**
 * Step 7 (AOA+) — deposit aPNTs collateral to the SuperPaymaster so the
 * operator can sponsor gas. Uses PaymasterOperatorClient.depositCollateral,
 * which approves aPNTs and calls SuperPaymaster.deposit under the hood.
 *
 * @module app/operator/deploy/steps/Step7DepositAPNTs
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BanknotesIcon } from "@heroicons/react/24/outline";
import { parseEther } from "viem";
import { buildPaymasterOperatorClient } from "@/lib/sdk/operator";
import type { StepProps } from "./types";
import { useTxStep } from "../components/useTxStep";
import StepCard from "../components/StepCard";
import WizardButton from "../components/WizardButton";
import FormField from "../components/FormField";

export default function Step7DepositAPNTs({ walletClient, data, update, onNext, onBack, refreshResources }: StepProps) {
  const { t } = useTranslation();
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
      {
        loadingMsg: t("operatorDeploy.tx.depositingApnts"),
        successMsg: t("operatorDeploy.tx.apntsDeposited"),
      }
    );
    if (hash) await refreshResources?.();
  };

  return (
    <StepCard
      title={t("operatorDeploy.step7Apnts.title")}
      description={t("operatorDeploy.step7Apnts.description")}
      icon={<BanknotesIcon className="h-6 w-6" />}
      status={tx.status}
      txHash={tx.txHash}
      error={tx.error}
      footer={
        <>
          <WizardButton variant="secondary" onClick={onBack} disabled={tx.isBusy}>
            {t("operatorDeploy.common.back")}
          </WizardButton>
          {tx.status === "success" ? (
            <WizardButton onClick={onNext}>{t("operatorDeploy.common.finish")}</WizardButton>
          ) : (
            <WizardButton onClick={deposit} loading={tx.isBusy} disabled={!valid}>
              {tx.status === "error"
                ? t("operatorDeploy.common.retry")
                : t("operatorDeploy.step7Apnts.depositApnts")}
            </WizardButton>
          )}
        </>
      }
    >
      <FormField label={t("operatorDeploy.step7Apnts.depositAmount")} type="number" value={amount} onChange={setAmount} hint={t("operatorDeploy.step7Apnts.depositHint")} />
    </StepCard>
  );
}
