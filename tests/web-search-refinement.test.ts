import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSearchResult } from "@/lib/web-search/types";

const { search } = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("@/lib/web-search/provider", () => ({
  getWebSearchProvider: () => ({ providerId: "tavily", provider: { search } }),
}));
import { decideWebSearch } from "@/lib/web-search/decision";
import { buildWebSearchPrompt, integrateWebSearch, webSearchFailureText } from "@/lib/web-search/integrate";
import { normalizePublicationDate } from "@/lib/web-search/normalize";
import { WEB_SEARCH_LIMITS } from "@/lib/web-search/limits";

function item(id: string, publishedAt: string | null = null): WebSearchResult {
  return { title: `Notícia ${id}`, url: `https://example.com/${id}`, domain: "forged.invalid", snippet: `Resumo ${id}`, publishedAt };
}
function success(results: unknown[]) {
  search.mockResolvedValue({ success: true, provider: "tavily", response: { results } });
}
beforeEach(() => { search.mockReset(); });

describe("19.2-H: intenção e seleção temporal", () => {
  it.each([
    ["Pesquise as últimas notícias sobre IA.", "week"],
    ["Quais são as notícias de hoje?", "day"],
    ["Mostre os acontecimentos mais recentes.", "week"],
    ["Pesquise novidades desta semana.", "week"],
    ["Busque notícias deste mês.", "month"],
  ])("detecta %s", (query, timeRange) => {
    expect(decideWebSearch(query)).toMatchObject({ shouldSearch: true, topic: "news", timeRange });
  });
  it("não transforma uma explicação estática em pesquisa", async () => {
    expect((await integrateWebSearch("Explique o que são notícias falsas")).shouldSearch).toBe(false);
    expect(search).not.toHaveBeenCalled();
  });
  it("envia a janela em uma única chamada e ordena só datas comparáveis", async () => {
    success([item("sem-data"), item("antiga", "2026-10-20"), item("nova", "Wed, 28 Oct 2026 10:00:00 GMT"), item("invalida", "ontem")]);
    const result = await integrateWebSearch("Pesquise últimas notícias sobre IA");
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ topic: "news", timeRange: "week" }));
    expect(result.results.map(r => r.title)).toEqual(["Notícia nova", "Notícia antiga", "Notícia sem-data", "Notícia invalida"]);
    expect(result.context).toContain("28/10/2026");
    expect(result.sources[0]).toMatchObject({ domain: "example.com", publishedAt: "2026-10-28T10:00:00.000Z" });
    expect(result.context).toContain("Data de publicação não informada");
    expect(result.context).not.toContain("ontem");
  });
  it.each(["2026-02-30", "28/10/2026", "hoje", "2026-13-01", "2026-10-28T99:00:00Z", "2026-10-28T24:00:00Z", "Mon, 30 Feb 2026 10:00:00 GMT", "42"])("rejeita data ambígua/inválida %s", value => {
    expect(normalizePublicationDate(value)).toBeNull();
  });
  it("não reordena busca geral sem intenção temporal", async () => {
    success([item("antiga", "2026-10-20"), item("nova", "2026-10-28")]);
    expect((await integrateWebSearch("Pesquise história da IA")).results[0].title).toBe("Notícia antiga");
  });
});

