import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Pacote 17.6 — estados do dashboard de uso e ordenacao do rate limit.
const dashboard = readFileSync(new URL("../components/usage/usage-dashboard.tsx", import.meta.url), "utf8");
const chatRoute = readFileSync(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");
const rateLimit = readFileSync(new URL("../lib/security/rate-limit.ts", import.meta.url), "utf8");

describe("usage dashboard states (17.6)", () => {
  it("estado limite atingido com copy de produto e renovacao diaria", () => {
    expect(dashboard).toContain('"Limite de hoje atingido"');
    expect(dashboard).toContain("Você usou o limite de hoje. Ele volta na renovação diária.");
  });

  it("estado perto do limite (20%) apenas reforcado, sem alarme tecnico", () => {
    expect(dashboard).toContain("isNearLimit");
    expect(dashboard).toContain("entry.remaining / entry.limit <= 0.2");
  });

  it("erro temporary disponibilidade oferece retry acessivel", () => {
    expect(dashboard).toContain("Tentar novamente");
    expect(dashboard).toMatch(/<button[^>]*type="button"[^>]*>/);
    expect(dashboard).toContain("aria-label=\"Uso da Hanira\"");
  });

  it("sem copy financeira (creditos, carteira, billing, preco)", () => {
    const lower = dashboard.toLowerCase();
    for (const banned of ["crédito", "wallet", "billing", "assinatura", "r$", "preço"]) {
      expect(lower).not.toContain(banned);
    }
  });
});

describe("rate limit vs quota ordering (17.6)", () => {
  it("rate limit (429) acontece ANTES do consumo de quota distribuida no chat", () => {
    const rateAt = chatRoute.indexOf("checkRateLimit");
    const quotaAt = chatRoute.indexOf("consumeDailyUsage");
    expect(rateAt).toBeGreaterThan(-1);
    expect(quotaAt).toBeGreaterThan(rateAt);
  });

  it("rate limit in-memory e por instancia — documentado como best-effort", () => {
    expect(rateLimit).toContain("new Map");
    // Sem dependencia externa (Redis/Upstash) — invariantes R$0 preservadas.
    expect(rateLimit).not.toMatch(/redis|upstash|import\s+from/i);
  });

  it("rate limit retorna Retry-After e nao toca o usage guard no caminho 429", () => {
    expect(chatRoute).toContain('"Retry-After": String(rate.retryAfter)');
    // Rate-limited: resposta direta antes de qualquer consumo de quota.
    const rateLimitedReturn = chatRoute.indexOf("event: \"rate_limited\"");
    const demoBypass = chatRoute.indexOf("user.demo");
    expect(rateLimitedReturn).toBeGreaterThan(-1);
    expect(rateLimitedReturn).toBeLessThan(demoBypass);
  });
});
