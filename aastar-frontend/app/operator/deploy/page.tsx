"use client";

/**
 * Operator onboarding wizard — registry flow 1 ("AOA", self-hosted Paymaster V4)
 * and flow 2 ("AOA+", shared SuperPaymaster).
 *
 * Fully client-side, no SSR: every transaction is signed in the operator's own
 * browser wallet (viem WalletClient from WalletContext) against the @aastar/*
 * SDK. The wizard threads a single `WizardData` object through ordered step
 * components and re-runs the resource pre-check after each mutating step so
 * already-satisfied prerequisites are skipped.
 *
 *   AOA : connect → resources → community → xPNTs → paymaster → entrypoint → done
 *   AOA+: connect → resources → community → xPNTs → super → configure → aPNTs → done
 *
 * @module app/operator/deploy/page
 */
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { RocketLaunchIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import Layout from "@/components/Layout";
import { useWallet } from "@/contexts/WalletContext";
import { checkResources, clearResourceCaches } from "@/lib/resources/resourceChecker";
import type { Address } from "viem";

import { initialWizardData, type StepProps, type WizardData } from "./steps/types";
import WizardProgress from "./components/WizardProgress";
import WizardButton from "./components/WizardButton";
import Step1ConnectSelect from "./steps/Step1ConnectSelect";
import Step2ResourceCheck from "./steps/Step2ResourceCheck";
import Step3RegisterCommunity from "./steps/Step3RegisterCommunity";
import Step4DeployXPNTs from "./steps/Step4DeployXPNTs";
import Step5DeployPaymasterV4 from "./steps/Step5DeployPaymasterV4";
import Step6EntryPointDeposit from "./steps/Step6EntryPointDeposit";
import Step5RegisterSuper from "./steps/Step5RegisterSuper";
import Step6ConfigureOperator from "./steps/Step6ConfigureOperator";
import Step7DepositAPNTs from "./steps/Step7DepositAPNTs";
import StepComplete from "./steps/StepComplete";

const LABEL_KEYS: Record<string, string> = {
  connect: "operatorDeploy.labels.connect",
  resources: "operatorDeploy.labels.resources",
  community: "operatorDeploy.labels.community",
  xpnts: "operatorDeploy.labels.xpnts",
  paymaster: "operatorDeploy.labels.paymaster",
  entrypoint: "operatorDeploy.labels.entrypoint",
  "register-super": "operatorDeploy.labels.registerSuper",
  configure: "operatorDeploy.labels.configure",
  "deposit-apnts": "operatorDeploy.labels.depositApnts",
  done: "operatorDeploy.labels.done",
};

export default function OperatorDeployPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { address, walletClient } = useWallet();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(initialWizardData);

  const update = useCallback((patch: Partial<WizardData>) => {
    setData(prev => ({ ...prev, ...patch }));
  }, []);

  const stepKeys = useMemo(() => {
    const head = ["connect", "resources", "community", "xpnts"];
    return data.mode === "aoa+"
      ? [...head, "register-super", "configure", "deposit-apnts", "done"]
      : [...head, "paymaster", "entrypoint", "done"];
  }, [data.mode]);

  const onNext = useCallback(() => setStep(s => Math.min(s + 1, stepKeys.length - 1)), [stepKeys.length]);
  const onBack = useCallback(() => setStep(s => Math.max(s - 1, 0)), []);

  const refreshResources = useCallback(async () => {
    if (!address || !data.mode) return;
    clearResourceCaches(address);
    const status = await checkResources(address, data.mode);
    setData(prev => ({
      ...prev,
      resources: status,
      xPNTsAddress: prev.xPNTsAddress ?? (status.xPNTsAddress as Address | undefined),
      paymasterAddress: prev.paymasterAddress ?? (status.paymasterAddress as Address | undefined),
    }));
  }, [address, data.mode]);

  const restart = useCallback(() => {
    setData(initialWizardData);
    setStep(0);
  }, []);

  const currentKey = stepKeys[step];

  // Steps after connect require a live wallet client.
  const needWallet = step > 0 && (!address || !walletClient);

  const stepProps: StepProps | null =
    address && walletClient
      ? { address, walletClient, data, update, onNext, onBack, refreshResources }
      : null;

  const renderStep = () => {
    if (currentKey === "connect") {
      return <Step1ConnectSelect data={data} update={update} onNext={onNext} />;
    }
    if (needWallet || !stepProps) {
      return (
        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <ExclamationTriangleIcon className="h-6 w-6" />
            <span className="font-semibold">{t("operatorDeploy.page.walletDisconnected")}</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t("operatorDeploy.page.reconnectPrompt")}
          </p>
          <WizardButton onClick={restart}>{t("operatorDeploy.page.backToStart")}</WizardButton>
        </section>
      );
    }
    switch (currentKey) {
      case "resources":
        return <Step2ResourceCheck {...stepProps} />;
      case "community":
        return <Step3RegisterCommunity {...stepProps} />;
      case "xpnts":
        return <Step4DeployXPNTs {...stepProps} />;
      case "paymaster":
        return <Step5DeployPaymasterV4 {...stepProps} />;
      case "entrypoint":
        return <Step6EntryPointDeposit {...stepProps} />;
      case "register-super":
        return <Step5RegisterSuper {...stepProps} />;
      case "configure":
        return <Step6ConfigureOperator {...stepProps} />;
      case "deposit-apnts":
        return <Step7DepositAPNTs {...stepProps} />;
      case "done":
        return <StepComplete data={data} onDone={() => router.push("/operator")} onRestart={restart} />;
      default:
        return null;
    }
  };

  return (
    <Layout requireAuth>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <RocketLaunchIcon className="h-7 w-7 text-slate-700 dark:text-emerald-400" />
            {t("operatorDeploy.page.title")}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t("operatorDeploy.page.subtitle")}
          </p>
        </div>

        <WizardProgress labels={stepKeys.map(k => t(LABEL_KEYS[k]))} current={step} />

        {renderStep()}
      </div>
    </Layout>
  );
}
