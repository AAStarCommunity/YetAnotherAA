"use client";

/**
 * Step 3 — register the connected wallet as a Community (ROLE_COMMUNITY) on the
 * v5 Registry. Two tx: approve GToken to GTokenStaking (skipped if allowance
 * already covers the role's stake) then `registerRole(ROLE_COMMUNITY, user,
 * roleData)`. In v5 the Registry is role-based — there is no on-chain
 * CommunityProfile struct; community metadata (name / ENS) lives on the xPNTs
 * token deployed in the next step — so `roleData` is empty bytes.
 *
 * Skipped automatically when the resource check already found ROLE_COMMUNITY.
 *
 * @module app/operator/deploy/steps/Step3RegisterCommunity
 */
import { UserPlusIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import {
  registryActions,
  tokenActions,
  ROLE_COMMUNITY,
  REGISTRY_ADDRESS,
  GTOKEN_ADDRESS,
  GTOKEN_STAKING_ADDRESS,
} from "@aastar/core";
import { ensureSdkConfig, getPublicClient } from "@/lib/sdk/client";
import type { StepProps } from "./types";
import { useTxStep } from "../components/useTxStep";
import StepCard from "../components/StepCard";
import WizardButton from "../components/WizardButton";

export default function Step3RegisterCommunity({
  address,
  walletClient,
  data,
  onNext,
  onBack,
  refreshResources,
}: StepProps) {
  const already = !!data.resources?.isCommunityRegistered;
  const tx = useTxStep();

  const register = async () => {
    await tx.run(
      async () => {
        ensureSdkConfig();
        const pc = getPublicClient();
        // 1) ensure GToken allowance to GTokenStaking covers stake + entry fee.
        // The @aastar/core RoleConfigDetailed type declares `entryBurn`, but the
        // deployed registry returns the fee under `ticketPrice` — the SDK type is
        // out of sync with the on-chain struct. Read whichever exists (guarding
        // against undefined so `minStake + undefined` can't throw), summing both
        // only if both were ever present. `minStake` is always returned.
        const cfg = (await registryActions(REGISTRY_ADDRESS)(pc as any).getRoleConfig({
          roleId: ROLE_COMMUNITY,
        })) as { minStake?: bigint; entryBurn?: bigint; ticketPrice?: bigint };
        const entryFee = (cfg.entryBurn ?? 0n) + (cfg.ticketPrice ?? 0n);
        const needed = (cfg.minStake ?? 0n) + entryFee;
        const token = tokenActions(GTOKEN_ADDRESS)(walletClient as any);
        const allowance = await tokenActions(GTOKEN_ADDRESS)(pc as any).allowance({
          token: GTOKEN_ADDRESS,
          owner: address,
          spender: GTOKEN_STAKING_ADDRESS,
        });
        if (allowance < needed) {
          const approveHash = await token.approve({
            token: GTOKEN_ADDRESS,
            spender: GTOKEN_STAKING_ADDRESS,
            amount: needed,
          });
          await pc.waitForTransactionReceipt({ hash: approveHash });
        }
        // 2) register ROLE_COMMUNITY (empty roleData — metadata lives on xPNTs)
        return registryActions(REGISTRY_ADDRESS)(walletClient as any).registerRole({
          roleId: ROLE_COMMUNITY,
          user: address,
          data: "0x",
        });
      },
      { loadingMsg: "Registering community…", successMsg: "Community registered" }
    );
    await refreshResources?.();
  };

  return (
    <StepCard
      title="Register community"
      description="Stake GToken and register ROLE_COMMUNITY on the Registry."
      icon={<UserPlusIcon className="h-6 w-6" />}
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
              {tx.status === "error" ? "Retry" : "Register Community"}
            </WizardButton>
          )}
        </>
      }
    >
      {already ? (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircleIcon className="h-5 w-5" />
          This wallet already holds ROLE_COMMUNITY — skipping.
        </div>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Approves GToken to GTokenStaking (only if needed) then calls{" "}
          <code className="px-1 rounded bg-gray-100 dark:bg-gray-700 text-xs">registerRole(ROLE_COMMUNITY)</code>.
          Stake amount is read from the role config on-chain.
        </p>
      )}
    </StepCard>
  );
}
