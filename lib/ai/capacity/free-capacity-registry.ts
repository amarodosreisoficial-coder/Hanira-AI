import { ModelRouterError } from "@/lib/ai/router/errors";
import { NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID } from "@/lib/ai/nira/profiles";
import type { RouterCandidate } from "@/lib/ai/router/types";

// Nira Free Capacity Registry (Pacote 16.5 - Fase 2 do roadmap, versao
// simples/fundacao).
//
// Registry declarativo da cadeia de capacidade FREE do perfil `nira-cloud-free`:
//
//   modelo free primario (auditado) -> fallback free -> secundario free
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
// - fail-closed: qualquer configuracao invalida falha com
//   ModelRouterError(invalid_configuration) — nada e silenciosamente ignorado;
// - pura: nao instancia providers, nao chama rede, nao acessa Supabase.
//   A leitura de env fica isolada em resolveFreeCapacityCandidates(), para que
//   o builder permaneca 100% puro e testavel.

export const FREE_EXTRA_CANDIDATES_ENV = "HANIRA_FREE_TEXT_CANDIDATES";

// Providers cloud elegiveis para a cadeia free. Hoje: somente o provider
// auditado. A expansao exige auditoria e mudanca explicita desta lista.
const ALLOWED_FREE_PROVIDERS: readonly string[] = Object.freeze(["groq"]);

// Limite defensivo de candidatos free configurados (evita configuracoes
// descontroladas; a capacidade real de modelos free e pequena).
const MAX_EXTRA_CANDIDATES = 8;

export interface FreeCapacityRegistryResult {
  // Candidatos completos (default + extras), prontos para o registry do router.
  readonly candidates: readonly RouterCandidate[];
  // Ids logicos dos candidatos EXTRA (sem o default), em ordem de prioridade.
  // Usados para estender o escopo do perfil nira-cloud-free.
  readonly extraCandidateIds: readonly string[];
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
  return candidate;
}

interface RawExtraCandidate {
  readonly id?: unknown;
  readonly model?: unknown;
  readonly provider?: unknown;
  readonly enabled?: unknown;
  readonly label?: unknown;
}

function buildExtraFreeCandidate(
  raw: RawExtraCandidate,
  index: number,
  seenIds: Set<string>,
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
  // Prioridade: default e 1; extras entram na ordem declarada (2, 3, ...).
  return Object.freeze({
    id,
    provider,
    model,
    capabilities: Object.freeze(["text" as const]),
    priority: index + 2,
    enabled,
    deployment: "cloud" as const,
    costClass: "free" as const,
    ...(typeof label === "string" ? { label } : {}),
  });
}

/**
 * Builder PURO da cadeia de capacidade free: candidato padrao auditado +
 * candidatos extra declarados via JSON (rawExtraCandidates).
 */
export function buildFreeCapacityCandidates(input: {
  readonly defaultCandidate: RouterCandidate;
  readonly rawExtraCandidates?: string | null;
}): FreeCapacityRegistryResult {
  const defaultCandidate = validateDefaultFreeCandidate(input.defaultCandidate);

  const raw = input.rawExtraCandidates;
  if (raw === undefined || raw === null || raw.trim() === "") {
    return Object.freeze({
      candidates: Object.freeze([defaultCandidate]),
      extraCandidateIds: Object.freeze([]),
    });
  }

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

  const seenIds = new Set<string>();
  const extras = Object.freeze(
    parsed.map((entry, index) =>
      buildExtraFreeCandidate(entry as RawExtraCandidate, index, seenIds),
    ),
  );

  return Object.freeze({
    candidates: Object.freeze([defaultCandidate, ...extras]),
    extraCandidateIds: Object.freeze(extras.map((candidate) => candidate.id)),
  });
}

/**
 * Composition root: le a env e monta a cadeia free a partir do candidato
 * padrao ja auditado. Unico ponto deste modulo que toca process.env.
 */
export function resolveFreeCapacityCandidates(input: {
  readonly defaultCandidate: RouterCandidate;
}): FreeCapacityRegistryResult {
  return buildFreeCapacityCandidates({
    defaultCandidate: input.defaultCandidate,
    rawExtraCandidates: process.env[FREE_EXTRA_CANDIDATES_ENV] ?? null,
  });
}