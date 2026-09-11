export type ComposerMode = "text" | "image";
export type ComposerIntent = "text" | "image";

const IMAGE_EXPLANATION_PATTERNS = [
  /\b(como|de que forma)\b.*\b(gerar|criar|fazer|desenhar)\b.*\b(imagem|foto|arte|ilustra[cç][aã]o)\b/u,
  /\b(explique|explica|ensine|ensina|tutorial|passo a passo)\b.*\b(imagem|foto|arte|ilustra[cç][aã]o)\b/u,
  /\b(quais?|qual)\b.*\b(formatos?|modelos?|limites?|recursos?)\b.*\b(imagem|foto|arte|ilustra[cç][aã]o)\b/u,
  /\b(melhor|bom)\b.*\bprompt\b.*\b(imagem|foto|arte|ilustra[cç][aã]o)\b/u,
  /\b(voc[eê]|nira)\b.*\b(consegue|pode|sabe)\b.*\b(gerar|criar|fazer|desenhar)\b.*\b(imagem|foto|arte|ilustra[cç][aã]o)\b/u,
  /\b(how (do|can|would)|explain|teach|tutorial)\b.*\b(generate|create|make|draw)\b.*\b(image|photo|art|illustration)\b/u,
  /\b(can|could) (you|nira)\b.*\b(generate|create|make|draw)\b.*\b(image|photo|art|illustration)\b/u,
  /\b(best prompt|what (formats?|models?)|which (formats?|models?))\b.*\b(image|photo|art|illustration)\b/u,
];

const DIRECT_IMAGE_PATTERNS = [
  /^(por favor[, ]*)?\b(gere|gera|crie|cria|fa[cç]a|faz|desenhe|desenha|produza|produz)\b[\s\S]*\b(imagem|foto|arte|ilustra[cç][aã]o|retrato|p[aô]ster|logo)\b/u,
  /\b(quero|gostaria de|preciso de)\b[\s\S]*\b(imagem|foto|arte|ilustra[cç][aã]o|retrato|p[aô]ster|logo)\b/u,
  /^(please[, ]*)?\b(generate|create|make|draw|illustrate|design)\b[\s\S]*\b(image|photo|art|illustration|portrait|poster|logo)\b/u,
  /\b(i want|i would like|i need)\b[\s\S]*\b(image|photo|art|illustration|portrait|poster|logo)\b/u,
];

function normalizeDraft(draft: string) {
  return draft.trim().toLocaleLowerCase("pt-BR").replace(/\s+/gu, " ");
}

export function hasHighConfidenceImageIntent(draft: string) {
  const normalized = normalizeDraft(draft);
  if (!normalized) return false;
  if (IMAGE_EXPLANATION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  return DIRECT_IMAGE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function resolveComposerIntent(options: {
  mode: ComposerMode;
  draft: string;
}): ComposerIntent {
  if (options.mode === "image") return "image";
  return hasHighConfidenceImageIntent(options.draft) ? "image" : "text";
}
