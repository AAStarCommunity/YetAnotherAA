"use client";

/**
 * Step 5 (AOA) — deploy a Paymaster V4 and register ROLE_PAYMASTER_AOA in one
 * orchestrated call via the high-level PaymasterOperatorClient. The client
 * predicts the address, deploys through the factory, and registers with the
 * 30 GT stake (approving GToken internally). The returned paymaster address is
 * stored for the EntryPoint deposit step.
 *
 * Skipped automatically when the resource check already found an AOA paymaster.
 *
 * @module app/operator/deploy/steps/Step5DeployPaymasterV4
 */
import { useTranslation } from "react-i18next";
import { ServerStackIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { parseEther, type Address } from "viem";
import { buildPaymasterOperatorClient } from "@/lib/sdk/operator";
import type { StepProps } from "./types";
import { useTxStep } from "../components/useTxStep";
import StepCard, { explorerAddr } from "../components/StepCard";
import WizardButton from "../components/WizardButton";

export default function Step5DeployPaymasterV4({
  walletClient,
  data,
  update,
  onNext,
  onBack,
  refreshResources,
}: StepProps) {
  const { t } = useTranslation();
  const already = !!data.resources?.hasAOAPaymaster;
  const tx = useTxStep();
  const paymaster = data.paymasterAddress;

  const deploy = async () => {
    await tx.run(
      async () => {
        const client = buildPaymasterOperatorClient(walletClient);
        const result = await client.deployAndRegisterPaymasterV4({ stakeAmount: parseEther("30") });
        update({ paymasterAddress: result.paymasterAddress as Address });
        return result.registerHash;
      },
      {
        loadingMsg: t("operatorDeploy.tx.deployingPaymaster"),
        successMsg: t("operatorDeploy.tx.paymasterDeployed"),
      }
    );
    await refreshResources?.();
  };

  return (
    <StepCard
      title={t("operatorDeploy.step5Paymaster.title")}
      description={t("operatorDeploy.step5Paymaster.description")}
      icon={<ServerStackIcon className="h-6 w-6" />}
      status={tx.status}
      txHash={tx.txHash}
      error={tx.error}
      footer={
        <>
          <WizardButton variant="secondary" onClick={onBack} disabled={tx.isBusy}>
            {t("operatorDeploy.common.back")}
          </WizardButton>
          {already || tx.status === "success" ? (
            <WizardButton onClick={onNext}>{t("operatorDeploy.common.continue")}</WizardButton>
          ) : (
            <WizardButton onClick={deploy} loading={tx.isBusy}>
              {tx.status === "error"
                ? t("operatorDeploy.common.retry")
                : t("operatorDeploy.step5Paymaster.deployPaymaster")}
            </WizardButton>
          )}
        </>
      }
    >
      {already ? (
        <div className="space-y-1 text-sm text-emerald-600 dark:text-emerald-400">
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="h-5 w-5" />
            {t("operatorDeploy.step5Paymaster.alreadyDeployed")}
          </div>
          {paymaster && (
            <a
              href={explorerAddr(paymaster)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs hover:underline break-all"
            >
              {paymaster}
            </a>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t("operatorDeploy.step5Paymaster.explainer")}
        </p>
      )}
    </StepCard>
  );
}
