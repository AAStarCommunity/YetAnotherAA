"use client";

import { Fragment, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import QRCode from "react-qr-code";
import EntryPointVersionSelector from "./EntryPointVersionSelector";
import { EntryPointVersion } from "@/lib/types";
import { accountAPI } from "@/lib/api";
import toast from "react-hot-toast";

interface CreateAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (account: any) => void;
}

type Step = "config" | "guardian1" | "guardian2" | "creating";

interface PrepareResult {
  owner: string;
  salt: number;
  chainId: number;
  factoryAddress: string;
  acceptanceHash: string;
  qrPayload: string;
}

interface GuardianSig {
  address: string;
  sig: string;
}

export default function CreateAccountDialog({
  isOpen,
  onClose,
  onSuccess,
}: CreateAccountDialogProps) {
  const [version, setVersion] = useState<EntryPointVersion>(EntryPointVersion.V0_7);
  const [salt, setSalt] = useState<string>("");
  const [dailyLimit, setDailyLimit] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [step, setStep] = useState<Step>("config");
  const [prepareResult, setPrepareResult] = useState<PrepareResult | null>(null);
  const [guardian1, setGuardian1] = useState<GuardianSig>({ address: "", sig: "" });
  const [guardian2, setGuardian2] = useState<GuardianSig>({ address: "", sig: "" });

  const handleReset = () => {
    setStep("config");
    setPrepareResult(null);
    setGuardian1({ address: "", sig: "" });
    setGuardian2({ address: "", sig: "" });
    setSalt("");
    setDailyLimit("");
    setShowAdvanced(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // Step 1: Call prepare endpoint to get QR payload
  const handlePrepare = async () => {
    setLoading(true);
    try {
      const response = await accountAPI.prepareGuardianSetup({
        entryPointVersion: version,
        salt: salt ? parseInt(salt) : undefined,
      });
      setPrepareResult(response.data);
      setStep("guardian1");
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to prepare guardian setup";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  // Validate guardian1 input and advance to guardian2 step
  const handleGuardian1Next = () => {
    if (!guardian1.address || !guardian1.sig) {
      toast.error("Please fill in Guardian 1 address and signature");
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(guardian1.address)) {
      toast.error("Guardian 1 address is not a valid Ethereum address");
      return;
    }
    if (!/^0x[0-9a-fA-F]+$/.test(guardian1.sig)) {
      toast.error("Guardian 1 signature must be a hex string starting with 0x");
      return;
    }
    setStep("guardian2");
  };

  // Final step: create account with both guardian sigs
  const handleCreate = async () => {
    if (!guardian2.address || !guardian2.sig) {
      toast.error("Please fill in Guardian 2 address and signature");
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(guardian2.address)) {
      toast.error("Guardian 2 address is not a valid Ethereum address");
      return;
    }
    if (!/^0x[0-9a-fA-F]+$/.test(guardian2.sig)) {
      toast.error("Guardian 2 signature must be a hex string starting with 0x");
      return;
    }
    if (guardian1.address.toLowerCase() === guardian2.address.toLowerCase()) {
      toast.error("Guardian 1 and Guardian 2 must be different addresses");
      return;
    }

    setStep("creating");
    setLoading(true);
    try {
      const response = await accountAPI.createWithGuardians({
        guardian1: guardian1.address,
        guardian1Sig: guardian1.sig,
        guardian2: guardian2.address,
        guardian2Sig: guardian2.sig,
        dailyLimit: dailyLimit && parseFloat(dailyLimit) > 0 ? dailyLimit : "0",
        salt: prepareResult?.salt,
        entryPointVersion: version,
      });

      toast.success("Smart Account created with Guardians!");
      handleReset();
      onSuccess(response.data);
      onClose();
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to create account";
      toast.error(message);
      // Go back to guardian2 step so user can retry
      setStep("guardian2");
    } finally {
      setLoading(false);
    }
  };

  // Build the guardian sign URL for QR code
  const buildGuardianSignUrl = () => {
    if (!prepareResult || typeof window === "undefined") return "";
    const params = new URLSearchParams({
      acceptanceHash: prepareResult.acceptanceHash,
      factory: prepareResult.factoryAddress,
      chainId: String(prepareResult.chainId),
      owner: prepareResult.owner,
      salt: String(prepareResult.salt),
    });
    return `${window.location.origin}/guardian-sign?${params.toString()}`;
  };

  // Render QR code + input section for a guardian
  const renderQRSection = (guardianNumber: 1 | 2) => {
    const guardianSignUrl = buildGuardianSignUrl();
    const currentGuardian = guardianNumber === 1 ? guardian1 : guardian2;
    const setCurrentGuardian = guardianNumber === 1 ? setGuardian1 : setGuardian2;

    return (
      <div className="space-y-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
            Step {guardianNumber} of 2 — Guardian {guardianNumber} Scan
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-400">
            Have Guardian {guardianNumber} scan the QR code below with their phone, sign the
            acceptance hash with their passkey, then paste the returned address and signature here.
          </p>
        </div>

        <div className="flex justify-center">
          <div className="bg-white p-3 rounded-lg border border-gray-200 dark:border-gray-600">
            {guardianSignUrl && <QRCode value={guardianSignUrl} size={200} />}
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Or share this URL manually:</p>
          <p className="text-xs text-blue-600 dark:text-blue-400 break-all mt-1 px-2 select-all">
            {guardianSignUrl}
          </p>
        </div>

        <div className="space-y-3 mt-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Guardian {guardianNumber} Address
            </label>
            <input
              type="text"
              value={currentGuardian.address}
              onChange={e => setCurrentGuardian(g => ({ ...g, address: e.target.value.trim() }))}
              placeholder="0x..."
              disabled={loading}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Guardian {guardianNumber} Signature
            </label>
            <textarea
              value={currentGuardian.sig}
              onChange={e => setCurrentGuardian(g => ({ ...g, sig: e.target.value.trim() }))}
              placeholder="0x..."
              rows={3}
              disabled={loading}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 font-mono text-xs"
            />
          </div>
        </div>
      </div>
    );
  };

  const renderStepContent = () => {
    switch (step) {
      case "config":
        return (
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Creating an AirAccount requires 2 guardian devices. Each guardian scans a QR code
                and signs with their passkey. The team Safe is added as the 3rd guardian
                automatically.
              </p>
            </div>

            <EntryPointVersionSelector value={version} onChange={setVersion} disabled={loading} />

            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
              >
                {showAdvanced ? "Hide" : "Show"} Advanced Options
              </button>
            </div>

            {showAdvanced && (
              <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <div>
                  <label
                    htmlFor="salt"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Salt (Optional)
                  </label>
                  <input
                    type="number"
                    id="salt"
                    value={salt}
                    onChange={e => setSalt(e.target.value)}
                    placeholder="Leave empty for random salt"
                    disabled={loading}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Salt is used for deterministic address generation
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="dailyLimit"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Daily Transfer Limit (ETH, Optional)
                  </label>
                  <input
                    type="number"
                    id="dailyLimit"
                    value={dailyLimit}
                    onChange={e => setDailyLimit(e.target.value)}
                    placeholder="e.g. 1.0 (leave empty for no limit)"
                    min="0"
                    step="0.01"
                    disabled={loading}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Enables on-chain guard enforcement. Tier 3 transfers (above limit) require
                    guardian approval. Leave empty to disable.
                  </p>
                  {dailyLimit && parseFloat(dailyLimit) > 0 && (
                    <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-xs text-amber-700 dark:text-amber-400">
                      Tiered security enabled. Transfers above {dailyLimit} ETH will require
                      guardian approval (Tier 3).
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case "guardian1":
        return renderQRSection(1);

      case "guardian2":
        return renderQRSection(2);

      case "creating":
        return (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="w-10 h-10 border-b-2 border-blue-600 rounded-full animate-spin" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Creating your account on-chain...
            </p>
          </div>
        );
    }
  };

  const renderFooterButtons = () => {
    switch (step) {
      case "config":
        return (
          <>
            <button
              type="button"
              onClick={handlePrepare}
              disabled={loading}
              className="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 mr-2 border-b-2 border-white rounded-full animate-spin" />
                  Preparing...
                </>
              ) : (
                "Create Account"
              )}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="mt-3 inline-flex w-full justify-center rounded-md bg-white dark:bg-gray-700 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-300 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed sm:mt-0 sm:w-auto"
            >
              Cancel
            </button>
          </>
        );

      case "guardian1":
        return (
          <>
            <button
              type="button"
              onClick={handleGuardian1Next}
              className="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:w-auto"
            >
              Next: Guardian 2
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="mt-3 inline-flex w-full justify-center rounded-md bg-white dark:bg-gray-700 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-300 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 sm:mt-0 sm:w-auto"
            >
              Back
            </button>
          </>
        );

      case "guardian2":
        return (
          <>
            <button
              type="button"
              onClick={handleCreate}
              disabled={loading}
              className="inline-flex w-full justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 mr-2 border-b-2 border-white rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Account"
              )}
            </button>
            <button
              type="button"
              onClick={() => setStep("guardian1")}
              disabled={loading}
              className="mt-3 inline-flex w-full justify-center rounded-md bg-white dark:bg-gray-700 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-300 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 sm:mt-0 sm:w-auto"
            >
              Back
            </button>
          </>
        );

      case "creating":
        return null;
    }
  };

  const stepTitles: Record<Step, string> = {
    config: "Create Smart Account",
    guardian1: "Scan with Guardian 1",
    guardian2: "Scan with Guardian 2",
    creating: "Creating Account...",
  };

  const stepKeys: Array<"config" | "guardian1" | "guardian2"> = [
    "config",
    "guardian1",
    "guardian2",
  ];

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        onClose={step === "creating" ? () => {} : handleClose}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                {step !== "creating" && (
                  <div className="absolute right-0 top-0 pr-4 pt-4">
                    <button
                      type="button"
                      className="rounded-md bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      onClick={handleClose}
                    >
                      <span className="sr-only">Close</span>
                      <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>
                )}

                {/* Step progress indicator */}
                {step !== "creating" && (
                  <div className="flex items-center space-x-2 mb-4">
                    {stepKeys.map((s, idx) => (
                      <div key={s} className="flex items-center">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            step === s
                              ? "bg-blue-600 text-white"
                              : idx < stepKeys.indexOf(step as "config" | "guardian1" | "guardian2")
                                ? "bg-green-500 text-white"
                                : "bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {idx + 1}
                        </div>
                        {idx < stepKeys.length - 1 && (
                          <div
                            className={`w-8 h-0.5 mx-1 ${
                              idx < stepKeys.indexOf(step as "config" | "guardian1" | "guardian2")
                                ? "bg-green-500"
                                : "bg-gray-200 dark:bg-gray-600"
                            }`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-semibold leading-6 text-gray-900 dark:text-white mb-4"
                  >
                    {stepTitles[step]}
                  </Dialog.Title>

                  {renderStepContent()}
                </div>

                {renderFooterButtons() !== null && (
                  <div className="mt-6 sm:flex sm:flex-row-reverse gap-3">
                    {renderFooterButtons()}
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
