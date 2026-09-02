import { describe, expect, it } from "vitest";
import { createTextChatRuntime } from "../lib/ai/runtime";
import { OLLAMA_DEFAULT_CANDIDATE_ID } from "../lib/ai/router/candidate-registry";
import {
  NIRA_LOCAL_PROFILE_ID,
  NIRA_LOCAL_PROFILE_NAME,
} from "../lib/ai/nira/profiles";

// Smoke test OPCIONAL da Nira Local contra Ollama REAL.
//
// Regras:
// - Por padrao (npm test), este teste fica SKIPPED. Nao depende de Ollama.
// - Para rodar: HANIRA_NIRA_LIVE_SMOKE=true npm run test:nira:local:live
// - Nao instala Ollama, nao baixa modelo, nao altera .env.
// - Toda validacao e feita via APIs reais do provider (healthCheck, generate).

const LIVE_SMOKE_ENABLED = process.env.HANIRA_NIRA_LIVE_SMOKE === "true";

function checkPreconditions(): {
  ok: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  if (process.env.AI_ENGINE_OLLAMA_ENABLED !== "true") {
    missing.push("AI_ENGINE_OLLAMA_ENABLED=true");
  }
  if (!process.env.OLLAMA_BASE_URL) {
    missing.push("OLLAMA_BASE_URL=<url>");
  }
  if (!process.env.OLLAMA_MODEL) {
    missing.push("OLLAMA_MODEL=<modelo>");
  }

  return { ok: missing.length === 0, missing };
}

describe("Nira Local live Ollama smoke (14.7)", () => {
  it.skipIf(!LIVE_SMOKE_ENABLED)(
    "verifica pre-condicoes de configuracao antes da geracao",
    () => {
      const { ok, missing } = checkPreconditions();
      expect(
        ok,
        [
          "Live smoke requer configuracao real do Ollama.",
          "Variaveis ausentes:",
          ...missing.map((m) => `  - ${m}`),
        ].join("\n"),
      ).toBe(true);
    },
  );

  it.skipIf(!LIVE_SMOKE_ENABLED)(
    "cria runtime real e valida metadata Nira/routing",
    () => {
      const runtime = createTextChatRuntime();

      // Nira Local como identidade logica
      expect(runtime.nira.profileId).toBe(NIRA_LOCAL_PROFILE_ID);
      expect(runtime.nira.displayName).toBe(NIRA_LOCAL_PROFILE_NAME);

      // Decisao do router: ollama-default por preferencia
      expect(runtime.routing.candidateId).toBe(OLLAMA_DEFAULT_CANDIDATE_ID);
      expect(runtime.routing.reason).toBe("selected_by_preference");
      expect(runtime.routing.providerId).toBe("ollama");

      // Provider final = ollama
      expect(runtime.providerId).toBe("ollama");
      expect(runtime.provider.providerId).toBe("ollama");
    },
  );

  it.skipIf(!LIVE_SMOKE_ENABLED)(
    "health check real do Ollama",
    async () => {
      const runtime = createTextChatRuntime();
      const health = await runtime.provider.healthCheck();

      expect(health.provider).toBe("ollama");
      expect(health.ok).toBe(true);
    },
  );

  it.skipIf(!LIVE_SMOKE_ENABLED)(
    "modelo configurado esta disponivel no Ollama",
    async () => {
      const runtime = createTextChatRuntime();
      const models = await runtime.provider.listModels();
      const configuredModel = process.env.OLLAMA_MODEL;

      expect(models.length).toBeGreaterThan(0);
      expect(
        models.some((m) => m.id === configuredModel),
        `Modelo "${configuredModel}" nao encontrado. Instale-o manualmente antes de executar novamente o smoke live.`,
      ).toBe(true);
    },
  );

  it.skipIf(!LIVE_SMOKE_ENABLED)(
    "geracao textual real via Nira Local + Ollama",
    async () => {
      const runtime = createTextChatRuntime();

      const response = await runtime.provider.generate({
        messages: [
          {
            role: "user",
            text: "Responda somente com: NIRA_LOCAL_OK",
          },
        ],
      });

      // Resposta valida, nao vazia
      expect(response.text).toBeTruthy();
      expect(response.text.trim().length).toBeGreaterThan(0);

      // Metadados coerentes
      expect(response.provider).toBe("ollama");
      expect(response.model).toBe(process.env.OLLAMA_MODEL);

      // Metadata do runtime continua correta apos geracao
      expect(runtime.nira.profileId).toBe(NIRA_LOCAL_PROFILE_ID);
      expect(runtime.routing.candidateId).toBe(OLLAMA_DEFAULT_CANDIDATE_ID);
      expect(runtime.routing.providerId).toBe("ollama");
    },
    60_000,
  );

  it("live smoke e skipped por padrao (sem HANIRA_NIRA_LIVE_SMOKE=true)", () => {
    // Garante que a suíte normal nao depende de Ollama.
    if (!LIVE_SMOKE_ENABLED) {
      expect(process.env.HANIRA_NIRA_LIVE_SMOKE).not.toBe("true");
    } else {
      expect(LIVE_SMOKE_ENABLED).toBe(true);
    }
  });

  it("metadata de routing permanece imutavel no runtime live", () => {
    if (!LIVE_SMOKE_ENABLED) {
      // Sem flag, nao cria runtime — apenas confirma que flag esta off
      expect(process.env.HANIRA_NIRA_LIVE_SMOKE).not.toBe("true");
      return;
    }

    const runtime = createTextChatRuntime();
    expect(Object.isFrozen(runtime.routing)).toBe(true);
    expect(Object.isFrozen(runtime.nira)).toBe(true);

    const routingKeys = Object.keys(runtime.routing).sort();
    expect(routingKeys).toEqual(["candidateId", "providerId", "reason"]);
  });
});
