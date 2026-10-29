import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OAuth Readiness: OAuth app setup & approval guides",
  description: "How long will it take to get your OAuth app approved? Shareable, evidence-labelled setup guides for developers building AI agents.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
          <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-zinc-900 text-[11px] text-white dark:bg-white dark:text-zinc-900">OR</span>
              OAuth Readiness
            </Link>
            <div className="flex items-center gap-5 text-sm text-zinc-600 dark:text-zinc-400">
              <Link href="/" className="hover:text-zinc-900 dark:hover:text-white">Library</Link>
              <Link href="/generate" className="hover:text-zinc-900 dark:hover:text-white">Generate</Link>
              <Link href="/method" className="hover:text-zinc-900 dark:hover:text-white">Method</Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-10">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-zinc-500">
          Guides are research, not provider guarantees. Every claim is labelled tested, documented, reported, or inferred. Check the linked sources before you commit to a launch date.
        </footer>
      </body>
    </html>
  );
}
