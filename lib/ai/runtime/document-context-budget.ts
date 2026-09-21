import {
  MAX_DOCUMENTS_PER_MESSAGE,
  MAX_DOCUMENT_CONTEXT_CHARACTERS,
  MAX_DOCUMENT_CONTEXT_TOTAL_CHARACTERS,
} from "@/lib/media/config";

/**
 * Pacote 17.7 (Document Intelligence V1): orçamento deterministico de contexto
 * de documentos. Segue a mesma filosofia do Context Economy do historico:
 * limite em CARACTERES (nao em contagem de tokens estimada), truncamento
 * deterministico do inicio do documento e metadata auditavel.
 *
 * Este modulo e puro (sem server-only) para poder ser testado isoladamente e
 * usado por qualquer runtime. Nao baixa, nao loga e nao persiste conteudo.
 */
export const DOCUMENT_CONTEXT_LIMITS = {
  maxDocumentsPerRequest: MAX_DOCUMENTS_PER_MESSAGE,
  // Limite por documento igual ao teto de extracao, para nao truncar duas
  // vezes o mesmo arquivo e manter a mensagem ao usuario honesta.
  maxCharactersPerDocument: MAX_DOCUMENT_CONTEXT_CHARACTERS,
  // Teto compartilhado da requisicao: dois documentos de 12k caberiam no
  // limite individual, mas o contexto do provider precisa preservar historico,
  // memoria e contexto de projeto.
  maxTotalCharacters: MAX_DOCUMENT_CONTEXT_TOTAL_CHARACTERS,
  maxSourceLabelCharacters: 120,
} as const;

export interface DocumentBudgetSource {
  readonly sourceLabel: string;
  readonly text: string;
}

export interface BudgetedDocumentSource {
  readonly sourceIndex: number;
  readonly sourceLabel: string;
  readonly text: string;
  readonly charactersProvided: number;
  readonly charactersIncluded: number;
  readonly truncated: boolean;
  readonly omitted: boolean;
}

export interface DocumentContextBudgetMetadata {
  readonly documentsProvided: number;
  readonly documentsIncluded: number;
  readonly documentsOmitted: number;
  readonly documentsTruncated: number;
  readonly charactersProvided: number;
  readonly charactersIncluded: number;
  readonly truncated: boolean;
  readonly perDocumentLimit: number;
  readonly totalLimit: number;
}

export interface DocumentContextBudgetResult {
  readonly sources: readonly BudgetedDocumentSource[];
  readonly metadata: DocumentContextBudgetMetadata;
}

/**
 * Rotulo de fonte seguro: nunca expoe caminho de storage, bucket ou UUID.
 * Remove separadores de caminho e caracteres de controle, colapsa espacos e
 * limita o tamanho. Rotulo vazio vira um padrao neutro.
 */
export function sanitizeDocumentSourceLabel(value: string | null | undefined) {
  const normalized = (value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "documento";
  return normalized.slice(0, DOCUMENT_CONTEXT_LIMITS.maxSourceLabelCharacters);
}

/**
 * Aplica o orcamento de documentos de forma determinística: a ordem recebida e
 * preservada, cada documento respeita o limite individual e o total e
 * compartilhado na ordem de anexo. Documentos que nao couberem permanecem na
 * lista marcados como `omitted`, para que a Nira possa informar a limitacao de
 * forma honesta em vez de silenciar a ausencia.
 */
export function buildDocumentContextBudget(
  sources: readonly DocumentBudgetSource[],
): DocumentContextBudgetResult {
  let remaining = DOCUMENT_CONTEXT_LIMITS.maxTotalCharacters;
  const result: BudgetedDocumentSource[] = sources.map((source, index) => {
    const label = sanitizeDocumentSourceLabel(source.sourceLabel);
    const provided = source.text;
    if (index >= DOCUMENT_CONTEXT_LIMITS.maxDocumentsPerRequest || remaining <= 0) {
      return Object.freeze({
        sourceIndex: index,
        sourceLabel: label,
        text: "",
        charactersProvided: provided.length,
        charactersIncluded: 0,
        truncated: provided.length > 0,
        omitted: true,
      });
    }

    const allowed = Math.min(
      DOCUMENT_CONTEXT_LIMITS.maxCharactersPerDocument,
      remaining,
    );
    const included = provided.slice(0, allowed);
    remaining -= included.length;
    return Object.freeze({
      sourceIndex: index,
      sourceLabel: label,
      text: included,
      charactersProvided: provided.length,
      charactersIncluded: included.length,
      truncated: included.length < provided.length,
      omitted: included.length === 0,
    });
  });

  const charactersProvided = result.reduce(
    (total, source) => total + source.charactersProvided,
    0,
  );
  const charactersIncluded = result.reduce(
    (total, source) => total + source.charactersIncluded,
    0,
  );

  return Object.freeze({
    sources: Object.freeze(result),
    metadata: Object.freeze({
      documentsProvided: result.length,
      documentsIncluded: result.filter((source) => !source.omitted).length,
      documentsOmitted: result.filter((source) => source.omitted).length,
      documentsTruncated: result.filter((source) => source.truncated).length,
      charactersProvided,
      charactersIncluded,
      truncated: charactersIncluded !== charactersProvided,
      perDocumentLimit: DOCUMENT_CONTEXT_LIMITS.maxCharactersPerDocument,
      totalLimit: DOCUMENT_CONTEXT_LIMITS.maxTotalCharacters,
    }),
  });
}
