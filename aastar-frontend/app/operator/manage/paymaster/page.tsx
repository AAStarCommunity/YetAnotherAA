"use client";

/**
 * AOA daily operations — PaymasterV4 (registry flow 6).
 *
 * Resolves the operator's deployed PaymasterV4 via PaymasterFactory, then shows
 * its config (owner / treasury / serviceFeeRate / maxGasCostCap / paused) and
 * EntryPoint deposit balance. Owner-only writes:
 *   - EntryPoint top-up   → entryPointActions.depositTo
 *   - setServiceFeeRate / setTreasury / setMaxGasCostCap / pause / unpause
 *     (all exposed on PaymasterActions — confirmed against paymaster.d.ts).
 *
 * Reads use a PublicClient (`reader()`); writes use the WalletClient cast to `any`.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { formatEther, isAddress, parseEther } from "viem";
import type { Address } from "viem";
import toast from "react-hot-toast";
import {
  ArrowLeftIcon,
  CreditCardIcon,
  ArrowPathIcon,
  PlusCircleIcon,
  PauseCircleIcon,
  PlayCircleIcon,
} from "@heroicons/react/24/outline";
import {
  paymasterActions,
  entryPointActions,
  paymasterFactoryActions,
  PAYMASTER_FACTORY_ADDRESS,
} from "@aastar/sdk/core";
import Layout from "@/components/Layout";
import { useWallet } from "@/contexts/WalletContext";
import { ensureSdkConfig } from "@/lib/sdk/client";
import {
  ConnectGate,
  Section,
  MetricCard,
  StatusBadge,
  Spinner,
  ErrorBox,
  TxLink,
  shortAddr,
  addrUrl,
  errMsg,
  eqAddr,
  reader,
} from "../_components/shared";

interface PaymasterState {
  paymasterAddress: Address;
  owner: Address;
  treasury: Address;
  serviceFeeRate: bigint;
  maxGasCostCap: bigint;
  paused: boolean;
  entryPoint: Address;
  entryPointBalance: string;
}

function AOAManager() {
  const { t } = useTranslation();
  const { address, walletClient } = useWallet();
  const operator = address as Address;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [state, setState] = useState<PaymasterState | null>(null);
  const [noPaymaster, setNoPaymaster] = useState(false);

  // Write form fields
  const [depositAmount, setDepositAmount] = useState("");
  const [feeRate, setFeeRate] = useState("");
  const [treasury, setTreasury] = useState("");
  const [gasCap, setGasCap] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState("");

  const load = useCallback(async () => {
    if (!operator) return;
    setLoading(true);
    setLoadError("");
    setNoPaymaster(false);
    try {
      ensureSdkConfig();
      const pf = paymasterFactoryActions(PAYMASTER_FACTORY_ADDRESS)(reader());
      const has = await pf.hasPaymaster({ owner: operator });
      if (!has) {
        setState(null);
        setNoPaymaster(true);
        return;
      }
      const pmAddr = (await pf.getPaymasterByOperator({ operator })) as Address;
      const pm = paymasterActions(pmAddr)(reader());
      const [owner, treasuryAddr, serviceFeeRate, maxGasCostCap, paused, entryPoint] =
        await Promise.all([
          pm.owner(),
          pm.treasury(),
          pm.serviceFeeRate(),
          pm.maxGasCostCap(),
          pm.paused(),
          pm.entryPoint(),
        ]);
      const epBal = await entryPointActions(entryPoint)(reader()).balanceOf({ account: pmAddr });
      setState({
        paymasterAddress: pmAddr,
        owner,
        treasury: treasuryAddr,
        serviceFeeRate,
        maxGasCostCap,
        paused,
        entryPoint,
        entryPointBalance: formatEther(epBal),
      });
    } catch (e) {
      setLoadError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [operator]);

  useEffect(() => {
    void load();
  }, [load]);

  // Generic write wrapper: confirm → submit → toast → reload.
  const runWrite = async (key: string, label: string, fn: () => Promise<`0x${string}`>) => {
    if (!walletClient) return;
    setBusy(key);
    setLastTx("");
    const tid = toast.loading(t("operatorManage.shared.confirmInWallet"));
    try {
      ensureSdkConfig();
      const hash = await fn();
      setLastTx(hash);
      toast.success(t("operatorManage.paymaster.toastSubmitted", { label }), { id: tid });
      setTimeout(() => void load(), 4000);
    } catch (e) {
      toast.error(errMsg(e), { id: tid });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Spinner />;

  if (noPaymaster) {
    return (
      <Section title={t("operatorManage.paymaster.noPaymasterTitle")}>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("operatorManage.paymaster.noPaymasterDescription")}
        </p>
        <ErrorBox message={loadError} />
      </Section>
    );
  }

  if (!state) {
    return <ErrorBox message={loadError || t("operatorManage.paymaster.loadFailed")} />;
  }

  const isOwner = eqAddr(state.owner, operator);
  const pm = (client: unknown) => paymasterActions(state.paymasterAddress)(client as never);

  return (
    <div className="space-y-6">
      <ErrorBox message={loadError} />

      <Section
        title={t("operatorManage.paymaster.statusTitle")}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge
              active={!state.paused}
              label={
                state.paused
                  ? t("operatorManage.paymaster.paused")
                  : t("operatorManage.paymaster.active")
              }
            />
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-emerald-600"
            >
              <ArrowPathIcon className="h-4 w-4" /> {t("operatorManage.shared.refresh")}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <MetricCard
            label={t("operatorManage.paymaster.entryPointBalance")}
            value={state.entryPointBalance}
            unit="ETH"
          />
          <MetricCard
            label={t("operatorManage.paymaster.serviceFeeRate")}
            value={state.serviceFeeRate.toString()}
            unit="bps"
          />
          <MetricCard
            label={t("operatorManage.paymaster.maxGasCostCap")}
            value={formatEther(state.maxGasCostCap)}
            unit="ETH"
          />
          <MetricCard
            label={t("operatorManage.paymaster.owner")}
            value={shortAddr(state.owner)}
            mono
          />
          <MetricCard
            label={t("operatorManage.paymaster.treasury")}
            value={shortAddr(state.treasury)}
            mono
          />
          <MetricCard
            label={t("operatorManage.paymaster.entryPoint")}
            value={shortAddr(state.entryPoint)}
            mono
          />
        </div>
        <p className="mt-3 text-xs text-gray-400 font-mono break-all">
          {t("operatorManage.paymaster.paymasterLabel")}{" "}
          <a
            href={addrUrl(state.paymasterAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            {state.paymasterAddress}
          </a>
        </p>
      </Section>

      {!isOwner && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-300">
          {t("operatorManage.paymaster.notOwnerWarning", {
            wallet: shortAddr(operator),
            owner: shortAddr(state.owner),
          })}
        </div>
      )}

      <Section title={t("operatorManage.paymaster.topUpTitle")}>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          {t("operatorManage.paymaster.topUpPrompt")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={depositAmount}
            onChange={e => setDepositAmount(e.target.value)}
            placeholder="0.1"
            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={() => {
              if (!depositAmount || parseFloat(depositAmount) <= 0) {
                toast.error(t("operatorManage.paymaster.errPositiveEth"));
                return;
              }
              void runWrite("deposit", t("operatorManage.paymaster.labelEntryPointDeposit"), () =>
                entryPointActions(state.entryPoint)(walletClient as never).depositTo({
                  account: state.paymasterAddress,
                  amount: parseEther(depositAmount),
                })
              );
            }}
            disabled={busy === "deposit"}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium"
          >
            {busy === "deposit" ? (
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
            ) : (
              <PlusCircleIcon className="h-4 w-4" />
            )}
            {t("operatorManage.paymaster.depositEth")}
          </button>
        </div>
      </Section>

      <Section title={t("operatorManage.paymaster.configTitle")}>
        <div className="space-y-4">
          {/* Service fee rate */}
          <ConfigRow
            label={t("operatorManage.paymaster.serviceFeeRateField")}
            placeholder={state.serviceFeeRate.toString()}
            value={feeRate}
            onChange={setFeeRate}
            busy={busy === "fee"}
            disabled={!isOwner}
            onSubmit={() => {
              if (feeRate === "" || isNaN(Number(feeRate))) {
                toast.error(t("operatorManage.paymaster.errFeeRate"));
                return;
              }
              void runWrite("fee", t("operatorManage.paymaster.labelServiceFeeRate"), () =>
                pm(walletClient).setServiceFeeRate({ _serviceFeeRate: BigInt(feeRate) })
              );
            }}
          />
          {/* Treasury */}
          <ConfigRow
            label={t("operatorManage.paymaster.treasuryAddress")}
            placeholder={state.treasury}
            value={treasury}
            onChange={setTreasury}
            busy={busy === "treasury"}
            disabled={!isOwner}
            mono
            onSubmit={() => {
              if (!isAddress(treasury)) {
                toast.error(t("operatorManage.paymaster.errInvalidTreasury"));
                return;
              }
              void runWrite("treasury", t("operatorManage.paymaster.labelTreasury"), () =>
                pm(walletClient).setTreasury({ treasury: treasury as Address })
              );
            }}
          />
          {/* Max gas cost cap */}
          <ConfigRow
            label={t("operatorManage.paymaster.maxGasCostCapField")}
            placeholder={formatEther(state.maxGasCostCap)}
            value={gasCap}
            onChange={setGasCap}
            busy={busy === "cap"}
            disabled={!isOwner}
            onSubmit={() => {
              if (gasCap === "" || isNaN(Number(gasCap))) {
                toast.error(t("operatorManage.paymaster.errCapEth"));
                return;
              }
              void runWrite("cap", t("operatorManage.paymaster.labelMaxGasCostCap"), () =>
                pm(walletClient).setMaxGasCostCap({ _maxGasCostCap: parseEther(gasCap) })
              );
            }}
          />
          {/* Pause / unpause */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {state.paused
                ? t("operatorManage.paymaster.currentlyPaused")
                : t("operatorManage.paymaster.currentlyActive")}
            </span>
            <button
              onClick={() =>
                void runWrite(
                  "pause",
                  state.paused
                    ? t("operatorManage.paymaster.unpause")
                    : t("operatorManage.paymaster.pause"),
                  () => (state.paused ? pm(walletClient).unpause({}) : pm(walletClient).pause({}))
                )
              }
              disabled={busy === "pause" || !isOwner}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              {state.paused ? (
                <PlayCircleIcon className="h-4 w-4" />
              ) : (
                <PauseCircleIcon className="h-4 w-4" />
              )}
              {state.paused
                ? t("operatorManage.paymaster.unpause")
                : t("operatorManage.paymaster.pause")}
            </button>
          </div>
        </div>
        {lastTx && (
          <div className="mt-4">
            <TxLink hash={lastTx} />
          </div>
        )}
      </Section>
    </div>
  );
}

interface ConfigRowProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  disabled: boolean;
  mono?: boolean;
}

function ConfigRow({
  label,
  placeholder,
  value,
  onChange,
  onSubmit,
  busy,
  disabled,
  mono,
}: ConfigRowProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col sm:flex-row sm:items-end gap-3">
      <label className="flex-1 block">
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
            mono ? "font-mono" : ""
          }`}
        />
      </label>
      <button
        onClick={onSubmit}
        disabled={busy || disabled}
        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium"
      >
        {busy ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : null}
        {t("operatorManage.paymaster.update")}
      </button>
    </div>
  );
}

export default function AOAPaymasterPage() {
  const { t } = useTranslation();
  return (
    <Layout requireAuth>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link
            href="/operator/manage"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-emerald-600"
          >
            <ArrowLeftIcon className="h-4 w-4" /> {t("operatorManage.paymaster.breadcrumb")}
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CreditCardIcon className="h-7 w-7 text-slate-700 dark:text-emerald-400" />
            {t("operatorManage.paymaster.title")}
            <span className="text-sm font-normal text-gray-400">Flow 6</span>
          </h1>
        </div>
        <ConnectGate>
          <AOAManager />
        </ConnectGate>
      </div>
    </Layout>
  );
}
