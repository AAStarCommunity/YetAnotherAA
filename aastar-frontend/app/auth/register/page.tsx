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

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [walletStatus, setWalletStatus] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!formData.email) {
      toast.error("Please enter your email address");
      return;
    }

    if (!formData.password) {
      toast.error("Please enter a password");
      return;
    }

    if (formData.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    let loadingToast: string | null = null;

    try {
      // Step 1: Register user account (email/password) → get JWT
      loadingToast = toast.loading("Creating account...");
      const registerResponse = await authAPI.register({
        email: formData.email,
        username: formData.username || undefined,
        password: formData.password,
      });

      const { access_token, user } = registerResponse.data;
      setStoredAuth(access_token, user);

      // Step 2: Begin KMS WebAuthn registration
      toast.dismiss(loadingToast);
      loadingToast = toast.loading("Starting passkey registration...");

      const beginResponse = await kmsClient.beginRegistration({
        Description: user.id,
        UserName: formData.email,
        UserDisplayName: formData.username || formData.email.split("@")[0],
      });

      // Step 3: Browser WebAuthn registration ceremony
      toast.dismiss(loadingToast);
      loadingToast = toast.loading("Please complete the passkey setup with your authenticator...");
      const credential = await startRegistration({
        optionsJSON: beginResponse.Options as any,
      });

      // Step 4: Complete KMS registration → get KeyId
      toast.dismiss(loadingToast);
      loadingToast = toast.loading("Completing passkey registration...");

      const completeResponse = await kmsClient.completeRegistration({
        ChallengeId: beginResponse.ChallengeId,
        Credential: credential,
        Description: user.id,
      });

      const { KeyId, CredentialId } = completeResponse;

      // Step 5: Poll for key readiness (address derivation takes 60-75s on STM32)
      toast.dismiss(loadingToast);
      setWalletStatus("Creating your wallet... This may take up to 2 minutes.");
      loadingToast = toast.loading("Deriving wallet address (this may take a moment)...");

      const keyStatus = await kmsClient.pollUntilReady(KeyId, 150_000, 3_000);

      if (!keyStatus.Address) {
        throw new Error("Key derivation completed but no address returned");
      }

      // Step 6: Link wallet to user account
      toast.dismiss(loadingToast);
      loadingToast = toast.loading("Linking wallet to your account...");

      await authAPI.linkWallet({
        kmsKeyId: KeyId,
        address: keyStatus.Address,
        credentialId: CredentialId,
      });

      toast.dismiss(loadingToast);
      setWalletStatus(null);
      toast.success("Account created with passkey wallet!");
      router.push("/dashboard");
    } catch (error: any) {
      console.error("Registration error:", error);
      let message = "Registration failed";

      if (error.response?.data?.message) {
        message = error.response.data.message;
      } else if (error.name === "NotAllowedError") {
        message = "Passkey registration was cancelled or not allowed";
      } else if (error.name === "NotSupportedError") {
        message = "Passkeys are not supported on this device";
      } else if (error.name === "SecurityError") {
        message = "Security error during passkey registration";
      } else if (error.message) {
        message = error.message;
      }

      if (loadingToast) {
        toast.dismiss(loadingToast);
      }
      setWalletStatus(null);
      toast.error(message);
    } finally {
      setLoading(false);
      if (loadingToast) {
        toast.dismiss(loadingToast);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const getPasswordStrength = (password: string) => {
    if (password.length === 0) return { strength: 0, label: "", color: "" };
    if (password.length < 6) return { strength: 1, label: "Weak", color: "bg-red-500" };
    if (password.length < 10) return { strength: 2, label: "Fair", color: "bg-yellow-500" };
    if (password.length < 14) return { strength: 3, label: "Good", color: "bg-blue-500" };
    return { strength: 4, label: "Strong", color: "bg-green-500" };
  };

  const passwordStrength = getPasswordStrength(formData.password);

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
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Create Your Account
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Join us with secure passkey authentication
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
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700">
            {/* How your account is protected — shown up-front at account creation */}
            <div className="mb-5 rounded-lg bg-slate-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 p-4 text-xs text-gray-600 dark:text-gray-400 space-y-1">
              <p className="font-semibold text-gray-700 dark:text-gray-300">
                🔑 No seed phrase — protected by social recovery
              </p>
              <p>
                Your account is guarded by <span className="font-medium">3 guardians</span>; any{" "}
                <span className="font-medium">2</span> can help you move it to a new device.{" "}
                <span className="font-medium">2 are yours, 1 is the community.</span>
              </p>
              <p>
                Because the community is <span className="font-medium">only 1 of 3</span>, it can
                never reach the 2 needed — so even a rogue community{" "}
                <span className="font-medium">can never touch your funds</span>. Lose one of your
                two? You can still recover with your remaining guardian + the community, which
                confirms it&apos;s really you through real social relationships (not a password).
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
                >
                  Email address *
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="appearance-none block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 focus:border-transparent transition-all sm:text-sm"
                  placeholder="your.email@example.com"
                />
              </div>

              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
                >
                  Username <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  value={formData.username}
                  onChange={handleChange}
                  className="appearance-none block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 focus:border-transparent transition-all sm:text-sm"
                  placeholder="Choose a username"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
                >
                  Password *
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="appearance-none block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 focus:border-transparent transition-all sm:text-sm"
                  placeholder="Create a strong password (min 6 characters)"
                />
                {formData.password && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        Password strength:
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          passwordStrength.strength === 1
                            ? "text-red-600 dark:text-red-500"
                            : passwordStrength.strength === 2
                              ? "text-orange-600 dark:text-orange-500"
                              : passwordStrength.strength === 3
                                ? "text-sky-600 dark:text-sky-500"
                                : "text-emerald-600 dark:text-emerald-500"
                        }`}
                      >
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          passwordStrength.strength === 1
                            ? "bg-red-500"
                            : passwordStrength.strength === 2
                              ? "bg-orange-500"
                              : passwordStrength.strength === 3
                                ? "bg-sky-500"
                                : "bg-emerald-500"
                        }`}
                        style={{ width: `${(passwordStrength.strength / 4) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
                >
                  Confirm Password *
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="appearance-none block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 focus:border-transparent transition-all sm:text-sm"
                    placeholder="Confirm your password"
                  />
                  {formData.confirmPassword && formData.password === formData.confirmPassword && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      <svg
                        className="h-5 w-5 text-emerald-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress Indicator */}
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 dark:bg-emerald-600">
                      <span className="text-lg font-bold text-white">1</span>
                    </div>
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Step 1 of 3: Account Details
                    </h3>
                    <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                      <p>
                        After submitting, you&apos;ll set up a passkey, then your wallet will be
                        created automatically (takes ~1 minute).
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3.5 px-4 border border-transparent text-base font-semibold rounded-xl text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-emerald-500 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                {loading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Setting up passkey...
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
                    Continue to Passkey Setup
                  </div>
                )}
              </button>
            </form>
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
