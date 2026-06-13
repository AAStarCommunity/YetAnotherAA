"use client";

/**
 * Step 5 (AOA+) — register as a SuperPaymaster operator (ROLE_PAYMASTER_SUPER)
 * via the high-level PaymasterOperatorClient one-stop API. It checks the
 * ROLE_COMMUNITY prerequisite, approves GToken to GTokenStaking, and registers
 * with the 50 GT stake (the "lockForSuperPaymaster" stake step is handled
 * inside this call). aPNTs collateral is deposited in a later step.
 *
 * Skipped automatically when the resource check already found a SuperPaymaster
 * registration.
 *
 * @module app/operator/deploy/steps/Step5RegisterSuper
 */
import { BoltIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { parseEther } from "viem";
import { buildPaymasterOperatorClient } from "@/lib/sdk/operator";
import type { StepProps } from "./types";
import { useTxStep } from "../components/useTxStep";
import StepCard from "../components/StepCard";
import WizardButton from "../components/WizardButton";

export default function Step5RegisterSuper({ walletClient, data, onNext, onBack, refreshResources }: StepProps) {
  const already = !!data.resources?.hasSuperPaymasterRegistered;
  const tx = useTxStep();

  const register = async () => {
    await tx.run(
      async () => {
        const client = buildPaymasterOperatorClient(walletClient);
        return client.registerAsSuperPaymasterOperator({ stakeAmount: parseEther("50") });
      },
      { loadingMsg: "Registering on SuperPaymaster…", successMsg: "Registered as SuperPaymaster operator" }
    );
    await refreshResources?.();
  };

  return (
    <StepCard
      title="Register on SuperPaymaster"
      description="Stake 50 GT and register ROLE_PAYMASTER_SUPER on the shared SuperPaymaster."
      icon={<BoltIcon className="h-6 w-6" />}
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
            <WizardButton onClick={register} loading={tx.isBusy}>
              {tx.status === "error" ? "Retry" : "Register Operator"}
            </WizardButton>
          )}
        </>
      }
    >
      {already ? (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircleIcon className="h-5 w-5" />
          Already registered on SuperPaymaster — skipping.
        </div>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          One-stop API: verifies ROLE_COMMUNITY, approves GToken to GTokenStaking, and registers
          ROLE_PAYMASTER_SUPER with the 50 GT stake.
        </p>
      )}
    </StepCard>
  );
}
