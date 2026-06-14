"use client";

/**
 * I18nProvider — client-only i18next provider for the App Router.
 *
 * Integration (do NOT let me edit app/layout.tsx — wire it yourself):
 *
 *   // app/layout.tsx
 *   import I18nProvider from "@/lib/i18n/I18nProvider";
 *
 *   export default function RootLayout({ children }: { children: React.ReactNode }) {
 *     return (
 *       <html lang="en">
 *         <body>
 *           <I18nProvider>{children}</I18nProvider>
 *         </body>
 *       </html>
 *     );
 *   }
 *
 * Place <I18nProvider> as high as possible (just inside <body>) so every client
 * component below it can call useTranslation(). Keep it a client boundary — the
 * i18next instance is initialized only on the client to avoid hydration drift.
 */

import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "./config";

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  // Keep <html lang> in sync with the active i18next language. The root
  // app/layout.tsx renders <html lang="en"> for SSR; here we update it on the
  // client once i18next resolves the stored/detected language, and on every
  // languageChanged event thereafter.
  useEffect(() => {
    const syncHtmlLang = (lng: string) => {
      document.documentElement.lang = lng?.startsWith("zh") ? "zh" : "en";
    };

    syncHtmlLang(i18n.resolvedLanguage || i18n.language);
    i18n.on("languageChanged", syncHtmlLang);

    return () => {
      i18n.off("languageChanged", syncHtmlLang);
    };
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
