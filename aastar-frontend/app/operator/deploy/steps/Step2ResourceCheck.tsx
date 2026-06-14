"use client";

/**
 * Step 2 — resource pre-check. Runs `checkResources(address, mode)` and renders
 * a checklist of prerequisites (GT / aPNTs / ETH balances + existing
 * community / xPNTs / paymaster state). Gates "Continue" on having enough
 * balances; the per-resource on-chain state is surfaced so later steps can be
 * skipped when already satisfied.
 *
 * @module app/operator/deploy/steps/Step2ResourceCheck
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/outline";
import { checkResources, clearResourceCaches } from "@/lib/resources/resourceChecker";
import type { StepProps } from "./types";
import StepCard from "../components/StepCard";
import WizardButton from "../components/WizardButton";

function Row({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      {ok ? (
        <CheckCircleIcon className="h-5 w-5 text-emerald-500 shrink-0" />
      ) : (
        <XCircleIcon className="h-5 w-5 text-red-400 shrink-0" />
      )}
      <span className="text-sm text-gray-700 dark:text-gray-200">{label}</span>
      {detail && <span className="ml-auto text-xs font-mono text-gray-400">{detail}</span>}
    </div>
  );
}

export default function Step2ResourceCheck({ address, data, update, onNext, onBack }: StepProps) {
  const { t } = useTranslation();
  const mode = data.mode!;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const res = data.resources;

  const run = useCallback(
    async (clear = false) => {
      setLoading(true);
      setError(undefined);
      try {
        if (clear) clearResourceCaches(address);
        const status = await checkResources(address, mode);
        update({
          resources: status,
          xPNTsAddress: (status.xPNTsAddress as `0x${string}` | undefined) ?? undefined,
          paymasterAddress: (status.paymasterAddress as `0x${string}` | undefined) ?? undefined,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : t("operatorDeploy.step2.checkFailed"));
      } finally {
        setLoading(false);
      }
    },
    [address, mode, update, t]
  );

  useEffect(() => {
    if (!data.resources) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const balancesOk = !!res && res.hasEnoughGToken && res.hasEnoughETH && (mode === "aoa" || res.hasEnoughAPNTs);

  return (
    <StepCard
      title={t("operatorDeploy.step2.title")}
      description={t("operatorDeploy.step2.description", { mode: mode.toUpperCase() })}
      icon={<ClipboardDocumentCheckIcon className="h-6 w-6" />}
      error={error}
      footer={
        <>
          <WizardButton variant="secondary" onClick={onBack}>
            {t("operatorDeploy.common.back")}
          </WizardButton>
          <div className="flex items-center gap-2">
            <WizardButton variant="secondary" onClick={() => run(true)} loading={loading}>
              <ArrowPathIcon className="h-4 w-4" />
              {t("operatorDeploy.step2.refresh")}
            </WizardButton>
            <WizardButton onClick={onNext} disabled={!balancesOk || loading}>
              {t("operatorDeploy.common.continue")}
            </WizardButton>
          </div>
        </>
      }
    >
      {loading && !res ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-6 justify-center">
          <ArrowPathIcon className="h-5 w-5 animate-spin" />
          {t("operatorDeploy.step2.checking")}
        </div>
      ) : res ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-900 p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
              {t("operatorDeploy.step2.balances")}
            </p>
            <Row
              label={t("operatorDeploy.step2.gtokenNeed", { amount: res.requiredGToken })}
              ok={res.hasEnoughGToken}
              detail={`${parseFloat(res.gTokenBalance).toFixed(2)} GT`}
            />
            {mode === "aoa+" && (
              <Row
                label={t("operatorDeploy.step2.apntsNeed", { amount: res.requiredAPNTs })}
                ok={res.hasEnoughAPNTs}
                detail={`${parseFloat(res.aPNTsBalance).toFixed(2)} aPNTs`}
              />
            )}
            <Row
              label={t("operatorDeploy.step2.ethNeed", { amount: res.requiredETH })}
              ok={res.hasEnoughETH}
              detail={`${parseFloat(res.ethBalance).toFixed(4)} ETH`}
            />
          </div>

          <div className="rounded-xl bg-gray-50 dark:bg-gray-900 p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
              {t("operatorDeploy.step2.onChainState")}
            </p>
            <Row label={t("operatorDeploy.step2.communityRegistered")} ok={res.isCommunityRegistered} />
            <Row label={t("operatorDeploy.step2.xpntsDeployed")} ok={res.hasXPNTs} />
            {mode === "aoa" ? (
              <Row label={t("operatorDeploy.step2.aoaPaymasterDeployed")} ok={res.hasAOAPaymaster} />
            ) : (
              <Row label={t("operatorDeploy.step2.registeredOnSuper")} ok={res.hasSuperPaymasterRegistered} />
            )}
          </div>

          {!balancesOk && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t("operatorDeploy.step2.topUpHint")}
            </p>
          )}
        </div>
      ) : null}
    </StepCard>
  );
}
