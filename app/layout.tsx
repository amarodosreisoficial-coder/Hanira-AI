import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Hanira AI — Inteligência que evolui com você",
    template: "%s · Hanira AI",
  },
  description:
    "Uma inteligência artificial pessoal, elegante e preparada para transformar ideias em ação.",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

// Next.js 14+ move themeColor from `metadata` to the `viewport` export
// (official syntax) to avoid the "Unsupported metadata themeColor... move to
// viewport export" build warning.
export const viewport: Viewport = {
  themeColor: "#0d0b11",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
