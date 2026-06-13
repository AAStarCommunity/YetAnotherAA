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

import { I18nextProvider } from "react-i18next";

import i18n from "./config";

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
