"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowPathIcon, CheckCircleIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { formatEther, type Address, type PublicClient } from "viem";
import { CHAIN_SEPOLIA, AAStarAirAccountV7ABI, getCanonicalAddresses } from "@aastar/sdk/core";
import { TIER_PROFILES, profileSetupCalls } from "@aastar/sdk/airaccount";
import { startAuthentication } from "@simplewebauthn/browser";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import Layout from "@/components/Layout";
import { useDashboard } from "@/contexts/DashboardContext";
import { transferAPI } from "@/lib/api";
import { ensureSdkConfig, getPublicClient } from "@/lib/sdk/client";

type ProfileKey = keyof typeof TIER_PROFILES;

export default function TierSetupPage() {
  const { t } = useTranslation();
  const { data } = useDashboard();
  const account = data.account?.address as Address | undefined;

  const [publicClient] = useState<PublicClient>(() => {
    ensureSdkConfig(CHAIN_SEPOLIA);
    return getPublicClient();
  });

  // Current account tier state: undefined = loading, 0n = unconfigured, >0n = configured.
  const [tier1, setTier1] = useState<bigint | undefined>(undefined);
  const [selected, setSelected] = useState<ProfileKey>("web3-newbie");
  const [busy, setBusy] = useState(false);

  const loadTier = useCallback(async () => {
    if (!account) return;
    try {
      const v = (await publicClient.readContract({
        address: account,
        abi: AAStarAirAccountV7ABI,
        functionName: "tier1Limit",
      })) as bigint;
      setTier1(v);
    } catch {
      setTier1(0n); // not deployed yet / no tiers → treat as unconfigured
    }
  }, [account, publicClient]);

  useEffect(() => {
    void loadTier();
  }, [loadTier]);

  // Apply the chosen profile: setTierLimits + setWeightConfig, each through the
  // AirAccount's two-phase device-passkey UserOp (gasless via PaymasterV4).
  const apply = async () => {
    if (!account) return;
    setBusy(true);
    const loading = toast.loading(t("tierSetup.applying"));
    try {
      const calls = profileSetupCalls(account, TIER_PROFILES[selected]) as {
        to: Address;
        data: `0x${string}`;
      }[];
      const canonical = getCanonicalAddresses(CHAIN_SEPOLIA);
      for (let i = 0; i < calls.length; i++) {
        toast.loading(t("tierSetup.step", { i: i + 1, n: calls.length }), { id: loading });
        const prep = await transferAPI.prepare({
          to: calls[i].to,
          amount: "0",
          data: calls[i].data,
          usePaymaster: true,
          paymasterAddress: canonical?.paymasterV4,
        });
        const credential = await startAuthentication({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          optionsJSON: prep.data.publicKeyOptions as any,
        });
        const res = await transferAPI.submit({
          transferId: prep.data.transferId,
          challengeId: prep.data.challengeId,
          credential,
        });
        // The SDK returns success:false (not a throw) when the bundler/paymaster rejects the
        // UserOp (e.g. AA33 — no aPNTs for PaymasterV4), so a missing check would falsely report
        // the tiers as applied. Surface the real failure instead.
        const r = res.data as { success?: boolean; message?: string } | undefined;
        if (r && r.success === false) {
          throw new Error(r.message || t("tierSetup.failed"));
        }
      }
      toast.success(t("tierSetup.done"));
      await loadTier();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("tierSetup.failed"));
    } finally {
      toast.dismiss(loading);
      setBusy(false);
    }
  };

  if (!account) {
    return (
      <Layout requireAuth>
        <div className="max-w-xl mx-auto px-4 py-10">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("tierSetup.noAccount")}</p>
        </div>
      </Layout>
    );
  }

  const configured = tier1 != null && tier1 > 0n;

  return (
    <Layout requireAuth>
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="h-6 w-6 text-emerald-500" />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t("tierSetup.title")}
          </h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("tierSetup.subtitle")}</p>

        {tier1 === undefined ? (
          <ArrowPathIcon className="h-5 w-5 animate-spin text-gray-400 mx-auto mt-8" />
        ) : (
          <>
            {configured && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircleIcon className="h-4 w-4" />
                {t("tierSetup.alreadyConfigured", { v: formatEther(tier1) })}
              </div>
            )}

            <div className="mt-5 space-y-3">
              {(Object.keys(TIER_PROFILES) as ProfileKey[]).map(k => {
                const p = TIER_PROFILES[k];
                const eth = (v: bigint) => formatEther(v);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelected(k)}
                    className={`w-full text-left rounded-xl border p-4 transition ${
                      selected === k
                        ? "border-emerald-500 ring-1 ring-emerald-500 bg-emerald-50/40 dark:bg-emerald-900/10"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {t(`tierSetup.profile.${k}.name`)}
                      </span>
                      {selected === k && <CheckCircleIcon className="h-5 w-5 text-emerald-500" />}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {t(`tierSetup.profile.${k}.desc`)}
                    </p>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
                      <span className="text-gray-500 dark:text-gray-400">
                        {t("tierSetup.tier1")}: <b>{eth(p.tier1Limit)}</b>
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {t("tierSetup.tier2")}: <b>{eth(p.tier2Limit)}</b>
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {t("tierSetup.daily")}: <b>{eth(p.dailyLimit)}</b>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-[11px] text-gray-400">{t("tierSetup.tierExplainer")}</p>

            <button
              disabled={busy}
              onClick={() => void apply()}
              className="mt-5 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
            >
              {busy ? "…" : configured ? t("tierSetup.reapply") : t("tierSetup.apply")}
            </button>
          </>
        )}
      </div>
    </Layout>
  );
}
