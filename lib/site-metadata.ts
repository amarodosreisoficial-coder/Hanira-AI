import type { Metadata } from "next";
import { HANIRA_BRAND, getCanonicalAppUrl } from "@/lib/brand";

type MetadataEnvironment = Parameters<typeof getCanonicalAppUrl>[0];

export function buildRootMetadata(
  environment: MetadataEnvironment = process.env,
): Metadata {
  const metadataBase = getCanonicalAppUrl(environment);
  const socialImage = metadataBase
    ? [
        {
          url: HANIRA_BRAND.socialImage,
          width: 1200,
          height: 630,
          alt: "Hanira AI — Nira, a inteligência da Hanira",
          type: "image/png",
        },
      ]
    : undefined;

  return {
    metadataBase: metadataBase ?? undefined,
    applicationName: HANIRA_BRAND.name,
    title: {
      default: "Hanira AI — Inteligência que evolui com você",
      template: "%s · Hanira AI",
    },
    description: HANIRA_BRAND.description,
    manifest: "/manifest.webmanifest",
    authors: [{ name: HANIRA_BRAND.creator }],
    creator: HANIRA_BRAND.creator,
    publisher: HANIRA_BRAND.name,
    appleWebApp: {
      capable: true,
      title: HANIRA_BRAND.shortName,
      statusBarStyle: "black-translucent",
    },
    alternates: metadataBase ? { canonical: "/" } : undefined,
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: HANIRA_BRAND.name,
      title: HANIRA_BRAND.name,
      description: HANIRA_BRAND.description,
      url: metadataBase ? "/" : undefined,
      images: socialImage,
    },
    twitter: {
      card: "summary_large_image",
      title: HANIRA_BRAND.name,
      description: HANIRA_BRAND.description,
      images: socialImage?.map((image) => image.url),
    },
  };
}
