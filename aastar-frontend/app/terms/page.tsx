import type { Metadata } from "next";
import MarketingShell from "@/components/MarketingShell";

export const metadata: Metadata = {
  title: "Terms — Cos72",
  description: "Terms of use for the Cos72 open-source cooperation system.",
};

export default function TermsPage() {
  return (
    <MarketingShell title="Terms of Use" subtitle="Plain and short.">
      <p>
        Cos72 is open-source software provided <span className="font-medium">as is</span>, without
        warranty of any kind. You are responsible for your account, your keys/passkeys, and the
        transactions you sign.
      </p>
      <ul className="list-disc list-inside space-y-1">
        <li>
          The hosted service may run on test networks and can change or pause; do not treat balances
          as guaranteed.
        </li>
        <li>
          Keep your iCloud / Google account (which syncs your passkey) and your guardians secure —
          they control account recovery.
        </li>
        <li>Don&apos;t use the service for unlawful activity.</li>
        <li>
          The open-source code is governed by its repository license; self-hosting is welcome.
        </li>
      </ul>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        This is a concise summary for an open-source project, not legal advice.
      </p>
    </MarketingShell>
  );
}
