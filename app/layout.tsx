import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Hanira AI — Inteligência que evolui com você",
    template: "%s · Hanira AI",
  },
  description:
    "Uma inteligência artificial pessoal, elegante e preparada para transformar ideias em ação.",
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
