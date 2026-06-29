"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowPathIcon, CheckCircleIcon, ArrowTrendingUpIcon } from "@heroicons/react/24/outline";
import {
  createWalletClient,
  custom,
  formatEther,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { CHAIN_SEPOLIA, AAStarAirAccountV7ABI, getCanonicalAddresses } from "@aastar/sdk/core";
import {
  modifyTierLimitsGuardianDigestFromChain,
  encodeModifyTierLimitsWithGuardians,
} from "@aastar/sdk/airaccount";
import { startAuthentication } from "@simplewebauthn/browser";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import Layout from "@/components/Layout";
import { useDashboard } from "@/contexts/DashboardContext";
import { transferAPI } from "@/lib/api";
import { ensureSdkConfig, getPublicClient } from "@/lib/sdk/client";

const CHAIN_ID = 11155111n;
// Contract RECOVERY_THRESHOLD — modifyTierLimitsWithGuardians needs this many DISTINCT
// guardian signatures over the change digest.
const GUARDIAN_QUORUM = 2;

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
function injected(): Eip1193 | undefined {
  return typeof window === "undefined"
    ? undefined
    : (window as unknown as { ethereum?: Eip1193 }).ethereum;
}

export default function TierRaisePage() {
  const { t } = useTranslation();
  const { data } = useDashboard();
  const account = data.account?.address as Address | undefined;

  const [publicClient] = useState<PublicClient>(() => {
    ensureSdkConfig(CHAIN_SEPOLIA);
    return getPublicClient();
  });

  const [current, setCurrent] = useState<{ t1: bigint; t2: bigint } | undefined>(undefined);
  const [t1, setT1] = useState("");
  const [t2, setT2] = useState("");
  const [busy, setBusy] = useState(false);
  // Active raise: the digest the guardians sign + the deadline bound into it (must be reused
  // verbatim at submit), and the collected distinct guardian signatures.
  const [pending, setPending] = useState<{ digest: Hex; deadline: bigint } | null>(null);
  const [sigs, setSigs] = useState<{ signer: string; sig: Hex }[]>([]);

  const load = useCallback(async () => {
    if (!account) return;
    try {
      const [a, b] = await Promise.all([
        publicClient.readContract({
          address: account,
          abi: AAStarAirAccountV7ABI,
          functionName: "tier1Limit",
        }),
        publicClient.readContract({
          address: account,
          abi: AAStarAirAccountV7ABI,
          functionName: "tier2Limit",
        }),
      ]);
      setCurrent({ t1: a as bigint, t2: b as bigint });
    } catch {
      setCurrent({ t1: 0n, t2: 0n });
    }
  }, [account, publicClient]);

  useEffect(() => {
    void load();
  }, [load]);

  // Step 1 — compute the on-chain change digest the guardians must sign.
  const start = async () => {
    if (!account) return;
    let nt1: bigint, nt2: bigint;
    try {
      nt1 = parseEther(t1);
      nt2 = parseEther(t2);
    } catch {
      toast.error(t("tierRaise.badAmount"));
      return;
    }
    if (nt2 > 0n && nt1 > nt2) {
      toast.error(t("tierRaise.t1GtT2"));
      return;
    }
    setBusy(true);
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // +1h
      const digest = (await modifyTierLimitsGuardianDigestFromChain({
        client: publicClient as never,
        account,
        chainId: CHAIN_ID,
        tier1Limit: nt1,
        tier2Limit: nt2,
        deadline,
      })) as Hex;
      setPending({ digest, deadline });
      setSigs([]);
      toast.success(t("tierRaise.digestReady"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("tierRaise.failed"));
    } finally {
      setBusy(false);
    }
  };

  // Step 2 — collect one guardian signature (eth-prefixed) over the digest from the currently
  // selected injected-wallet account; reject duplicates so the quorum is DISTINCT guardians.
  const collectSig = async () => {
    if (!pending) return;
    const eth = injected();
    if (!eth) {
      toast.error(t("tierRaise.needWallet"));
      return;
    }
    setBusy(true);
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
      const signer = accounts?.[0]?.toLowerCase();
      if (!signer) throw new Error(t("tierRaise.needWallet"));
      if (sigs.some(s => s.signer === signer)) {
        toast.error(t("tierRaise.switchAccount"));
        return;
      }
      const wallet = createWalletClient({ transport: custom(eth) });
      const sig = (await wallet.signMessage({
        account: accounts[0],
        message: { raw: pending.digest },
      })) as Hex;
      setSigs(prev => [...prev, { signer, sig }]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("tierRaise.failed"));
    } finally {
      setBusy(false);
    }
  };

  // Step 3 — encode modifyTierLimitsWithGuardians and submit it as the account's own gasless
  // self-call UserOp (device-passkey ceremony), same path as profile setup.
  const submit = async () => {
    if (!account || !pending || sigs.length < GUARDIAN_QUORUM) return;
    setBusy(true);
    const id = toast.loading(t("tierRaise.submitting"));
    try {
      const nt1 = parseEther(t1);
      const nt2 = parseEther(t2);
      const call = encodeModifyTierLimitsWithGuardians(
        account,
        nt1,
        nt2,
        pending.deadline,
        sigs.map(s => s.sig)
      ) as { to: Address; data: Hex };
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
      const res = await transferAPI.submit({
        transferId: prep.data.transferId,
        challengeId: prep.data.challengeId,
        credential,
      });
      // success:false (not a throw) when the bundler/paymaster rejects the UserOp — surface it.
      const r = res.data as { success?: boolean; message?: string } | undefined;
      if (r && r.success === false) throw new Error(r.message || t("tierRaise.failed"));
      toast.success(t("tierRaise.done"), { id });
      setPending(null);
      setSigs([]);
      setT1("");
      setT2("");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("tierRaise.failed"), { id });
    } finally {
      setBusy(false);
    }
  };

  if (!account) {
    return (
      <Layout requireAuth>
        <div className="max-w-xl mx-auto px-4 py-10">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("tierRaise.noAccount")}</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout requireAuth>
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2">
          <ArrowTrendingUpIcon className="h-6 w-6 text-emerald-500" />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t("tierRaise.title")}
          </h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("tierRaise.subtitle")}</p>

        {current === undefined ? (
          <ArrowPathIcon className="h-5 w-5 animate-spin text-gray-400 mx-auto mt-8" />
        ) : (
          <>
            <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
              {t("tierRaise.currentLimits", {
                t1: formatEther(current.t1),
                t2: formatEther(current.t2),
              })}
            </p>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <label className="text-xs text-gray-600 dark:text-gray-300">
                {t("tierRaise.newTier1")}
                <input
                  value={t1}
                  onChange={e => setT1(e.target.value)}
                  disabled={!!pending || busy}
                  placeholder="0.5"
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm disabled:opacity-50"
                />
              </label>
              <label className="text-xs text-gray-600 dark:text-gray-300">
                {t("tierRaise.newTier2")}
                <input
                  value={t2}
                  onChange={e => setT2(e.target.value)}
                  disabled={!!pending || busy}
                  placeholder="2"
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm disabled:opacity-50"
                />
              </label>
            </div>

            {!pending ? (
              <button
                onClick={() => void start()}
                disabled={busy || !t1 || !t2}
                className="mt-4 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {t("tierRaise.start")}
              </button>
            ) : (
              <div className="mt-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-900/10 p-4">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {t("tierRaise.collectTitle", { quorum: GUARDIAN_QUORUM })}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                  {t("tierRaise.collectHint")}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  {Array.from({ length: GUARDIAN_QUORUM }).map((_, i) => (
                    <span
                      key={i}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                        i < sigs.length
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {i < sigs.length && <CheckCircleIcon className="h-3.5 w-3.5" />}
                      {t("tierRaise.guardianN", { n: i + 1 })}
                    </span>
                  ))}
                </div>
                {sigs.length < GUARDIAN_QUORUM ? (
                  <button
                    onClick={() => void collectSig()}
                    disabled={busy}
                    className="mt-3 w-full py-2 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {t("tierRaise.collectBtn", { i: sigs.length + 1, n: GUARDIAN_QUORUM })}
                  </button>
                ) : (
                  <button
                    onClick={() => void submit()}
                    disabled={busy}
                    className="mt-3 w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {t("tierRaise.submit")}
                  </button>
                )}
                <button
                  onClick={() => {
                    setPending(null);
                    setSigs([]);
                  }}
                  disabled={busy}
                  className="mt-2 w-full py-1.5 text-xs text-gray-500 dark:text-gray-400 disabled:opacity-50"
                >
                  {t("tierRaise.cancel")}
                </button>
              </div>
            )}

            <p className="mt-4 text-[11px] text-gray-400">{t("tierRaise.note")}</p>
          </>
        )}
      </div>
    </Layout>
  );
}
