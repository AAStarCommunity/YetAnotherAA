/**
 * i18next configuration for aastar-frontend (Next.js App Router, client-only).
 *
 * IMPORTANT: This module initializes i18next on the client only. Do NOT import
 * it from a Server Component or from a module that runs during SSR, otherwise
 * the server/client markup can diverge (hydration mismatch). It is consumed
 * exclusively through `I18nProvider` ("use client"), which is the only place
 * that should import this file.
 *
 * Ported/trimmed from registry: /Users/jason/Dev/aastar/registry/src/i18n/config.ts
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import zh from "./locales/zh.json";

// Guard against double init under React Strict Mode / Fast Refresh.
if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector) // detect language from localStorage / navigator
    .use(initReactI18next) // wire i18next into react-i18next
    .init({
      fallbackLng: "en",
      resources: {
        en: { translation: en },
        zh: { translation: zh },
      },
      detection: {
        order: ["localStorage", "navigator"],
        caches: ["localStorage"],
        lookupLocalStorage: "i18nextLng",
      },
      interpolation: {
        escapeValue: false, // React already escapes values
      },
      react: {
        // Render content immediately; resources are bundled so there is no async load.
        useSuspense: false,
      },
    });
}

export default i18n;
