import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_REAL = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_VISION_MODEL",
  "OPENAI_TRANSCRIPTION_MODEL",
  "OPENAI_TTS_MODEL",
  "OPENAI_TTS_VOICE",
  "NEXT_PUBLIC_MAX_IMAGE_SIZE_MB",
  "NEXT_PUBLIC_MAX_AUDIO_SIZE_MB",
  "NEXT_PUBLIC_VOICE_ENABLED",
  "NEXT_PUBLIC_VISION_ENABLED",
];

export function parseEnvFile(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function validUrl(value, { supabase = false } = {}) {
  try {
    const url = new URL(value);
    const validProtocol = url.protocol === "https:" || url.hostname === "localhost" ||
      url.hostname === "127.0.0.1";
    return (
      validProtocol &&
      (!supabase ||
        url.hostname.endsWith(".supabase.co") ||
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

function jwtLike(value) {
  return value.split(".").length === 3 && value.length >= 80;
}

export function analyzeEnvironment(values, { envFileExists = true } = {}) {
  const checks = [];
  const add = (level, message) => checks.push({ level, message });

  add(
    envFileExists ? "ok" : "error",
    envFileExists
      ? "Arquivo .env.local encontrado"
      : "Arquivo .env.local não foi encontrado",
  );

  const demoValue = values.HANIRA_DEMO_MODE;
  const validDemo = demoValue === "true" || demoValue === "false";
  add(
    validDemo ? "ok" : "error",
    validDemo
      ? "HANIRA_DEMO_MODE possui valor válido"
      : "HANIRA_DEMO_MODE deve ser true ou false",
  );
  const demo = demoValue === "true";
  if (validDemo && demo) add("warning", "HANIRA_DEMO_MODE está ativado");

  add(
    validUrl(values.NEXT_PUBLIC_APP_URL ?? "")
      ? "ok"
      : "error",
    validUrl(values.NEXT_PUBLIC_APP_URL ?? "")
      ? "NEXT_PUBLIC_APP_URL é válida"
      : "NEXT_PUBLIC_APP_URL está ausente ou inválida",
  );

  add(
    Boolean(values.NEXT_PUBLIC_APP_VERSION?.trim()) ? "ok" : "error",
    values.NEXT_PUBLIC_APP_VERSION?.trim()
      ? "Versão da aplicação definida"
      : "NEXT_PUBLIC_APP_VERSION não foi definida",
  );

  for (const name of [
    "NEXT_PUBLIC_MAX_IMAGE_SIZE_MB",
    "NEXT_PUBLIC_MAX_AUDIO_SIZE_MB",
  ]) {
    const size = Number(values[name]);
    add(
      Number.isFinite(size) && size > 0 && size <= 100 ? "ok" : "error",
      Number.isFinite(size) && size > 0 && size <= 100
        ? `${name} possui limite válido`
        : `${name} deve ser um número entre 0 e 100`,
    );
  }

  for (const name of [
    "NEXT_PUBLIC_VOICE_ENABLED",
    "NEXT_PUBLIC_VISION_ENABLED",
  ]) {
    const valid = values[name] === "true" || values[name] === "false";
    add(
      valid ? "ok" : "error",
      valid ? `${name} possui valor válido` : `${name} deve ser true ou false`,
    );
  }

  const supabaseValues = [
    values.NEXT_PUBLIC_SUPABASE_URL,
    values.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    values.SUPABASE_SERVICE_ROLE_KEY,
  ];
  const supabaseCount = supabaseValues.filter(Boolean).length;
  if (supabaseCount === 0 && demo) {
    add("warning", "Supabase não configurado (permitido no modo demonstração)");
  } else if (supabaseCount !== supabaseValues.length) {
    add("error", "Configuração do Supabase está incompleta");
  } else {
    const urlOk = validUrl(values.NEXT_PUBLIC_SUPABASE_URL, { supabase: true });
    const anon = values.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const service = values.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const anonOk = jwtLike(anon) || anon.startsWith("sb_publishable_");
    const serviceOk = jwtLike(service) || service.startsWith("sb_secret_");
    add(urlOk && anonOk && serviceOk ? "ok" : "error",
      urlOk && anonOk && serviceOk
        ? "Supabase configurado com formato plausível"
        : "URL ou chaves do Supabase possuem formato inesperado");
  }

  const openAIKey = values.OPENAI_API_KEY ?? "";
  const openAIModel = values.OPENAI_MODEL?.trim() ?? "";
  const mediaModels = [
    ["OPENAI_VISION_MODEL", values.OPENAI_VISION_MODEL?.trim()],
    ["OPENAI_TRANSCRIPTION_MODEL", values.OPENAI_TRANSCRIPTION_MODEL?.trim()],
    ["OPENAI_TTS_MODEL", values.OPENAI_TTS_MODEL?.trim()],
    ["OPENAI_TTS_VOICE", values.OPENAI_TTS_VOICE?.trim()],
  ];
  if (
    !openAIKey &&
    !openAIModel &&
    mediaModels.every(([, value]) => !value) &&
    demo
  ) {
    add("warning", "OpenAI não configurada (permitido no modo demonstração)");
  } else {
    add(
      openAIKey.startsWith("sk-") && openAIKey.length >= 20 ? "ok" : "error",
      openAIKey.startsWith("sk-") && openAIKey.length >= 20
        ? "Chave da OpenAI possui formato plausível"
        : "OPENAI_API_KEY está ausente ou possui formato inesperado",
    );
    add(
      Boolean(openAIModel) ? "ok" : "error",
      openAIModel
        ? "OPENAI_MODEL foi definido"
        : "OPENAI_MODEL não foi definido",
    );
    for (const [name, value] of mediaModels) {
      add(
        Boolean(value) ? "ok" : demo ? "warning" : "error",
        value
          ? `${name} foi definido`
          : demo
            ? `${name} não foi definido (permitido no modo demonstração)`
            : `${name} não foi definido`,
      );
    }
  }

  const leakedPrivate = Object.keys(values).filter(
    (key) =>
      key.startsWith("NEXT_PUBLIC_") &&
      /(SERVICE_ROLE|OPENAI_API_KEY|SECRET|PRIVATE_KEY)/i.test(key),
  );
  add(
    leakedPrivate.length === 0 ? "ok" : "error",
    leakedPrivate.length === 0
      ? "Nenhum segredo conhecido usa prefixo NEXT_PUBLIC_"
      : "Uma variável privada está usando prefixo NEXT_PUBLIC_",
  );

  if (!demo) {
    const missing = REQUIRED_REAL.filter((key) => !values[key]?.trim());
    if (missing.length) {
      add("error", "Modo real exige todas as credenciais obrigatórias");
    } else {
      add("ok", "Modo real possui todas as variáveis obrigatórias");
    }
  } else if (
    supabaseCount === 3 ||
    openAIKey ||
    openAIModel ||
    mediaModels.some(([, value]) => value)
  ) {
    add(
      "warning",
      "Há credenciais preenchidas, mas o modo demonstração continua ativo",
    );
  }

  return {
    checks,
    hasErrors: checks.some((check) => check.level === "error"),
    mode: demo ? "demo" : "production",
  };
}

export function runDoctor(cwd = process.cwd()) {
  const envPath = path.join(cwd, ".env.local");
  const exists = fs.existsSync(envPath);
  const fileValues = exists ? parseEnvFile(fs.readFileSync(envPath, "utf8")) : {};
  const result = analyzeEnvironment(
    { ...process.env, ...fileValues },
    { envFileExists: exists },
  );

  console.log("\nHanira Doctor\n");
  for (const check of result.checks) {
    const symbol =
      check.level === "ok" ? "✓" : check.level === "warning" ? "⚠" : "✗";
    console.log(`${symbol} ${check.message}`);
  }
  console.log(
    result.hasErrors
      ? "\nDiagnóstico concluído com erros.\n"
      : "\nDiagnóstico concluído sem erros bloqueantes.\n",
  );
  return result.hasErrors ? 1 : 0;
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exitCode = runDoctor();
