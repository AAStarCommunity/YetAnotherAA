"use client";

/**
 * Horizontal step indicator for the onboarding wizard.
 *
 * @module app/operator/deploy/components/WizardProgress
 */
import { CheckIcon } from "@heroicons/react/24/outline";

interface WizardProgressProps {
  labels: string[];
  current: number;
}

export default function WizardProgress({ labels, current }: WizardProgressProps) {
  return (
    <ol className="flex items-center w-full overflow-x-auto pb-2">
      {labels.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center shrink-0">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  done
                    ? "bg-emerald-600 text-white"
                    : active
                      ? "bg-slate-800 text-white dark:bg-emerald-500"
                      : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                }`}
              >
                {done ? <CheckIcon className="h-4 w-4" /> : i + 1}
              </span>
              <span
                className={`text-xs font-medium whitespace-nowrap ${
                  active ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"
                }`}
              >
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <span className="mx-3 h-px w-8 bg-gray-200 dark:bg-gray-700" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
