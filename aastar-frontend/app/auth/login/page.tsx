"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Layout from "@/components/Layout";
import { authAPI } from "@/lib/api";
import { kmsClient } from "@/lib/yaaa";
import { setStoredAuth } from "@/lib/auth";
import toast from "react-hot-toast";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [loginMode, setLoginMode] = useState<"passkey" | "otp">("passkey");
  const [email, setEmail] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpStep, setOtpStep] = useState<"email" | "code">("email");
  const [walletStatus, setWalletStatus] = useState<string | null>(null);
  const router = useRouter();

  // ── Passkey login (Face ID / fingerprint) ──────────────────────
  const handlePasskeyLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (loading) return;
    if (!isEmail(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setLoading(true);
    let t: string | null = null;
    try {
      t = toast.loading("Starting authentication...");
      const beginResponse = await authAPI.beginKmsLogin(email.trim());
      const { walletAddress } = beginResponse.data;

      toast.dismiss(t);
      t = toast.loading("Authenticate with your passkey...");
      const authResponse = await kmsClient.beginAuthentication({ Address: walletAddress });
      const credential = await startAuthentication({ optionsJSON: authResponse.Options as any });

      toast.dismiss(t);
      t = toast.loading("Completing...");
      const completeResponse = await authAPI.completeKmsLogin({
        address: walletAddress,
        challengeId: authResponse.ChallengeId,
        credential,
      });
      const { access_token, user } = completeResponse.data;
      toast.dismiss(t);
      setStoredAuth(access_token, user);
      toast.success("Welcome back!");
      router.push("/dashboard");
    } catch (error: any) {
      if (t) toast.dismiss(t);
      if (error?.name === "NotAllowedError") {
        toast.error("Authentication was cancelled.");
      } else if (error?.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error(error.message || "Authentication failed");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Email-code login (fallback: new device / no passkey here) ───
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
    setWalletStatus("Creating your wallet… up to 2 minutes.");
    const keyStatus = await kmsClient.pollUntilReady(KeyId, 150_000, 3_000);
    if (!keyStatus.Address) throw new Error("Key derivation completed but no address was returned");
    await authAPI.linkWallet({
      kmsKeyId: KeyId,
      address: keyStatus.Address,
      credentialId: CredentialId,
    });
    setWalletStatus(null);
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!isEmail(otpEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }
    setLoading(true);
    const t = toast.loading("Sending your code…");
    try {
      await authAPI.requestOtp(otpEmail.trim());
      toast.dismiss(t);
      toast.success("Code sent — check your email");
      setOtpStep("code");
    } catch (error: any) {
      toast.dismiss(t);
      toast.error(error.response?.data?.message || "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!/^\d{6}$/.test(code)) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setLoading(true);
    let t: string | null = toast.loading("Verifying…");
    try {
      const res = await authAPI.verifyOtp(otpEmail.trim(), code);
      const { access_token, user, needsWallet } = res.data;
      setStoredAuth(access_token, user);
      toast.dismiss(t);
      if (needsWallet) {
        t = toast.loading("Set up your passkey…");
        await runPasskeyWalletSetup(user);
        toast.dismiss(t);
        toast.success("Account ready — secured by your passkey!");
      } else {
        toast.success("Signed in!");
      }
      router.push("/dashboard");
    } catch (error: any) {
      if (t) toast.dismiss(t);
      setWalletStatus(null);
      if (error?.name === "NotAllowedError") {
        toast.error("Passkey setup was cancelled.");
      } else {
        toast.error(error.response?.data?.message || error.message || "Verification failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const btn =
    "w-full flex justify-center items-center py-3.5 px-4 text-base font-semibold rounded-xl text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg";
  const input =
    "appearance-none block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 focus:border-transparent transition-all sm:text-sm";

  return (
    <Layout>
      <div className="flex items-start justify-center pt-20 sm:pt-28 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          {/* Brand — fingerprint inline with heading */}
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
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome Back</h2>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Sign in with your passkey — or an email code
            </p>
          </div>

          {walletStatus && (
            <div className="mb-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 dark:border-blue-400 mr-3"></div>
                <p className="text-sm text-blue-800 dark:text-blue-300">{walletStatus}</p>
              </div>
            </div>
          )}

          {/* Mode toggle */}
          <div className="flex bg-gray-200 dark:bg-gray-700 rounded-xl p-1 mb-6">
            <button
              onClick={() => setLoginMode("passkey")}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                loginMode === "passkey"
                  ? "bg-white dark:bg-gray-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              Passkey
            </button>
            <button
              onClick={() => setLoginMode("otp")}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                loginMode === "otp"
                  ? "bg-white dark:bg-gray-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              Email code
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 space-y-5 border border-gray-200 dark:border-gray-700">
            {loginMode === "passkey" ? (
              <form onSubmit={handlePasskeyLogin} className="space-y-5">
                <div>
                  <label
                    htmlFor="passkey-email"
                    className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Email address
                  </label>
                  <input
                    id="passkey-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className={input}
                    placeholder="your.email@example.com"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Use Face ID / Touch ID / fingerprint to sign in. No passkey on this device? Use
                  the email code instead.
                </p>
                <button type="submit" disabled={loading} className={btn}>
                  {loading ? "Authenticating…" : "Sign in with passkey"}
                </button>
              </form>
            ) : otpStep === "email" ? (
              <form onSubmit={handleSendCode} className="space-y-5">
                <div>
                  <label
                    htmlFor="otp-email"
                    className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Email address
                  </label>
                  <input
                    id="otp-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={otpEmail}
                    onChange={e => setOtpEmail(e.target.value)}
                    className={input}
                    placeholder="your.email@example.com"
                  />
                </div>
                <button type="submit" disabled={loading} className={btn}>
                  {loading ? "Sending…" : "Send code"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-5">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Code sent to{" "}
                  <span className="font-medium text-gray-900 dark:text-white">{otpEmail}</span>.
                </p>
                <input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  autoFocus
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                  className="block w-full text-center tracking-[0.6em] font-mono text-2xl px-3 py-3 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 focus:border-transparent"
                  placeholder="······"
                />
                <button type="submit" disabled={loading} className={btn}>
                  {loading ? "Working…" : "Verify & sign in"}
                </button>
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setOtpStep("email");
                      setCode("");
                    }}
                    disabled={loading}
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
                  >
                    ← Change email
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendCode({ preventDefault() {} } as React.FormEvent)}
                    disabled={loading}
                    className="font-medium text-slate-900 dark:text-emerald-400 hover:underline disabled:opacity-50"
                  >
                    Resend code
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Don&apos;t have an account?{" "}
              <Link
                href="/auth/register"
                className="font-semibold text-slate-900 hover:text-slate-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
              >
                Create a new account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
