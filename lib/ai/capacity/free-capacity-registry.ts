import { ModelRouterError } from "@/lib/ai/router/errors";
import { NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID } from "@/lib/ai/nira/profiles";
import type { RouterCandidate } from "@/lib/ai/router/types";
import {
  assertGroqModelNotDeprecated,
  isPreviewGroqModel,
} from "@/lib/ai/capacity/groq-free-candidates";
import { isRouterCandidateLifecycle } from "@/lib/ai/router/types";

// Nira Free Capacity Registry (Pacote 16.5 - Fase 2 do roadmap; estendido no
// Pacote 16.6 - Groq Multi-Free / Free Capacity Engine).
//
// Registry declarativo da cadeia de capacidade FREE do perfil `nira-cloud-free`:
//
//   modelo free primario (auditado)
//     -> candidato secundario free DE PRODUCAO (catalogo 16.6: gpt-oss-120b)
//     -> candidatos extra declarados por env (prioridade crescente)
//
// Regras duras desta camada (invariantes do roadmap):
// - TODO candidato aqui e costClass "free" POR CONSTRUCAO: a classificacao
//   financeira NAO e configuravel via env. Nenhum candidato pago/promocional
//   entra na cadeia free (o Zero-Cost Guard continua aplicando no router);
// - apenas o provider cloud AUDITADO ("groq") e aceito na cadeia free hoje.
//   Adicionar outro provider exige auditoria R$0 propria (Fase 3 do roadmap);
// - o modelo primario e o tecnico ja auditado ao vivo (Pacote 16.3:
//   GROQ_MODEL / GROQ_DEFAULT_MODEL); modelos extra entram SOMENTE por
//   configuracao explicita do operador (env JSON), auditados por quem
//   configura — a Hanira nunca assume que um modelo e free so pelo nome;
// - Pacote 16.6: modelos aposentados (deprecated) sao BLOQUEADOS em qualquer
//   posicao da cadeia (fail-closed); modelos preview sao ISOLADOS: so entram
//   com lifecycle "preview" declarado E opt-in explicito
//   (HANIRA_ALLOW_PREVIEW_MODELS=true) — preview nunca e default de producao;
// - fail-closed: qualquer configuracao invalida falha com
//   ModelRouterError(invalid_configuration) — nada e silenciosamente ignorado;
// - pura: nao instancia providers, nao chama rede, nao acessa Supabase.
//   A leitura de env fica isolada em resolveFreeCapacityCandidates() e
//   resolveFreeCapacityRoutingPolicy(), para que o builder permaneca 100%
//   puro e testavel.

export const FREE_EXTRA_CANDIDATES_ENV = "HANIRA_FREE_TEXT_CANDIDATES";
// Pacote 16.6: opt-in explicito de modelos Free Plan Preview. DEFAULT FALSE
// (preview bloqueado por padrao, fail-closed em valor invalido).
export const PREVIEW_MODELS_ENV = "HANIRA_ALLOW_PREVIEW_MODELS";
// Pacote 16.6: opt-out do candidato secundario free DE PRODUCAO
// (openai/gpt-oss-120b). Default TRUE: a cadeia default tem dois candidatos
// de producao auditados (20b primario, 120b secundario).
export const SECONDARY_ENABLED_ENV = "HANIRA_FREE_SECONDARY_ENABLED";

// Providers cloud elegiveis para a cadeia free. Hoje: somente o provider
// auditado. A expansao exige auditoria e mudanca explicita desta lista.
const ALLOWED_FREE_PROVIDERS: readonly string[] = Object.freeze(["groq"]);

// Limite defensivo de candidatos free configurados (evita configuracoes
// descontroladas; a capacidade real de modelos free e pequena).
const MAX_EXTRA_CANDIDATES = 8;

