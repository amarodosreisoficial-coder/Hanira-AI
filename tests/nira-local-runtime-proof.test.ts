import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AIProvider, AIProviderHealth } from "../lib/ai/provider";
import {
  createRouterCandidateRegistry,
  OLLAMA_DEFAULT_CANDIDATE_ID,
} from "../lib/ai/router/candidate-registry";
import { ModelRouterError } from "../lib/ai/router/errors";
import { createTextModelRouter } from "../lib/ai/runtime/text-router-resolution";
import {
  NIRA_LOCAL_PROFILE_ID,
  NIRA_LOCAL_PROFILE_NAME,
  resolveNiraProfile,
} from "../lib/ai/nira/profiles";
import {
  type AIChatResponse,
  type AIModelInfo,
  type AIProviderCapability,
  type AIStreamEvent,
} from "../lib/ai/types";

const ORIGINAL_ENV = { ...process.env };

// Mocka o OllamaProvider na fronteira de rede: o routing real e exercitado
// (Nira -> Registry -> ModelRouter -> Decision -> Provider Resolver), mas a
// geracao/streaming de texto e simulada, sem chamar rede nem depender de um
// Ollama real instalado.
vi.mock("@/lib/ai/providers/ollama", () => {
  class MockOllamaProvider implements AIProvider {
    readonly providerId = "ollama";
    readonly capabilities = {
      supported: [
        "text-generation",
        "text-streaming",
      ] as readonly AIProviderCapability[],
    };

    constructor() {}

    async generate(): Promise<AIChatResponse> {
      return {
        text: "resposta simulada do runtime Nira Local",
        provider: "ollama",
        model: "qwen2.5:latest",
        finishReason: "stop",
      };
    }

    async *stream(): AsyncGenerator<AIStreamEvent> {
      yield { type: "start", provider: "ollama", model: "qwen2.5:latest" };
      yield { type: "text-delta", textDelta: "delta simulado " };
      yield { type: "text-delta", textDelta: "do runtime Nira Local" };
      yield { type: "finish", finishReason: "stop" };
    }

    async healthCheck(): Promise<AIProviderHealth> {
      return { ok: true, provider: "ollama" };
    }

    async listModels(): Promise<AIModelInfo[]> {
      return [{ id: "qwen2.5:latest", provider: "ollama" }];
    }

    supports(capability: AIProviderCapability): boolean {
      return this.capabilities.supported.includes(capability);
    }
  }

  return { OllamaProvider: MockOllamaProvider };
});

