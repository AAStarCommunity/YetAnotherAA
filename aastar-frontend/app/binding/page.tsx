"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  TrashIcon,
  BellAlertIcon,
} from "@heroicons/react/24/outline";
import { startAuthentication } from "@simplewebauthn/browser";
import {
  createContactBindingClient,
  type ContactRecord,
  type ContactChannel,
} from "@aastar/sdk/airaccount";
import type { Address } from "viem";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import Layout from "@/components/Layout";
import { useDashboard } from "@/contexts/DashboardContext";
import { kmsClient } from "@/lib/yaaa";
import { getStoredAuth } from "@/lib/auth";

// Out-of-band confirmation contact binding (Scheme 2 / aastar-sdk#193). Binds a Telegram
// channel to the AirAccount so the DVT can reach the owner for high-value approvals. The
// KMS api key is NEVER in the browser: the client points at the /kms-api proxy, which injects
// it server-side (apiKey: "" here). Every begin/confirm/unbind is gated by an owner passkey
// ceremony (BeginAuthentication → navigator.credentials.get → {ChallengeId, Credential}).
export default function BindingPage() {
  const { t } = useTranslation();
  const { data } = useDashboard();
  const account = data.account?.address as Address | undefined;
  const ownerWallet = getStoredAuth().user?.walletAddress;

  const [contacts, setContacts] = useState<ContactRecord[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Active Telegram binding awaiting the verifyToken the @AAStarBot hands back.
  const [pending, setPending] = useState<{ bindingCode: string } | null>(null);
  const [verifyToken, setVerifyToken] = useState("");

  const client = useMemo(() => {
    if (!ownerWallet) return null;
    return createContactBindingClient({
      kmsEndpoint: "/kms-api", // proxy injects the KMS x-api-key server-side
      apiKey: "",
      ceremony: async () => {
        // Owner WebAuthn ceremony against the KMS wallet (not the smart-account address).
        const auth = await kmsClient.beginAuthentication({ Address: ownerWallet });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const credential = await startAuthentication({ optionsJSON: auth.Options as any });
        return { ChallengeId: auth.ChallengeId, Credential: credential };
      },
    });
  }, [ownerWallet]);

  const loadContacts = useCallback(async () => {
    if (!client || !account) return;
    try {
      setContacts(await client.getContacts(account));
    } catch {
      setContacts([]); // no contacts yet / KMS unreachable → show empty, not a crash
    }
  }, [client, account]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  const startBind = async () => {
    if (!client || !account) return;
    setBusy(true);
    const id = toast.loading(t("binding.starting"));
    try {
      const { bindingCode } = await client.beginContactBinding({ account, channel: "telegram" });
      setPending({ bindingCode });
      setVerifyToken("");
      toast.success(t("binding.codeReady"), { id });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("binding.failed"), { id });
    } finally {
      setBusy(false);
    }
  };

  const confirmBind = async () => {
    if (!client || !account || !pending || !verifyToken.trim()) return;
    setBusy(true);
    const id = toast.loading(t("binding.confirming"));
    try {
      await client.confirmContactBinding({
        account,
        bindingCode: pending.bindingCode,
        verifyToken: verifyToken.trim(),
      });
      toast.success(t("binding.verified"), { id });
      setPending(null);
      setVerifyToken("");
      await loadContacts();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("binding.failed"), { id });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (channel: ContactChannel) => {
    if (!client || !account) return;
    // Removing a contact silently disables the Scheme-2 out-of-band approval path —
    // confirm so an accidental tap can't strip a security channel.
    if (!window.confirm(t("binding.removeConfirm", { channel }))) return;
    setBusy(true);
    const id = toast.loading(t("binding.removing"));
    try {
      await client.removeContact({ account, channel });
      toast.success(t("binding.removed"), { id });
      await loadContacts();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("binding.failed"), { id });
    } finally {
      setBusy(false);
    }
  };

  if (!account || !ownerWallet) {
    return (
      <Layout requireAuth>
        <div className="max-w-xl mx-auto px-4 py-10">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("binding.noAccount")}</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout requireAuth>
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2">
          <BellAlertIcon className="h-6 w-6 text-emerald-500" />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t("binding.title")}
          </h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("binding.subtitle")}</p>

        {/* Current contacts */}
        <div className="mt-5">
          {contacts === null ? (
            <ArrowPathIcon className="h-5 w-5 animate-spin text-gray-400 mx-auto mt-6" />
          ) : contacts.length === 0 ? (
            <p className="text-xs text-gray-400">{t("binding.none")}</p>
          ) : (
            <ul className="space-y-2">
              {contacts.map(c => (
                <li
                  key={c.channel}
                  className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize text-gray-900 dark:text-white">
                      {c.channel}
                    </span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        c.status === "verified"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <button
                    onClick={() => void remove(c.channel)}
                    disabled={busy}
                    className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                    aria-label={t("binding.remove")}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Bind Telegram flow */}
        {!pending ? (
          <button
            onClick={() => void startBind()}
            disabled={busy}
            className="mt-5 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {t("binding.bindTelegram")}
          </button>
        ) : (
          <div className="mt-5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-900/10 p-4">
            <p className="text-sm text-gray-900 dark:text-white font-medium">
              {t("binding.step2Title")}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
              {t("binding.step2Hint")}
            </p>
            <code className="mt-2 block text-center text-sm font-mono bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg py-2">
              /bind {pending.bindingCode}
            </code>
            <input
              value={verifyToken}
              onChange={e => setVerifyToken(e.target.value)}
              placeholder={t("binding.verifyTokenPlaceholder")}
              className="mt-3 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => void confirmBind()}
                disabled={busy || !verifyToken.trim()}
                className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
              >
                <CheckCircleIcon className="h-4 w-4 inline mr-1" />
                {t("binding.confirm")}
              </button>
              <button
                onClick={() => {
                  setPending(null);
                  setVerifyToken("");
                }}
                disabled={busy}
                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 disabled:opacity-50"
              >
                {t("binding.cancel")}
              </button>
            </div>
          </div>
        )}

        <p className="mt-4 text-[11px] text-gray-400">{t("binding.privacyNote")}</p>
      </div>
    </Layout>
  );
}
