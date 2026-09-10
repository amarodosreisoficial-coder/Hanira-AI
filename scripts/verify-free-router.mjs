// Pacote 16.6 — verify:free-router
//
// Valida los invariantes del FREE CAPACITY ENGINE (Groq Multi-Free) SIN
// llamadas de red, SIN instanciar providers y SIN imprimir secretos.
//
// Uso: npm run verify:free-router
//
// Verifica (fuente de verdad: lib/ai/capacity/groq-free-candidates.ts y
// lib/ai/capacity/free-capacity-registry.ts — si cambian, actualizar aqui es
// parte del cambio correspondiente):
// - configuracion de candidatos parsea (env booleanas fail-closed);
// - existe al menos un candidato free DE PRODUCAO elegible (baseline);
// - candidatos paid/promotional/unknown bloqueados (costClass "free" por
//   construccion + costClass NUNCA configurable por env);
// - preview DESACTIVADO por defecto (opt-in explicito obligatorio);
// - modelos aposentados (deprecated) bloqueados en cualquier posicion;
// - provider allow-list valida (hoy: solo "groq");
// - prioridad deterministica (sin colision de engines, sin duplicados);
// - sin fallback a paid (claves de env pago/billing prohibidas);
// - perfil nira-cloud-free consistente (ids de la cadena en el escopo).
//
// NO toca la red, NO instancia providers, NO accede a Supabase y NO imprime
// valores de entorno: solo claves/ids logicos y OK/X.

import process from "node:process";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { parseEnvFile } from "./doctor.mjs";

// Fuente de verdad (espejo): lib/ai/capacity/groq-free-candidates.ts
const GROQ_FREE_SECONDARY_CANDIDATE_ID = "nira-cloud-free-secondary-1";
const GROQ_FREE_SECONDARY_MODEL = "openai/gpt-oss-120b";
const GROQ_PRIMARY_DEFAULT_MODEL = "openai/gpt-oss-20b";
const DEPRECATED_GROQ_MODELS = Object.freeze([
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "qwen/qwen3-32b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
]);
const PREVIEW_GROQ_MODELS = Object.freeze([
  "qwen/qwen3.6-27b",
  "qwen/qwen3.8-27b",
]);
const ALLOWED_FREE_PROVIDERS = Object.freeze(["groq"]);

// Fuente de verdad (espejo): lib/ai/capacity/free-capacity-registry.ts
const FREE_CANDIDATES_ENV = "HANIRA_FREE_TEXT_CANDIDATES";
const PREVIEW_MODELS_ENV = "HANIRA_ALLOW_PREVIEW_MODELS";
const SECONDARY_ENABLED_ENV = "HANIRA_FREE_SECONDARY_ENABLED";
const RESERVED_CANDIDATE_ID = "nira-cloud-free-default";
const CANDIDATE_ID_PREFIX = "nira-cloud-free-";
const MAX_EXTRA_CANDIDATES = 8;

// Fuente de verdad (espejo): scripts/verify-capacity.mjs
const DISALLOWED_ENV_PATTERNS = [
  /PAID_FALLBACK/i,
  /PAID_PROVIDER/i,
  /ENABLE_BILLING/i,
  /STRIPE_/i,
  /ENABLE_PAYMENT/i,
];

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isDeprecatedModel(model) {
  return DEPRECATED_GROQ_MODELS.includes(String(model).trim());
}

function isPreviewModel(model) {
  return PREVIEW_GROQ_MODELS.includes(String(model).trim());
}

function checkBooleanEnv(checks, { name, raw, fallback, defaultDescription }) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    checks.push({ level: "ok", message: `${name} ausente: ${defaultDescription} (default ${fallback}).` });
    return fallback;
  }
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "true" || normalized === "false") {
    checks.push({ level: "ok", message: `${name} es booleano valido (${normalized}).` });
    return normalized === "true";
  }
  checks.push({ level: "error", message: `${name} debe ser "true" o "false" (fail-closed).` });
  return fallback;
}