export interface FreeCapacityRegistryResult {
  // Candidatos completos (default + conhecidos aceitos + extras aceitos),
  // prontos para o registry do router.
  readonly candidates: readonly RouterCandidate[];
  // Ids logicos de TODA a cadeia free aceita (default + conhecidos + extras),
  // em ordem de prioridade. Usados para o escopo do perfil nira-cloud-free.
  readonly chainCandidateIds: readonly string[];
  // Ids logicos dos candidatos EXTRA aceitos (sem o default e sem os
  // conhecidos), em ordem de prioridade. Mantido para compatibilidade (16.5).
  readonly extraCandidateIds: readonly string[];
  // Pacote 16.6: ids de candidatos preview configurados porem NAO aceitos
  // (opt-in ausente). Apenas observabilidade — nenhum segredo/conteudo.
  readonly previewBlockedIds: readonly string[];
  // Pacote 16.6: politica efetivamente aplicada na construcao da cadeia.
  readonly policy: FreeCapacityRoutingPolicy;
}

// Pacote 16.6: politica de roteamento free multi-candidato. Preview e
// bloqueado por padrao (fail-closed); o secundario de producao e ligado por
// padrao e pode ser desligado explicitamente pelo operador.
export interface FreeCapacityRoutingPolicy {
  readonly allowPreviewModels: boolean;
  readonly secondaryEnabled: boolean;
}

export const DEFAULT_FREE_CAPACITY_POLICY: FreeCapacityRoutingPolicy =
  Object.freeze({
    allowPreviewModels: false,
    secondaryEnabled: true,
  });

/**
 * Parser fail-closed de env booleana de politica. Ausente/vazia -> fallback.
 * Apenas "true"/"false" sao validos; qualquer outro valor falha com
 * ModelRouterError(invalid_configuration) — nunca interpretado como default
 * silenciosamente.
 */
