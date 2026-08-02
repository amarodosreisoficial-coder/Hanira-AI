import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildDocumentContextBlock,
  extractDocumentFromFile,
} from "../services/document-extraction";

function createTextFile(content: string, name = "nota.txt", type = "text/plain") {
  return new File([content], name, { type });
}

function createPdfFile(text: string) {
  const stream = `BT\n/F1 12 Tf\n72 720 Td\n(${text}) Tj\nET`;
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length ${stream.length} >>
stream
${stream}
endstream
endobj
trailer
<< /Root 1 0 R >>
%%EOF`;
  return new File([pdf], "arquivo.pdf", { type: "application/pdf" });
}

describe("extracao textual de documentos", () => {
  it("extrai txt e markdown sanitizados", async () => {
    await expect(
      extractDocumentFromFile(createTextFile("linha 1\n\nlinha 2")),
    ).resolves.toMatchObject({
      text: "linha 1\n\nlinha 2",
      truncated: false,
      warnings: [],
    });
    await expect(
      extractDocumentFromFile(
        createTextFile("# titulo\n\nconteudo", "nota.md", "text/markdown"),
      ),
    ).resolves.toMatchObject({
      text: "# titulo\n\nconteudo",
      truncated: false,
    });
  });

  it("extrai PDF textual sem OCR", async () => {
    await expect(
      extractDocumentFromFile(createPdfFile("Resumo do PDF")),
    ).resolves.toMatchObject({
      text: "Resumo do PDF",
      pageCount: 1,
    });
  });

  it("informa quando o documento nao possui texto extraivel", async () => {
    await expect(extractDocumentFromFile(createPdfFile(""))).rejects.toThrow(
      "texto extraivel",
    );
  });

  it("marca truncamento e delimita contexto nao confiavel", async () => {
    const extracted = await extractDocumentFromFile(createTextFile("a".repeat(12_500)));
    expect(extracted.truncated).toBe(true);
    expect(extracted.warnings.join(" ")).toContain("primeiros");

    const context = buildDocumentContextBlock([
      {
        attachment: {
          id: "1",
          type: "document",
          storageBucket: "chat-documents",
          storagePath: "u/c/f.pdf",
          originalName: "manual.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          userId: "u",
          conversationId: "c",
          messageId: null,
          metadata: {},
        },
        extracted,
      },
    ]);
    expect(context).toContain("Conteudo nao confiavel");
    expect(context).toContain("<documento>");
    expect(context).toContain("</documento>");
  });
});