function checkPreviewPolicy(checks, { name, allowPreviewModels }) {
  if (!allowPreviewModels) {
    checks.push({
      level: "ok",
      message: "Preview bloqueado por defecto: modelos Free Plan Preview (ex.: qwen/qwen3.6-27b, qwen/qwen3.8-27b) NO son elegibles sin opt-in explicito.",
    });
  } else {
    checks.push({
      level: "warning",
      message: `Preview ACTIVADO (${name}=true): modelos Free Plan Preview declarados con lifecycle "preview" se vuelven elegibles (nunca default de produccion).`,
    });
  }
}

function checkPrimaryModel(checks, { model, allowPreviewModels }) {
  const primary = isNonEmptyString(model) ? model.trim() : GROQ_PRIMARY_DEFAULT_MODEL;
  if (isDeprecatedModel(primary)) {
    checks.push({
      level: "error",
      message: `GROQ_MODEL "${primary}" fue aposentado por el provider y esta BLOQUEADO (fail-closed).`,
    });
    return;
  }
  if (isPreviewModel(primary) && !allowPreviewModels) {
    checks.push({
      level: "error",
      message: `GROQ_MODEL "${primary}" es un Free Plan Preview y exige opt-in explicito (${PREVIEW_MODELS_ENV}=true; fail-closed).`,
    });
    return;
  }
  const tag = isNonEmptyString(model) ? primary : `${primary} (default tecnico)`;
  checks.push({ level: "ok", message: `Primario free elegible: ${tag}.` });
}

function checkSecondary(checks, { primaryModel, secondaryEnabled }) {
  if (!secondaryEnabled) {
    checks.push({
      level: "ok",
      message: `Candidato secundario de producao desligado por env (${SECONDARY_ENABLED_ENV}=false).`,
    });
    return;
  }
  if (String(primaryModel ?? "").trim() === GROQ_FREE_SECONDARY_MODEL) {
    checks.push({
      level: "ok",
      message: `Secundario omitido: el primario ya es ${GROQ_FREE_SECONDARY_MODEL} (mismo engine; sin colision de prioridad).`,
    });
    return;
  }
  checks.push({
    level: "ok",
    message: `Secundario free DE PRODUCAO activo: ${GROQ_FREE_SECONDARY_MODEL} (${GROQ_FREE_SECONDARY_CANDIDATE_ID}, prioridad 2).`,
  });
}

function checkChain(checks, { primaryModel, secondaryEnabled }) {
  const primary = isNonEmptyString(primaryModel) ? primaryModel.trim() : GROQ_PRIMARY_DEFAULT_MODEL;
  const models = [primary];
  if (secondaryEnabled && primary !== GROQ_FREE_SECONDARY_MODEL) {
    models.push(GROQ_FREE_SECONDARY_MODEL);
  }
  const unique = new Set(models);
  if (unique.size !== models.length) {
    checks.push({ level: "error", message: `Cadena con engines duplicados (${models.join(", ")}): prioridad NO deterministica.` });
    return;
  }
  checks.push({
    level: models.length > 0 ? "ok" : "error",
    message:
      models.length > 0
        ? `Existe al menos un candidato free DE PRODUCAO elegible (${models.length} en la cadena default; prioridad deterministica por (priority, id)).`
        : "Ningun candidato free DE PRODUCAO elegible en la cadena default.",
  });
}

function checkDeprecatedGuard(checks, values) {
  const offending = [];
  const primary = values.GROQ_MODEL;
  if (isNonEmptyString(primary) && isDeprecatedModel(primary)) {
    offending.push(`GROQ_MODEL=${primary}`);
  }
  checks.push({
    level: offending.length === 0 ? "ok" : "error",
    message:
      offending.length === 0
        ? "Guard de modelos aposentados intacto: ninguna posicion de la cadena usa modelo deprecated."
        : `Modelos aposentados configurados (fail-closed en runtime): ${offending.join(", ")}.`,
  });
}

