import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageContent } from "@/components/chat/message-content";

const render = (content: string) => renderToStaticMarkup(<MessageContent content={content} />);

describe("19.2-O: Marcadores semânticos e cores da Nira", () => {
  it("vincula cor verde ao marcador Confirmado (success)", () => {
    const html = render("✅ **Confirmado:** Operação concluída com sucesso.");
    expect(html).toContain("chat-callout--success");
  });

  it("vincula cor azul/ciano ao marcador Informação (info)", () => {
    const html = render("ℹ️ **Informação:** Contexto relevante.");
    expect(html).toContain("chat-callout--info");
  });

  it("vincula cor âmbar ao marcador Atenção (warning)", () => {
    const html = render("⚠️ **Atenção:** Verifique antes de prosseguir.");
    expect(html).toContain("chat-callout--warning");
  });

  it("vincula cor vermelha ao marcador Erro (error)", () => {
    const html = render("❌ **Erro:** A operação falhou.");
    expect(html).toContain("chat-callout--error");
  });

  it("reconhece marcadores sem emoji (apenas rótulo textual)", () => {
    const html = render("**Informação:** Orientação sem emoji.");
    expect(html).toContain("chat-callout--info");
    expect(html).toContain("<strong>Informação:</strong>");
  });

  it("não aplica chat-callout a texto comum sem marcador de rótulo", () => {
    const html = render("Apenas uma frase normal sem nenhum marcador.");
    expect(html).not.toContain("chat-callout");
    expect(html).toContain("<p>");
  });

  it("não colore palavras arbitrárias fora de marcadores semânticos", () => {
    const html = render("Esta frase tem palavras comuns sem **nenhum** marcador especial.");
    expect(html).not.toContain("chat-callout");
    expect(html).toContain("<strong>nenhum</strong>");
  });

  it("renderiza títulos com níveis distintos (## → h3, ### → h4)", () => {
    const html2 = render("## Título de seção");
    const html3 = render("### Subtítulo");
    expect(html2).toContain("<h3>");
    expect(html3).toContain("<h4>");
  });

  it("renderiza lista não ordenada com itens", () => {
    const html = render("- Item um\n- Item dois");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>Item um</li>");
    expect(html).toContain("<li>Item dois</li>");
  });

  it("renderiza lista ordenada com numeração", () => {
    const html = render("1. Primeiro\n2. Segundo");
    expect(html).toContain("<ol>");
  });

  it("renderiza tabela com cabeçalho e linhas", () => {
    const html = render("| Coluna A | Coluna B |\n| --- | --- |\n| Valor 1 | Valor 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain('<th scope="col">');
    expect(html).toContain("<td>Valor 1</td>");
    expect(html).toContain("<td>Valor 2</td>");
  });

  it("preserva bloco de escrita grafite (hanira-writing)", () => {
    const html = render(":::hanira-writing type=codigo title=Exemplo\nconst x = 1;\n:::");
    expect(html).toContain("nira-writing-block");
  });
});
