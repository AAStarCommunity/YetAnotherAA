"use client";

/**
 * AOA+ daily operations — shared SuperPaymaster operator account (registry flow 7).
 *
 * Reads the operator's SuperPaymaster config via superPaymaster.operators({operator})
 * (OperatorConfig: aPNTsBalance / isConfigured / isPaused / reputation / treasury /
 * totalSpent / totalTxSponsored / exchangeRate / xPNTsToken). Supports topping up
 * aPNTs collateral: ERC20 approve (if allowance insufficient) → superPaymaster.deposit.
 *
 * NOTE on deposit: we call superPaymasterActions(...).deposit({amount}) directly.
 * The higher-level `buildPaymasterOperatorClient(walletClient).depositCollateral(amount)`
 * (@aastar/operator) wraps the same approve+deposit and is an equivalent alternative.
 *
 * Reads use a PublicClient (`reader()`); writes use the WalletClient cast to `any`.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatEther, parseEther } from "viem";
import type { Address } from "viem";
import toast from "react-hot-toast";
import {
  ArrowLeftIcon,
  ServerStackIcon,
  ArrowPathIcon,
  PlusCircleIcon,
} from "@heroicons/react/24/outline";
import {
  superPaymasterActions,
  tokenActions,
  SUPER_PAYMASTER_ADDRESS,
  APNTS_ADDRESS,
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
  errMsg,
  reader,
} from "../_components/shared";

interface SPState {
  isConfigured: boolean;
  isPaused: boolean;
  aPNTsBalance: string;
  exchangeRate: string;
  reputation: number;
  treasury: Address;
  xPNTsToken: Address;
  totalSpent: string;
  totalTxSponsored: string;
  walletAPNTs: string;
}

function SuperPaymasterManager() {
  const { address, walletClient } = useWallet();
  const operator = address as Address;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [state, setState] = useState<SPState | null>(null);

  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [lastTx, setLastTx] = useState("");

  const load = useCallback(async () => {
    if (!operator) return;
    setLoading(true);
    setLoadError("");
    try {
      ensureSdkConfig();
      const sp = superPaymasterActions(SUPER_PAYMASTER_ADDRESS)(reader());
      const cfg = await sp.operators({ operator });
      const walletAPNTs = await tokenActions(APNTS_ADDRESS)(reader()).balanceOf({
        token: APNTS_ADDRESS,
        account: operator,
      });
      setState({
        isConfigured: cfg.isConfigured,
        isPaused: cfg.isPaused,
        aPNTsBalance: formatEther(cfg.aPNTsBalance),
        exchangeRate: formatEther(cfg.exchangeRate),
        reputation: cfg.reputation,
        treasury: cfg.treasury,
        xPNTsToken: cfg.xPNTsToken,
        totalSpent: formatEther(cfg.totalSpent),
        totalTxSponsored: cfg.totalTxSponsored.toString(),
        walletAPNTs: formatEther(walletAPNTs),
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

  const handleDeposit = async () => {
    if (!walletClient) return;
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast.error("Enter a positive aPNTs amount.");
      return;
    }
    setDepositing(true);
    setLastTx("");
    const amount = parseEther(depositAmount);
    const tid = toast.loading("Checking aPNTs allowance…");
    try {
      ensureSdkConfig();
      const apntsRead = tokenActions(APNTS_ADDRESS)(reader());
      const allowance = await apntsRead.allowance({
        token: APNTS_ADDRESS,
        owner: operator,
        spender: SUPER_PAYMASTER_ADDRESS,
      });
      if (allowance < amount) {
        toast.loading("Approve aPNTs in your wallet…", { id: tid });
        const apntsWrite = tokenActions(APNTS_ADDRESS)(walletClient as never);
        await apntsWrite.approve({
          token: APNTS_ADDRESS,
          spender: SUPER_PAYMASTER_ADDRESS,
          amount,
        });
      }
      toast.loading("Confirm deposit in your wallet…", { id: tid });
      const sp = superPaymasterActions(SUPER_PAYMASTER_ADDRESS)(walletClient as never);
      const hash = await sp.deposit({ amount });
      setLastTx(hash);
      toast.success(`Deposited ${depositAmount} aPNTs.`, { id: tid });
      setDepositAmount("");
      setTimeout(() => void load(), 4000);
    } catch (e) {
      toast.error(errMsg(e), { id: tid });
    } finally {
      setDepositing(false);
    }
  };

  if (loading) return <Spinner />;
  if (!state) return <ErrorBox message={loadError || "Failed to load operator account."} />;

  const lowBalance = parseFloat(state.aPNTsBalance) < 100;

  return (
    <div className="space-y-6">
      <ErrorBox message={loadError} />

      <Section
        title="SuperPaymaster Account"
        action={
          <div className="flex items-center gap-2">
            <StatusBadge active={state.isConfigured} label={state.isConfigured ? "Configured" : "Not configured"} />
            <StatusBadge active={!state.isPaused} label={state.isPaused ? "Paused" : "Active"} />
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-emerald-600"
            >
              <ArrowPathIcon className="h-4 w-4" /> Refresh
            </button>
          </div>
        }
      >
        {!state.isConfigured && (
          <div className="mb-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-700 dark:text-blue-300">
            This operator is not yet configured on the SuperPaymaster. Complete AOA+ registration
            (deploy flow) first; this page manages the account once configured.
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <MetricCard
            label="aPNTs Collateral"
            value={state.aPNTsBalance}
            unit="aPNTs"
            sub={lowBalance ? "⚠ Low — top up" : undefined}
          />
          <MetricCard label="Exchange Rate" value={state.exchangeRate} unit="xPNTs / aPNTs" />
          <MetricCard label="Reputation" value={state.reputation.toString()} />
          <MetricCard label="Total Spent" value={state.totalSpent} unit="aPNTs" />
          <MetricCard label="Tx Sponsored" value={state.totalTxSponsored} />
          <MetricCard label="Treasury" value={shortAddr(state.treasury)} mono />
        </div>
        <p className="mt-3 text-xs text-gray-400 font-mono break-all">
          xPNTs token: {shortAddr(state.xPNTsToken)} · Wallet aPNTs: {state.walletAPNTs}
        </p>
      </Section>

      <Section title="Top up aPNTs Collateral">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          Approve (if needed) and deposit aPNTs collateral so the SuperPaymaster can keep sponsoring
          your community&apos;s gas. Wallet balance: {state.walletAPNTs} aPNTs.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={depositAmount}
            onChange={e => setDepositAmount(e.target.value)}
            placeholder="100"
            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={() => void handleDeposit()}
            disabled={depositing}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium"
          >
            {depositing ? (
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
            ) : (
              <PlusCircleIcon className="h-4 w-4" />
            )}
            {depositing ? "Depositing…" : "Deposit aPNTs"}
          </button>
        </div>
        {lastTx && (
          <div className="mt-3">
            <TxLink hash={lastTx} />
          </div>
        )}
      </Section>
    </div>
  );
}

export default function SuperPaymasterPage() {
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
            <ServerStackIcon className="h-7 w-7 text-slate-700 dark:text-emerald-400" />
            AOA+ SuperPaymaster
            <span className="text-sm font-normal text-gray-400">Flow 7</span>
          </h1>
        </div>
        <ConnectGate>
          <SuperPaymasterManager />
        </ConnectGate>
      </div>
    </Layout>
  );
}
