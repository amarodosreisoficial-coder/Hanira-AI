import { describe, expect, it } from "vitest";
import { getCanonicalAppUrl } from "../lib/brand";
import { buildRootMetadata } from "../lib/site-metadata";

describe("metadata social da Hanira", () => {
  it("publica canonical, Open Graph e Twitter com URL pública absoluta", () => {
    const metadata = buildRootMetadata({
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://hanira.example",
    });

    expect(String(metadata.metadataBase)).toBe("https://hanira.example/");
    expect(metadata.alternates).toEqual({ canonical: "/" });
    expect(metadata.description).toContain("Nira");
    expect(metadata.manifest).toBe("/manifest.webmanifest");
    expect(metadata.appleWebApp).toEqual(
      expect.objectContaining({ capable: true, title: "Hanira" }),
    );
    expect(metadata.openGraph).toEqual(
      expect.objectContaining({
        type: "website",
        siteName: "Hanira AI",
        url: "/",
        images: [expect.objectContaining({ url: "/brand/hanira-social.png" })],
      }),
    );
    expect(metadata.twitter).toEqual(
      expect.objectContaining({
        card: "summary_large_image",
        images: ["/brand/hanira-social.png"],
      }),
    );
  });

  it("não transforma localhost em canonical de produção", () => {
    expect(
      getCanonicalAppUrl({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "http://localhost:3051",
      }),
    ).toBeNull();
  });

  it("usa somente o domínio de produção automático da Vercel como fallback", () => {
    expect(
      getCanonicalAppUrl({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "http://localhost:3051",
        VERCEL_PROJECT_PRODUCTION_URL: "hanira.example",
      })?.href,
    ).toBe("https://hanira.example/");
  });
});
