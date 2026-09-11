import type { MetadataRoute } from "next";
import { HANIRA_BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: HANIRA_BRAND.name,
    short_name: HANIRA_BRAND.shortName,
    description: HANIRA_BRAND.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: HANIRA_BRAND.backgroundColor,
    theme_color: HANIRA_BRAND.themeColor,
    lang: "pt-BR",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/icons/hanira-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/hanira-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/hanira-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
