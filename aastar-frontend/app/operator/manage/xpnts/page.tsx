"use client";

/**
 * xPNTs management (registry flow 3).
 *
 * 1. Look up whether the connected community (operator EOA) already has an xPNTs
 *    token via xPNTsFactory.hasToken / getTokenAddress.
 * 2. If NOT deployed → deploy via xPNTsFactory.deployxPNTsToken.
 * 3. If deployed → show token metadata + exchange rate, and let the token owner
 *    mint points to a recipient (xPNTsToken.mint — caller must be the owner).
 *
 * Reads use a PublicClient (`reader()`); writes use the WalletContext WalletClient
 * cast to `any` for @aastar/core actions (two viem copies — see shared.tsx).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatEther, isAddress, parseEther } from "viem";
import type { Address } from "viem";
import toast from "react-hot-toast";
import {
  ArrowLeftIcon,
  CurrencyDollarIcon,
  ArrowPathIcon,
  PaperAirplaneIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/outline";
import {
  xPNTsFactoryActions,
  xPNTsTokenActions,
  paymasterFactoryActions,
  XPNTS_FACTORY_ADDRESS,
  PAYMASTER_FACTORY_ADDRESS,
} from "@aastar/core";
import Layout from "@/components/Layout";
import { useWallet } from "@/contexts/WalletContext";
import { ensureSdkConfig } from "@/lib/sdk/client";
import {
  ConnectGate,
  Section,
  MetricCard,
  Spinner,
  ErrorBox,
  TxLink,
  shortAddr,
  addrUrl,
  errMsg,
  eqAddr,
  reader,
} from "../_components/shared";

interface TokenInfo {
  address: Address;
  name: string;
  symbol: string;
  communityName: string;
  communityENS: string;
  communityOwner: Address;
  exchangeRate: string;
  balance: string;
}

function XPNTsManager() {
  const { address, walletClient } = useWallet();
  const operator = address as Address;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [token, setToken] = useState<TokenInfo | null>(null);

  // Deploy form
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [communityName, setCommunityName] = useState("");
  const [communityENS, setCommunityENS] = useState("");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [paymasterAOA, setPaymasterAOA] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployTx, setDeployTx] = useState("");

  // Mint form
  const [mintTo, setMintTo] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [minting, setMinting] = useState(false);
  const [mintTx, setMintTx] = useState("");

  const load = useCallback(async () => {
    if (!operator) return;
    setLoading(true);
    setLoadError("");
    try {
      ensureSdkConfig();
      const factory = xPNTsFactoryActions(XPNTS_FACTORY_ADDRESS)(reader());
      const has = await factory.hasToken({ community: operator });
      if (!has) {
        setToken(null);
        // Prefill the AOA paymaster field with the operator's deployed PaymasterV4
        // (deployxPNTsToken auto-approves it as a spender). Falls back to manual.
        try {
          const pf = paymasterFactoryActions(PAYMASTER_FACTORY_ADDRESS)(reader());
          if (await pf.hasPaymaster({ owner: operator })) {
            const pm = await pf.getPaymasterByOperator({ operator });
            setPaymasterAOA(pm);
          }
        } catch {
          /* non-fatal: leave the field for manual entry */
        }
        return;
      }
      const tokenAddress = (await factory.getTokenAddress({ community: operator })) as Address;
      const t = xPNTsTokenActions(tokenAddress)(reader());
      const [meta, rate, balance] = await Promise.all([
        t.getMetadata({ token: tokenAddress }),
        t.exchangeRate({ token: tokenAddress }),
        t.balanceOf({ token: tokenAddress, account: operator }),
      ]);
      setToken({
        address: tokenAddress,
        name: meta.name,
        symbol: meta.symbol,
        communityName: meta.communityName,
        communityENS: meta.communityENS,
        communityOwner: meta.communityOwner,
        exchangeRate: formatEther(rate),
        balance: formatEther(balance),
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

  const handleDeploy = async () => {
    if (!walletClient) return;
    if (!name || !symbol) {
      toast.error("Name and symbol are required.");
      return;
    }
    if (paymasterAOA && !isAddress(paymasterAOA)) {
      toast.error("Invalid AOA paymaster address.");
      return;
    }
    setDeploying(true);
    setDeployTx("");
    const tid = toast.loading("Confirm deployment in your wallet…");
    try {
      ensureSdkConfig();
      const factory = xPNTsFactoryActions(XPNTS_FACTORY_ADDRESS)(walletClient as never);
      const hash = await factory.deployxPNTsToken({
        name,
        symbol,
        communityName: communityName || name,
        communityENS: communityENS || "",
        exchangeRate: parseEther(exchangeRate || "1"),
        // Zero address = no AOA paymaster auto-approval yet (can bind later).
        paymasterAOA: (paymasterAOA || "0x0000000000000000000000000000000000000000") as Address,
      });
      setDeployTx(hash);
      toast.success("xPNTs token deployment submitted.", { id: tid });
      // Re-read so the UI flips to the deployed view once mined.
      setTimeout(() => void load(), 4000);
    } catch (e) {
      toast.error(errMsg(e), { id: tid });
    } finally {
      setDeploying(false);
    }
  };

  const handleMint = async () => {
    if (!walletClient || !token) return;
    if (!isAddress(mintTo)) {
      toast.error("Invalid recipient address.");
      return;
    }
    if (!mintAmount || parseFloat(mintAmount) <= 0) {
      toast.error("Enter a positive amount.");
      return;
    }
    setMinting(true);
    setMintTx("");
    const tid = toast.loading("Confirm mint in your wallet…");
    try {
      ensureSdkConfig();
      const t = xPNTsTokenActions(token.address)(walletClient as never);
      const hash = await t.mint({
        token: token.address,
        to: mintTo as Address,
        amount: parseEther(mintAmount),
      });
      setMintTx(hash);
      toast.success(`Minted ${mintAmount} ${token.symbol}.`, { id: tid });
      setMintTo("");
      setMintAmount("");
      setTimeout(() => void load(), 4000);
    } catch (e) {
      toast.error(errMsg(e), { id: tid });
    } finally {
      setMinting(false);
    }
  };

  if (loading) return <Spinner />;

  const isOwner = token ? eqAddr(token.communityOwner, operator) : false;

  return (
    <div className="space-y-6">
      <ErrorBox message={loadError} />

      {!token ? (
        /* ── Not deployed → deploy form ─────────────────────────────────── */
        <Section title="Deploy xPNTs Token">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Your community has no xPNTs token yet. Deploy one to start issuing points.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Token Name" value={name} onChange={setName} placeholder="My Community Points" />
            <Field label="Symbol" value={symbol} onChange={setSymbol} placeholder="MCP" />
            <Field
              label="Community Name"
              value={communityName}
              onChange={setCommunityName}
              placeholder="My Community"
            />
            <Field
              label="Community ENS (optional)"
              value={communityENS}
              onChange={setCommunityENS}
              placeholder="mycommunity.eth"
            />
            <Field
              label="Exchange Rate (xPNTs per aPNTs)"
              value={exchangeRate}
              onChange={setExchangeRate}
              placeholder="1"
            />
            <Field
              label="AOA Paymaster (optional)"
              value={paymasterAOA}
              onChange={setPaymasterAOA}
              placeholder="0x… (auto-approved spender)"
              mono
            />
          </div>
          <button
            onClick={() => void handleDeploy()}
            disabled={deploying}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium"
          >
            {deploying ? (
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
            ) : (
              <RocketLaunchIcon className="h-4 w-4" />
            )}
            {deploying ? "Deploying…" : "Deploy Token"}
          </button>
          {deployTx && (
            <div className="mt-3">
              <TxLink hash={deployTx} />
            </div>
          )}
        </Section>
      ) : (
        /* ── Deployed → info + mint ─────────────────────────────────────── */
        <>
          <Section
            title="xPNTs Token"
            action={
              <button
                onClick={() => void load()}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-emerald-600"
              >
                <ArrowPathIcon className="h-4 w-4" /> Refresh
              </button>
            }
          >
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <MetricCard label="Name" value={token.name} mono />
              <MetricCard label="Symbol" value={token.symbol} mono />
              <MetricCard label="Exchange Rate" value={token.exchangeRate} unit="xPNTs / aPNTs" />
              <MetricCard label="Community" value={token.communityName} mono />
              <MetricCard label="Your Balance" value={token.balance} unit={token.symbol} />
              <MetricCard label="Owner" value={shortAddr(token.communityOwner)} mono />
            </div>
            <p className="mt-3 text-xs text-gray-400 font-mono break-all">
              Token:{" "}
              <a
                href={addrUrl(token.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                {token.address}
              </a>
            </p>
          </Section>

          <Section title="Mint Points">
            {!isOwner && (
              <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-300">
                Only the token owner ({shortAddr(token.communityOwner)}) can mint. Your wallet is{" "}
                {shortAddr(operator)}.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Recipient" value={mintTo} onChange={setMintTo} placeholder="0x…" mono />
              <Field
                label={`Amount (${token.symbol})`}
                value={mintAmount}
                onChange={setMintAmount}
                placeholder="100"
              />
            </div>
            <button
              onClick={() => void handleMint()}
              disabled={minting || !isOwner}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium"
            >
              {minting ? (
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
              ) : (
                <PaperAirplaneIcon className="h-4 w-4" />
              )}
              {minting ? "Minting…" : "Mint"}
            </button>
            {mintTx && (
              <div className="mt-3">
                <TxLink hash={mintTx} />
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}

function Field({ label, value, onChange, placeholder, mono }: FieldProps) {
  return (
    <label className="block">
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
  );
}

export default function XPNTsPage() {
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
            <CurrencyDollarIcon className="h-7 w-7 text-slate-700 dark:text-emerald-400" />
            xPNTs Token
            <span className="text-sm font-normal text-gray-400">Flow 3</span>
          </h1>
        </div>
        <ConnectGate>
          <XPNTsManager />
        </ConnectGate>
      </div>
    </Layout>
  );
}
