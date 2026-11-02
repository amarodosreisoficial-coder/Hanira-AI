import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMarkdownBlock } from "@/components/chat/message-content";
import {
  MessageContent,
  inlineContent,
  parseChatMarkdown,
  renderWritingBody,
} from "@/components/chat/message-content";
import { NiraWritingBlock, copyToClipboard, shareContent } from "@/components/chat/nira-writing-block";

const render = (content: string) => renderToStaticMarkup(<MessageContent content={content} />);

function stubNavigator(share = false) {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const nav: Record<string, unknown> = { clipboard: { writeText } };
  if (share) nav.share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", nav);
  return { writeText, share: nav.share as ReturnType<typeof vi.fn> | undefined };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("19.2-L: blocos inteligentes de escrita", () => {
  it("reconhece bloco de escrita válido", () => {
    const blocks = parseChatMarkdown(
      ':::hanira-writing type="prompt" title="Prompt pronto"\nCrie um plano de aula.\n:::',
    );
    expect(blocks).toEqual([
      {
        type: "writing",
        writingType: "prompt",
        title: "Prompt pronto",
        text: "Crie um plano de aula.",
      },
    ]);
  });

  it("texto comum sem delimitadores continua como parágrafo", () => {
    const blocks = parseChatMarkdown("Apenas uma resposta comum da Nira.");
    expect(blocks).toEqual([
      { type: "paragraph", text: "Apenas uma resposta comum da Nira." },
    ]);
  });

  it("mantém markdown básico dentro do bloco", () => {
    const blocks = parseChatMarkdown(
      ':::hanira-writing type="email" title="E-mail"\nOlá **nome**,\n:::',
    );
    const block = blocks[0] as Extract<ChatMarkdownBlock, { type: "writing" }>;
    expect(block.type).toBe("writing");
    expect(block.text).toBe("Olá **nome**,");
    const html = render(
      ':::hanira-writing type="email" title="E-mail"\nOlá **nome**,\n:::',
    );
    expect(html).toContain("<strong>nome</strong>");
  });

  it("respeita blocos de código internos", () => {
    const html = render(
      ':::hanira-writing type="prompt"\n```ts\nconst x = 1;\n```\n:::',
    );
    expect(html).toContain("<pre");
    expect(html).toContain("const x = 1;");
    expect(html).toContain("nira-writing-block");
  });

  it("delimitador incompleto durante streaming não esconde o conteúdo", () => {
    const blocks = parseChatMarkdown(
      ':::hanira-writing type="prompt"\nConteúdo ainda em andamento',
    );
    expect(blocks).toEqual([
      { type: "paragraph", text: "Conteúdo ainda em andamento" },
    ]);
  });

  it("não interpreta HTML/JavaScript enviado pelo modelo", () => {
    const html = render(
      ':::hanira-writing type="prompt"\n<script>alert(1)</script>\n:::',
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("nira-writing-block");
  });

  it("blocos não aninham arbitrariamente", () => {
    const html = render(
      ':::hanira-writing type="prompt"\nExterno :::hanira-writing type="x"\ninterno\n:::\n:::',
    );
    // O primeiro ::: fecha o bloco; o restante vira texto visível, não some.
    expect(html).toContain("Externo");
    expect(html).toContain("interno");
  });

  it("copia somente o conteúdo interno do bloco", async () => {
    const { writeText } = stubNavigator(false);
    await copyToClipboard("somente este texto");
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("somente este texto");
  });

  it("compartilha via navigator.share quando o navegador suporta", async () => {
    const { share } = stubNavigator(true);
    await shareContent("Prompt pronto", "conteúdo do prompt");
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ title: "Prompt pronto", text: "conteúdo do prompt" });
  });

  it("faz fallback de cópia quando não há compartilhamento nativo", async () => {
    const { writeText } = stubNavigator(false);
    await shareContent("Título", "texto para colar");
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("texto para colar");
  });

  it("trata falha de cópia da área de transferência", async () => {
    const { writeText } = stubNavigator(false);
    writeText.mockRejectedValueOnce(new Error("sem permissão"));
    await expect(copyToClipboard("x")).rejects.toThrow("sem permissão");
  });

  it("renderiza rótulos acessíveis e categoria configurável", () => {
    const html = render(
      ':::hanira-writing type="whatsapp" title="Mensagem pronta"\nOi, tudo bem?\n:::',
    );
    expect(html).toContain("nira-writing-block");
    expect(html).toContain("Mensagem pronta");
    expect(html).toContain("WhatsApp");
    expect(html).toContain("Copiar conteúdo do bloco");
    expect(html).toContain("Compartilhar conteúdo do bloco");
    expect(html).toContain("aria-label=\"Bloco de escrita: WhatsApp\"");
  });

  it("preserva a cópia da resposta inteira (não altera o registro original)", () => {
    const content = "# Título\nTexto da resposta.\n:::hanira-writing type=\"prompt\"\nbloco interno\n:::\n";
    const html = render(content);
    expect(html).toContain("Texto da resposta.");
    expect(html).toContain("bloco interno");
    // O bloco de escrita não envolve a mensagem inteira; a cópia integral segue
    // existindo no componente de mensagem (coberto pelo teste de apresentação).
  });
});
