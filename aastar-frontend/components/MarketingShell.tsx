import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

/** Lightweight public-page shell (no auth nav) for /contact, /about, /privacy, /terms. */
export default function MarketingShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col">
      <header className="px-4 sm:px-6 lg:px-8 py-4">
        <Link href="/" className="inline-flex items-center gap-2">
          <Image src="/aastar-logo.png" alt="" width={22} height={26} />
          <span className="font-bold text-slate-900 dark:text-white">Cos72</span>
        </Link>
      </header>

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
          <div className="mt-6 space-y-6 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {children}
          </div>
        </div>
      </main>

      <footer className="px-4 sm:px-6 lg:px-8 py-6 text-center text-xs text-gray-400 dark:text-gray-600">
        <div className="flex items-center justify-center gap-4 mb-2">
          <Link href="/about" className="hover:text-gray-600 dark:hover:text-gray-300">
            About
          </Link>
          <Link href="/contact" className="hover:text-gray-600 dark:hover:text-gray-300">
            Contact
          </Link>
          <Link href="/privacy" className="hover:text-gray-600 dark:hover:text-gray-300">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-gray-600 dark:hover:text-gray-300">
            Terms
          </Link>
        </div>
        <p>Cos72 — an open-source cooperation system. Powered by AAStar 2023.</p>
      </footer>
    </div>
  );
}
