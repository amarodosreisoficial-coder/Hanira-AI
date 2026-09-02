import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { ModelRouterError } from "../lib/ai/router/errors";
import {
  createRouterCandidateRegistry,
  OLLAMA_DEFAULT_CANDIDATE_ID,
} from "../lib/ai/router/candidate-registry";
import {
  createTextModelRouter,
  TEXT_ROUTER_LOGICAL_PROVIDERS,
} from "../lib/ai/runtime/text-router-resolution";
import { OllamaProvider } from "../lib/ai/providers/ollama";
import { createTextChatRuntime } from "../lib/ai/runtime";
import {
  DEFAULT_NIRA_PROFILE_ID,
  NIRA_LOCAL_PROFILE_CAPABILITY,
  NIRA_LOCAL_PROFILE_ID,
  NIRA_LOCAL_PROFILE_NAME,
  NIRA_LOCAL_PREFERRED_CANDIDATE_ID,
  NIRA_PROFILES,
  resolveNiraProfile,
  type NiraProfile,
} from "../lib/ai/nira/profiles";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function setOllamaEnv(): void {
  process.env.AI_ENGINE_OLLAMA_ENABLED = "true";
  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434/";
  process.env.OLLAMA_MODEL = "qwen2.5:latest";
}

describe("Nira Local profile (14.5) - catalogo e resolucao", () => {
  it("catalogo contem Nira Local", () => {
    expect(
      NIRA_PROFILES.some((profile) => profile.id === NIRA_LOCAL_PROFILE_ID),
    ).toBe(true);
  });

  it("id correto", () => {
    expect(NIRA_LOCAL_PROFILE_ID).toBe("nira-local");
    expect(resolveNiraProfile(NIRA_LOCAL_PROFILE_ID).id).toBe("nira-local");
  });

  it("nome correto", () => {
    expect(NIRA_LOCAL_PROFILE_NAME).toBe("Nira Local");
    expect(resolveNiraProfile(NIRA_LOCAL_PROFILE_ID).name).toBe("Nira Local");
  });

  it("capability text", () => {
    expect(NIRA_LOCAL_PROFILE_CAPABILITY).toBe("text");
    expect(resolveNiraProfile(NIRA_LOCAL_PROFILE_ID).capability).toBe("text");
  });

  it("preferredCandidateId = ollama-default", () => {
    expect(NIRA_LOCAL_PREFERRED_CANDIDATE_ID).toBe(OLLAMA_DEFAULT_CANDIDATE_ID);
    expect(NIRA_LOCAL_PREFERRED_CANDIDATE_ID).toBe("ollama-default");
    expect(resolveNiraProfile(NIRA_LOCAL_PROFILE_ID).preferredCandidateId).toBe(
      OLLAMA_DEFAULT_CANDIDATE_ID,
    );
  });

  it("perfil conhecido resolve corretamente", () => {
    const resolved = resolveNiraProfile("nira-local");
    expect(resolved).toBeDefined();
    expect(resolved.id).toBe(NIRA_LOCAL_PROFILE_ID);
    expect(resolved.capability).toBe("text");
    expect(resolved.preferredCandidateId).toBe(OLLAMA_DEFAULT_CANDIDATE_ID);
  });

  it("perfil desconhecido gera erro controlado e seguro", () => {
    expect(() => resolveNiraProfile("nira-cloud")).toThrowError(ModelRouterError);
    expect(() => resolveNiraProfile("nira-fast")).toThrowError(ModelRouterError);

    let erro: unknown;
    try {
      resolveNiraProfile("nira-cloud");
    } catch (caught) {
      erro = caught;
    }
    expect(erro).toBeInstanceOf(ModelRouterError);
    expect((erro as ModelRouterError).code).toBe("invalid_configuration");
    // Mensagem segura: nao vaza catalogo, objeto nem conteudo sensivel.
    expect(String((erro as ModelRouterError).message)).not.toContain(
      "Nira Local",
    );
  });

  it("id vazio ou em branco falha de forma controlada", () => {
    expect(() => resolveNiraProfile("")).toThrowError(ModelRouterError);
    expect(() => resolveNiraProfile("   ")).toThrowError(ModelRouterError);
  });

  it("catalogo imutavel", () => {
    expect(Object.isFrozen(NIRA_PROFILES)).toBe(true);
    expect(() => {
      (NIRA_PROFILES as readonly NiraProfile[] as unknown[]).push({});
    }).toThrow();
  });

  it("perfil imutavel", () => {
    const profile = resolveNiraProfile(NIRA_LOCAL_PROFILE_ID);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(() => {
      (profile as unknown as { name: string }).name = "Outro Nome";
    }).toThrow();
  });

  it("perfil padrao do runtime e nira-local", () => {
    expect(DEFAULT_NIRA_PROFILE_ID).toBe(NIRA_LOCAL_PROFILE_ID);
  });

  it("camada de perfis permanece pura: sem env, rede e providers concretos", () => {
    const source = readFileSync("lib/ai/nira/profiles.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/.*$/gm, " ");

    expect(source).not.toContain("process.env");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("OllamaProvider");
    expect(source).not.toContain("OpenAIProvider");
    expect(source).not.toContain("supabase");
    expect(source).not.toContain("server-only");
  });
});

describe("Nira Local no runtime de texto (14.5)", () => {
  it("runtime padrao usa Nira Local", () => {
    setOllamaEnv();
    const runtime = createTextChatRuntime();
    expect(runtime.nira.profileId).toBe(NIRA_LOCAL_PROFILE_ID);
    expect(runtime.nira.displayName).toBe(NIRA_LOCAL_PROFILE_NAME);
  });

  it("Nira Local direciona para ollama-default no router", () => {
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

  it("Ollama continua sendo o provider real", () => {
    setOllamaEnv();
    const runtime = createTextChatRuntime();
    expect(runtime.provider).toBeInstanceOf(OllamaProvider);
    expect(runtime.providerId).toBe("ollama");
  });

  it("nenhum provider cloud e criado; allow-list segue somente ollama", () => {
    setOllamaEnv();
    const runtime = createTextChatRuntime({
      niraProfileId: NIRA_LOCAL_PROFILE_ID,
    });
    expect(runtime.provider.providerId).toBe("ollama");
    expect(TEXT_ROUTER_LOGICAL_PROVIDERS).toEqual(["ollama"]);
  });

  it("createTextChatRuntime() sem argumentos continua funcionando", () => {
    setOllamaEnv();
    const runtime = createTextChatRuntime();
    expect(runtime.provider).toBeInstanceOf(OllamaProvider);
    expect(runtime.model).toBe("qwen2.5:latest");
    expect(runtime.nira.profileId).toBe(NIRA_LOCAL_PROFILE_ID);
  });

  it("runtime aceita niraProfileId explicito nira-local", () => {
    setOllamaEnv();
    const runtime = createTextChatRuntime({ niraProfileId: "nira-local" });
    expect(runtime.nira.profileId).toBe("nira-local");
    expect(runtime.provider).toBeInstanceOf(OllamaProvider);
  });

  it("runtime rejeita perfil Nira desconhecido de forma controlada", () => {
    setOllamaEnv();
    expect(() =>
      createTextChatRuntime({ niraProfileId: "nira-fast" }),
    ).toThrowError(ModelRouterError);
  });

  it("composition root integra Nira mas nao instancia provider cloud", () => {
    const source = readFileSync(
      "lib/ai/runtime/create-text-chat-runtime.ts",
      "utf8",
    );
    expect(source).toContain("new OllamaProvider");
    expect(source).toContain("resolveNiraProfile");
    expect(source).not.toContain("OpenAIProvider");
    expect(source).not.toContain('preferredCandidateId: "ollama-default"');
  });
});