import { createTextChatRuntime } from "../lib/ai/runtime";

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.AI_ENGINE_OLLAMA_ENABLED = "true";
  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434/";
  process.env.OLLAMA_MODEL = "qwen2.5:latest";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("Nira Local runtime proof (14.6) - fluxo ponta a ponta", () => {
  it("exercita fluxo completo: Nira Local -> Router -> ollama-default -> provider -> resposta", async () => {
    const runtime = createTextChatRuntime();

    // 1. Perfil ativo = nira-local
    expect(runtime.nira.profileId).toBe(NIRA_LOCAL_PROFILE_ID);
    expect(runtime.nira.displayName).toBe(NIRA_LOCAL_PROFILE_NAME);

    // 2. Decisao do router: candidato ollama-default selecionado por preferencia
    expect(runtime.routing.candidateId).toBe(OLLAMA_DEFAULT_CANDIDATE_ID);
    expect(runtime.routing.reason).toBe("selected_by_preference");
    expect(runtime.routing.providerId).toBe("ollama");

    // 3. Provider final = ollama, modelo preservado
    expect(runtime.providerId).toBe("ollama");
    expect(runtime.model).toBe("qwen2.5:latest");
    expect(runtime.provider.providerId).toBe("ollama");

    // 4. Resposta textual atravessa o runtime (generate)
    const response = await runtime.provider.generate({
      messages: [{ role: "user", text: "ola" }],
    });
    expect(response.text).toBe("resposta simulada do runtime Nira Local");
    expect(response.provider).toBe("ollama");
    expect(response.model).toBe("qwen2.5:latest");
    expect(response.finishReason).toBe("stop");
  });

  it("streaming do runtime Nira Local entrega deltas e finish", async () => {
    const runtime = createTextChatRuntime();

    const events: AIStreamEvent[] = [];
    for await (const event of runtime.provider.stream({
      messages: [{ role: "user", text: "ola" }],
    })) {
      events.push(event);
    }

    expect(events.length).toBe(4);
    expect(events[0]).toMatchObject({ type: "start", provider: "ollama" });
    expect(events[1]).toMatchObject({ type: "text-delta" });
    expect(events[2]).toMatchObject({ type: "text-delta" });
    expect(events[3]).toMatchObject({ type: "finish", finishReason: "stop" });

    const fullText = events
      .filter((e): e is Extract<AIStreamEvent, { type: "text-delta" }> =>
        e.type === "text-delta"
      )
      .map((e) => e.textDelta)
      .join("");
    expect(fullText).toContain("delta simulado");
    expect(fullText).toContain("do runtime Nira Local");
  });

  it("createTextChatRuntime() sem argumentos continua funcionando (default nira-local)", () => {
    const runtime = createTextChatRuntime();
    expect(runtime.nira.profileId).toBe(NIRA_LOCAL_PROFILE_ID);
    expect(runtime.routing.candidateId).toBe(OLLAMA_DEFAULT_CANDIDATE_ID);
    expect(runtime.providerId).toBe("ollama");
  });

  it("runtime aceita niraProfileId explicito nira-local", () => {
    const runtime = createTextChatRuntime({
      niraProfileId: NIRA_LOCAL_PROFILE_ID,
    });
    expect(runtime.nira.profileId).toBe(NIRA_LOCAL_PROFILE_ID);
    expect(runtime.routing.candidateId).toBe(OLLAMA_DEFAULT_CANDIDATE_ID);
  });

  it("runtime rejeita perfil Nira desconhecido de forma controlada", () => {
    expect(() =>
      createTextChatRuntime({ niraProfileId: "nira-inexistente" }),
    ).toThrowError(ModelRouterError);
  });
});

describe("Nira Local runtime proof (14.6) - seguranca e escopo", () => {
  it("metadata de routing e imutavel e nao expoe segredos", () => {
    const runtime = createTextChatRuntime();

    expect(Object.isFrozen(runtime.routing)).toBe(true);
    expect(Object.isFrozen(runtime.nira)).toBe(true);

    // Metadata de routing contem apenas identificadores logicos
    const routingKeys = Object.keys(runtime.routing).sort();
    expect(routingKeys).toEqual(["candidateId", "providerId", "reason"]);

    // Nenhuma string sensivel na metadata
    const routingValues = JSON.stringify(runtime.routing);
    expect(routingValues).not.toContain("baseUrl");
    expect(routingValues).not.toContain("127.0.0.1");
    expect(routingValues).not.toContain("api_key");
    expect(routingValues).not.toContain("token");
    expect(routingValues).not.toContain("secret");
  });

  it("nenhum provider cloud e chamado: allow-list segue somente ollama", () => {
    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
    });
    const candidates = registry.getCandidatesForCapability("text");

    expect(candidates.length).toBe(1);
    expect(candidates[0].provider).toBe("ollama");
    expect(candidates[0].deployment).toBe("local");
  });

  it("Nira Local direciona para ollama-default na decisao do router", () => {
    const profile = resolveNiraProfile(NIRA_LOCAL_PROFILE_ID);
    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
    });
    const decision = createTextModelRouter(
      registry.getCandidatesForCapability("text"),
    ).select({
      capability: "text",
      preferredCandidateId: profile.preferredCandidateId,
    });

    expect(decision.selected.candidateId).toBe(OLLAMA_DEFAULT_CANDIDATE_ID);
    expect(decision.selected.provider).toBe("ollama");
    expect(decision.reason).toBe("selected_by_preference");
  });

  it("camada de prova Nira permanece pura: sem env, sem rede direta", () => {
    const source = readFileSync("lib/ai/nira/profiles.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/.*$/gm, " ");

    expect(source).not.toContain("process.env");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("OllamaProvider");
  });
});