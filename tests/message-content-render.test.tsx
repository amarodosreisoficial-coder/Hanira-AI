import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageContent, parseChatMarkdown } from "@/components/chat/message-content";
import { chatPresentationExamples } from "./fixtures/chat-presentation";

const render = (content: string) => renderToStaticMarkup(<MessageContent content={content} />);

describe("19.2-J: Markdown legível e seguro", () => {
  it("renderiza seis níveis de título sem disputar o h1 da página", () => {
    const html = render("# Título\n## Seção\n### Subtítulo\n#### Detalhe\n##### Nota\n###### Contexto");
    for (const tag of ["h2", "h3", "h4", "h5", "h6"]) expect(html).toContain(`<${tag}>`);
    expect(html).not.toContain("<h1>");
  });
  it("renderiza negrito, itálico, código inline e emojis sem colorir palavras", () => {
    const html = render("**Essencial** e *leve*, __forte__ e _ênfase_. **Com _cuidado_**. Use `nome_do_usuario`. 💡 Ideia.");
    expect(html).toContain("<strong>Essencial</strong>");
    expect(html).toContain("<em>leve</em>");
    expect(html).toContain("<strong>forte</strong>");
    expect(html).toContain("<strong>Com <em>cuidado</em></strong>");
    expect(html).toContain("<code>nome_do_usuario</code>");
    expect(html).toContain("💡 Ideia.");
    expect(html).not.toContain("chat-callout");
    expect(render("nome_do_usuario")).toContain("nome_do_usuario");
    expect(render("\\servidor")).toContain("\\servidor");
    expect(render("\\*literal\\*")).not.toContain("<em>");
  });
  it.each([
    ["✅ **Confirmado:** Passou no teste.", "success"],
    ["ℹ️ **Informação:** Confira o contexto.", "info"],
    ["⚠️ **Atenção:** Resultado ainda não verificado.", "warning"],
    ["❌ **Erro:** A operação falhou.", "error"],
    ["**Atenção:** Sem emoji, com significado textual.", "warning"],
  ])("reconhece marcador explícito %s", (content, tone) => {
    const html = render(content);
    expect(html).toContain(`chat-callout--${tone}`);
    expect(html).toContain("<strong>");
    expect(html).not.toContain('role="alert"');
  });
  it.each(["✅ Concluído", "✅ **Erro:** Inconsistência", "Não precisa alterar nada.", "Este trecho cita **Confirmado:** como exemplo.", "⚠️ cuidado", "<div class='chat-callout--success'>Confirmado</div>"])("mantém texto comum neutro: %s", content => {
    expect(render(content)).not.toContain('class="chat-callout ');
  });
  it("separa marcadores consecutivos, listas e divisores", () => {
    const html = render("**Informação:** Orientação.\n**Erro:** Falha.\n\n4. Quarto\n5. Quinto\n\n+ Item\n+ Outro\n\n---\n\n> Uma citação.");
    expect(html).toContain("chat-callout--info");
    expect(html).toContain("chat-callout--error");
    expect(html).toContain('<ol start="4">');
    expect(html).toContain("<ul><li>Item</li><li>Outro</li></ul>");
    expect(html).toContain("<hr/>");
    expect(html).toContain("<blockquote>Uma citação.</blockquote>");
  });
  it("preserva tabelas e colunas adicionais recebidas durante streaming", () => {
    const html = render("| Dado | Valor |\n| --- | --- |\n| **Status** | *Pronto* | Extra | ");
    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('scope="col"');
    expect(html).toContain("<td>Extra</td>");
  });
  it("mantém links HTTP/HTTPS originais e protege a nova aba", () => {
    const html = render("[HTTP](http://example.com/a) [HTTPS](https://example.com/wiki/Test_(example))");
    expect(html).toContain('href="http://example.com/a"');
    expect(html).toContain('href="https://example.com/wiki/Test_(example)"');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
  });
  it.each(["javascript:alert(1)", "data:text/html,script", "vbscript:msgbox(1)", "file:///secret", "https://user:pass@example.com", "https://", "https://example.com/%0A\"onclick=alert(1)"])("não cria link executável para %s", url => {
    expect(render(`[Link](${url})`)).not.toContain("<a ");
  });
  it("HTML, script e CSS permanecem texto e código mantém indentação", () => {
    const html = render('<script>alert(1)</script>\n<style>body{display:none}</style>\n<img src=x onerror="alert(1)">\n\n```html\n  <script>alert(2)</script>\n    **literal**\n```');
    expect(html).not.toMatch(/<(script|style|img)\b/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("  &lt;script&gt;alert(2)&lt;/script&gt;\n    **literal**");
    expect(html).toContain('aria-label="Código html"');
  });
  it.each(["Uma **resposta em andamento", "Veja [fonte](https://example", "Texto com `código em andamento", "| Título | Valor |\n| --", "<scr"])("preserva texto incompleto de streaming: %s", content => {
    expect(parseChatMarkdown(content)).toEqual([{ type: "paragraph", text: content }]);
    expect(render(content).length).toBeGreaterThan(content.length);
  });
  it("preserva código ainda sem fechamento da cerca", () => {
    expect(parseChatMarkdown("```ts\n  const valor = 1;\n    console.log(valor);")).toEqual([{ type: "code", language: "ts", text: "  const valor = 1;\n    console.log(valor);" }]);
  });
  it("mensagens antigas, fontes web e exemplos locais não são modificados", () => {
    for (const example of chatPresentationExamples) {
      const before = example.content;
      expect(render(before)).toContain("chat-prose");
      expect(example.content).toBe(before);
    }
    const html = render(chatPresentationExamples[1].content);
    expect(html).toContain("28/10/2026");
    expect(html).toContain('href="https://example.com/noticia"');
    expect(render("Bom dia!")).toBe('<div class="chat-prose"><p>Bom dia!</p></div>');
  });

  it("renderiza os quatro marcadores semânticos com emojis contextuais", () => {
    expect(render("✅ **Confirmado:** Operação concluída.")).toContain(
      "chat-callout--success"
    );
    expect(render("ℹ️ **Informação:** Contexto relevante.")).toContain(
      "chat-callout--info"
    );
    expect(render("⚠️ **Atenção:** Verifique antes de prosseguir.")).toContain(
      "chat-callout--warning"
    );
    expect(render("❌ **Erro:** A operação falhou.")).toContain(
      "chat-callout--error"
    );
  });

  it("não colore palavras avulsas; cor só vem do marcador semântico", () => {
    const html = render(
      "✅ Confirmação genérica. ⚠️ Aviso isolado. 📌 Destaque solto."
    );
    expect(html).not.toContain('class="chat-callout ');
  });

  it("renderiza resposta organizada com títulos, listas e marcadores semânticos", () => {
    const html = render(
      "## Resumo da operação\n\n✅ **Confirmado:** A tarefa foi concluída com sucesso.\n\nℹ️ **Informação:** O resultado está disponível para consulta.\n\n⚠️ **Atenção:** Revise os dados antes de compartilhar.\n\n- Item um\n- Item dois\n\n❌ **Erro:** Não foi possível salvar o anexo."
    );
    expect(html).toContain("<h3>");
    expect(html).toContain("chat-callout--success");
    expect(html).toContain("chat-callout--info");
    expect(html).toContain("chat-callout--warning");
    expect(html).toContain("chat-callout--error");
    expect(html).toContain("<ul>");
    expect(html).not.toContain('role="alert"');
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
});
