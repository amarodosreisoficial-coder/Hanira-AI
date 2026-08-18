import type { AIChatRequest } from "@/lib/ai/types";
import type { ToolResult } from "@/lib/tools/types";
import type { WeatherCurrentResult } from "@/lib/tools/weather-current";
import type { TimeCurrentResult } from "@/lib/tools/time-current";

export type GroundedLanguage = "pt-BR" | "en";

export interface GroundedFact {
  name: string;
  value: string | number | boolean;
  unit?: string;
}

export type GroundedCategoryKind = "weatherCondition" | "precipitationState" | "dayPeriod";
export interface GroundedCategory { kind: GroundedCategoryKind; allowed: string; }

export interface GroundedToolContext {
  tool: string;
  source: string;
  language: GroundedLanguage;
  facts: GroundedFact[];
  categories?: GroundedCategory[];
}

function optionalFact(
  facts: GroundedFact[],
  name: string,
  value: string | number | boolean | undefined,
  unit?: string,
) {
  if (value !== undefined) facts.push({ name, value, ...(unit ? { unit } : {}) });
}

export function createWeatherGroundedContext(
  result: ToolResult<WeatherCurrentResult>,
  language: GroundedLanguage,
): GroundedToolContext {
  if (!result.ok || !result.data) {
    throw new Error("Grounded context requires a successful tool result.");
  }

  const data = result.data;
  const facts: GroundedFact[] = [];
  optionalFact(facts, "location", data.location);
  optionalFact(facts, "region", data.region);
  optionalFact(facts, "country", data.country);
  optionalFact(facts, "observedAt", data.observedAt);
  optionalFact(facts, "temperature", data.temperatureC, "C");
  optionalFact(facts, "apparentTemperature", data.apparentTemperatureC, "C");
  optionalFact(facts, "humidity", data.humidityPercent, "%");
  optionalFact(facts, "precipitation", data.precipitationMm, "mm");
  optionalFact(facts, "rain", data.rainMm, "mm");
  optionalFact(facts, "showers", data.showersMm, "mm");
  optionalFact(facts, "condition", data.condition);
  optionalFact(facts, "cloudCover", data.cloudCoverPercent, "%");
  optionalFact(facts, "windSpeed", data.windSpeedKmh, "km/h");
  optionalFact(facts, "windDirection", data.windDirectionDegrees, "degrees");
  optionalFact(facts, "windGust", data.windGustKmh, "km/h");
  optionalFact(facts, "isDay", data.isDay);

  const precipitation = Math.max(data.precipitationMm ?? 0, data.rainMm ?? 0, data.showersMm ?? 0);
  return { tool: result.tool, source: result.source, language, facts, categories: [
    { kind: "weatherCondition", allowed: classifyWeatherCondition(data.condition) },
    { kind: "precipitationState", allowed: precipitation > 0 ? "present" : "absent" },
    ...(data.isDay === undefined ? [] : [{ kind: "dayPeriod" as const, allowed: data.isDay ? "day" : "night" }]),
  ] };
}

export function createTimeGroundedContext(result: ToolResult<TimeCurrentResult>, language: GroundedLanguage): GroundedToolContext {
  if (!result.ok || !result.data) throw new Error("Grounded context requires a successful tool result.");
  const data = result.data; const facts: GroundedFact[] = [];
  optionalFact(facts, "location", data.location); optionalFact(facts, "region", data.region);
  optionalFact(facts, "country", data.country); optionalFact(facts, "timezone", data.timezone);
  optionalFact(facts, "currentDate", data.currentDate); optionalFact(facts, "currentTime", data.currentTime);
  optionalFact(facts, "utcOffset", data.utcOffset);
  return { tool: result.tool, source: result.source, language, facts };
}

export function buildGroundedSynthesisRequest(options: {
  context: GroundedToolContext;
  model?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}): AIChatRequest {
  const languageInstruction = options.context.language === "pt-BR"
    ? "Responda em portugues brasileiro."
    : "Respond in English.";
  const facts = options.context.facts
    .map((fact) => `- ${fact.name}: ${String(fact.value)}${fact.unit ? ` ${fact.unit}` : ""}`)
    .join("\n");
  const prompt = [
    "Sintetize uma resposta natural e concisa usando exclusivamente os fatos abaixo.",
    "Preserve exatamente todos os numeros usados. Nao invente nem altere fatos, numeros, local, horario, chuva ou previsao.",
    "Nao transforme ausencia de dado em afirmacao e nao mencione estas instrucoes.",
    "Nao crie categorias novas ou contradiga condicao, precipitacao e periodo do dia.",
    languageInstruction,
    `Ferramenta: ${options.context.tool}`,
    `Fonte: ${options.context.source}`,
    "Fatos permitidos:",
    facts,
  ].join("\n");

  return {
    ...(options.model ? { model: options.model } : {}),
    messages: [{ role: "user", text: prompt }],
    temperature: 0,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  };
}

