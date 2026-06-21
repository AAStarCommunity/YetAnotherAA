"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { clearStoredAuth, getStoredAuth } from "@/lib/auth";
import { User } from "@/lib/types";
import { useTheme } from "@/lib/theme";
import ServiceStatus from "@/components/ServiceStatus";
import LanguageSwitcher from "@/lib/i18n/LanguageSwitcher";
import {
  SunIcon,
  MoonIcon,
  HomeIcon,
  PaperAirplaneIcon,
  WalletIcon,
  CreditCardIcon,
  Cog6ToothIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  BookOpenIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  ServerStackIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";

interface LayoutProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export default function Layout({ children, requireAuth = false }: LayoutProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopSettingsOpen, setDesktopSettingsOpen] = useState(false);
  const [showServiceStatus, setShowServiceStatus] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const { token, user: storedUser } = getStoredAuth();

    if (requireAuth && !token) {
      router.push("/auth/login");
      return;
    }

    if (!requireAuth && token) {
      router.push("/dashboard");
      return;
    }

    setUser(storedUser);
    setLoading(false);
  }, [requireAuth, router]);

  const handleLogout = () => {
    clearStoredAuth();
    setUser(null);
    router.push("/");
  };

  const getNavButtonClass = (path: string, isActive: boolean) => {
    const baseClass = "px-3 py-2 text-sm font-medium transition-all duration-200 relative";
    if (isActive) {
      return `${baseClass} text-slate-900 dark:text-emerald-400 border-b-2 border-slate-900 dark:border-emerald-400`;
    }
    return `${baseClass} text-gray-700 dark:text-gray-300 hover:text-slate-900 dark:hover:text-emerald-400 hover:border-b-2 hover:border-gray-300 dark:hover:border-gray-600`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-slate-900 dark:border-emerald-500"></div>
      </div>
    );
  }

  const getBottomNavButtonClass = (path: string, isActive: boolean) => {
    const baseClass =
      "flex flex-col items-center justify-center flex-1 py-2 px-1 transition-all duration-200 touch-manipulation active:scale-95";
    if (isActive) {
      return `${baseClass} text-slate-900 dark:text-emerald-400 font-semibold`;
    }
    return `${baseClass} text-gray-400 dark:text-gray-500`;
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* Top Navigation - Desktop only */}
      {user && (
        <nav className="hidden md:block sticky top-0 z-50 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 backdrop-blur-lg bg-opacity-90 dark:bg-opacity-90">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center"></div>

              {/* Desktop Navigation */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => router.push("/dashboard")}
                  className={getNavButtonClass("/dashboard", pathname === "/dashboard")}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => router.push("/role")}
                  className={getNavButtonClass("/role", pathname === "/role")}
                >
                  My Role
                </button>
                <button
                  onClick={() => router.push("/community")}
                  className={getNavButtonClass("/community", pathname.startsWith("/community"))}
                >
                  Community
                </button>
                <button
                  onClick={() => router.push("/operator")}
                  className={getNavButtonClass("/operator", pathname.startsWith("/operator"))}
                >
                  Operator
                </button>
                <button
                  onClick={() => router.push("/admin")}
                  className={getNavButtonClass("/admin", pathname.startsWith("/admin"))}
                >
                  Protocol
                </button>
                <button
                  onClick={() => router.push("/sale")}
                  className={getNavButtonClass("/sale", pathname.startsWith("/sale"))}
                >
                  Sale
                </button>
                <button
                  onClick={() => router.push("/transfer")}
                  className={getNavButtonClass("/transfer", pathname.startsWith("/transfer"))}
                >
                  Transfer
                </button>
                <button
                  onClick={() => router.push("/paymaster")}
                  className={getNavButtonClass("/paymaster", pathname === "/paymaster")}
                >
                  Paymasters
                </button>
                <button
                  onClick={() => router.push("/tasks")}
                  className={getNavButtonClass("/tasks", pathname.startsWith("/tasks"))}
                >
                  Tasks
                </button>
                <button
                  onClick={() => router.push("/recovery")}
                  className={getNavButtonClass("/recovery", pathname === "/recovery")}
                >
                  Recovery
                </button>
                {/* Settings Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setDesktopSettingsOpen(!desktopSettingsOpen)}
                    className={`${getNavButtonClass("/settings", pathname === "/tokens" || pathname === "/nfts" || pathname === "/address-book")} inline-flex items-center gap-1`}
                  >
                    Settings
                    <ChevronDownIcon
                      className={`w-4 h-4 transition-transform ${desktopSettingsOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {desktopSettingsOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setDesktopSettingsOpen(false)}
                      />
                      <div className="absolute right-0 mt-2 w-56 rounded-xl shadow-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 z-20">
                        <div className="py-2">
                          <button
                            onClick={() => {
                              router.push("/tokens");
                              setDesktopSettingsOpen(false);
                            }}
                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
                          >
                            <WalletIcon className="w-5 h-5 mr-3" />
                            Tokens
                          </button>
                          <button
                            onClick={() => {
                              router.push("/nfts");
                              setDesktopSettingsOpen(false);
                            }}
                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
                          >
                            <svg
                              className="w-5 h-5 mr-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            NFTs
                          </button>
                          <button
                            onClick={() => {
                              router.push("/address-book");
                              setDesktopSettingsOpen(false);
                            }}
                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
                          >
                            <BookOpenIcon className="w-5 h-5 mr-3" />
                            Address Book
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {/* Language Switcher */}
                <LanguageSwitcher />
                {/* Theme Toggle Button */}
                <button
                  onClick={toggleTheme}
                  className="p-2 text-gray-700 dark:text-gray-300 hover:text-slate-900 dark:hover:text-emerald-400 rounded-md transition-colors"
                  title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
                >
                  {theme === "light" ? (
                    <MoonIcon className="h-5 w-5" />
                  ) : (
                    <SunIcon className="h-5 w-5" />
                  )}
                </button>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {user.username || user.email}
                  </span>
                  <button
                    onClick={handleLogout}
                    className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-all shadow-sm hover:shadow-md"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </nav>
      )}

      {/* Main content with bottom padding for mobile nav */}
      <main className={user ? "md:py-6 pb-20 md:pb-6" : ""}>{children}</main>

      {/* Footer — shown on mobile + desktop; extra bottom padding on mobile when the
          fixed bottom nav is present (logged in) so it isn't hidden behind it. */}
      <footer
        className={`flex items-center justify-center gap-2 pt-4 text-xs text-gray-400 dark:text-gray-600 ${
          user ? "pb-24 md:pb-4" : "pb-6"
        }`}
      >
        <Image src="/aastar-logo.png" alt="AAStar" width={20} height={24} className="opacity-80" />
        <span>Powered by AAStar 2023</span>
      </footer>

      {/* Service Status - Desktop only (mobile version is embedded in Me menu) */}
      <div className="hidden md:block">
        <ServiceStatus />
      </div>

      {/* Bottom Navigation Bar - Mobile only */}
      {user && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg">
          <div className="flex items-center justify-around h-16 px-2 safe-area-inset-bottom">
            {/* Dashboard */}
            <button
              onClick={() => router.push("/dashboard")}
              className={getBottomNavButtonClass("/dashboard", pathname === "/dashboard")}
            >
              <HomeIcon className="h-6 w-6 mb-1" />
              <span className="text-xs font-medium">Home</span>
            </button>

            {/* My Role */}
            <button
              onClick={() => router.push("/role")}
              className={getBottomNavButtonClass("/role", pathname === "/role")}
            >
              <ShieldCheckIcon className="h-6 w-6 mb-1" />
              <span className="text-xs font-medium">My Role</span>
            </button>

            {/* Community */}
            <button
              onClick={() => router.push("/community")}
              className={getBottomNavButtonClass("/community", pathname.startsWith("/community"))}
            >
              <UserGroupIcon className="h-6 w-6 mb-1" />
              <span className="text-xs font-medium">Community</span>
            </button>

            {/* Operator */}
            <button
              onClick={() => router.push("/operator")}
              className={getBottomNavButtonClass("/operator", pathname.startsWith("/operator"))}
            >
              <ServerStackIcon className="h-6 w-6 mb-1" />
              <span className="text-xs font-medium">Operator</span>
            </button>

            {/* Tasks */}
            <button
              onClick={() => router.push("/tasks")}
              className={getBottomNavButtonClass("/tasks", pathname.startsWith("/tasks"))}
            >
              <ClipboardDocumentListIcon className="h-6 w-6 mb-1" />
              <span className="text-xs font-medium">Tasks</span>
            </button>

            {/* Transfer */}
            <button
              onClick={() => router.push("/transfer")}
              className={getBottomNavButtonClass("/transfer", pathname.startsWith("/transfer"))}
            >
              <PaperAirplaneIcon className="h-6 w-6 mb-1" />
              <span className="text-xs font-medium">Transfer</span>
            </button>

            {/* Paymaster */}
            <button
              onClick={() => router.push("/paymaster")}
              className={getBottomNavButtonClass("/paymaster", pathname === "/paymaster")}
            >
              <CreditCardIcon className="h-6 w-6 mb-1" />
              <span className="text-xs font-medium">Paymaster</span>
            </button>

            {/* Settings Menu */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={getBottomNavButtonClass(
                "/address-book",
                pathname === "/address-book" || mobileMenuOpen
              )}
            >
              <Cog6ToothIcon className="h-6 w-6 mb-1" />
              <span className="text-xs font-medium">Settings</span>
            </button>
          </div>
        </nav>
      )}

      {/* Mobile User Menu Overlay */}
      {mobileMenuOpen && user && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black bg-opacity-50"
          onClick={() => {
            setMobileMenuOpen(false);
            setShowServiceStatus(false);
          }}
        >
          <div
            className="fixed bottom-16 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-xl max-h-[70vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 space-y-2">
              {/* User Info */}
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <div className="text-base font-semibold text-gray-900 dark:text-white truncate">
                  {user.username || user.email}
                </div>
              </div>

              {/* Tokens */}
              <button
                onClick={() => {
                  router.push("/tokens");
                  setMobileMenuOpen(false);
                }}
                className="flex items-center justify-between w-full px-4 py-3 text-left text-base font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-slate-50 dark:hover:bg-gray-600 rounded-lg transition-all touch-manipulation active:scale-95"
              >
                <div className="flex items-center gap-3">
                  <WalletIcon className="w-5 h-5" />
                  <span>Tokens</span>
                </div>
                <ChevronRightIcon className="w-5 h-5" />
              </button>

              {/* NFTs */}
              <button
                onClick={() => {
                  router.push("/nfts");
                  setMobileMenuOpen(false);
                }}
                className="flex items-center justify-between w-full px-4 py-3 text-left text-base font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-slate-50 dark:hover:bg-gray-600 rounded-lg transition-all touch-manipulation active:scale-95"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span>NFTs</span>
                </div>
                <ChevronRightIcon className="w-5 h-5" />
              </button>

              {/* Address Book */}
              <button
                onClick={() => {
                  router.push("/address-book");
                  setMobileMenuOpen(false);
                }}
                className="flex items-center justify-between w-full px-4 py-3 text-left text-base font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-slate-50 dark:hover:bg-gray-600 rounded-lg transition-all touch-manipulation active:scale-95"
              >
                <div className="flex items-center gap-3">
                  <BookOpenIcon className="w-5 h-5" />
                  <span>Address Book</span>
                </div>
                <ChevronRightIcon className="w-5 h-5" />
              </button>

              {/* Language Switcher */}
              <div className="flex items-center justify-between w-full px-4 py-3 text-base font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 rounded-lg">
                <span>Language</span>
                <LanguageSwitcher />
              </div>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="flex items-center justify-between w-full px-4 py-3 text-left text-base font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-slate-50 dark:hover:bg-gray-600 rounded-lg transition-all touch-manipulation active:scale-95"
              >
                <div className="flex items-center gap-3">
                  {theme === "light" ? (
                    <MoonIcon className="w-5 h-5" />
                  ) : (
                    <SunIcon className="w-5 h-5" />
                  )}
                  <span>{theme === "light" ? "Dark Mode" : "Light Mode"}</span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {theme === "light" ? "Off" : "On"}
                </div>
              </button>

              {/* Service Status Toggle */}
              <button
                onClick={() => setShowServiceStatus(!showServiceStatus)}
                className="flex items-center justify-between w-full px-4 py-3 text-left text-base font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-slate-50 dark:hover:bg-gray-600 rounded-lg transition-all touch-manipulation active:scale-95"
              >
                <div className="flex items-center gap-3">
                  <Cog6ToothIcon className="w-5 h-5" />
                  <span>Service Status</span>
                </div>
                <ChevronRightIcon
                  className={`w-5 h-5 transition-transform ${showServiceStatus ? "rotate-90" : ""}`}
                />
              </button>

              {/* Embedded Service Status - shown when toggle is active */}
              {showServiceStatus && (
                <div className="bg-slate-50 dark:bg-gray-900/50 rounded-lg p-3 space-y-2">
                  <ServiceStatus isOpen={true} onClose={() => setShowServiceStatus(false)} />
                </div>
              )}

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="block w-full text-center px-4 py-3 text-base font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg transition-all shadow-sm hover:shadow-md touch-manipulation active:scale-95"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
