import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "@/lib/theme";
import { DashboardProvider } from "@/contexts/DashboardContext";
import { TaskProvider } from "@/contexts/TaskContext";
import I18nProvider from "@/lib/i18n/I18nProvider";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export const metadata: Metadata = {
  title:
    "Cos72: A Cooperation System, Open Source, Powerful and Easy to Use: Any one, Any Where, Any time",
  description: "ERC4337 Account Abstraction with BLS Signatures",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AAStar",
  },
  icons: {
    // 🍄 emoji favicon (app/icon.svg) on every page — inline SVG, no raster asset.
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <I18nProvider>
          <ThemeProvider>
            <DashboardProvider>
              <TaskProvider>
                {children}
                <Toaster position="top-right" />
              </TaskProvider>
            </DashboardProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
