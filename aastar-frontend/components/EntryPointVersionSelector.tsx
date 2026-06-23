import React from "react";
import { EntryPointVersion } from "@/lib/types";
import { InformationCircleIcon } from "@heroicons/react/24/outline";

interface EntryPointVersionSelectorProps {
  value: EntryPointVersion;
  onChange: (version: EntryPointVersion) => void;
  disabled?: boolean;
  showDescription?: boolean;
}

// Only versions listed here are shown. v0.6 is hidden by default (uncomment to
// re-enable when needed); new accounts default to v0.7.
const versionInfo: Partial<
  Record<
    EntryPointVersion,
    { label: string; description: string; badge: string; badgeColor: string }
  >
> = {
  // [EntryPointVersion.V0_6]: {
  //   label: "v0.6",
  //   description: "Original ERC-4337 implementation with standard UserOperation format",
  //   badge: "Stable",
  //   badgeColor: "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
  // },
  [EntryPointVersion.V0_7]: {
    label: "v0.7",
    description: "Optimized with PackedUserOperation format and improved gas efficiency",
    badge: "Recommended",
    badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
  },
  // [EntryPointVersion.V0_8]: {
  //   label: "v0.8",
  //   description: "Latest version with executeUserOp and further optimizations",
  //   badge: "Latest",
  //   badgeColor: "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400",
  // },
};

export default function EntryPointVersionSelector({
  value,
  onChange,
  disabled = false,
  showDescription = true,
}: EntryPointVersionSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        EntryPoint Version
      </label>

      {showDescription && (
        <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          Select the ERC-4337 EntryPoint version for your smart account
        </div>
      )}

      <div className="grid grid-cols-1 gap-2">
        {(Object.keys(versionInfo) as EntryPointVersion[]).map(version => {
          const info = versionInfo[version]!;
          const isSelected = value === version;

          return (
            <button
              key={version}
              type="button"
              onClick={() => onChange(version)}
              disabled={disabled}
              className={`
                relative flex items-start p-4 rounded-lg border-2 transition-all
                ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/10"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                }
                ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              <div className="flex items-center">
                <div
                  className={`
                    w-4 h-4 rounded-full border-2 mr-3 flex-shrink-0 mt-0.5
                    ${
                      isSelected
                        ? "border-blue-500 bg-blue-500"
                        : "border-gray-300 dark:border-gray-600"
                    }
                  `}
                >
                  {isSelected && (
                    <div className="w-full h-full rounded-full bg-white dark:bg-gray-900 scale-50" />
                  )}
                </div>

                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">
                      EntryPoint {info.label}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${info.badgeColor}`}
                    >
                      {info.badge}
                    </span>
                  </div>

                  {showDescription && (
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                      {info.description}
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <div className="flex">
          <InformationCircleIcon className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="ml-2 flex-1">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <strong>Note:</strong> Each version requires corresponding smart contracts deployed
              on-chain.
              {value === EntryPointVersion.V0_7 && (
                <span className="block mt-1">
                  v0.7 uses packed format for gas optimization and is recommended for new accounts.
                </span>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
