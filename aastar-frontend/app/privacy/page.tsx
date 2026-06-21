import type { Metadata } from "next";
import MarketingShell from "@/components/MarketingShell";

export const metadata: Metadata = {
  title: "Privacy — Cos72",
  description: "How Cos72 handles your data: minimal by design, no passwords.",
};

export default function PrivacyPage() {
  return (
    <MarketingShell title="Privacy" subtitle="Minimal by design.">
      <p>
        Cos72 collects as little as possible. We do not sell your data and we do not use it for
        advertising.
      </p>
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">What we store</h2>
      <ul className="list-disc list-inside space-y-1">
        <li>
          <span className="font-medium">Email</span> — used only to sign you in (a one-time code)
          and to reach you about your account. No password is ever stored.
        </li>
        <li>
          <span className="font-medium">Passkey public key &amp; wallet address</span> — to
          authenticate you and operate your smart account. Private keys never leave your device /
          the secure TEE.
        </li>
      </ul>
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">
        What we don&apos;t do
      </h2>
      <ul className="list-disc list-inside space-y-1">
        <li>No passwords, no seed phrases to leak.</li>
        <li>One-time login codes are kept in memory only and expire in minutes.</li>
        <li>No tracking for ads; no selling personal data.</li>
      </ul>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Questions? See the Contact page. This is a concise summary for an open-source project, not
        legal advice.
      </p>
    </MarketingShell>
  );
}
