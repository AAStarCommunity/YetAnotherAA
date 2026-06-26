"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldExclamationIcon,
  ArrowPathIcon,
  LockClosedIcon,
  LockOpenIcon,
} from "@heroicons/react/24/outline";
import {
  encodeFunctionData,
  formatEther,
  formatUnits,
  isAddress,
  parseEther,
  parseUnits,
  type Address,
  type PublicClient,
} from "viem";
import {
  CHAIN_SEPOLIA,
  AAStarAirAccountV7ABI,
  ERC20ABI,
  PolicyRegistryABI,
  getCanonicalAddresses,
  type GuardConfig,
  type GuardTokenConfig,
  type GuardCall,
} from "@aastar/sdk/core";
import { startAuthentication } from "@simplewebauthn/browser";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import Layout from "@/components/Layout";
import { useDashboard } from "@/contexts/DashboardContext";
import { transferAPI } from "@/lib/api";
import { buildGuardClient, ensureSdkConfig, getPublicClient } from "@/lib/sdk/client";

const ZERO = "0x0000000000000000000000000000000000000000";

export default function GuardPage() {
  const { t } = useTranslation();
  const { data } = useDashboard();
  const account = data.account?.address as Address | undefined;

  const [publicClient] = useState<PublicClient>(() => {
    ensureSdkConfig(CHAIN_SEPOLIA);
    return getPublicClient();
  });

  // undefined = loading, null = this account has no guard, Address = the guard.
  const [guardAddr, setGuardAddr] = useState<Address | null | undefined>(undefined);
  const [cfg, setCfg] = useState<GuardConfig | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  // ETH daily-limit form + strict mode use cfg directly.
  const [newEthLimit, setNewEthLimit] = useState("");

  // Token config viewer / editor.
  const [tokenInput, setTokenInput] = useState("");
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [tokenCfg, setTokenCfg] = useState<GuardTokenConfig | null>(null);
  const [tokenSpent, setTokenSpent] = useState<bigint | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tier1, setTier1] = useState("");
  const [tier2, setTier2] = useState("");
  const [tokenDaily, setTokenDaily] = useState("");
  const [newTokenDaily, setNewTokenDaily] = useState("");

  // Layer-1 PolicyRegistry (per-account on-chain policy the DVT network enforces).
  type EthPolicy = {
    dvtTriggerAmount: bigint;
    perTxHardCap: bigint;
    dailyLimit: bigint;
    windowSeconds: bigint;
    configured: boolean;
  };
  const [frozen, setFrozen] = useState<boolean | null>(null);
  const [ethPol, setEthPol] = useState<EthPolicy | null>(null);
  const policyAddr = getCanonicalAddresses(CHAIN_SEPOLIA)?.policyRegistry as Address | undefined;

  const guard = useMemo(
    () => (guardAddr ? buildGuardClient(publicClient, guardAddr) : null),
    [publicClient, guardAddr]
  );

  const loadConfig = useCallback(async () => {
    if (!guard) return;
    try {
      setCfg(await guard.getConfig());
    } catch {
      /* best-effort */
    }
  }, [guard]);

  // Read the account's Layer-1 policy: frozen flag + native-ETH asset policy.
  const loadPolicy = useCallback(async () => {
    if (!account || !policyAddr) return;
    try {
      const sentinel = (await publicClient.readContract({
        address: policyAddr,
        abi: PolicyRegistryABI,
        functionName: "ETH_SENTINEL",
      })) as Address;
      const [fz, pol] = await Promise.all([
        publicClient.readContract({
          address: policyAddr,
          abi: PolicyRegistryABI,
          functionName: "isFrozen",
          args: [account],
        }),
        publicClient.readContract({
          address: policyAddr,
          abi: PolicyRegistryABI,
          functionName: "getAssetPolicy",
          args: [account, sentinel],
        }),
      ]);
      setFrozen(fz as boolean);
      setEthPol(pol as EthPolicy);
    } catch {
      /* registry unreachable — leave nulls */
    }
  }, [account, policyAddr, publicClient]);

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);

  // Freeze / unfreeze the account on the registry, routed through the AirAccount UserOp.
  const policyCall = (fn: "freezeSender" | "unfreezeSender"): GuardCall => ({
    to: policyAddr as Address,
    data: encodeFunctionData({
      abi: PolicyRegistryABI,
      functionName: fn,
      args: [account as Address],
    }),
    value: 0n,
  });

  // Resolve the account's guard() and its config.
  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    (async () => {
      try {
        const g = (await publicClient.readContract({
          address: account,
          abi: AAStarAirAccountV7ABI,
          functionName: "guard",
        })) as Address;
        if (cancelled) return;
        if (!g || g.toLowerCase() === ZERO) {
          setGuardAddr(null);
          return;
        }
        setGuardAddr(g);
      } catch {
        // Account not deployed yet, or no guard() — treat as no guard.
        if (!cancelled) setGuardAddr(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account, publicClient]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  // Submit a guard call through the AirAccount's two-phase device-passkey UserOp
  // (gasless via PaymasterV4). Guard writes are onlyAccount, so they MUST go
  // through the account — GuardClient only produces calldata.
  const submitGuardCall = async (key: string, call: GuardCall) => {
    setSubmitting(key);
    const loading = toast.loading(t("guardPage.confirming"));
    try {
      const canonical = getCanonicalAddresses(CHAIN_SEPOLIA);
      const prep = await transferAPI.prepare({
        to: call.to,
        amount: "0",
        data: call.data,
        usePaymaster: true,
        paymasterAddress: canonical?.paymasterV4,
      });
      const credential = await startAuthentication({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        optionsJSON: prep.data.publicKeyOptions as any,
      });
      await transferAPI.submit({
        transferId: prep.data.transferId,
        challengeId: prep.data.challengeId,
        credential,
      });
      toast.success(t("guardPage.updated"));
      await loadConfig();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("guardPage.failed"));
    } finally {
      toast.dismiss(loading);
      setSubmitting(null);
    }
  };

  const lookupToken = async () => {
    const addr = tokenInput.trim();
    if (!isAddress(addr) || !guard) {
      toast.error(t("guardPage.invalidToken"));
      return;
    }
    setTokenLoading(true);
    try {
      const [dec, tc, spent] = await Promise.all([
        publicClient
          .readContract({ address: addr as Address, abi: ERC20ABI, functionName: "decimals" })
          .catch(() => 18),
        guard.getTokenConfig(addr as Address),
        guard.getTokenTodaySpent(addr as Address),
      ]);
      setTokenDecimals(Number(dec));
      setTokenCfg(tc);
      setTokenSpent(spent);
    } catch {
      toast.error(t("guardPage.tokenReadFailed"));
    } finally {
      setTokenLoading(false);
    }
  };

  const tokenConfigured =
    tokenCfg != null &&
    (tokenCfg.tier1Limit > 0n || tokenCfg.tier2Limit > 0n || tokenCfg.dailyLimit > 0n);

  if (!account) {
    return (
      <Layout requireAuth>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("guardPage.noAccount")}</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout requireAuth>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldExclamationIcon className="h-7 w-7 text-slate-700 dark:text-emerald-400" />
            {t("guardPage.title")}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("guardPage.subtitle")}</p>
        </div>

        {guardAddr === undefined ? (
          <div className="flex justify-center py-10">
            <ArrowPathIcon className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : guardAddr === null ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 text-center">
            <ShieldExclamationIcon className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600" />
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {t("guardPage.noGuard")}
            </p>
          </div>
        ) : (
          <>
            {/* ETH policy */}
            <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t("guardPage.ethPolicy")}
                </h2>
                <span className="text-[11px] font-mono text-gray-400">{guardAddr}</span>
              </div>
              {cfg ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <Stat
                      label={t("guardPage.dailyLimit")}
                      v={`${formatEther(cfg.dailyLimit)} ETH`}
                    />
                    <Stat
                      label={t("guardPage.remaining")}
                      v={`${formatEther(cfg.remainingDailyAllowance)} ETH`}
                    />
                    <Stat
                      label={t("guardPage.spentToday")}
                      v={`${formatEther(cfg.todaySpent)} ETH`}
                    />
                    <Stat
                      label={t("guardPage.minLimit")}
                      v={`${formatEther(cfg.minDailyLimit)} ETH`}
                    />
                  </div>

                  {/* Decrease ETH daily limit (decrease-only, ≥ minDailyLimit) */}
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                      {t("guardPage.decreaseDailyLimit")}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={newEthLimit}
                        onChange={e => setNewEthLimit(e.target.value)}
                        placeholder={formatEther(cfg.dailyLimit)}
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        disabled={submitting != null || !newEthLimit}
                        onClick={() => {
                          const wei = parseEther(newEthLimit || "0");
                          if (wei >= cfg.dailyLimit)
                            return toast.error(t("guardPage.onlyDecrease"));
                          if (wei < cfg.minDailyLimit) return toast.error(t("guardPage.belowMin"));
                          void submitGuardCall("eth", guard!.encodeDecreaseDailyLimit(wei));
                        }}
                        className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
                      >
                        {submitting === "eth" ? "…" : t("guardPage.apply")}
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-400">{t("guardPage.monotonicHint")}</p>
                  </div>

                  {/* Strict mode toggle */}
                  <button
                    disabled={submitting != null}
                    onClick={() =>
                      void submitGuardCall("strict", guard!.encodeSetStrictMode(!cfg.strictMode))
                    }
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 hover:border-gray-300 disabled:opacity-50"
                  >
                    {cfg.strictMode ? (
                      <LockClosedIcon className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <LockOpenIcon className="h-4 w-4 text-amber-500" />
                    )}
                    {cfg.strictMode
                      ? t("guardPage.strictOnDisable")
                      : t("guardPage.strictOffEnable")}
                  </button>
                </>
              ) : (
                <ArrowPathIcon className="h-5 w-5 animate-spin text-gray-400 mx-auto" />
              )}
            </section>

            {/* Per-token policy */}
            <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("guardPage.tokenPolicy")}
              </h2>
              <div className="flex gap-2">
                <input
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  placeholder="0x… (token address)"
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  disabled={tokenLoading}
                  onClick={lookupToken}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
                >
                  {tokenLoading ? "…" : t("guardPage.lookup")}
                </button>
              </div>

              {tokenCfg && (
                <div className="space-y-3">
                  {tokenConfigured ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <Stat label="Tier-1" v={formatUnits(tokenCfg.tier1Limit, tokenDecimals)} />
                        <Stat label="Tier-2" v={formatUnits(tokenCfg.tier2Limit, tokenDecimals)} />
                        <Stat
                          label={t("guardPage.dailyLimit")}
                          v={formatUnits(tokenCfg.dailyLimit, tokenDecimals)}
                        />
                        <Stat
                          label={t("guardPage.spentToday")}
                          v={tokenSpent != null ? formatUnits(tokenSpent, tokenDecimals) : "—"}
                        />
                      </div>
                      {/* Decrease this token's daily limit */}
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={newTokenDaily}
                          onChange={e => setNewTokenDaily(e.target.value)}
                          placeholder={t("guardPage.newTokenDaily")}
                          className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          disabled={submitting != null || !newTokenDaily}
                          onClick={() => {
                            const v = parseUnits(newTokenDaily || "0", tokenDecimals);
                            if (v >= tokenCfg.dailyLimit)
                              return toast.error(t("guardPage.onlyDecrease"));
                            void submitGuardCall(
                              "tokenDaily",
                              guard!.encodeDecreaseTokenDailyLimit(tokenInput.trim() as Address, v)
                            );
                          }}
                          className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
                        >
                          {submitting === "tokenDaily" ? "…" : t("guardPage.apply")}
                        </button>
                      </div>
                    </>
                  ) : (
                    /* Add a config for an unconfigured token (add-only) */
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t("guardPage.notConfigured")}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="number"
                          value={tier1}
                          onChange={e => setTier1(e.target.value)}
                          placeholder="Tier-1"
                          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <input
                          type="number"
                          value={tier2}
                          onChange={e => setTier2(e.target.value)}
                          placeholder="Tier-2"
                          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <input
                          type="number"
                          value={tokenDaily}
                          onChange={e => setTokenDaily(e.target.value)}
                          placeholder={t("guardPage.dailyLimit")}
                          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <button
                        disabled={submitting != null || (!tier1 && !tier2 && !tokenDaily)}
                        onClick={() =>
                          void submitGuardCall(
                            "addToken",
                            guard!.encodeAddTokenConfig(tokenInput.trim() as Address, {
                              tier1Limit: parseUnits(tier1 || "0", tokenDecimals),
                              tier2Limit: parseUnits(tier2 || "0", tokenDecimals),
                              dailyLimit: parseUnits(tokenDaily || "0", tokenDecimals),
                            })
                          )
                        }
                        className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
                      >
                        {submitting === "addToken" ? "…" : t("guardPage.addConfig")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Layer-1 recipient policy (PolicyRegistry) — read state + emergency freeze. */}
            {policyAddr && (
              <section className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {t("guardPage.policyTitle")}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {t("guardPage.policySubtitle")}
                </p>
                {frozen === null ? (
                  <ArrowPathIcon className="h-5 w-5 animate-spin text-gray-400 mx-auto mt-4" />
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <Stat
                        label={t("guardPage.policyStatus")}
                        v={frozen ? t("guardPage.policyFrozen") : t("guardPage.policyActive")}
                      />
                      {ethPol?.configured ? (
                        <>
                          <Stat
                            label={t("guardPage.policyPerTx")}
                            v={formatEther(ethPol.perTxHardCap)}
                          />
                          <Stat
                            label={t("guardPage.policyDvtTrigger")}
                            v={formatEther(ethPol.dvtTriggerAmount)}
                          />
                          <Stat
                            label={t("guardPage.policyDaily")}
                            v={formatEther(ethPol.dailyLimit)}
                          />
                        </>
                      ) : (
                        <div className="col-span-2 text-xs text-gray-400">
                          {t("guardPage.policyNotConfigured")}
                        </div>
                      )}
                    </div>
                    <button
                      disabled={submitting != null || !account}
                      onClick={async () => {
                        await submitGuardCall(
                          "freeze",
                          policyCall(frozen ? "unfreezeSender" : "freezeSender")
                        );
                        void loadPolicy();
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm hover:border-gray-300 disabled:opacity-50"
                    >
                      {frozen ? (
                        <LockOpenIcon className="h-4 w-4 text-amber-500" />
                      ) : (
                        <LockClosedIcon className="h-4 w-4 text-red-500" />
                      )}
                      <span className={frozen ? "text-amber-600" : "text-red-600"}>
                        {submitting === "freeze"
                          ? "…"
                          : frozen
                            ? t("guardPage.policyUnfreeze")
                            : t("guardPage.policyFreeze")}
                      </span>
                    </button>
                    <p className="text-[11px] text-gray-400">{t("guardPage.policyLoosenHint")}</p>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2">
      <div className="text-gray-400">{label}</div>
      <div className="font-mono text-gray-900 dark:text-white truncate">{v}</div>
    </div>
  );
}
