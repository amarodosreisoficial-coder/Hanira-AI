import { describe, expect, it } from "vitest";
import {
  buildDocumentContextBudget,
  sanitizeDocumentSourceLabel,
  DOCUMENT_CONTEXT_LIMITS,
} from "../lib/ai/runtime/document-context-budget";

describe("document context budget", () => {
  it("preserva fonte e texto quando dentro do orcamento", () => {
    const result = buildDocumentContextBudget([
      { sourceLabel: "nota.txt", text: "Hello".repeat(100) },
    ]);

    expect(result.sources[0].sourceLabel).toBe("nota.txt");
    expect(result.sources[0].text).toBe("Hello".repeat(100));
    expect(result.sources[0].charactersIncluded).toBe(result.sources[0].charactersProvided);
    expect(result.sources[0].truncated).toBe(false);
    expect(result.sources[0].omitted).toBe(false);
    expect(result.metadata.documentsIncluded).toBe(1);
    expect(result.metadata.documentsOmitted).toBe(0);
  });

  it("truncar texto quando excede limite por documento", () => {
    const longText = "A".repeat(DOCUMENT_CONTEXT_LIMITS.maxCharactersPerDocument + 1000);
    const result = buildDocumentContextBudget([
      { sourceLabel: "doc.txt", text: longText },
    ]);

    expect(result.sources[0].truncated).toBe(true);
    expect(result.sources[0].charactersIncluded).toBe(DOCUMENT_CONTEXT_LIMITS.maxCharactersPerDocument);
    expect(result.sources[0].charactersProvided).toBeGreaterThan(result.sources[0].charactersIncluded);
    expect(result.metadata.documentsTruncated).toBe(1);
    expect(result.metadata.truncated).toBe(true);
  });

  it("omite documento quando total excede limite compartilhado", () => {
    // Dois documentos grandes que juntos excedem o limite total
    const text1 = "A".repeat(15000);
    const text2 = "B".repeat(15000);
    const result = buildDocumentContextBudget([
      { sourceLabel: "doc1.txt", text: text1 },
      { sourceLabel: "doc2.txt", text: text2 },
    ]);

    // Primeiro documento consome 12000 (limite por documento)
    expect(result.sources[0].charactersIncluded).toBe(DOCUMENT_CONTEXT_LIMITS.maxCharactersPerDocument);
    expect(result.sources[0].truncated).toBe(true);

    // Segundo documento fica com 8000 restantes do total (20000 - 12000)
    // Mas como 8000 < 15000, ele é truncado
    expect(result.sources[1].omitted).toBe(false);
    expect(result.sources[1].truncated).toBe(true);
    expect(result.sources[1].charactersIncluded).toBe(DOCUMENT_CONTEXT_LIMITS.maxTotalCharacters - DOCUMENT_CONTEXT_LIMITS.maxCharactersPerDocument);
    expect(result.metadata.documentsIncluded).toBe(2);
    expect(result.metadata.truncated).toBe(true);
  });

  it("omite documento quando nao cabe nenhum caractere no orcamento restante", () => {
    // Dois documentos que preenchem o limite total
    const text1 = "A".repeat(DOCUMENT_CONTEXT_LIMITS.maxCharactersPerDocument);
    const text2 = "B".repeat(DOCUMENT_CONTEXT_LIMITS.maxTotalCharacters - DOCUMENT_CONTEXT_LIMITS.maxCharactersPerDocument + 100);
    const result = buildDocumentContextBudget([
      { sourceLabel: "doc1.txt", text: text1 },
      { sourceLabel: "doc2.txt", text: text2 },
    ]);

    expect(result.sources[0].charactersIncluded).toBe(DOCUMENT_CONTEXT_LIMITS.maxCharactersPerDocument);
    // Segundo documento é truncado pois excede o orçamento restante
    expect(result.sources[1].truncated).toBe(true);
    expect(result.sources[1].charactersIncluded).toBe(DOCUMENT_CONTEXT_LIMITS.maxTotalCharacters - DOCUMENT_CONTEXT_LIMITS.maxCharactersPerDocument);
  });

  it("respeita limite maximo de documentos por requisicao", () => {
    const result = buildDocumentContextBudget([
      { sourceLabel: "a.txt", text: "A".repeat(100) },
      { sourceLabel: "b.txt", text: "B".repeat(100) },
      { sourceLabel: "c.txt", text: "C".repeat(100) },
      { sourceLabel: "d.txt", text: "D".repeat(100) },
    ]);

    expect(result.sources.length).toBe(4);
    expect(result.sources[0].omitted).toBe(false);
    expect(result.sources[1].omitted).toBe(false);
    expect(result.sources[2].omitted).toBe(true);
    expect(result.sources[3].omitted).toBe(true);
    expect(result.metadata.documentsProvided).toBe(4);
    expect(result.metadata.documentsIncluded).toBe(2);
    expect(result.metadata.documentsOmitted).toBe(2);
  });

  it("sanitiza rotulo de fonte removendo caracteres perigosos", () => {
    // O regex garante que paths com / e \ sao convertidos
    expect(sanitizeDocumentSourceLabel("folder/file.txt")).toBe("folder_file.txt");
    expect(sanitizeDocumentSourceLabel("folder\\file.txt")).toBe("folder_file.txt");
    expect(sanitizeDocumentSourceLabel("  espacos  ")).toBe("espacos");
    expect(sanitizeDocumentSourceLabel("")).toBe("documento");
    expect(sanitizeDocumentSourceLabel(null)).toBe("documento");
    expect(sanitizeDocumentSourceLabel(undefined)).toBe("documento");
  });

  it("limita tamanho do rotulo de fonte", () => {
    const longLabel = "A".repeat(200);
    expect(sanitizeDocumentSourceLabel(longLabel).length).toBeLessThanOrEqual(DOCUMENT_CONTEXT_LIMITS.maxSourceLabelCharacters);
  });

  it("mantem limite de documentos configurado", () => {
    expect(DOCUMENT_CONTEXT_LIMITS.maxDocumentsPerRequest).toBe(2);
    expect(DOCUMENT_CONTEXT_LIMITS.maxCharactersPerDocument).toBe(12000);
    expect(DOCUMENT_CONTEXT_LIMITS.maxTotalCharacters).toBe(20000);
  });
});
