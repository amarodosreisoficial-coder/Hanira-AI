import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TavilySearchProvider } from "@/lib/web-search/providers/tavily";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Tavily: contrato gratuito com fetch simulado", () => {
  it("usa news/time_range, basic, sem auto parameters e preserva published_date", async () => {
    fetchMock.mockResolvedValue(Response.json({ query: "IA", results: [
      { title: "Publicação", url: "https://example.com/news", content: "Resumo da notícia", published_date: "Wed, 28 Oct 2026 10:00:00 GMT" },
    ] }));
    const result = await new TavilySearchProvider("fake-test-key").search({ query: "IA", topic: "news", timeRange: "day", freshness: "recent" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.tavily.com/search");
    expect(JSON.parse(request.body)).toMatchObject({ topic: "news", time_range: "day", search_depth: "basic", auto_parameters: false, max_results: 5, include_answer: false, include_raw_content: false, include_images: false });
    expect(request.headers.Authorization).toBe("Bearer fake-test-key");
    expect(result.response?.results[0]).toMatchObject({ publishedAt: "Wed, 28 Oct 2026 10:00:00 GMT", snippet: "Resumo da notícia" });
    expect(JSON.stringify(result)).not.toContain("fake-test-key");
  });
  it("busca geral não recebe janela de notícias e limita snippets", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [{ title: "Título", url: "https://example.com", content: "x".repeat(900) }, null, {}, { title: 123 }] }));
    const result = await new TavilySearchProvider("fake-test-key").search({ query: "conceito" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ topic: "general", search_depth: "basic" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("time_range");
    expect(result.response?.results).toHaveLength(1);
    expect(result.response?.results[0].publishedAt).toBeNull();
    expect(result.response?.results[0].snippet).toHaveLength(300);
  });
  it.each([[401, "blocked"], [429, "rate_limited"], [432, "quota_exhausted"], [433, "quota_exhausted"], [500, "unavailable"]])("HTTP %s é classificado sem expor body", async (status, code) => {
    fetchMock.mockResolvedValue(new Response("SECRET provider body", { status }));
    const result = await new TavilySearchProvider("fake-test-key").search({ query: "consulta privada" });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(code);
    expect(JSON.stringify(result)).not.toMatch(/SECRET|fake-test-key|consulta privada/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("não chama fetch sem configuração", async () => {
    expect((await new TavilySearchProvider("").search({ query: "IA" })).error?.code).toBe("not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("timeout não repete a chamada e limpa o timer", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, request) => new Promise((_resolve, reject) => {
      request.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const pending = new TavilySearchProvider("fake-test-key", { timeoutMs: 10 }).search({ query: "IA" });
    await vi.advanceTimersByTimeAsync(10);
    expect((await pending).error?.code).toBe("timeout");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
