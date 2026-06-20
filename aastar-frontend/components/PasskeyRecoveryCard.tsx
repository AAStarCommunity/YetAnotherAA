"use client";

import { useState } from "react";
import { guardianAPI } from "@/lib/api";
import { signGuardianRecovery } from "@/lib/p256-guardian";
import toast from "react-hot-toast";

function isAddress(v: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(v);
}

/**
 * Passkey (P-256) social recovery — one-step propose.
 *
 * The guardian's passkey (Face ID / fingerprint, synced via iCloud/Google) signs
 * the recovery challenge; the backend relays proposeRecoveryWithSig on-chain and
 * pays gas (the passkey signature is the authorization, so any relayer may submit).
 * No second device, no KMS, no gas for the guardian.
 */
export default function PasskeyRecoveryCard() {
  const [accountAddress, setAccountAddress] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const handlePropose = async () => {
    if (!isAddress(accountAddress)) return toast.error("Invalid account address");
    if (!isAddress(newOwner)) return toast.error("Invalid new owner address");

    setLoading(true);
    try {
      // 1. Backend builds the challenge (reads on-chain nonce + P-256 guardian slot).
      const prep = await guardianAPI.prepareP256Recovery({ accountAddress, newOwner });

      // 2. The passkey signs the challenge (WebAuthn assertion ceremony).
      const assertion = await signGuardianRecovery({ challenge: prep.data.challenge });

      // 3. Backend encodes the assertion + relays proposeRecoveryWithSig.
      const res = await guardianAPI.submitP256Recovery({
        accountAddress,
        newOwner,
        ...assertion,
      });

      setTxHash(res.data.transactionHash);
      toast.success("Recovery proposed on-chain with your passkey!");
    } catch (error: any) {
      if (error?.name === "NotAllowedError") {
        toast.error("Passkey authentication was cancelled.");
      } else {
        const message =
          error.response?.data?.message || error.message || "Failed to propose recovery";
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-indigo-900 dark:text-indigo-200">
          Recover with passkey
        </h2>
        <p className="mt-1 text-sm text-indigo-700 dark:text-indigo-300">
          Sign with the passkey guardian you set up (Face ID / fingerprint). The backend submits the
          recovery on-chain and pays the gas — no second device, no KMS.
        </p>
      </div>

      {txHash ? (
        <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-3 text-sm text-green-800 dark:text-green-300">
          <p className="font-medium">Recovery proposed. ✅</p>
          <p className="mt-1 break-all font-mono text-xs">tx: {txHash}</p>
          <p className="mt-2">
            After the on-chain time lock, anyone can call <span className="font-mono">execute</span>{" "}
            to finalize the new owner.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Account address
            </label>
            <input
              type="text"
              value={accountAddress}
              onChange={e => setAccountAddress(e.target.value.trim())}
              placeholder="0x… (the AirAccount to recover)"
              disabled={loading}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              New owner address
            </label>
            <input
              type="text"
              value={newOwner}
              onChange={e => setNewOwner(e.target.value.trim())}
              placeholder="0x… (the new signer to take control)"
              disabled={loading}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2"
            />
          </div>
          <button
            type="button"
            onClick={handlePropose}
            disabled={loading}
            className="inline-flex w-full justify-center items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 mr-2 border-b-2 border-white rounded-full animate-spin" />
                Signing…
              </>
            ) : (
              "Propose recovery with passkey"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
