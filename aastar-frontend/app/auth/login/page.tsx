"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Layout from "@/components/Layout";
import { authAPI } from "@/lib/api";
import { kmsClient } from "@/lib/yaaa";
import { setStoredAuth } from "@/lib/auth";
import toast from "react-hot-toast";
import { startAuthentication } from "@simplewebauthn/browser";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [loginMode, setLoginMode] = useState<"passkey" | "password">("passkey");
  const [email, setEmail] = useState("");
  const [passwordFormData, setPasswordFormData] = useState({
    email: "",
    password: "",
  });
  const router = useRouter();

  // ── KMS Passkey Login ──────────────────────────────────────────

  const handlePasskeyLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (loading) return;

    if (!email) {
      toast.error("Please enter your email address");
      return;
    }

    setLoading(true);
    let loadingToast: string | null = null;

    try {
      // Step 1: Get loginHash + walletAddress from backend
      loadingToast = toast.loading("Starting authentication...");
      const beginResponse = await authAPI.beginKmsLogin(email);
      const { walletAddress } = beginResponse.data;

      // Step 2: Call KMS BeginAuthentication with the wallet address
      toast.dismiss(loadingToast);
      loadingToast = toast.loading("Please authenticate with your passkey...");

      const authResponse = await kmsClient.beginAuthentication({
        Address: walletAddress,
      });

      // Step 3: Browser WebAuthn authentication ceremony
      const credential = await startAuthentication({ optionsJSON: authResponse.Options as any });

      // Step 4: Complete login via backend (backend calls KMS SignHash to verify)
      toast.dismiss(loadingToast);
      loadingToast = toast.loading("Completing authentication...");

      const completeResponse = await authAPI.completeKmsLogin({
        address: walletAddress,
        challengeId: authResponse.ChallengeId,
        credential,
      });

      const { access_token, user } = completeResponse.data;

      toast.dismiss(loadingToast);
      setStoredAuth(access_token, user);
      toast.success("Login successful!");
      router.push("/dashboard");
    } catch (error: any) {
      console.error("Passkey login error:", error);
      let message = "Authentication failed";

      if (error.response?.data?.message) {
        message = error.response.data.message;
      } else if (error.name === "NotAllowedError") {
        message = "Authentication was cancelled or not allowed";
      } else if (error.name === "NotSupportedError") {
        message = "Passkeys are not supported on this device";
      } else if (error.name === "SecurityError") {
        message = "Security error during authentication";
      } else if (error.message) {
        message = error.message;
      }

      if (loadingToast) {
        toast.dismiss(loadingToast);
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  // ── Password Login (fallback) ──────────────────────────────────

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!passwordFormData.email || !passwordFormData.password) {
      toast.error("Please enter your email and password");
      return;
    }

    setLoading(true);
    let loadingToast: string | null = null;

    try {
      loadingToast = toast.loading("Signing in...");
      const response = await authAPI.login({
        email: passwordFormData.email,
        password: passwordFormData.password,
      });

      const { access_token, user } = response.data;

      toast.dismiss(loadingToast);
      setStoredAuth(access_token, user);
      toast.success("Login successful!");
      router.push("/dashboard");
    } catch (error: any) {
      let message = "Login failed";
      if (error.response?.data?.message) {
        message = error.response.data.message;
      }
      if (loadingToast) {
        toast.dismiss(loadingToast);
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          {/* Logo/Brand Section */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-900 dark:bg-slate-800 mb-4 shadow-lg">
              <svg
                className="w-8 h-8 text-emerald-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome Back</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Sign in to your account</p>
          </div>

          {/* Mode Toggle */}
          <div className="flex bg-gray-200 dark:bg-gray-700 rounded-xl p-1 mb-6">
            <button
              onClick={() => setLoginMode("passkey")}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                loginMode === "passkey"
                  ? "bg-white dark:bg-gray-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              Passkey Login
            </button>
            <button
              onClick={() => setLoginMode("password")}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                loginMode === "password"
                  ? "bg-white dark:bg-gray-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              Password Login
            </button>
          </div>

          {/* Main Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 space-y-6 border border-gray-200 dark:border-gray-700">
            {loginMode === "passkey" ? (
              <>
                {/* Passkey Login Form */}
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
                      className="appearance-none block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 focus:border-transparent transition-all sm:text-sm"
                      placeholder="your.email@example.com"
                    />
                  </div>

                  {/* Info Box */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <svg
                          className="h-6 w-6 text-slate-700 dark:text-slate-300"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <div className="ml-3 flex-1">
                        <div className="text-sm text-slate-700 dark:text-slate-300">
                          <p>
                            Use Face ID, Touch ID, Windows Hello, or your security key to sign in
                            securely.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-base font-semibold rounded-xl text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-500 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                  >
                    {loading ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Authenticating...
                      </div>
                    ) : (
                      <div className="flex items-center">
                        <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Sign in with Passkey
                      </div>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <>
                {/* Password Login Form */}
                <form onSubmit={handlePasswordLogin} className="space-y-5">
                  <div>
                    <label
                      htmlFor="password-email"
                      className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
                    >
                      Email address
                    </label>
                    <input
                      id="password-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={passwordFormData.email}
                      onChange={e =>
                        setPasswordFormData({ ...passwordFormData, email: e.target.value })
                      }
                      className="appearance-none block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 focus:border-transparent transition-all sm:text-sm"
                      placeholder="your.email@example.com"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="password-input"
                      className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
                    >
                      Password
                    </label>
                    <input
                      id="password-input"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={passwordFormData.password}
                      onChange={e =>
                        setPasswordFormData({ ...passwordFormData, password: e.target.value })
                      }
                      className="appearance-none block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 focus:border-transparent transition-all sm:text-sm"
                      placeholder="Enter your password"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex justify-center py-3.5 px-4 border border-transparent text-base font-semibold rounded-xl text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-500 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                  >
                    {loading ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Signing in...
                      </div>
                    ) : (
                      "Sign in with Password"
                    )}
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Footer Links */}
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
