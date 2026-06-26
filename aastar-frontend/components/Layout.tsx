"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
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
  ShieldExclamationIcon,
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
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [showServiceStatus, setShowServiceStatus] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  // Close the avatar dropdown when clicking/tapping anywhere outside it, or on
  // Escape — the GitHub-style behavior. A document-level pointerdown listener is
  // more robust than a backdrop overlay, which a higher z-index sticky header
  // would sit above (leaving header clicks unable to dismiss the menu).
  useEffect(() => {
    if (!avatarMenuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAvatarMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [avatarMenuOpen]);

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
            <div className="flex justify-between items-center h-16">
              {/* Brand */}
              <button onClick={() => router.push("/dashboard")} className="flex items-center gap-2">
                <Image src="/aastar-logo.png" alt="" width={22} height={26} />
                <span className="font-bold text-slate-900 dark:text-white">Cos72</span>
              </button>

              {/* Right: language, theme, account avatar menu */}
              <div className="flex items-center gap-1.5">
                <LanguageSwitcher />
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

                {/* Account avatar dropdown (GitHub-style) */}
                <div className="relative" ref={avatarMenuRef}>
                  <button
                    onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
                    className="flex items-center gap-1 rounded-full focus:outline-none"
                    aria-label="Account menu"
                    aria-expanded={avatarMenuOpen}
                  >
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 dark:bg-emerald-600 text-white text-sm font-semibold">
                      {(user.username || user.email || "?").charAt(0).toUpperCase()}
                    </span>
                    <ChevronDownIcon
                      className={`w-4 h-4 text-gray-400 transition-transform ${avatarMenuOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {avatarMenuOpen && (
                    <div className="absolute right-0 mt-2 w-64 rounded-xl shadow-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 z-50 py-1">
                      {/* Account header */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-900 dark:bg-emerald-600 text-white text-sm font-semibold shrink-0">
                          {(user.username || user.email || "?").charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {user.username || "Account"}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {user.email}
                          </p>
                        </div>
                      </div>

                      {[
                        {
                          title: "Profile",
                          items: [
                            { label: "Dashboard", path: "/dashboard", Icon: HomeIcon },
                            { label: "My Role", path: "/role", Icon: ShieldCheckIcon },
                            { label: "Transfer", path: "/transfer", Icon: PaperAirplaneIcon },
                            { label: "Recovery", path: "/recovery", Icon: ShieldCheckIcon },
                            { label: "Guard", path: "/guard", Icon: ShieldExclamationIcon },
                            { label: "Tier Security", path: "/tier-setup", Icon: ShieldCheckIcon },
                            { label: "Tasks", path: "/tasks", Icon: ClipboardDocumentListIcon },
                          ],
                        },
                        {
                          title: "Organizations",
                          items: [
                            { label: "Community", path: "/community", Icon: UserGroupIcon },
                            { label: "Operator", path: "/operator", Icon: ServerStackIcon },
                            { label: "Protocol", path: "/admin", Icon: Cog6ToothIcon },
                            { label: "Tokens", path: "/tokens", Icon: CreditCardIcon },
                            { label: "Paymasters", path: "/paymaster", Icon: WalletIcon },
                          ],
                        },
                        {
                          title: "Settings",
                          items: [
                            { label: "Tokens", path: "/tokens", Icon: WalletIcon },
                            { label: "NFTs", path: "/nfts", Icon: BookOpenIcon },
                            { label: "Address Book", path: "/address-book", Icon: BookOpenIcon },
                          ],
                        },
                      ].map(group => (
                        <div
                          key={group.title}
                          className="border-t border-gray-100 dark:border-gray-700 py-1"
                        >
                          <p className="px-4 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                            {group.title}
                          </p>
                          {group.items.map(item => {
                            const Icon = item.Icon;
                            return (
                              <button
                                key={item.path}
                                onClick={() => {
                                  router.push(item.path);
                                  setAvatarMenuOpen(false);
                                }}
                                className="flex items-center w-full px-4 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
                              >
                                <Icon className="w-4 h-4 mr-3 text-gray-400" />
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                      ))}

                      <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1">
                        <button
                          onClick={handleLogout}
                          className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          <ChevronRightIcon className="w-4 h-4 mr-3" />
                          Sign out
                        </button>
                      </div>
                    </div>
                  )}
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
        className={`flex flex-col items-center justify-center gap-2 pt-6 text-xs text-gray-400 dark:text-gray-600 ${
          user ? "pb-24 md:pb-6" : "pb-8"
        }`}
      >
        <div className="flex items-center gap-2">
          <Image
            src="/aastar-logo.png"
            alt="AAStar"
            width={18}
            height={22}
            className="opacity-80"
          />
          <span className="text-gray-500 dark:text-gray-400">
            Cos72 — an open-source cooperation system with value-added gas sponsorship.
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/about" className="hover:text-gray-600 dark:hover:text-gray-300">
            About
          </Link>
          <Link href="/contact" className="hover:text-gray-600 dark:hover:text-gray-300">
            Contact
          </Link>
          <Link href="/privacy" className="hover:text-gray-600 dark:hover:text-gray-300">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-gray-600 dark:hover:text-gray-300">
            Terms
          </Link>
          <span className="text-gray-300 dark:text-gray-700">·</span>
          <span>Powered by AAStar 2023</span>
        </div>
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
