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
    // 🍄 favicon comes from app/icon.svg (file convention); icon-512 for PWA/larger.
    icon: [{ url: "/icon-512.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
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
