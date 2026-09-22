import type { DocumentExtractionStatus } from "@/services/document-extraction";

/**
 * Pacote 17.7 — estados de documento expostos na UI.
 *
 * Este modulo e puro (sem React, sem rede) para que os estados possam ser
 * testados diretamente, e nao apenas por comparacao de strings de origem.
 */

export const DOCUMENT_READING_LABEL = "Lendo documento...";

export const DOCUMENT_UI_STATES = [
  "ready",
  "reading",
  "warning",
  "error",
] as const;

export type DocumentUiState = (typeof DOCUMENT_UI_STATES)[number];

export interface DocumentStatusDescriptor {
  readonly state: DocumentUiState;
  readonly message: string;
}

const STATUS_DESCRIPTORS: Record<DocumentExtractionStatus, DocumentStatusDescriptor> = {
  extracted: Object.freeze({
    state: "ready" as const,
    message: "Documento pronto para envio.",
  }),
  truncated: Object.freeze({
    state: "warning" as const,
    message: "Documento pronto para envio. Partes do final podem ficar fora do limite de contexto.",
  }),
  no_text: Object.freeze({
    state: "error" as const,
    message:
      "Não encontrei texto extraível neste arquivo. PDFs digitalizados ainda precisam de OCR, recurso que não está disponível nesta versão.",
  }),
  unsupported_type: Object.freeze({
    state: "error" as const,
    message: "Formato não suportado. Use PDF com texto extraível, TXT ou Markdown.",
  }),
  unreadable: Object.freeze({
    state: "error" as const,
    message: "Não foi possível ler este documento. O arquivo pode estar corrompido.",
  }),
  budget_exceeded: Object.freeze({
    state: "warning" as const,
    message: "Este documento excedeu o limite de contexto de documentos desta mensagem.",
  }),
};

export function describeDocumentStatus(
  status: DocumentExtractionStatus,
): DocumentStatusDescriptor {
  return STATUS_DESCRIPTORS[status] ?? STATUS_DESCRIPTORS.unreadable;
}

export function documentReadingLabel(fileName: string) {
  return `${DOCUMENT_READING_LABEL} ${fileName}`;
}

/** Estados que impedem o envio do documento: a Nira nao deve fingir leitura. */
export function isBlockingDocumentStatus(status: DocumentExtractionStatus) {
  return status !== "extracted" && status !== "truncated";
}