// Pacote 16.5 — verify:capacity
//
// Valida la configuracion de CAPACIDAD de la Hanira SIN llamadas de red y SIN
// imprimir secretos. Complementa a verify:release orquestando solamente los
// checks de invariantes de capacidad / Zero-Cost.
//
// Uso: npm run verify:capacity
//
// NO toca la red, NO instancia providers, NO accede a Supabase y NO imprime
// valores de entorno: solo claves y PASS/FAIL.
//
// Limites internos (fuente de verdad): modulos TS listados en cada entrada.
// Si cambian, actualizar aqui es parte del cambio correspondiente (el script
// replica los mismos limites que los validadores de runtime).

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnvFile } from "./doctor.mjs";

const NUMERIC_LIMITS = [
  { key: "HANIRA_USER_DAILY_MESSAGE_LIMIT", min: 0, max: 100_000, fallback: 200, source: "lib/security/user-quota.ts" },
  { key: "HANIRA_CONCURRENCY_MAX_PER_USER", min: 0, max: 10, fallback: 1, source: "lib/security/concurrency-guard.ts" },
  { key: "HANIRA_CAPACITY_RATE_LIMIT_COOLDOWN_MS", min: 1_000, max: 600_000, fallback: 60_000, source: "lib/ai/capacity/capacity-state.ts" },
  { key: "HANIRA_CAPACITY_UNHEALTHY_COOLDOWN_MS", min: 1_000, max: 600_000, fallback: 30_000, source: "lib/ai/capacity/capacity-state.ts" },
];

const BOOLEAN_LIMITS = ["HANIRA_DEMO_MODE", "AI_ENGINE_OLLAMA_ENABLED"];
const FREE_CANDIDATES_ENV = "HANIRA_FREE_TEXT_CANDIDATES";
const ALLOWED_FREE_PROVIDERS = Object.freeze(["groq"]);
const MAX_EXTRA_CANDIDATES = 8;
const CONTEXT_LIMITS = Object.freeze({
  maxHistoryMessages: 20,
  maxHistoryChars: 24_000,
  maxMemories: 8,
  maxMemoryChars: 4_000,
});
const DISALLOWED_ENV_PATTERNS = [
  /PAID_FALLBACK/i,
  /PAID_PROVIDER/i,
  /ENABLE_BILLING/i,
  /STRIPE_/i,
  /ENABLE_PAYMENT/i,
];

function checkInteger(checks, { key, raw, min, max, fallback, source }) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    checks.push({ level: "ok", message: `${key} usa el predeterminado ${fallback} (${source})` });
    return;
  }
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    checks.push({ level: "error", message: `${key} debe ser un entero entre ${min} y ${max} (${source}).` });
    return;
  }
  const value = Number(text);
  if (value < min || value > max) {
    checks.push({ level: "error", message: `${key} debe estar entre ${min} y ${max} (0 desactiva).` });
    return;
  }
  checks.push({ level: "ok", message: `${key} es valido (${source}).` });
}

