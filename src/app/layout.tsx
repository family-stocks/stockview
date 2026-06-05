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
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <header style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}>
            <div className="container flex items-center justify-between" style={{ height: '4rem' }}>
              <Link href="/" className="flex items-center gap-2 hover-bg-transition" style={{ padding: '0.5rem', borderRadius: '0.375rem' }}>
                <Terminal size={24} color="var(--accent-primary)" />
                <span style={{ fontWeight: 600, fontSize: '1.125rem', letterSpacing: '-0.025em' }}>StockConnect</span>
              </Link>
              <div className="flex items-center gap-4">
                <nav className="flex items-center gap-1">
                  <Link href="/" className="hover-bg-transition" style={{ padding: '0.375rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Dashboard
                  </Link>
                  <Link href="/jobs" className="hover-bg-transition" style={{ padding: '0.375rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Research Jobs
                  </Link>
                </nav>
                <HeaderActions />
              </div>
            </div>
          </header>
          <main style={{ flex: 1, padding: '2rem 0' }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
