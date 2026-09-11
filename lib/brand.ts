export const HANIRA_BRAND = Object.freeze({
  name: "Hanira AI",
  shortName: "Hanira",
  intelligenceName: "Nira",
  creator: "Ronne Maicon Amaro dos Reis",
  description:
    "Hanira AI — converse, crie e trabalhe com a Nira, a inteligência da Hanira.",
  themeColor: "#0d0b11",
  backgroundColor: "#070608",
  canonicalSymbol: "/hanira-symbol.png",
  canonicalLogo: "/hanira-logo-primary.png",
  socialImage: "/brand/hanira-social.png",
} as const);

type PublicAppEnvironment = Readonly<{
  NODE_ENV?: string;
  NEXT_PUBLIC_APP_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
}>;

function parsePublicHttpUrl(value: string | undefined) {
  if (!value) return null;

  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function isLocalHost(url: URL) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

export function getCanonicalAppUrl(
  environment: PublicAppEnvironment = process.env,
) {
  const configured = parsePublicHttpUrl(environment.NEXT_PUBLIC_APP_URL);
  const isProduction = environment.NODE_ENV === "production";

  if (configured && (!isProduction || !isLocalHost(configured))) {
    return configured;
  }

  return parsePublicHttpUrl(environment.VERCEL_PROJECT_PRODUCTION_URL);
}
