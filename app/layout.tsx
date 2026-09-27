import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { FinanceProvider } from "@/lib/state/FinanceProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Financial X-Ray",
  description: "Understand your money. Plan your goals. Make better financial decisions.",
  appleWebApp: { capable: true, title: "Financial X-Ray", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f3f3ef",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={inter.variable}>
      <body className="min-h-dvh font-sans">
        <FinanceProvider>{children}</FinanceProvider>
      </body>
    </html>
  );
}
