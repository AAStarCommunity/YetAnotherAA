"use client";

/**
 * LanguageSwitcher — EN / 中文 toggle for the operator portal header.
 *
 * Usage: import LanguageSwitcher from "@/lib/i18n/LanguageSwitcher";
 *        <LanguageSwitcher />
 *
 * Renders nothing meaningful until mounted on the client to avoid a hydration
 * mismatch on the active-language highlight (i18n is client-only).
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "zh", label: "中文" },
] as const;

type LangCode = (typeof LANGUAGES)[number]["code"];

export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { i18n } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const active: LangCode = i18n.resolvedLanguage?.startsWith("zh") ? "zh" : "en";

  const changeLanguage = (code: LangCode) => {
    if (code !== active) {
      void i18n.changeLanguage(code);
    }
  };

  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 text-sm font-medium dark:border-gray-700 dark:bg-gray-800 ${className}`}
    >
      {LANGUAGES.map(lang => {
        const isActive = mounted && active === lang.code;
        return (
          <button
            key={lang.code}
            type="button"
            onClick={() => changeLanguage(lang.code)}
            aria-pressed={isActive}
            className={`rounded-md px-2.5 py-1 transition-colors ${
              isActive
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            {lang.label}
          </button>
        );
      })}
    </div>
  );
}
