import type { Metadata } from "next";
import MarketingShell from "@/components/MarketingShell";
import EmailImage from "@/components/EmailImage";

export const metadata: Metadata = {
  title: "Contact — Cos72",
  description: "Get in touch with the Cos72 / AAStar team.",
};

const CONTACTS = [
  {
    name: "General",
    role: "Anything else — partnerships, press, hello",
    user: "hi",
    domain: "aastar.io",
  },
  {
    name: "David",
    role: "R&D & Operations",
    user: "david",
    domain: "aastar.io",
  },
  {
    name: "Jason",
    role: "Business & Security",
    user: "jason",
    domain: "aastar.io",
  },
];

export default function ContactPage() {
  return (
    <MarketingShell
      title="Contact"
      subtitle="We'd love to hear from you. Reach the right person directly."
    >
      <div className="space-y-3">
        {CONTACTS.map(c => (
          <div
            key={c.user}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <p className="font-semibold text-gray-900 dark:text-white">{c.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{c.role}</p>
            </div>
            <div className="mt-2">
              <EmailImage user={c.user} domain={c.domain} />
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Emails are shown as images on purpose, to keep the team out of spam-harvesting bots. Use the
        “copy” link to grab an address.
      </p>
    </MarketingShell>
  );
}
