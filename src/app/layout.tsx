import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "md-ai",
  description: "Two-panel Markdown and chat workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased font-sans bg-gray-50 text-gray-900">
        <main className="min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
