import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSearchIntegrationResult } from "@/lib/web-search/integrate";

const mocks = vi.hoisted(() => ({
  integrate: vi.fn(), routeCapability: vi.fn(), providerResponse: vi.fn(), log: vi.fn(),
  resolveContext: vi.fn(), save: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth/session", () => ({ requireSessionUser: async () => ({ id: "test-user", demo: false }) }));
vi.mock("@/lib/logging/server", () => ({ createRequestId: () => "test-search-request", logServerEvent: mocks.log }));
vi.mock("@/lib/security/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/security/usage-guard", () => ({ consumeDailyUsage: async () => ({ allowed: true }), UsageGuardUnavailableError: class extends Error {} }));
vi.mock("@/services/usage-service", () => ({ getUsageSupabaseClient: () => null }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    const chain = {
      select: () => chain, eq: () => chain, insert: () => chain, update: () => chain,
      upsert: (value: unknown) => { mocks.save(value); return chain; },
      single: async () => ({ data: { id: "message-id" } }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [] }).then(resolve),
    };
    return { from: () => chain };
  },
}));
vi.mock("@/services/chat-context", () => ({ resolveProjectChatContext: mocks.resolveContext, ChatContextError: class extends Error {} }));
vi.mock("@/services/attachments", () => ({ getOwnedAttachments: async () => [] }));
vi.mock("@/services/memory", () => ({ saveExplicitMemory: async () => ({ status: "skipped" }) }));
vi.mock("@/lib/ai/public-capabilities", () => ({ getPublicAICapabilities: () => ({}), buildCapabilitySummary: () => "" }));
vi.mock("@/lib/ai/runtime/self-knowledge", () => ({ resolveSelfKnowledge: () => null }));
vi.mock("@/lib/tools/router", () => ({ routeTool: async () => null }));
vi.mock("@/lib/ai/runtime/current-weather-fallback", () => ({ createCurrentWeatherFallbackResponse: () => null }));
vi.mock("@/lib/ai/runtime/capability-router", () => ({ routeChatCapability: mocks.routeCapability }));
vi.mock("@/lib/ai/runtime", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/ai/runtime")>(),
  createTextChatProviderResponse: mocks.providerResponse,
  getOllamaTextProviderEligibility: () => ({ eligible: true }),
  shouldUseOllamaTextProvider: () => true,
}));
vi.mock("@/lib/web-search/integrate", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/web-search/integrate")>(),
  integrateWebSearch: mocks.integrate,
}));
import { POST } from "@/app/api/chat/route";
import { concurrencyLockCountForTests, resetConcurrencyGuardForTests } from "@/lib/security/concurrency-guard";

function result(overrides: Partial<WebSearchIntegrationResult> = {}): WebSearchIntegrationResult {
  return { shouldSearch: true, decision: { shouldSearch: true, reason: "explicit", query: "PRIVATE QUERY" },
    results: [], sources: [], context: "", providerId: "tavily", providerInvoked: true, ...overrides };
}
async function post(message = "Pesquise notícias de hoje") {
  return POST(new Request("http://localhost/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) }));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("HANIRA_CONCURRENCY_MAX_PER_USER", "1");
  resetConcurrencyGuardForTests();
  mocks.resolveContext.mockResolvedValue({ projectId: "project", projectName: "Projeto de teste", conversationId: "conversation", conversationMessages: [], relevantMemories: [], contextBudget: {}, legacyScopeUsed: false });
  mocks.routeCapability.mockResolvedValue({ capability: "text", providerId: "mock", model: "mock-model", mode: "text", provider: { capabilities: { supported: ["text"] } }, attachmentCount: 0, imageAttachmentCount: 0 });
  mocks.providerResponse.mockReturnValue(new Response("provider stream"));
});
afterEach(() => { resetConcurrencyGuardForTests(); vi.unstubAllEnvs(); });

describe("19.2-H: rota de chat com pesquisa simulada", () => {
  it.each(["not_configured", "quota_exhausted", "timeout", "empty_results", "no_valid_sources"] as const)("%s responde sem chamar modelo e libera lock", async errorCode => {
    mocks.integrate.mockResolvedValue(result({ error: "Falha", errorCode }));
    const response = await post();
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('"mode":"web_search_unavailable"');
    expect(body).toContain("fontes verificáveis");
    expect(mocks.routeCapability).not.toHaveBeenCalled();
    expect(mocks.providerResponse).not.toHaveBeenCalled();
    expect(concurrencyLockCountForTests()).toBe(0);
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ role: "assistant", content: expect.stringContaining("fontes verificáveis") }));
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ event: "web_search_failed", providerId: "tavily", errorCode, details: expect.objectContaining({ sourceCount: 0, sourcesDelivered: false }) }));
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain("PRIVATE QUERY");
  });
  it("entrega fontes e contexto ao provider, com diagnóstico seguro", async () => {
    const sources = [{ title: "Notícia", url: "https://example.com/news", domain: "example.com", publishedAt: "2026-10-28T00:00:00.000Z" }];
    mocks.integrate.mockResolvedValue(result({ sources, context: "Dados públicos da pesquisa" }));
    expect(await (await post("Pesquise PRIVATE QUERY, pessoa@example.com")).text()).toBe("provider stream");
    const options = mocks.providerResponse.mock.calls[0][0];
    expect(options.webSearchSources).toEqual(sources);
    const system = options.providerRequest.messages.find((message: { role: string }) => message.role === "system");
    expect(system.text).toContain("Dados públicos da pesquisa");
    expect(system.text).toContain("não são documentos ou links enviados pelo usuário");
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ event: "web_search_sources_delivered", providerId: "tavily", details: expect.objectContaining({ success: true, sourceCount: 1, providerInvoked: true, sourcesDelivered: true }) }));
    expect(JSON.stringify(mocks.log.mock.calls)).not.toMatch(/PRIVATE QUERY|pessoa@example.com|Authorization|TAVILY_API_KEY/);
    await options.onCancelled();
    expect(concurrencyLockCountForTests()).toBe(0);
  });
  it("mantém o fluxo normal sem pesquisa", async () => {
    mocks.integrate.mockResolvedValue(result({ shouldSearch: false, decision: { shouldSearch: false, reason: "static" }, providerId: undefined, providerInvoked: false }));
    expect(await (await post("Explique fotossíntese")).text()).toBe("provider stream");
    const options = mocks.providerResponse.mock.calls[0][0];
    expect(options.webSearchSources).toBeUndefined();
    expect(mocks.routeCapability).toHaveBeenCalledTimes(1);
    expect(mocks.log).not.toHaveBeenCalledWith(expect.objectContaining({ event: "web_search_sources_delivered" }));
    await options.onCancelled();
  });
  it("falha antes da criação do stream libera lock sem alegar entrega", async () => {
    mocks.integrate.mockResolvedValue(result({ sources: [{ title: "Notícia", url: "https://example.com", domain: "example.com" }], context: "Contexto" }));
    mocks.providerResponse.mockImplementationOnce(() => { throw new Error("mock failure"); });
    expect((await post()).status).toBe(500);
    expect(concurrencyLockCountForTests()).toBe(0);
    expect(mocks.log).not.toHaveBeenCalledWith(expect.objectContaining({ event: "web_search_sources_delivered" }));
  });
});