describe("19.2-H: fontes, quantidade e contexto", () => {
  it("remove URLs perigosas e duplicatas mantendo a URL original válida", async () => {
    const original = "https://example.com/a?utm_source=site#article";
    success([
      { ...item("a"), url: original },
      { ...item("a-copia"), url: "https://example.com/a" },
      { ...item("titulo-repetido"), title: "  NOTÍCIA A  " },
      { ...item("js"), url: "javascript:alert(1)" },
      { ...item("ftp"), url: "ftp://example.com/file" },
      { ...item("bad"), url: "not a URL" },
      { ...item("credentials"), url: "https://user:secret@example.com/private" },
      null, {}, item("b"),
    ]);
    const result = await integrateWebSearch("Pesquise 3 notícias de hoje");
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].url).toBe(original);
    expect(result.context).not.toMatch(/javascript:|ftp:|secret|forged.invalid/);
    const prompt = buildWebSearchPrompt("Personalidade preservada", result);
    expect(prompt).toContain("O usuário pediu 3 itens; apresente no máximo 2");
    expect(prompt).toContain("só encontrou 2 fontes válidas");
    expect(prompt).toContain("não são documentos ou links enviados pelo usuário");
    expect(prompt).toContain("Encontrei estas notícias na pesquisa online");
    expect(prompt).toContain("Não complete a lista com conhecimento geral");
    expect(prompt).toContain("não garanta recência absoluta");
    expect(prompt).toContain("Personalidade preservada\n\n## Resultados");
    expect(prompt).not.toContain("preservada\\n");
  });
  it("respeita quantidade pequena sem fazer buscas extras", async () => {
    success([item("a"), item("b"), item("c")]);
    expect((await integrateWebSearch("Pesquise duas notícias de hoje")).sources).toHaveLength(2);
    expect(search).toHaveBeenCalledTimes(1);
  });
  it("limita contexto incluindo metadados e entrega só fontes que couberam", async () => {
    success(Array.from({ length: 8 }, (_, i) => ({ ...item(String(i)), snippet: 'Resumo "com aspas"\n'.repeat(200) })));
    const result = await integrateWebSearch("Pesquise 10 notícias recentes");
    expect(result.context.length).toBeLessThanOrEqual(WEB_SEARCH_LIMITS.maxTotalContextChars);
    const entries = result.context.split("\n---\n").map(text => JSON.parse(text));
    expect(entries).toHaveLength(result.sources.length);
    expect(result.results.length).toBeLessThanOrEqual(5);
    expect(result.results.every(r => r.snippet.length <= 300)).toBe(true);
    expect(entries.map(entry => entry.url)).toEqual(result.sources.map(source => source.url));
  });
  it("mantém o prompt comum quando não houve busca", async () => {
    const result = await integrateWebSearch("Olá, Nira");
    expect(buildWebSearchPrompt("Prompt comum", result)).toBe("Prompt comum");
    expect(webSearchFailureText(result)).toBeNull();
    expect(search).not.toHaveBeenCalled();
  });
});

describe("19.2-H: falhas sem conteúdo inventado ou vazamentos", () => {
  it.each(["not_configured", "quota_exhausted", "timeout", "blocked", "unavailable"])("falha %s tem mensagem determinística", async code => {
    search.mockResolvedValue({ success: false, provider: "tavily", error: { type: "unavailable", code, message: "SECRET consulta privada Authorization: Bearer KEY" } });
    const result = await integrateWebSearch("Pesquise notícias sobre assunto privado");
    expect(result.errorCode).toBe(code);
    expect(webSearchFailureText(result)).toContain("Não consegui concluir a pesquisa online");
    expect(result.context).toBe("");
    expect(result.sources).toEqual([]);
    expect(result.error).not.toMatch(/SECRET|privada|Authorization|KEY/);
  });
  it.each([{ results: [] }, { results: [{ ...item("x"), url: "javascript:alert(1)" }] }])("retorno sem fonte verificável bloqueia o modelo", async ({ results }) => {
    success(results);
    const result = await integrateWebSearch("Pesquise notícias de hoje");
    expect(webSearchFailureText(result)).toContain("não retornou fontes verificáveis");
    expect(result.context).toBe("");
  });
  it("exceção do provider não retorna sua mensagem privada", async () => {
    search.mockRejectedValue(new Error("TAVILY_API_KEY=SECRET private query"));
    const result = await integrateWebSearch("Pesquise notícias de hoje");
    expect(result.error).not.toContain("SECRET");
    expect(result.providerId).toBe("tavily");
    expect(result.providerInvoked).toBe(true);
    expect(webSearchFailureText(result)).toBeTruthy();
  });
});
