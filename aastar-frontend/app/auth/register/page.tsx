"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Layout from "@/components/Layout";
import { authAPI } from "@/lib/api";
import { kmsClient } from "@/lib/yaaa";
import { setStoredAuth } from "@/lib/auth";
import toast from "react-hot-toast";
import { startRegistration } from "@simplewebauthn/browser";

const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

export default function RegisterPage() {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [walletStatus, setWalletStatus] = useState<string | null>(null);
  const [showRecoveryInfo, setShowRecoveryInfo] = useState(false);
  const router = useRouter();

  // Step 1: email → send a 6-digit code
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!isEmail(email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    setLoading(true);
    const t = toast.loading("Sending your code…");
    try {
      await authAPI.requestOtp(email.trim());
      toast.dismiss(t);
      toast.success("Code sent — check your email");
      setStep("otp");
    } catch (error: any) {
      toast.dismiss(t);
      toast.error(error.response?.data?.message || "Failed to send code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Provision the passkey + KMS wallet for a freshly verified account.
  const runPasskeyWalletSetup = async (user: { id: string; email: string; username?: string }) => {
    const displayName = user.username || user.email.split("@")[0];
    const beginResponse = await kmsClient.beginRegistration({
      Description: user.id,
      UserName: user.email,
      UserDisplayName: displayName,
    });
    const credential = await startRegistration({ optionsJSON: beginResponse.Options as any });
    const completeResponse = await kmsClient.completeRegistration({
      ChallengeId: beginResponse.ChallengeId,
      Credential: credential,
      Description: user.id,
    });
    const { KeyId, CredentialId } = completeResponse;

    setWalletStatus("Creating your wallet… this can take up to 2 minutes.");
    const keyStatus = await kmsClient.pollUntilReady(KeyId, 150_000, 3_000);
    if (!keyStatus.Address) {
      throw new Error("Key derivation completed but no address was returned");
    }
    await authAPI.linkWallet({
      kmsKeyId: KeyId,
      address: keyStatus.Address,
      credentialId: CredentialId,
    });
    setWalletStatus(null);
  };

  // Step 2: verify code → login/create, then bind passkey + wallet if needed
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!/^\d{6}$/.test(code)) {
      toast.error("Enter the 6-digit code from your email");
      return;
    }
    setLoading(true);
    let t = toast.loading("Verifying…");
    try {
      const res = await authAPI.verifyOtp(email.trim(), code);
      const { access_token, user, needsWallet } = res.data;
      setStoredAuth(access_token, user);
      toast.dismiss(t);

      if (needsWallet) {
        t = toast.loading("Now set up your passkey (Face ID / fingerprint)…");
        await runPasskeyWalletSetup(user);
        toast.dismiss(t);
        toast.success("Account ready — secured by your passkey!");
      } else {
        toast.success("Signed in!");
      }
      router.push("/dashboard");
    } catch (error: any) {
      toast.dismiss(t);
      setWalletStatus(null);
      if (error?.name === "NotAllowedError") {
        toast.error("Passkey setup was cancelled. You're verified — try the passkey step again.");
      } else if (error?.name === "NotSupportedError") {
        toast.error("Passkeys aren't supported on this device.");
      } else {
        toast.error(error.response?.data?.message || error.message || "Verification failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await authAPI.requestOtp(email.trim());
      toast.success("New code sent");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to resend code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex items-start justify-center pt-20 sm:pt-28 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          {/* Brand — fingerprint inline with the heading, transparent bg */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2.5">
              <svg
                className="w-8 h-8 text-emerald-500 dark:text-emerald-400 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 0 0 4.5 10.5a7.464 7.464 0 0 1-1.15 3.993m1.989 3.559A11.209 11.209 0 0 0 8.25 10.5a3.75 3.75 0 1 1 7.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 0 1-3.6 9.75m6.633-4.596a18.666 18.666 0 0 1-2.485 5.33"
                />
              </svg>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Create Your Account
              </h2>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              No password — just your email and a passkey
            </p>
          </div>

          {/* Wallet creation status banner */}
          {walletStatus && (
            <div className="mb-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 dark:border-blue-400 mr-3"></div>
                <p className="text-sm text-blue-800 dark:text-blue-300">{walletStatus}</p>
              </div>
            </div>
          )}

          {/* Main Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
            {/* How your account is protected — compact by default, expandable */}
            <div className="mb-5 rounded-lg bg-slate-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
              <button
                type="button"
                onClick={() => setShowRecoveryInfo(v => !v)}
                className="flex w-full items-center justify-between gap-2 text-left"
                aria-expanded={showRecoveryInfo}
              >
                <span className="font-semibold text-gray-700 dark:text-gray-300">
                  🔑 No seed phrase — protected by social recovery
                </span>
                <svg
                  className={`h-4 w-4 shrink-0 transition-transform ${showRecoveryInfo ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              <p className="mt-1">
                <span className="font-medium">3 guardians</span> (2 yours + 1 community); any{" "}
                <span className="font-medium">2</span> recover your account.
              </p>
              {showRecoveryInfo && (
                <div className="mt-2 space-y-1 border-t border-gray-200 dark:border-gray-700 pt-2">
                  <p>
                    Because the community is <span className="font-medium">only 1 of 3</span>, it
                    can never reach the 2 needed — so even a rogue community{" "}
                    <span className="font-medium">can never touch your funds</span>.
                  </p>
                  <p>
                    Lose one of your two? You can still recover with your remaining guardian + the
                    community, which confirms it&apos;s really you through real social
                    relationships.
                  </p>
                </div>
              )}
            </div>

            {step === "email" ? (
              <form className="space-y-4" onSubmit={handleSendCode}>
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="email"
                    className="w-16 shrink-0 text-right text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    autoFocus
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="flex-1 min-w-0 appearance-none px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 focus:border-transparent transition-all text-sm"
                    placeholder="your.email@example.com"
                  />
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400 pl-[4.75rem]">
                  We&apos;ll email you a 6-digit code to verify it&apos;s you. New here? This also
                  creates your account.
                </p>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-3.5 px-4 text-base font-semibold rounded-xl text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg"
                >
                  {loading ? "Sending…" : "Send code"}
                </button>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={handleVerify}>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Enter the 6-digit code sent to{" "}
                  <span className="font-medium text-gray-900 dark:text-white">{email}</span>.
                </p>
                <input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  autoFocus
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                  className="block w-full text-center tracking-[0.6em] font-mono text-2xl px-3 py-3 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 focus:border-transparent transition-all"
                  placeholder="······"
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-3.5 px-4 text-base font-semibold rounded-xl text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg"
                >
                  {loading ? (
                    <span className="flex items-center">
                      <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                      Working…
                    </span>
                  ) : (
                    "Verify & continue"
                  )}
                </button>

                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("email");
                      setCode("");
                    }}
                    disabled={loading}
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
                  >
                    ← Change email
                  </button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={loading}
                    className="font-medium text-slate-900 dark:text-emerald-400 hover:underline disabled:opacity-50"
                  >
                    Resend code
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Footer Links */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Already have an account?{" "}
              <Link
                href="/auth/login"
                className="font-semibold text-slate-900 hover:text-slate-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
              >
                Sign in here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
