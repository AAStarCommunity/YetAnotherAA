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
import { useTranslation } from "react-i18next";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { parseEther, isAddress, type Address } from "viem";
import { buildPaymasterOperatorClient } from "@/lib/sdk/operator";
import type { StepProps } from "./types";
import { useTxStep } from "../components/useTxStep";
import StepCard from "../components/StepCard";
import WizardButton from "../components/WizardButton";
import FormField from "../components/FormField";

export default function Step6ConfigureOperator({ address, walletClient, data, update, onNext, onBack }: StepProps) {
  const { t } = useTranslation();
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
      {
        loadingMsg: t("operatorDeploy.tx.configuringOperator"),
        successMsg: t("operatorDeploy.tx.operatorConfigured"),
      }
    );
  };

  return (
    <StepCard
      title={t("operatorDeploy.step6Configure.title")}
      description={t("operatorDeploy.step6Configure.description")}
      icon={<Cog6ToothIcon className="h-6 w-6" />}
      status={tx.status}
      txHash={tx.txHash}
      error={tx.error}
      footer={
        <>
          <WizardButton variant="secondary" onClick={onBack} disabled={tx.isBusy}>
            {t("operatorDeploy.common.back")}
          </WizardButton>
          {tx.status === "success" ? (
            <WizardButton onClick={onNext}>{t("operatorDeploy.common.continue")}</WizardButton>
          ) : (
            <WizardButton onClick={configure} loading={tx.isBusy} disabled={!valid}>
              {tx.status === "error"
                ? t("operatorDeploy.common.retry")
                : t("operatorDeploy.step6Configure.configure")}
            </WizardButton>
          )}
        </>
      }
    >
      {!xPNTs ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          {t("operatorDeploy.step6Configure.noXpnts")}
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("operatorDeploy.step6Configure.xpntsToken")} <span className="font-mono break-all">{xPNTs}</span>
          </p>
          <FormField label={t("operatorDeploy.step6Configure.treasuryAddress")} value={treasury} onChange={setTreasury} mono placeholder="0x…" hint={t("operatorDeploy.step6Configure.treasuryHint")} />
          <FormField label={t("operatorDeploy.step6Configure.exchangeRate")} type="number" value={rate} onChange={setRate} hint={t("operatorDeploy.step6Configure.exchangeRateHint")} />
        </div>
      )}
    </StepCard>
  );
}
