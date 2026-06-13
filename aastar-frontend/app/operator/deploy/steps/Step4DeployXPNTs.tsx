"use client";

/**
 * Step 4 — deploy the community's xPNTs gas token via xPNTsFactory.
 *
 * `paymasterAOA` is set to the zero address: in the AOA flow the Paymaster V4 is
 * deployed in a later step, and AOA+ uses the shared SuperPaymaster, so the
 * token is not bound to a specific paymaster at creation. The deployed address
 * is read back from the factory and stored for the configure step (AOA+).
 *
 * Skipped automatically when the resource check already found an xPNTs token.
 *
 * @module app/operator/deploy/steps/Step4DeployXPNTs
 */
import { useState } from "react";
import { CurrencyDollarIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { parseEther, zeroAddress, type Address } from "viem";
import { xPNTsFactoryActions, XPNTS_FACTORY_ADDRESS } from "@aastar/core";
import { ensureSdkConfig, getPublicClient } from "@/lib/sdk/client";
import type { StepProps } from "./types";
import { useTxStep } from "../components/useTxStep";
import StepCard, { explorerAddr } from "../components/StepCard";
import WizardButton from "../components/WizardButton";
import FormField from "../components/FormField";

export default function Step4DeployXPNTs({
  address,
  walletClient,
  data,
  update,
  onNext,
  onBack,
  refreshResources,
}: StepProps) {
  const already = !!data.resources?.hasXPNTs;
  const existing = data.xPNTsAddress;
  const tx = useTxStep();
  const [local, setLocal] = useState({
    name: data.tokenName,
    symbol: data.tokenSymbol,
    communityName: data.communityName,
    communityENS: data.communityENS,
    rate: data.exchangeRate,
  });

  const valid = local.name.trim() && local.symbol.trim() && parseFloat(local.rate || "0") > 0;

  const deploy = async () => {
    update({
      tokenName: local.name,
      tokenSymbol: local.symbol,
      communityName: local.communityName,
      communityENS: local.communityENS,
      exchangeRate: local.rate,
    });
    const hash = await tx.run(
      async () => {
        ensureSdkConfig();
        return xPNTsFactoryActions(XPNTS_FACTORY_ADDRESS)(walletClient as any).deployxPNTsToken({
          name: local.name,
          symbol: local.symbol,
          communityName: local.communityName || local.name,
          communityENS: local.communityENS || "",
          exchangeRate: parseEther(local.rate || "1"),
          paymasterAOA: zeroAddress,
        });
      },
      { loadingMsg: "Deploying xPNTs token…", successMsg: "xPNTs token deployed" }
    );
    if (hash) {
      ensureSdkConfig();
      try {
        const tokenAddr = (await xPNTsFactoryActions(XPNTS_FACTORY_ADDRESS)(
          getPublicClient() as any
        ).getTokenAddress({ community: address })) as Address;
        update({ xPNTsAddress: tokenAddr });
      } catch {
        /* address read best-effort; resource refresh below also captures it */
      }
      await refreshResources?.();
    }
  };

  return (
    <StepCard
      title="Deploy xPNTs token"
      description="Your community's gas token, deployed through the protocol factory."
      icon={<CurrencyDollarIcon className="h-6 w-6" />}
      status={tx.status}
      txHash={tx.txHash}
      error={tx.error}
      footer={
        <>
          <WizardButton variant="secondary" onClick={onBack} disabled={tx.isBusy}>
            Back
          </WizardButton>
          {already || tx.status === "success" ? (
            <WizardButton onClick={onNext}>Continue</WizardButton>
          ) : (
            <WizardButton onClick={deploy} loading={tx.isBusy} disabled={!valid}>
              {tx.status === "error" ? "Retry" : "Deploy Token"}
            </WizardButton>
          )}
        </>
      }
    >
      {already ? (
        <div className="space-y-1 text-sm text-emerald-600 dark:text-emerald-400">
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="h-5 w-5" />
            xPNTs token already deployed — skipping.
          </div>
          {existing && (
            <a
              href={explorerAddr(existing)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs hover:underline break-all"
            >
              {existing}
            </a>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Token Name" value={local.name} onChange={v => setLocal(s => ({ ...s, name: v }))} placeholder="My Community Points" />
          <FormField label="Token Symbol" value={local.symbol} onChange={v => setLocal(s => ({ ...s, symbol: v.toUpperCase() }))} placeholder="MCP" />
          <FormField label="Community Name" value={local.communityName} onChange={v => setLocal(s => ({ ...s, communityName: v }))} placeholder="My Community" />
          <FormField label="Community ENS (optional)" value={local.communityENS} onChange={v => setLocal(s => ({ ...s, communityENS: v }))} placeholder="mycommunity.aastar.eth" mono />
          <FormField label="Exchange Rate (1 aPNTs = ? xPNTs)" type="number" value={local.rate} onChange={v => setLocal(s => ({ ...s, rate: v }))} hint="Default 1:1" />
        </div>
      )}
    </StepCard>
  );
}