function checkExtraLifecycle(checks, { raw, allowPreviewModels, secondaryEnabled }) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    checks.push({ level: "ok", message: `${FREE_CANDIDATES_ENV} ausente: cadena default suficiente (sin JSON obligatorio).` });
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    checks.push({ level: "error", message: `${FREE_CANDIDATES_ENV} no es un JSON valido (fail-closed en runtime).` });
    return;
  }
  if (!Array.isArray(parsed)) {
    checks.push({ level: "error", message: `${FREE_CANDIDATES_ENV} debe ser un array JSON.` });
    return;
  }
  if (parsed.length > MAX_EXTRA_CANDIDATES) {
    checks.push({ level: "error", message: `${FREE_CANDIDATES_ENV} acepta como maximo ${MAX_EXTRA_CANDIDATES} candidatos.` });
  }

  const seenIds = new Set();
  const secondaryId = secondaryEnabled ? GROQ_FREE_SECONDARY_CANDIDATE_ID : null;
  let blockedPreviews = 0;

  for (const [index, entry] of parsed.entries()) {
    const tag = `candidato extra #${index + 1}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      checks.push({ level: "error", message: `${tag}: no es un objeto valido.` });
      continue;
    }
    const id = entry.id;
    if (!isNonEmptyString(id)) {
      checks.push({ level: "error", message: `${tag}: exige un id no vacio.` });
    } else {
      if (seenIds.has(id)) {
        checks.push({ level: "error", message: `${tag}: id duplicado "${id}".` });
      } else {
        seenIds.add(id);
      }
      if (id === RESERVED_CANDIDATE_ID) {
        checks.push({ level: "error", message: `${tag}: id reservado "${RESERVED_CANDIDATE_ID}" no puede usarse.` });
      }
      if (secondaryId !== null && id === secondaryId) {
        checks.push({ level: "error", message: `${tag}: id "${secondaryId}" colisiona con el secundario de producao activo (fail-closed en runtime).` });
      }
      if (!String(id).startsWith(CANDIDATE_ID_PREFIX)) {
        checks.push({ level: "error", message: `${tag}: id "${id}" debe usar el prefijo "${CANDIDATE_ID_PREFIX}" (escopo del perfil).` });
      }
    }
    const model = entry.model;
    if (!isNonEmptyString(model)) {
      checks.push({ level: "error", message: `${tag}: exige un model no vacio.` });
    } else if (isDeprecatedModel(model)) {
      checks.push({ level: "error", message: `${tag}: modelo aposentado "${model}" BLOQUEADO (fail-closed en runtime).` });
    }
    const provider = entry.provider === undefined || entry.provider === null ? ALLOWED_FREE_PROVIDERS[0] : entry.provider;
    if (!ALLOWED_FREE_PROVIDERS.includes(provider)) {
      checks.push({
        level: "error",
        message: `${tag}: provider "${String(provider)}" no esta auditado para la cadena free. Providers permitidos: ${ALLOWED_FREE_PROVIDERS.join(", ")}.`,
      });
    }
    const lifecycle = entry.lifecycle === undefined || entry.lifecycle === null ? "production" : entry.lifecycle;
    if (lifecycle !== "production" && lifecycle !== "preview") {
      checks.push({
        level: "error",
        message: `${tag}: lifecycle "${String(lifecycle)}" invalido (aceitos: "production", "preview").`,
      });
    }
    if (lifecycle === "preview" && !allowPreviewModels) {
      blockedPreviews += 1;
      checks.push({
        level: "warning",
        message: `${tag}: preview declarado SIN opt-in sera FILTRADO (inelegible; nunca activado en silencio).`,
      });
    }
    if (entry.enabled !== undefined && entry.enabled !== null && typeof entry.enabled !== "boolean") {
      checks.push({ level: "error", message: `${tag}: enabled debe ser booleano.` });
    }
    if (entry.label !== undefined && entry.label !== null && typeof entry.label !== "string") {
      checks.push({ level: "error", message: `${tag}: label debe ser texto.` });
    }
  }

  checks.push({
    level: "ok",
    message: `${FREE_CANDIDATES_ENV} evaluado (${parsed.length} candidato(s)); costClass siempre "free" por construccion (NUNCA configurable).`,
  });
  if (blockedPreviews === 0) {
    checks.push({ level: "ok", message: "Sin previews bloqueados silenciosos: preview desactivado por defecto esta representado." });
  }
}

function checkProfileConsistency(checks, values, secondaryEnabled) {
  const ids = [RESERVED_CANDIDATE_ID];
  const primaryModel = values.GROQ_MODEL;
  if (secondaryEnabled && String(primaryModel ?? "").trim() !== GROQ_FREE_SECONDARY_MODEL) {
    ids.push(GROQ_FREE_SECONDARY_CANDIDATE_ID);
  }
  const raw = values[FREE_CANDIDATES_ENV];
  if (isNonEmptyString(raw)) {
    try {
      const parsed = JSON.parse(String(raw));
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (entry && typeof entry === "object" && isNonEmptyString(entry.id)) ids.push(entry.id);
        }
      }
    } catch {
      // Errores de JSON ya reportados.
    }
  }
  const outside = ids.filter((id) => !String(id).startsWith(CANDIDATE_ID_PREFIX));
  checks.push({
    level: outside.length === 0 ? "ok" : "error",
    message:
      outside.length === 0
        ? "Perfil nira-cloud-free consistente: toda la cadena free dentro del escopo del perfil."
        : `Perfil nira-cloud-free con ids fuera del escopo: ${outside.join(", ")}.`,
  });
}

function checkZeroCostInvariant(checks, values) {
  const offending = Object.keys(values).filter((key) => DISALLOWED_ENV_PATTERNS.some((pattern) => pattern.test(key)));
  checks.push({
    level: offending.length === 0 ? "ok" : "error",
    message:
      offending.length === 0
        ? "Fallback free -> PAID imposible: costClass \"free\" por construccion + sin claves pago/billing."
        : `Zero-Cost Guard comprometido: claves que sugieren fallback pago/billing: ${offending.join(", ")}.`,
  });
}

export function validateFreeRouterConfig(input) {
  const values = input?.values ?? {};
  const checks = [{ level: "ok", message: "verify:free-router — validacion SIN red, SIN providers y SIN salida de secretos." }];

  const allowPreviewModels = checkBooleanEnv(checks, {
    name: PREVIEW_MODELS_ENV,
    raw: values[PREVIEW_MODELS_ENV],
    fallback: false,
    defaultDescription: "preview DESACTIVADO",
  });
  const secondaryEnabled = checkBooleanEnv(checks, {
    name: SECONDARY_ENABLED_ENV,
    raw: values[SECONDARY_ENABLED_ENV],
    fallback: true,
    defaultDescription: "candidato secundario free DE PRODUCAO ACTIVO",
  });

  checkPreviewPolicy(checks, { name: PREVIEW_MODELS_ENV, allowPreviewModels });
  checkPrimaryModel(checks, { model: values.GROQ_MODEL, allowPreviewModels });
  checkSecondary(checks, { primaryModel: values.GROQ_MODEL, secondaryEnabled });
  checkChain(checks, { primaryModel: values.GROQ_MODEL, secondaryEnabled });
  checkDeprecatedGuard(checks, values);
  checkExtraLifecycle(checks, { raw: values[FREE_CANDIDATES_ENV], allowPreviewModels, secondaryEnabled });
  checkProfileConsistency(checks, values, secondaryEnabled);
  checkZeroCostInvariant(checks, values);

  return { checks, hasErrors: checks.some((check) => check.level === "error") };
}

export function runVerifyFreeRouter(cwd = process.cwd()) {
  const envPath = path.join(cwd, ".env.local");
  const exists = fs.existsSync(envPath);
  const fileValues = exists ? parseEnvFile(fs.readFileSync(envPath, "utf8")) : {};
  const result = validateFreeRouterConfig({ values: { ...process.env, ...fileValues } });

  console.log("\nHanira verify:free-router\n");
  for (const check of result.checks) {
    const symbol = check.level === "ok" ? "OK" : check.level === "warning" ? "!" : "X";
    console.log(`${symbol} ${check.message}`);
  }
  console.log(result.hasErrors ? "\nverify:free-router concluido com erros.\n" : "\nverify:free-router concluido sem erros.\n");
  return result.hasErrors ? 1 : 0;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exitCode = runVerifyFreeRouter();
