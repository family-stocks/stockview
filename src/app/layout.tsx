import type { Metadata } from "next";
import "./globals.css";
import { Terminal } from "lucide-react";
import Link from "next/link";
import HeaderActions from "@/components/HeaderActions";

export const metadata: Metadata = {
  title: "StockConnect Research",
  description: "Equity research terminal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-nav">Skip to content</a>
        <div className="app-shell">
          <header className="topbar">
            <div className="container topbar-inner">
              <Link href="/" className="brand-mark">
                <Terminal size={24} aria-hidden="true" />
                <span>StockConnect</span>
              </Link>
              <div className="topbar-actions">
                <nav className="main-nav" aria-label="Primary navigation">
                  <Link href="/">Dashboard</Link>
                  <Link href="/jobs">Research Jobs</Link>
                </nav>
                <HeaderActions />
              </div>
            </div>
          </header>
          <main id="main" className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