export function parseFreeCapacityBooleanEnv(input: {
  readonly name: string;
  readonly rawValue: string | undefined;
  readonly fallback: boolean;
}): boolean {
  const raw = input.rawValue;
  if (raw === undefined || raw === null || raw.trim() === "") {
    return input.fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  invalidFreeCapacityConfig(
    `a variavel ${input.name} deve ser "true" ou "false" (recebido valor invalido; fail-closed).`,
  );
}

/**
 * Composition root da POLITICA de roteamento free (le env, fail-closed).
 * Pura no sentido de nao tocar rede/providers/Supabase.
 */
export function resolveFreeCapacityRoutingPolicy(): FreeCapacityRoutingPolicy {
  return Object.freeze({
    allowPreviewModels: parseFreeCapacityBooleanEnv({
      name: PREVIEW_MODELS_ENV,
      rawValue: process.env[PREVIEW_MODELS_ENV],
      fallback: DEFAULT_FREE_CAPACITY_POLICY.allowPreviewModels,
    }),
    secondaryEnabled: parseFreeCapacityBooleanEnv({
      name: SECONDARY_ENABLED_ENV,
      rawValue: process.env[SECONDARY_ENABLED_ENV],
      fallback: DEFAULT_FREE_CAPACITY_POLICY.secondaryEnabled,
    }),
  });
}

function invalidFreeCapacityConfig(message: string): never {
  throw new ModelRouterError({
    code: "invalid_configuration",
    message: `Configuracao invalida do Nira Free Capacity Registry: ${message}`,
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateDefaultFreeCandidate(
  candidate: RouterCandidate,
  policy: FreeCapacityRoutingPolicy,
): RouterCandidate {
  if (!candidate || typeof candidate !== "object") {
    invalidFreeCapacityConfig("o candidato padrao nao e um objeto valido.");
  }
  if (candidate.id !== NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID) {
    invalidFreeCapacityConfig(
      `o candidato padrao da cadeia free deve ter id "${NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID}".`,
    );
  }
  if (!ALLOWED_FREE_PROVIDERS.includes(candidate.provider)) {
    invalidFreeCapacityConfig(
      `o candidato padrao usa o provider "${candidate.provider}", que nao esta auditado para a cadeia free.`,
    );
  }
  if (candidate.costClass !== "free") {
    invalidFreeCapacityConfig(
      'o candidato padrao exige costClass "free" declarada (fail-closed).',
    );
  }
  if (
    !Array.isArray(candidate.capabilities) ||
    !candidate.capabilities.includes("text")
  ) {
    invalidFreeCapacityConfig(
      'o candidato padrao deve anunciar a capability "text".',
    );
  }
  if (candidate.enabled !== true) {
    invalidFreeCapacityConfig(
      "o candidato padrao da cadeia free deve estar enabled.",
    );
  }
  // Pacote 16.6: modelos aposentados sao bloqueados em qualquer posicao.
  assertGroqModelNotDeprecated({
    model: candidate.model,
    role: "candidato padrao da cadeia free",
  });
  // Pacote 16.6: lifecycle do padrao. Ausente = production (compat 16.5).
  // Preview no padrao exige opt-in explicito (a composicao decide antes);
  // deprecated/disabled nunca sao aceitos aqui.
  if (candidate.lifecycle !== undefined) {
    if (!isRouterCandidateLifecycle(candidate.lifecycle)) {
      invalidFreeCapacityConfig(
        "o candidato padrao possui lifecycle invalido.",
      );
    }
    if (
      candidate.lifecycle === "deprecated" ||
      candidate.lifecycle === "disabled"
    ) {
      invalidFreeCapacityConfig(
        `o candidato padrao da cadeia free nao aceita lifecycle "${candidate.lifecycle}" (fail-closed).`,
      );
    }
    if (
      candidate.lifecycle === "preview" &&
      !policy.allowPreviewModels
    ) {
      invalidFreeCapacityConfig(
        `o candidato padrao declara lifecycle "preview" sem opt-in explicito (${PREVIEW_MODELS_ENV}=true exigido; fail-closed).`,
      );
    }
    if (
      candidate.lifecycle === "production" &&
      isPreviewGroqModel(candidate.model)
    ) {
      invalidFreeCapacityConfig(
        `o modelo "${candidate.model}" e um Free Plan Preview conhecido e exige lifecycle "preview" + opt-in (${PREVIEW_MODELS_ENV}=true); declarar como "production" e bloqueado (fail-closed).`,
      );
    }
  }
  return candidate;
}

interface RawExtraCandidate {
  readonly id?: unknown;
  readonly model?: unknown;
  readonly provider?: unknown;
  readonly enabled?: unknown;
  readonly label?: unknown;
  // Pacote 16.6: ciclo de vida declarado do extra. Aceito apenas
  // "production" (default/ausente) ou "preview" (com opt-in). "deprecated" e
  // "disabled" sao rejeitados com diagnostico (fail-closed).
  readonly lifecycle?: unknown;
}

function validateExtraLifecycle(
  raw: RawExtraCandidate,
  id: string,
): RouterCandidate["lifecycle"] {
  if (raw.lifecycle === undefined || raw.lifecycle === null) {
    return undefined;
  }
  if (!isRouterCandidateLifecycle(raw.lifecycle)) {
    invalidFreeCapacityConfig(
      `candidato extra "${id}" possui lifecycle invalido (valores aceitos: "production", "preview").`,
    );
  }
  if (raw.lifecycle === "deprecated" || raw.lifecycle === "disabled") {
    invalidFreeCapacityConfig(
      `candidato extra "${id}" declara lifecycle "${raw.lifecycle}", que nunca e elegivel: remova o candidato ou corrija a configuracao (fail-closed).`,
    );
  }
  // "preview" pode retornar aqui mesmo sem opt-in: o builder FILTRA (candidato
  // INELEGIVEL, nunca erro de rede nem ativacao silenciosa) e reporta o id em
  // previewBlockedIds. A elegibilidade final continua no router (opt-in e
  // re-verificado em defesa extra).
  return raw.lifecycle;
}

function buildExtraFreeCandidate(
  raw: RawExtraCandidate,
  index: number,
  seenIds: Set<string>,
  priorityOffset: number,
): RouterCandidate {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    invalidFreeCapacityConfig(
      `candidato extra na posicao ${index} nao e um objeto valido.`,
    );
  }
  const id = raw.id;
  if (!isNonEmptyString(id)) {
    invalidFreeCapacityConfig(
      `candidato extra na posicao ${index} exige id logico nao vazio.`,
    );
  }
  if (!id.startsWith("nira-cloud-free-")) {
    invalidFreeCapacityConfig(
      `candidato extra "${id}" deve usar o prefixo "nira-cloud-free-" (escopo do perfil nira-cloud-free).`,
    );
  }
  if (id === NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID) {
    invalidFreeCapacityConfig(
      `candidato extra nao pode usar o id reservado "${NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID}".`,
    );
  }
  if (seenIds.has(id)) {
    invalidFreeCapacityConfig(
      `id logico de candidato extra duplicado: ${id}.`,
    );
  }
  seenIds.add(id);

  const model = raw.model;
  if (!isNonEmptyString(model)) {
    invalidFreeCapacityConfig(
      `candidato extra "${id}" exige model nao vazio.`,
    );
  }

  // Pacote 16.6: modelos aposentados sao bloqueados em qualquer posicao da
  // cadeia (fail-closed, com diagnostico explicito).
  assertGroqModelNotDeprecated({
    model,
    role: `candidato extra "${id}"`,
  });

  const lifecycle = validateExtraLifecycle(raw, id);
  // Pacote 16.6: modelo preview conhecido NUNCA pode ser declarado como
  // "production" (defesa contra promocao silenciosa de preview). Declarar
  // lifecycle "preview" e a unica forma de inclui-lo (e ainda exige opt-in).
  if (isPreviewGroqModel(model) && lifecycle !== "preview") {
    invalidFreeCapacityConfig(
      `o modelo "${model}" (candidato extra "${id}") e um Free Plan Preview conhecido e exige lifecycle "preview" + opt-in (${PREVIEW_MODELS_ENV}=true); declarar como "production" e bloqueado (fail-closed).`,
    );
  }

  const provider =
    raw.provider === undefined || raw.provider === null
      ? ALLOWED_FREE_PROVIDERS[0]
      : raw.provider;
  if (
    typeof provider !== "string" ||
    !ALLOWED_FREE_PROVIDERS.includes(provider)
  ) {
    invalidFreeCapacityConfig(
      `candidato extra "${id}" usa o provider "${String(provider)}", que nao esta auditado para a cadeia free. Providers auditados: ${ALLOWED_FREE_PROVIDERS.join(", ")}.`,
    );
  }

  const enabled =
    raw.enabled === undefined || raw.enabled === null ? true : raw.enabled;
  if (typeof enabled !== "boolean") {
    invalidFreeCapacityConfig(
      `candidato extra "${id}" exige enabled booleano.`,
    );
  }

  const label = raw.label;
  if (label !== undefined && label !== null && typeof label !== "string") {
    invalidFreeCapacityConfig(
      `candidato extra "${id}" possui label invalida.`,
    );
  }

  // costClass "free" e HARDCODED por construcao: a cadeia free e so free.
  // Prioridade (Pacote 16.6): default e 1; candidatos conhecidos (ex.:
  // secundario de producao) ocupam as prioridades seguintes do catalogo;
  // extras entram DEPOIS deles, na ordem declarada. A regra antiga
  // (index + 2) e preservada quando nao ha candidatos conhecidos (16.5).
  return Object.freeze({
    id,
    provider,
    model,
    capabilities: Object.freeze(["text" as const]),
    priority: priorityOffset + index,
    enabled,
    deployment: "cloud" as const,
    costClass: "free" as const,
    ...(lifecycle !== undefined ? { lifecycle } : {}),
    ...(typeof label === "string" ? { label } : {}),
  });
}

/**
 * Valida um candidato conhecido (catalogo interno, ex.: secundario free de
 * producao). Mesmo contrato duro do padrao: provider auditado, costClass
 * "free" por construcao, capability text, modelo nao aposentado. Candidato
 * preview sem opt-in retorna sinalizado para o builder FILTRAR (inelegivel).
 */
function validateKnownFreeCandidate(
  candidate: RouterCandidate,
  seenIds: Set<string>,
): RouterCandidate {
  if (!candidate || typeof candidate !== "object") {
    invalidFreeCapacityConfig("candidato conhecido nao e um objeto valido.");
  }
  if (!isNonEmptyString(candidate.id)) {
    invalidFreeCapacityConfig("candidato conhecido exige id logico nao vazio.");
  }
  if (candidate.id === NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID) {
    invalidFreeCapacityConfig(
      `candidato conhecido nao pode usar o id reservado "${NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID}".`,
    );
  }
  if (!candidate.id.startsWith("nira-cloud-free-")) {
    invalidFreeCapacityConfig(
      `candidato conhecido "${candidate.id}" deve usar o prefixo "nira-cloud-free-" (escopo do perfil).`,
    );
  }
  if (seenIds.has(candidate.id)) {
    invalidFreeCapacityConfig(
      `id logico de candidato conhecido duplicado: ${candidate.id}.`,
    );
  }
  if (!ALLOWED_FREE_PROVIDERS.includes(candidate.provider)) {
    invalidFreeCapacityConfig(
      `candidato conhecido "${candidate.id}" usa o provider "${candidate.provider}", que nao esta auditado para a cadeia free.`,
    );
  }
  if (candidate.costClass !== "free") {
    invalidFreeCapacityConfig(
      `candidato conhecido "${candidate.id}" exige costClass "free" declarada (fail-closed).`,
    );
  }
  if (
    !Array.isArray(candidate.capabilities) ||
    !candidate.capabilities.includes("text")
  ) {
    invalidFreeCapacityConfig(
      `candidato conhecido "${candidate.id}" deve anunciar a capability "text".`,
    );
  }
  if (
    typeof candidate.priority !== "number" ||
    !Number.isSafeInteger(candidate.priority)
  ) {
    invalidFreeCapacityConfig(
      `candidato conhecido "${candidate.id}" exige priority inteira segura.`,
    );
  }
  if (
    candidate.enabled !== undefined &&
    typeof candidate.enabled !== "boolean"
  ) {
    invalidFreeCapacityConfig(
      `candidato conhecido "${candidate.id}" exige enabled booleano.`,
    );
  }
  assertGroqModelNotDeprecated({
    model: candidate.model,
    role: `candidato conhecido "${candidate.id}"`,
  });
  if (candidate.lifecycle !== undefined) {
    if (!isRouterCandidateLifecycle(candidate.lifecycle)) {
      invalidFreeCapacityConfig(
        `candidato conhecido "${candidate.id}" possui lifecycle invalido.`,
      );
    }
    if (
      candidate.lifecycle === "deprecated" ||
      candidate.lifecycle === "disabled"
    ) {
      invalidFreeCapacityConfig(
        `candidato conhecido "${candidate.id}" nao aceita lifecycle "${candidate.lifecycle}" (fail-closed).`,
      );
    }
  }
  seenIds.add(candidate.id);
  return candidate;
}

/**
 * Builder PURO da cadeia de capacidade free (Pacote 16.6):
 *
 *   default (auditado) -> candidatos conhecidos aceitos (ex.: secundario
 *   free DE PRODUCAO do catalogo) -> extras declarados via JSON
 *
 * - candidatos preview (conhecidos ou extras) sem opt-in sao FILTRADOS e
 *   reportados em previewBlockedIds (inelegiveis, nunca ativados em silencio);
 * - a prioridade dos extras comeca DEPOIS do ultimo candidato aceito antes
 *   deles (sem colisoes deterministicas);
 * - qualquer configuracao invalida falha com ModelRouterError
 *   (invalid_configuration) — fail-closed, nada e silenciosamente ignorado.
 */
export function buildFreeCapacityCandidates(input: {
  readonly defaultCandidate: RouterCandidate;
  readonly knownCandidates?: readonly RouterCandidate[];
  readonly rawExtraCandidates?: string | null;
  readonly policy?: FreeCapacityRoutingPolicy;
}): FreeCapacityRegistryResult {
  const policy = input.policy ?? DEFAULT_FREE_CAPACITY_POLICY;
  const seenIds = new Set<string>();
  const defaultCandidate = validateDefaultFreeCandidate(
    input.defaultCandidate,
    policy,
  );
  seenIds.add(defaultCandidate.id);

  // 1) Candidatos conhecidos (catalogo): preview sem opt-in e filtrado.
  const knownAccepted: RouterCandidate[] = [];
  const previewBlockedIds: string[] = [];
  for (const known of input.knownCandidates ?? []) {
    const validated = validateKnownFreeCandidate(known, seenIds);
    if (
      validated.lifecycle === "preview" &&
      !policy.allowPreviewModels
    ) {
      previewBlockedIds.push(validated.id);
      continue;
    }
    knownAccepted.push(validated);
  }

  const chainSoFar = [defaultCandidate, ...knownAccepted];
  // Prioridade dos extras: imediatamente depois do ultimo candidato aceito
  // antes deles (default e 1; conhecidos comecam em 2). Sem colisoes.
  const extraPriorityOffset =
    chainSoFar.reduce((max, candidate) => Math.max(max, candidate.priority), 1) +
    1;

  // 2) Extras via env JSON (a partir do Pacote 16.5).
  const raw = input.rawExtraCandidates;
  let extras: readonly RouterCandidate[] = Object.freeze([]);
  if (raw !== undefined && raw !== null && raw.trim() !== "") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      invalidFreeCapacityConfig(
        `${FREE_EXTRA_CANDIDATES_ENV} nao e um JSON valido.`,
      );
    }
    if (!Array.isArray(parsed)) {
      invalidFreeCapacityConfig(
        `${FREE_EXTRA_CANDIDATES_ENV} deve ser um array JSON.`,
      );
    }
    if (parsed.length > MAX_EXTRA_CANDIDATES) {
      invalidFreeCapacityConfig(
        `${FREE_EXTRA_CANDIDATES_ENV} aceita no maximo ${MAX_EXTRA_CANDIDATES} candidatos.`,
      );
    }

    const acceptedExtras: RouterCandidate[] = [];
    for (let index = 0; index < parsed.length; index += 1) {
      const candidate = buildExtraFreeCandidate(
        parsed[index] as RawExtraCandidate,
        index,
        seenIds,
        extraPriorityOffset,
      );
      if (candidate.lifecycle === "preview" && !policy.allowPreviewModels) {
        previewBlockedIds.push(candidate.id);
        continue;
      }
      acceptedExtras.push(candidate);
    }
    extras = Object.freeze(acceptedExtras);
  }

  const candidates = Object.freeze([...chainSoFar, ...extras]);

  return Object.freeze({
    candidates,
    chainCandidateIds: Object.freeze(candidates.map((candidate) => candidate.id)),
    extraCandidateIds: Object.freeze(extras.map((candidate) => candidate.id)),
    previewBlockedIds: Object.freeze(previewBlockedIds),
    policy: Object.freeze({ ...policy }),
  });
}

/**
 * Composition root: le a env e monta a cadeia free a partir do candidato
 * padrao ja auditado. Unico ponto deste modulo que toca process.env.
 */
export function resolveFreeCapacityCandidates(input: {
  readonly defaultCandidate: RouterCandidate;
  readonly knownCandidates?: readonly RouterCandidate[];
  readonly policy?: FreeCapacityRoutingPolicy;
}): FreeCapacityRegistryResult {
  return buildFreeCapacityCandidates({
    defaultCandidate: input.defaultCandidate,
    knownCandidates: input.knownCandidates,
    policy:
      input.policy ??
      {
        ...resolveFreeCapacityRoutingPolicy(),
      },
    rawExtraCandidates: process.env[FREE_EXTRA_CANDIDATES_ENV] ?? null,
  });
}