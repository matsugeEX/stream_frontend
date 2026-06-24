import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stream Platform",
  description: "Low latency streaming platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-zinc-950 text-white">
        <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="text-xl font-bold">Logo</div>
          <nav className="flex gap-6">
            <span>Streams</span>
            <span>Login</span>
          </nav>
        </header>

        {children}

        <footer className="border-t border-zinc-800 px-6 py-4 text-center text-sm text-zinc-400">
          footer
        </footer>
      </body>
    </html>
  );
}