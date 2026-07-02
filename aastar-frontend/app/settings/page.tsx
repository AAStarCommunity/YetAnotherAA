"use client";

import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import toast from "react-hot-toast";
import {
  getApiKey,
  setApiKey,
  clearApiKey,
  getKmsUrl,
  setKmsUrl,
  getBundlerUrl,
  setBundlerUrl,
  getRpcUrl,
  setRpcUrl,
  getRelayUrl,
  setRelayUrl,
} from "@/lib/api-key-store";
import { kmsBaseUrl, isDirectKmsReady, pingKms } from "@/lib/kms-client";

export default function SettingsPage() {
  const [apiKey, setApiKeyInput] = useState("");
  const [kmsUrl, setKmsUrlInput] = useState("");
  const [bundlerUrl, setBundlerUrlInput] = useState("");
  const [rpcUrl, setRpcUrlInput] = useState("");
  const [relayUrl, setRelayUrlInput] = useState("");
  const [ready, setReady] = useState(false);
  const [resolvedKms, setResolvedKms] = useState("");
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);

  useEffect(() => {
    setApiKeyInput(getApiKey() ?? "");
    setKmsUrlInput(getKmsUrl() ?? "");
    setBundlerUrlInput(getBundlerUrl() ?? "");
    setRpcUrlInput(getRpcUrl() ?? "");
    setRelayUrlInput(getRelayUrl() ?? "");
    setReady(isDirectKmsReady());
    setResolvedKms(kmsBaseUrl());
  }, []);

  const handleSave = () => {
    if (apiKey.trim()) setApiKey(apiKey);
    else clearApiKey();
    setKmsUrl(kmsUrl);
    setBundlerUrl(bundlerUrl);
    setRpcUrl(rpcUrl);
    setRelayUrl(relayUrl);
    setReady(isDirectKmsReady());
    setResolvedKms(kmsBaseUrl());
    toast.success("Settings saved (this device)");
  };

  const handleClear = () => {
    clearApiKey();
    setKmsUrl("");
    setBundlerUrl("");
    setRpcUrl("");
    setRelayUrl("");
    setApiKeyInput("");
    setKmsUrlInput("");
    setBundlerUrlInput("");
    setRpcUrlInput("");
    setRelayUrlInput("");
    setReady(false);
    setResolvedKms(kmsBaseUrl());
    setPingResult(null);
    toast.success("Cleared");
  };

  const handlePing = async () => {
    setPinging(true);
    setPingResult(null);
    const r = await pingKms();
    setPingResult(r.ok ? `OK (${r.status})` : `Failed: ${r.error ?? r.status}`);
    setPinging(false);
  };

  const inputClass =
    "block w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm placeholder-gray-400 dark:placeholder-gray-500 transition-all";

  return (
    <Layout requireAuth={true}>
      <div className="max-w-2xl px-3 py-4 sm:px-4 sm:py-6 mx-auto lg:px-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1">
          Settings
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Endpoints &amp; credentials for this device. Leave a field{" "}
          <strong>blank to use the AAStar default</strong>; fill it to point at{" "}
          <strong>your own</strong> node/service — YAA doesn&apos;t lock you into AAStar infra. The
          AAStar API key (free tier; more via aPoints) authorizes the default KMS + bundler;
          self-hosted endpoints use your own auth. Nothing here leaves this device.
        </p>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              AAStar API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKeyInput(e.target.value)}
              placeholder="Paste your API key"
              autoComplete="off"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Authorizes both KMS and the bundler. Leave blank to keep using the hosted proxy.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              KMS Endpoint (optional override)
            </label>
            <input
              type="text"
              value={kmsUrl}
              onChange={e => setKmsUrlInput(e.target.value)}
              placeholder={kmsBaseUrl()}
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} font-mono`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Bundler Endpoint (optional override)
            </label>
            <input
              type="text"
              value={bundlerUrl}
              onChange={e => setBundlerUrlInput(e.target.value)}
              placeholder="Default bundler"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} font-mono`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              RPC Endpoint (optional override)
            </label>
            <input
              type="text"
              value={rpcUrl}
              onChange={e => setRpcUrlInput(e.target.value)}
              placeholder="Default RPC (viem public)"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} font-mono`}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Used for on-chain reads (balances, nonce). Point at your own node to decentralize
              reads.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Relay Endpoint (optional override)
            </label>
            <input
              type="text"
              value={relayUrl}
              onChange={e => setRelayUrlInput(e.target.value)}
              placeholder="Default account-deploy relay"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} font-mono`}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Sponsors passkey account creation (see relay proposal). Blank = AAStar relay.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={handleSave}
              className="inline-flex items-center justify-center px-4 py-3 sm:py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-xl shadow transition active:scale-95"
            >
              Save
            </button>
            <button
              onClick={handlePing}
              disabled={pinging}
              className="inline-flex items-center justify-center px-4 py-3 sm:py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition active:scale-95 disabled:opacity-60"
            >
              {pinging ? "Testing…" : "Test KMS connection"}
            </button>
            <button
              onClick={handleClear}
              className="inline-flex items-center justify-center px-4 py-3 sm:py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition active:scale-95"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Status */}
        <div className="mt-6 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4 text-sm">
          <div className="flex items-center justify-between py-1">
            <span className="text-slate-600 dark:text-slate-400">Direct-KMS ready</span>
            <span className={ready ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500"}>
              {ready ? "Yes (API key set)" : "No (using hosted proxy)"}
            </span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-slate-600 dark:text-slate-400">Resolved KMS endpoint</span>
            <span className="font-mono text-xs text-slate-700 dark:text-slate-300 break-all">
              {resolvedKms}
            </span>
          </div>
          {pingResult && (
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-600 dark:text-slate-400">Last test</span>
              <span className="text-xs text-slate-700 dark:text-slate-300">{pingResult}</span>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Note: transfer signing still runs through the hosted service today. Direct browser→KMS +
          direct bundler (using this key) turn on once the KMS Origin/API-key path is live — this
          screen configures it ahead of that switch.
        </p>
      </div>
    </Layout>
  );
}
