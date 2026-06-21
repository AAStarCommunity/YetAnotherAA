import type { Metadata } from "next";
import MarketingShell from "@/components/MarketingShell";

export const metadata: Metadata = {
  title: "About — Cos72",
  description:
    "Cos72 is an open-source cooperation system with a value-added gas-sponsorship service.",
};

export default function AboutPage() {
  return (
    <MarketingShell title="About Cos72" subtitle="Open source, powerful, easy to use.">
      <p>
        <span className="font-medium text-gray-900 dark:text-white">Cos72</span> is an open-source
        cooperation system — software that helps people and communities work together without
        handing control to a platform. It is free, open, and self-hostable.
      </p>
      <p>
        On top of the open core, we offer a{" "}
        <span className="font-medium">value-added gas sponsorship service</span>: powered by
        AAStar&apos;s ERC-4337 account-abstraction stack (AirAccount + SuperPaymaster), users sign
        in with a passkey and transact without holding ETH for gas — communities can even sponsor
        with their own tokens.
      </p>
      <p>
        No seed phrase, no password: your account is a smart account secured by a passkey and
        protected by social recovery. Cos72 is part of the{" "}
        <span className="font-medium">Mycelium Protocol</span> ecosystem of digital public goods.
      </p>
      <ul className="list-disc list-inside space-y-1">
        <li>Passkey sign-in (Face ID / fingerprint) — no password</li>
        <li>Smart accounts (ERC-4337) with social recovery</li>
        <li>Gasless transactions via SuperPaymaster — pay gas in community tokens</li>
        <li>Open source &amp; self-hostable</li>
      </ul>
    </MarketingShell>
  );
}
