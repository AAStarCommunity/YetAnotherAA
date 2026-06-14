"use client";

/**
 * Step 6 (AOA) — fund the freshly-deployed Paymaster V4 on the EntryPoint so it
 * can sponsor gas. Calls `entryPointActions.depositTo({ account: paymaster,
 * amount })` (payable — `amount` is forwarded as msg.value).
 *
 * @module app/operator/deploy/steps/Step6EntryPointDeposit
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      {
        loadingMsg: t("operatorDeploy.tx.depositingEntrypoint"),
        successMsg: t("operatorDeploy.tx.entrypointFunded"),
      }
    );
  };

  return (
    <StepCard
      title={t("operatorDeploy.step6Entrypoint.title")}
      description={t("operatorDeploy.step6Entrypoint.description")}
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
                : t("operatorDeploy.step6Entrypoint.depositEth")}
            </WizardButton>
          )}
        </>
      }
    >
      {!paymaster ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          {t("operatorDeploy.step6Entrypoint.noPaymaster")}
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("operatorDeploy.step6Entrypoint.paymaster")} <span className="font-mono">{paymaster}</span>
          </p>
          <FormField label={t("operatorDeploy.step6Entrypoint.depositAmount")} type="number" value={eth} onChange={setEth} hint={t("operatorDeploy.step6Entrypoint.depositHint")} />
        </div>
      )}
    </StepCard>
  );
}
