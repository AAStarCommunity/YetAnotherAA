"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CurrencyDollarIcon,
  ArrowPathIcon,
  BoltIcon,
  WalletIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { formatUnits, isAddress, type Address, type PublicClient, type WalletClient } from "viem";
import { CHAIN_SEPOLIA } from "@aastar/sdk/core";
import {
  usd,
  type SaleTokenKind,
  type PayToken,
  type SaleBalances,
  type SalePrices,
} from "@aastar/sdk/tokens";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import Layout from "@/components/Layout";
import { useDashboard } from "@/contexts/DashboardContext";
import {
  buildTokenSaleClient,
  connectWallet,
  ensureChain,
  ensureSdkConfig,
  getPublicClient,
} from "@/lib/sdk/client";

type BuyMode = "GASLESS" | "SELFPAY";

const SHORT = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
const ETHERSCAN_TX = (h: string) => `https://sepolia.etherscan.io/tx/${h}`;

export default function TokensPage() {
  const { t } = useTranslation();
  const { data } = useDashboard();
  const airAccount = data.account?.address as Address | undefined;

  const [publicClient] = useState<PublicClient>(() => {
    ensureSdkConfig(CHAIN_SEPOLIA);
    return getPublicClient();
  });
  const [eoa, setEoa] = useState<Address | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [connecting, setConnecting] = useState(false);

  const [token, setToken] = useState<SaleTokenKind>("APNTS");
  const [mode, setMode] = useState<BuyMode>("GASLESS");
  const [payToken, setPayToken] = useState<PayToken>("USDC");
  const [usdAmount, setUsdAmount] = useState("10");
  const [recipient, setRecipient] = useState<string>("");

  const [prices, setPrices] = useState<SalePrices | null>(null);
  const [balances, setBalances] = useState<SaleBalances | null>(null);
  const [quoteOut, setQuoteOut] = useState<bigint | null>(null);
  const [buying, setBuying] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);

  // Read-only sale client for prices/quotes before a wallet connects.
  const readSale = useMemo(() => buildTokenSaleClient(publicClient), [publicClient]);

  // Gasless can deliver to any recipient — default to the user's AirAccount so
  // points land where in-app gasless spending happens. Self-pay (USDC/USDT) has
  // no recipient param in the SDK, so it always credits the paying EOA.
  useEffect(() => {
    if (airAccount && !recipient) setRecipient(airAccount);
  }, [airAccount, recipient]);

  useEffect(() => {
    readSale
      .getPrices()
      .then(setPrices)
      .catch(() => null);
  }, [readSale]);

  const refreshBalances = useCallback(
    async (addr: Address) => {
      try {
        setBalances(await readSale.getBalances(addr));
      } catch {
        /* balances are best-effort */
      }
    },
    [readSale]
  );

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { address, walletClient: wc } = await connectWallet();
      const onChain = await ensureChain(CHAIN_SEPOLIA);
      if (!onChain) {
        toast.error(t("tokensPage.switchSepolia"));
        return;
      }
      setEoa(address);
      setWalletClient(wc);
      await refreshBalances(address);
      // Smart default (mirrors launch): low ETH → gasless, else self-pay.
      const ethBal = await publicClient.getBalance({ address });
      setMode(ethBal < 5_000_000_000_000_000n ? "GASLESS" : "SELFPAY");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("tokensPage.connectFailed"));
    } finally {
      setConnecting(false);
    }
  };

  // Quote (debounced) — tokens out for the entered USD amount.
  useEffect(() => {
    const amt = parseFloat(usdAmount);
    if (!amt || amt <= 0) {
      setQuoteOut(null);
      return;
    }
    let cancelled = false;
    const id = setTimeout(() => {
      readSale
        .quote(token, usd(amt))
        .then(out => !cancelled && setQuoteOut(out))
        .catch(() => !cancelled && setQuoteOut(null));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [usdAmount, token, readSale]);

  // Gasless is USDC-only (EIP-3009); force USDC when in gasless mode.
  useEffect(() => {
    if (mode === "GASLESS") setPayToken("USDC");
  }, [mode]);

  const handleBuy = async () => {
    const amt = parseFloat(usdAmount);
    if (!walletClient || !eoa) return;
    if (!amt || amt <= 0) {
      toast.error(t("tokensPage.enterAmount"));
      return;
    }
    // Resolve + validate the delivery address up front (gasless can deliver to a
    // user-typed recipient; a typo must not silently send funds to a bad address).
    const to: Address =
      mode === "GASLESS" && recipient.trim() ? (recipient.trim() as Address) : eoa;
    if (mode === "GASLESS" && !isAddress(to)) {
      toast.error(t("tokensPage.invalidRecipient"));
      return;
    }
    // Re-check the wallet is still on Sepolia — the user may have switched chains
    // after connecting (ensureChain is a no-op prompt when already correct).
    if (!(await ensureChain(CHAIN_SEPOLIA))) {
      toast.error(t("tokensPage.switchSepolia"));
      return;
    }
    setBuying(true);
    setLastTx(null);
    const loading = toast.loading(
      mode === "GASLESS" ? t("tokensPage.signing") : t("tokensPage.confirming")
    );
    try {
      const sale = buildTokenSaleClient(publicClient, walletClient);
      const amount = usd(amt);
      // Slippage guard: require ≥98% of a fresh quote, so a price move / sandwich
      // can't fill at an arbitrary rate. The SDK defaults minOut to 0n (accept
      // anything) — see aastar-sdk / launch#20. Re-quote here so the floor isn't
      // stale. (aPNTs self-pay has no on-chain minOut param yet — aastar-sdk#147.)
      const quoted = await sale.quote(token, amount);
      if (quoted === 0n) {
        toast.error(t("tokensPage.amountTooSmall"));
        return;
      }
      const minOut = (quoted * 98n) / 100n;
      let result;
      if (mode === "GASLESS") {
        result = await sale.buyGasless({ token, usdAmount: amount, recipient: to, minOut });
      } else {
        // aPNTs self-pay (buyAPNTs) has no on-chain minOut param yet — passing
        // minOut>0 there is rejected by the SDK (aastar-sdk#147), and aPNTs +
        // self-pay is the default landing path, so omit minOut for it. GToken
        // self-pay (buyTokens) does take it.
        result = await sale.buySelfPay({
          token,
          usdAmount: amount,
          payToken,
          ...(token === "GTOKEN" ? { minOut } : {}),
        });
      }
      setLastTx(result.txHash);
      toast.success(t("tokensPage.submitted"));
      await refreshBalances(eoa);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("tokensPage.purchaseFailed"));
    } finally {
      toast.dismiss(loading);
      setBuying(false);
    }
  };

  const tokenLabel = token === "GTOKEN" ? "GToken" : "aPNTs";
  const priceFor = prices ? (token === "GTOKEN" ? prices.gToken : prices.aPNTs) : null;

  return (
    <Layout requireAuth>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CurrencyDollarIcon className="h-7 w-7 text-slate-700 dark:text-emerald-400" />
            {t("tokensPage.title")}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t("tokensPage.subtitle")}
          </p>
        </div>

        {/* Wallet */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          {eoa ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <WalletIcon className="h-4 w-4" /> {t("tokensPage.connected")}
                </span>
                <span className="font-mono text-sm text-gray-900 dark:text-white">
                  {SHORT(eoa)}
                </span>
              </div>
              {balances && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <Bal label="ETH" v={formatUnits(balances.eth, 18)} />
                  <Bal label="USDC" v={formatUnits(balances.usdc, 6)} />
                  <Bal label="USDT" v={formatUnits(balances.usdt, 6)} />
                  <Bal label="GToken" v={formatUnits(balances.gToken, 18)} />
                  <Bal label="aPNTs" v={formatUnits(balances.aPNTs, 18)} />
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
            >
              {connecting ? t("tokensPage.connecting") : t("tokensPage.connect")}
            </button>
          )}
        </section>

        {/* Buy form */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-5">
          {/* Token selector */}
          <div className="grid grid-cols-2 gap-3">
            {(["GTOKEN", "APNTS"] as SaleTokenKind[]).map(k => (
              <button
                key={k}
                onClick={() => setToken(k)}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  token === k
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                }`}
              >
                <div className="font-semibold text-gray-900 dark:text-white">
                  {k === "GTOKEN" ? "GToken" : "aPNTs"}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {k === "GTOKEN" ? t("tokensPage.gtokenSub") : t("tokensPage.apntsSub")}
                </div>
              </button>
            ))}
          </div>

          {/* Mode tabs */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
            <button
              onClick={() => setMode("GASLESS")}
              className={`flex-1 py-2 flex items-center justify-center gap-1.5 ${
                mode === "GASLESS"
                  ? "bg-emerald-500 text-white"
                  : "text-gray-600 dark:text-gray-300"
              }`}
            >
              <BoltIcon className="h-4 w-4" /> {t("tokensPage.modeGasless")}
            </button>
            <button
              onClick={() => setMode("SELFPAY")}
              className={`flex-1 py-2 ${
                mode === "SELFPAY" ? "bg-slate-900 text-white" : "text-gray-600 dark:text-gray-300"
              }`}
            >
              {t("tokensPage.modeSelfpay")}
            </button>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            {mode === "GASLESS" ? t("tokensPage.gaslessDesc") : t("tokensPage.selfpayDesc")}
          </p>

          {/* Pay token (self-pay only) */}
          {mode === "SELFPAY" && (
            <div className="flex gap-2 text-sm">
              {(["USDC", "USDT"] as PayToken[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPayToken(p)}
                  className={`px-4 py-1.5 rounded-full border ${
                    payToken === p
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
                      : "border-gray-200 dark:border-gray-700 text-gray-500"
                  }`}
                >
                  {p}
                </button>
              ))}
              <span
                className="px-4 py-1.5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 cursor-not-allowed"
                title="Needs an oracle upgrade"
              >
                {t("tokensPage.wethSoon")}
              </span>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
              {t("tokensPage.spend", { token: mode === "GASLESS" ? "USDC" : payToken })}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                $
              </span>
              <input
                type="number"
                value={usdAmount}
                onChange={e => setUsdAmount(e.target.value)}
                placeholder="10"
                className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-xs">
              <span className="text-gray-400">
                {priceFor ? `1 ${tokenLabel} ≈ $${formatUnits(priceFor, 6)}` : "—"}
              </span>
              <span className="text-gray-700 dark:text-gray-300">
                ≈{" "}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {quoteOut != null ? Number(formatUnits(quoteOut, 18)).toFixed(2) : "—"}{" "}
                  {tokenLabel}
                </span>
              </span>
            </div>
          </div>

          {/* Recipient (gasless only — self-pay credits the paying EOA) */}
          {mode === "GASLESS" && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                {t("tokensPage.deliverTo")} {airAccount ? t("tokensPage.deliverDefault") : ""}
              </label>
              <input
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                placeholder="0x…"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}
          {mode === "SELFPAY" && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t("tokensPage.selfpayNote", { addr: SHORT(eoa ?? undefined) })}
            </p>
          )}

          <button
            onClick={handleBuy}
            disabled={!eoa || buying}
            className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {buying ? (
              <ArrowPathIcon className="h-5 w-5 animate-spin mx-auto" />
            ) : !eoa ? (
              t("tokensPage.connectFirst")
            ) : (
              t("tokensPage.buy", { token: tokenLabel })
            )}
          </button>

          {lastTx && (
            <a
              href={ETHERSCAN_TX(lastTx)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              {t("tokensPage.viewTx")} <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </a>
          )}
        </section>
      </div>
    </Layout>
  );
}

function Bal({ label, v }: { label: string; v: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2">
      <div className="text-gray-400">{label}</div>
      <div className="font-mono text-gray-900 dark:text-white truncate">
        {Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 })}
      </div>
    </div>
  );
}
