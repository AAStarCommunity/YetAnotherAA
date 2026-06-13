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
} from "@aastar/core";
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
    const tid = toast.loading("Confirm in your wallet…");
    try {
      ensureSdkConfig();
      const hash = await fn();
      setLastTx(hash);
      toast.success(`${label} submitted.`, { id: tid });
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
      <Section title="No AOA Paymaster">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          This operator has not deployed a PaymasterV4 yet. Deploy one from the operator deploy flow
          first, then return here to manage it.
        </p>
        <ErrorBox message={loadError} />
      </Section>
    );
  }

  if (!state) {
    return <ErrorBox message={loadError || "Failed to load paymaster."} />;
  }

  const isOwner = eqAddr(state.owner, operator);
  const pm = (client: unknown) => paymasterActions(state.paymasterAddress)(client as never);

  return (
    <div className="space-y-6">
      <ErrorBox message={loadError} />

      <Section
        title="PaymasterV4 Status"
        action={
          <div className="flex items-center gap-2">
            <StatusBadge active={!state.paused} label={state.paused ? "Paused" : "Active"} />
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-emerald-600"
            >
              <ArrowPathIcon className="h-4 w-4" /> Refresh
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <MetricCard label="EntryPoint Balance" value={state.entryPointBalance} unit="ETH" />
          <MetricCard label="Service Fee Rate" value={state.serviceFeeRate.toString()} unit="bps" />
          <MetricCard
            label="Max Gas Cost Cap"
            value={formatEther(state.maxGasCostCap)}
            unit="ETH"
          />
          <MetricCard label="Owner" value={shortAddr(state.owner)} mono />
          <MetricCard label="Treasury" value={shortAddr(state.treasury)} mono />
          <MetricCard label="EntryPoint" value={shortAddr(state.entryPoint)} mono />
        </div>
        <p className="mt-3 text-xs text-gray-400 font-mono break-all">
          Paymaster:{" "}
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
          Your wallet ({shortAddr(operator)}) is not the paymaster owner ({shortAddr(state.owner)}).
          Configuration changes will revert. EntryPoint top-up is permissionless.
        </div>
      )}

      <Section title="EntryPoint Top-up">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          Deposit ETH into the EntryPoint for this paymaster (anyone can fund).
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
                toast.error("Enter a positive ETH amount.");
                return;
              }
              void runWrite("deposit", "EntryPoint deposit", () =>
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
            Deposit ETH
          </button>
        </div>
      </Section>

      <Section title="Configuration (owner only)">
        <div className="space-y-4">
          {/* Service fee rate */}
          <ConfigRow
            label="Service Fee Rate (bps)"
            placeholder={state.serviceFeeRate.toString()}
            value={feeRate}
            onChange={setFeeRate}
            busy={busy === "fee"}
            disabled={!isOwner}
            onSubmit={() => {
              if (feeRate === "" || isNaN(Number(feeRate))) {
                toast.error("Enter a fee rate in basis points.");
                return;
              }
              void runWrite("fee", "Service fee rate", () =>
                pm(walletClient).setServiceFeeRate({ _serviceFeeRate: BigInt(feeRate) })
              );
            }}
          />
          {/* Treasury */}
          <ConfigRow
            label="Treasury Address"
            placeholder={state.treasury}
            value={treasury}
            onChange={setTreasury}
            busy={busy === "treasury"}
            disabled={!isOwner}
            mono
            onSubmit={() => {
              if (!isAddress(treasury)) {
                toast.error("Invalid treasury address.");
                return;
              }
              void runWrite("treasury", "Treasury", () =>
                pm(walletClient).setTreasury({ treasury: treasury as Address })
              );
            }}
          />
          {/* Max gas cost cap */}
          <ConfigRow
            label="Max Gas Cost Cap (ETH)"
            placeholder={formatEther(state.maxGasCostCap)}
            value={gasCap}
            onChange={setGasCap}
            busy={busy === "cap"}
            disabled={!isOwner}
            onSubmit={() => {
              if (gasCap === "" || isNaN(Number(gasCap))) {
                toast.error("Enter a cap in ETH.");
                return;
              }
              void runWrite("cap", "Max gas cost cap", () =>
                pm(walletClient).setMaxGasCostCap({ _maxGasCostCap: parseEther(gasCap) })
              );
            }}
          />
          {/* Pause / unpause */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
            <span className="text-sm text-gray-600 dark:text-gray-300">
              Paymaster is currently {state.paused ? "paused" : "active"}.
            </span>
            <button
              onClick={() =>
                void runWrite(
                  "pause",
                  state.paused ? "Unpause" : "Pause",
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
              {state.paused ? "Unpause" : "Pause"}
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
        Update
      </button>
    </div>
  );
}

export default function AOAPaymasterPage() {
  return (
    <Layout requireAuth>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link
            href="/operator/manage"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-emerald-600"
          >
            <ArrowLeftIcon className="h-4 w-4" /> Manage
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CreditCardIcon className="h-7 w-7 text-slate-700 dark:text-emerald-400" />
            AOA Paymaster
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
