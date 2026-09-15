import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Pacote 17.6: readiness seguro — estados genericos, sem segredos, com
// sinal do guard distribuido (migration 009) e identificacao de release.
const readiness = readFileSync(new URL("../app/api/readiness/route.ts", import.meta.url), "utf8");

describe("readiness /api/readiness (17.6)", () => {
  it("verifica daily_usage (guard distribuido) via head select", () => {
    expect(readiness).toContain('from("daily_usage")');
    expect(readiness).toContain("usageGuard");
    expect(readiness).toContain("usageTracking");
  });

  it("expoe capability states seguros text/image/usageTracking", () => {
    expect(readiness).toContain('"available" | "unavailable"');
    expect(readiness).toContain('image: "disabled"');
    expect(readiness).not.toMatch(/apiKey|apiToken:|CLOUDFLARE_AI_API_TOKEN\s*=/);
  });

  it("nao expoe segredos nem valores de env na resposta", () => {
    expect(readiness).toContain("CLOUDFLARE_AI_ACCOUNT_ID &&");
    expect(readiness).toMatch(/Boolean\(process\.env\.CLOUDFLARE_AI_ACCOUNT_ID && process\.env\.CLOUDFLARE_AI_API_TOKEN\)/);
    // Apenas booleano derivado; nenhum valor cru vai para o JSON.
    expect(readiness).not.toContain("imageConfigured: process.env");
  });

  it("inclui release info segura no payload autenticado de readiness", () => {
    expect(readiness).toContain("getReleaseInfo()");
  });

  it("demo nao finge guard distribuido", () => {
    expect(readiness).toContain('usageTracking: "disabled"');
    expect(readiness).toContain("usageGuard: false");
  });
});
