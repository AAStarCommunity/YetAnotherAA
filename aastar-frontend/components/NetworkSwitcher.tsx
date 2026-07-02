"use client";

import { useEffect, useRef, useState } from "react";
import { CHAIN_SEPOLIA } from "@aastar/sdk/core";
import toast from "react-hot-toast";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

/**
 * Network indicator + switcher. Makes the active network explicit (so the app never
 * silently assumes a chain) and frames the roadmap. Transfers currently run only on
 * Sepolia — the full AA stack (KMS / DVT / paymaster / contracts) is Sepolia-only — so
 * other networks are shown as "Coming soon" (OP mainnet is the phase-2 target) rather
 * than offering a switch that would fail. Wire real switching here when mainnet lands.
 */
interface NetOption {
  id: number;
  name: string;
  testnet?: boolean;
  available: boolean;
}

const NETWORKS: NetOption[] = [
  { id: CHAIN_SEPOLIA, name: "Sepolia", testnet: true, available: true },
  { id: 10, name: "OP Mainnet", available: false },
];

export default function NetworkSwitcher({ chainId = CHAIN_SEPOLIA }: { chainId?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = NETWORKS.find(n => n.id === chainId) ?? NETWORKS[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const select = (n: NetOption) => {
    setOpen(false);
    if (!n.available) {
      toast(`${n.name} is coming soon — transfers currently run on Sepolia.`, { icon: "🛠️" });
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
      >
        <span
          className={`w-2 h-2 rounded-full ${current.testnet ? "bg-amber-500" : "bg-emerald-500"}`}
        />
        {current.name}
        {current.testnet && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            Testnet
          </span>
        )}
        <ChevronDownIcon
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-52 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg z-50 py-1">
          {NETWORKS.map(n => (
            <button
              key={n.id}
              type="button"
              onClick={() => select(n)}
              disabled={!n.available}
              className="flex items-center justify-between w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${n.testnet ? "bg-amber-500" : "bg-emerald-500"}`}
                />
                {n.name}
                {n.testnet && <span className="text-[10px] text-amber-600">Testnet</span>}
              </span>
              {n.id === current.id ? (
                <span className="text-emerald-500 text-xs">✓</span>
              ) : !n.available ? (
                <span className="text-[10px] text-gray-400">Coming soon</span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
