import type { Metadata, Viewport } from "next";
import { InstallExperience } from "@/components/pwa/install-experience";
import { buildRootMetadata } from "@/lib/site-metadata";
import "./globals.css";

export const metadata: Metadata = buildRootMetadata();

// Next.js 14+ move themeColor from `metadata` to the `viewport` export
// (official syntax) to avoid the "Unsupported metadata themeColor... move to
// viewport export" build warning.
export const viewport: Viewport = {
  themeColor: "#0d0b11",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full">
        {children}
        <InstallExperience />
      </body>
    </html>
  );
}