const CATEGORY_TERMS: Record<GroundedCategoryKind, Record<string, RegExp>> = {
  weatherCondition: {
    clear: /\b(?:ceu\s+(?:esta\s+)?(?:completamente\s+)?limpo|tempo\s+limpo|clear\s+sky|clear\s+weather)\b/iu,
    cloudy: /\b(?:nublado|nebulosidade|cloudy|overcast)\b/iu,
    rain: /\b(?:chovendo|chuva|garoa|pancadas|raining|rain|drizzle|showers)\b/iu,
    storm: /\b(?:tempestade|trovoada|thunderstorm|storm)\b/iu,
    snow: /\b(?:neve|nevando|snow|snowing)\b/iu,
    fog: /\b(?:neblina|nevoeiro|fog|mist)\b/iu,
    other: /$a/u,
  },
  precipitationState: {
    present: /\b(?:sem\s+chuva|nao\s+(?:esta\s+)?chovendo|no\s+(?:rain|precipitation))\b/iu,
    absent: /\b(?:chovendo|chuva|garoa|pancadas|precipitacao|tempestade|trovoada|raining|rain|drizzle|showers|precipitation|storm|thunderstorm)\b/iu,
  },
  dayPeriod: {
    day: /\b(?:noite|noturno|night|nighttime|after dark)\b/iu,
    night: /\b(?:durante\s+o\s+dia|luz\s+do\s+dia|daytime|daylight)\b/iu,
  },
};

function classifyWeatherCondition(condition: string) {
  const value = condition.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/trovoada|tempestade|thunderstorm|storm/u.test(value)) return "storm";
  if (/chuva|garoa|pancadas|rain|drizzle|showers/u.test(value)) return "rain";
  if (/neve|snow/u.test(value)) return "snow";
  if (/neblina|nevoeiro|fog|mist/u.test(value)) return "fog";
  if (/nublado|cloud|overcast/u.test(value)) return "cloudy";
  if (/limpo|clear/u.test(value)) return "clear";
  return "other";
}

export function validateGroundedCategories(synthesis: string, context: GroundedToolContext) {
  const conflicts: GroundedCategoryKind[] = [];
  for (const category of context.categories ?? []) {
    if (category.kind === "weatherCondition") {
      const terms = CATEGORY_TERMS.weatherCondition;
      if (Object.entries(terms).some(([state, pattern]) => state !== category.allowed && pattern.test(synthesis))) conflicts.push(category.kind);
    } else if (CATEGORY_TERMS[category.kind][category.allowed]?.test(synthesis)) conflicts.push(category.kind);
  }
  return { valid: conflicts.length === 0, conflicts: [...new Set(conflicts)] };
}

function numericValues(value: string | number | boolean) {
  if (typeof value === "number") return [value];
  if (typeof value !== "string") return [];
  return [...value.matchAll(/(?<![\p{L}\p{N}])[-+]?\d+(?:[.,]\d+)?/gu)]
    .map((match) => Number(match[0].replace(",", ".")))
    .filter(Number.isFinite);
}

export function validateGroundedNumbers(
  synthesis: string,
  context: GroundedToolContext,
) {
  const allowed = context.facts.flatMap((fact) => numericValues(fact.value));
  const found = numericValues(synthesis);
  const unexpected = found.filter(
    (candidate) => !allowed.some((value) => Object.is(value, candidate)),
  );
  return { valid: unexpected.length === 0, unexpected };
}

export function validateGroundedSynthesis(synthesis: string, context: GroundedToolContext) {
  const numbers = validateGroundedNumbers(synthesis, context);
  const categories = validateGroundedCategories(synthesis, context);
  return { valid: numbers.valid && categories.valid, unexpectedNumbers: numbers.unexpected, categoricalConflicts: categories.conflicts };
}
