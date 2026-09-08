import { afterEach, describe, expect, it, vi } from "vitest";
import { GroqProvider } from "../lib/ai/providers/groq";
import { toPublicAIError } from "../lib/ai/runtime/public-ai-errors";
import { translateAuthError } from "../lib/auth/errors";
import { streamChatMessage } from "../services/chat-service";
import { resolveNiraRuntimeState } from "../lib/chat/runtime-state";
import { GROQ_DEFAULT_MODEL } from "../lib/ai/providers/groq/groq-types";

// Pacote 16.4 — matriz automatizada de validação de runtime.
// Nenhum teste desta suíte chama rede real: fetch é sempre stubado.

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function groqProvider(): GroqProvider {
  process.env.GROQ_API_KEY = "gsk_test_matrix_key";
  process.env.GROQ_MODEL = "";
  return new GroqProvider({
    apiKey: process.env.GROQ_API_KEY,
    defaultModel: GROQ_DEFAULT_MODEL,
  });
}

function groqErrorResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("matriz de erros do provider Groq (16.4)", () => {
  it.each([
    [429, { error: { message: "Rate limit reached", type: "rate_limit" } }, "rate_limit"],
    [404, { error: { message: "model not found", type: "invalid_request_error" } }, "model_not_found"],
    [401, { error: { message: "Invalid API Key", type: "auth_error" } }, "authentication"],
    [403, { error: { message: "Forbidden", type: "auth_error" } }, "authorization"],
    [503, { error: { message: "service unavailable", type: "server_error" } }, "provider_error"],
  ])("HTTP %i normaliza como %s", async (status, body, expectedCode) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(groqErrorResponse(status, body)),
    );
    await expect(
      groqProvider().generate({ messages: [{ role: "user", text: "oi" }] }),
    ).rejects.toMatchObject({ code: expectedCode, provider: "groq" });
  });

  it("falha de rede/DNS normaliza como unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND api.groq.com")),
    );
    await expect(
      groqProvider().generate({ messages: [{ role: "user", text: "oi" }] }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("timeout normaliza como timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        Object.assign(new Error("request timeout"), { name: "TimeoutError" }),
      ),
    );
    await expect(
      groqProvider().generate({
        messages: [{ role: "user", text: "oi" }],
        timeoutMs: 1,
      }),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("mensagens públicas não vaziam detalhes internos do provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(groqErrorResponse(401, { error: { message: "Invalid API Key gsk_secret_value" } })),
    );
    const provider = groqProvider();
    try {
      await provider.generate({ messages: [{ role: "user", text: "oi" }] });
      expect.unreachable("deveria ter falhado");
    } catch (error) {
      const publicError = toPublicAIError(error);
      expect(JSON.stringify(publicError)).not.toContain("gsk_secret_value");
    }
  });
});
describe("chat-service deriva runtime real do evento start (16.4)", () => {
  function sseResponse(events: unknown[]): Response {
    const payload = events
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .join("");
    return new Response(payload, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  it("start demo entrega meta demo; start groq entrega cloud-free", async () => {
    const seen: Array<ReturnType<typeof resolveNiraRuntimeState>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        sseResponse([
          { type: "start", conversationId: "c1", mode: "demo" },
          { type: "delta", delta: "demo" },
          { type: "done", conversationId: "c1" },
        ]),
      ),
    );
    await streamChatMessage(
      { message: "ola", requestId: "r1" },
      {
        onDelta: () => undefined,
        onStart: (_id, meta) =>
          seen.push(resolveNiraRuntimeState({ mode: meta?.mode, niraProfileId: meta?.profile })),
      },
      new AbortController().signal,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        sseResponse([
          { type: "start", conversationId: "c1", mode: "groq", profile: "nira-cloud-free" },
          { type: "delta", delta: "ok" },
          { type: "done", conversationId: "c1" },
        ]),
      ),
    );
    await streamChatMessage(
      { message: "ola", requestId: "r2" },
      {
        onDelta: () => undefined,
        onStart: (_id, meta) =>
          seen.push(resolveNiraRuntimeState({ mode: meta?.mode, niraProfileId: meta?.profile })),
      },
      new AbortController().signal,
    );
    expect(seen).toEqual(["demo", "cloud-free"]);
  });

  it("start sem meta não inventa runtime (deriva unknown)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        sseResponse([{ type: "start", conversationId: "c1" }, { type: "done", conversationId: "c1" }]),
      ),
    );
    let derived: string | null = null;
    await streamChatMessage(
      { message: "ola", requestId: "r3" },
      {
        onDelta: () => undefined,
        onStart: (_id, meta) => {
          if (meta) {
            derived = resolveNiraRuntimeState({ mode: meta.mode, niraProfileId: meta.profile });
          }
        },
      },
      new AbortController().signal,
    );
    expect(derived).toBe("unknown");
  });
});

describe("classificação de erros de autenticação (16.4)", () => {
  it("falha de DNS/projeto pausado vira indisponibilidade temporária amigável", () => {
    expect(
      translateAuthError("TypeError: fetch failed\ngetaddrinfo ENOTFOUND xyz.supabase.co"),
    ).toBe(
      "Não foi possível acessar o serviço de autenticação agora. Tente novamente em alguns instantes.",
    );
    expect(translateAuthError("fetch failed")).not.toContain("supabase");
    expect(translateAuthError("ECONNREFUSED")).not.toContain("ECONNREFUSED");
    expect(translateAuthError("ETIMEDOUT")).not.toContain("ETIMEDOUT");
  });

  it("credenciais inválidas e sessão expirada mantêm mensagens específicas", () => {
    expect(translateAuthError("Invalid login credentials")).toBe(
      "E-mail ou senha incorretos.",
    );
    expect(translateAuthError("Session expired")).toBe(
      "Sua sessão expirou. Entre novamente.",
    );
  });
});