function checkBoolean(checks, { key, raw }) {
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (normalized === "true" || normalized === "false") {
    checks.push({ level: "ok", message: `${key} es booleano valido.` });
  } else {
    checks.push({ level: "error", message: `${key} debe ser true o false.` });
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function checkFreeCandidates(checks, rawValue) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
    checks.push({ level: "ok", message: `${FREE_CANDIDATES_ENV} ausente: solo el candidato free auditado.` });
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(String(rawValue));
  } catch {
    checks.push({ level: "error", message: `${FREE_CANDIDATES_ENV} no es un JSON valido.` });
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
  for (const [index, entry] of parsed.entries()) {
    const tag = `candidato extra #${index + 1}`;
    if (!entry || typeof entry !== "object") {
      checks.push({ level: "error", message: `${tag}: no es un objeto valido.` });
      continue;
    }
    if (!isNonEmptyString(entry.id)) {
      checks.push({ level: "error", message: `${tag}: exige un id no vacio.` });
    } else if (seenIds.has(entry.id)) {
      checks.push({ level: "error", message: `${tag}: id duplicado "${entry.id}".` });
    } else {
      seenIds.add(entry.id);
    }
    if (!isNonEmptyString(entry.model)) {
      checks.push({ level: "error", message: `${tag}: exige un model no vacio.` });
    }
    const provider = entry.provider === undefined || entry.provider === null ? ALLOWED_FREE_PROVIDERS[0] : entry.provider;
    if (!ALLOWED_FREE_PROVIDERS.includes(provider)) {
      checks.push({
        level: "error",
        message: `${tag}: provider "${String(provider)}" no esta auditado para la cadena free. Providers permitidos: ${ALLOWED_FREE_PROVIDERS.join(", ")}.`,
      });
    }
    if (entry.enabled !== undefined && entry.enabled !== null && typeof entry.enabled !== "boolean") {
      checks.push({ level: "error", message: `${tag}: enabled debe ser booleano.` });
    }
    if (entry.label !== undefined && entry.label !== null && typeof entry.label !== "string") {
      checks.push({ level: "error", message: `${tag}: label debe ser texto.` });
    }
  }
  checks.push({ level: "ok", message: `${FREE_CANDIDATES_ENV} evaluado (${parsed.length} candidato(s)); costClass siempre "free" por construccion.` });
}

function checkZeroCostInvariant(checks, values) {
  const offending = Object.keys(values).filter((key) => DISALLOWED_ENV_PATTERNS.some((pattern) => pattern.test(key)));
  if (offending.length === 0) {
    checks.push({ level: "ok", message: "Zero-Cost Guard intacto: sin configuracion de fallback pago / billing." });
  } else {
    checks.push({ level: "error", message: `Zero-Cost Guard comprometido: claves que sugieren fallback pago/billing: ${offending.join(", ")}.` });
  }
}

function checkContextConfigValid(checks) {
  const l = CONTEXT_LIMITS;
  const positive =
    Number.isInteger(l.maxHistoryMessages) && l.maxHistoryMessages > 0 &&
    Number.isInteger(l.maxHistoryChars) && l.maxHistoryChars > 0 &&
    Number.isInteger(l.maxMemories) && l.maxMemories > 0 &&
    Number.isInteger(l.maxMemoryChars) && l.maxMemoryChars > 0;
  checks.push({
    level: positive ? "ok" : "error",
    message: positive
      ? `Context Guard valido: historico <= ${l.maxHistoryMessages} msgs / ${l.maxHistoryChars} chars, memorias <= ${l.maxMemories} / ${l.maxMemoryChars} chars.`
      : "Context Guard invalido: los limites de contexto deben ser enteros positivos.",
  });
}

function checkCloudFreeProfile(checks, values) {
  const rawValue = values[FREE_CANDIDATES_ENV];
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
    checks.push({ level: "ok", message: "Perfil nira-cloud-free valido: solo el candidato primario auditado (groq)." });
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(String(rawValue));
  } catch {
    return;
  }
  if (!Array.isArray(parsed)) return;
  const badProviders = parsed
    .filter((entry) => entry && typeof entry === "object" && !ALLOWED_FREE_PROVIDERS.includes(entry.provider))
    .map((entry) => entry.id);
  checks.push({
    level: badProviders.length === 0 ? "ok" : "error",
    message: badProviders.length === 0
      ? "Perfil nira-cloud-free valido: providers de la cadena free auditados."
      : `Perfil nira-cloud-free con providers no auditados: ${badProviders.join(", ")}.`,
  });
}

export function validateCapacityConfig(input) {
  const values = input?.values ?? {};
  const checks = [{ level: "ok", message: "verify:capacity — validacion SIN red y SIN salida de secretos." }];

  for (const limit of NUMERIC_LIMITS) {
    checkInteger(checks, { ...limit, raw: values[limit.key] });
  }
  for (const key of BOOLEAN_LIMITS) {
    if (values[key] === undefined || values[key] === null || String(values[key]).trim() === "") {
      checks.push({ level: "ok", message: `${key} usa su predeterminado (ausente).` });
    } else {
      checkBoolean(checks, { key, raw: values[key] });
    }
  }

  checkFreeCandidates(checks, values[FREE_CANDIDATES_ENV]);
  checkContextConfigValid(checks);
  checkCloudFreeProfile(checks, values);
  checkZeroCostInvariant(checks, values);

  return { checks, hasErrors: checks.some((check) => check.level === "error") };
}

export function runVerifyCapacity(cwd = process.cwd()) {
  const envPath = path.join(cwd, ".env.local");
  const exists = fs.existsSync(envPath);
  const fileValues = exists ? parseEnvFile(fs.readFileSync(envPath, "utf8")) : {};
  const result = validateCapacityConfig({ values: { ...process.env, ...fileValues } });

  console.log("\nHanira verify:capacity\n");
  for (const check of result.checks) {
    const symbol = check.level === "ok" ? "OK" : check.level === "warning" ? "!" : "X";
    console.log(`${symbol} ${check.message}`);
  }
  console.log(result.hasErrors ? "\nverify:capacity concluido con errores.\n" : "\nverify:capacity concluido sin errores.\n");
  return result.hasErrors ? 1 : 0;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exitCode = runVerifyCapacity();