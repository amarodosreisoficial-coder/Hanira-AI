import { detectCurrentWeatherRequest, type CurrentWeatherLanguage } from "@/lib/ai/runtime/current-weather-fallback";
import { logServerEvent } from "@/lib/logging/server";
import type { ToolExecutionContext, ToolResult } from "./types";
import { GeocodingError, resolveGeocodedLocation } from "./geocoding";

export const CURRENT_WEATHER_TOOL = "weather.current";
export const OPEN_METEO_SOURCE = "open-meteo";
export const WEATHER_TOOL_TIMEOUT_MS = 8_000;

export interface WeatherCurrentResult {
  location: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  observedAt: string;
  temperatureC?: number;
  apparentTemperatureC?: number;
  humidityPercent?: number;
  precipitationMm?: number;
  rainMm?: number;
  showersMm?: number;
  weatherCode?: number;
  condition: string;
  cloudCoverPercent?: number;
  windSpeedKmh?: number;
  windDirectionDegrees?: number;
  windGustKmh?: number;
  isDay?: boolean;
  source: typeof OPEN_METEO_SOURCE;
}

interface WeatherToolOptions extends ToolExecutionContext {
  message: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface ForecastResponse {
  current?: Record<string, unknown>;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalNumber(value: unknown) {
  return isFiniteNumber(value) ? value : undefined;
}

function extractLocation(message: string) {
  const match = message.match(
    /\b(?:em|no|na|de|do|da|in|at)\s+(.+?)(?=\s+(?:agora|hoje|now|currently|neste momento|right now)\b|[?!.,]*$)/iu,
  );
  const location = match?.[1]
    ?.replace(/\s+(?:agora|hoje|now|currently|neste momento|right now)\s*$/iu, "")
    .replace(/[?!.,]+$/u, "")
    .trim();
  return location || null;
}

function conditionFromWeatherCode(code: number | undefined, language: CurrentWeatherLanguage) {
  const portuguese: Record<number, string> = {
    0: "ceu limpo",
    1: "principalmente limpo",
    2: "parcialmente nublado",
    3: "nublado",
    45: "neblina",
    48: "neblina congelante",
    51: "garoa fraca",
    53: "garoa moderada",
    55: "garoa intensa",
    61: "chuva fraca",
    63: "chuva moderada",
    65: "chuva intensa",
    71: "neve fraca",
    73: "neve moderada",
    75: "neve intensa",
    80: "pancadas de chuva fracas",
    81: "pancadas de chuva moderadas",
    82: "pancadas de chuva intensas",
    95: "trovoada",
    96: "trovoada com granizo fraco",
    99: "trovoada com granizo intenso",
  };
  const english: Record<number, string> = {
    0: "ceu limpo",
    1: "mainly clear",
    2: "partly cloudy",
    3: "overcast",
    45: "fog",
    48: "freezing fog",
    51: "light drizzle",
    53: "moderate drizzle",
    55: "dense drizzle",
    61: "light rain",
    63: "moderate rain",
    65: "heavy rain",
    71: "light snow",
    73: "moderate snow",
    75: "heavy snow",
    80: "light rain showers",
    81: "moderate rain showers",
    82: "heavy rain showers",
    95: "thunderstorm",
    96: "thunderstorm with light hail",
    99: "thunderstorm with heavy hail",
  };
  return (language === "pt-BR" ? portuguese : english)[code ?? -1] ??
    (language === "pt-BR" ? "condicao nao classificada" : "unclassified condition");
}

function reportToolEvent(context: ToolExecutionContext, event: string, durationMs: number, status: number, errorCode?: string) {
  logServerEvent({
    level: status >= 400 ? "warn" : "info",
    requestId: context.requestId,
    route: "/api/chat",
    event,
    status,
    durationMs,
    providerId: OPEN_METEO_SOURCE,
    details: { tool: CURRENT_WEATHER_TOOL, ...(errorCode ? { errorCode } : {}) },
  });
}

function toolFailure<T>(
  context: ToolExecutionContext,
  startedAt: number,
  error: NonNullable<ToolResult<T>["error"]>,
): ToolResult<T> {
  const durationMs = Date.now() - startedAt;
  reportToolEvent(context, "tool_execution_failed", durationMs, error.code === "aborted" ? 499 : 502, error.code);
  return { ok: false, tool: CURRENT_WEATHER_TOOL, source: OPEN_METEO_SOURCE, durationMs, error };
}

async function fetchJson<T>(fetchImpl: typeof fetch, url: URL, signal: AbortSignal): Promise<T> {
  const response = await fetchImpl(url, { method: "GET", signal, headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`http_${response.status}`);
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("invalid_json");
  }
}

export function formatWeatherCurrent(result: WeatherCurrentResult, language: CurrentWeatherLanguage) {
  const number = (value: number | undefined, suffix: string) =>
    value === undefined ? null : `${value.toLocaleString(language === "pt-BR" ? "pt-BR" : "en-US", { maximumFractionDigits: 1 })}${suffix}`;
  const place = [result.location, result.region, result.country].filter(Boolean).join(", ");
  const parts: string[] = language === "pt-BR"
    ? [`Agora em ${place}`, `${number(result.temperatureC, " \u00b0C") ?? "temperatura indisponivel"}`, result.condition]
    : [`Now in ${place}`, `${number(result.temperatureC, " \u00b0C") ?? "temperature unavailable"}`, result.condition];
  if (result.apparentTemperatureC !== undefined) parts.push(language === "pt-BR" ? `sensacao de ${number(result.apparentTemperatureC, " \u00b0C")}` : `feels like ${number(result.apparentTemperatureC, " \u00b0C")}`);
  if (result.humidityPercent !== undefined) parts.push(language === "pt-BR" ? `umidade de ${number(result.humidityPercent, "%")}` : `humidity ${number(result.humidityPercent, "%")}`);
  if (result.precipitationMm !== undefined) parts.push(language === "pt-BR" ? `precipitacao de ${number(result.precipitationMm, " mm")}` : `precipitation ${number(result.precipitationMm, " mm")}`);
  if (result.windSpeedKmh !== undefined) parts.push(language === "pt-BR" ? `vento de ${number(result.windSpeedKmh, " km/h")}` : `wind ${number(result.windSpeedKmh, " km/h")}`);
  parts.push(language === "pt-BR" ? `Dados meteorologicos modelados fornecidos pelo Open-Meteo (observacao: ${result.observedAt}).` : `Modeled weather data provided by Open-Meteo (observed: ${result.observedAt}).`);
  return `${parts[0]}, ${parts.slice(1).join(", ")}`;
}

export async function executeCurrentWeatherTool(options: WeatherToolOptions): Promise<ToolResult<WeatherCurrentResult>> {
  const startedAt = Date.now();
  const detected = detectCurrentWeatherRequest(options.message);
  if (!detected) return { ok: false, tool: CURRENT_WEATHER_TOOL, source: OPEN_METEO_SOURCE, durationMs: 0, error: { code: "not_found", message: "Not a current weather request." } };
  const location = extractLocation(options.message);
  if (!location) return toolFailure(options, startedAt, { code: "missing_location", message: "Informe a cidade ou regiao para consultar o clima atual." });

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (options.signal.aborted) controller.abort();
  else options.signal.addEventListener("abort", onAbort, { once: true });
  if (controller.signal.aborted) {
    return toolFailure(options, startedAt, {
      code: "aborted",
      message: "A consulta meteorológica foi cancelada.",
    });
  }
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? WEATHER_TOOL_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl ?? fetch;
  reportToolEvent(options, "tool_execution_started", 0, 200);

  try {
    const point = await resolveGeocodedLocation({ query: location, language: detected.language, signal: controller.signal, fetchImpl });
    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.searchParams.set("latitude", String(point.latitude));
    forecastUrl.searchParams.set("longitude", String(point.longitude));
    forecastUrl.searchParams.set("current", "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day");
    forecastUrl.searchParams.set("timezone", typeof point.timezone === "string" ? point.timezone : "auto");
    const forecast = await fetchJson<ForecastResponse>(fetchImpl, forecastUrl, controller.signal);
    const current = forecast.current;
    if (!current || typeof current.time !== "string") throw new Error("invalid_current");
    const weatherCode = optionalNumber(current.weather_code);
    const result: WeatherCurrentResult = {
      location: point.location,
      ...(point.region && { region: point.region }),
      ...(point.country && { country: point.country }),
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      ...(point.timezone && { timezone: point.timezone }),
      observedAt: current.time,
      temperatureC: optionalNumber(current.temperature_2m),
      apparentTemperatureC: optionalNumber(current.apparent_temperature),
      humidityPercent: optionalNumber(current.relative_humidity_2m),
      precipitationMm: optionalNumber(current.precipitation),
      rainMm: optionalNumber(current.rain),
      showersMm: optionalNumber(current.showers),
      weatherCode,
      condition: conditionFromWeatherCode(weatherCode, detected.language),
      cloudCoverPercent: optionalNumber(current.cloud_cover),
      windSpeedKmh: optionalNumber(current.wind_speed_10m),
      windDirectionDegrees: optionalNumber(current.wind_direction_10m),
      windGustKmh: optionalNumber(current.wind_gusts_10m),
      ...(typeof current.is_day === "number" && { isDay: current.is_day === 1 }),
      source: OPEN_METEO_SOURCE,
    };
    const durationMs = Date.now() - startedAt;
    reportToolEvent(options, "tool_execution_completed", durationMs, 200);
    return { ok: true, tool: CURRENT_WEATHER_TOOL, source: OPEN_METEO_SOURCE, durationMs, data: result };
  } catch (error) {
    const code = controller.signal.aborted
      ? options.signal.aborted ? "aborted" : "timeout"
      : error instanceof GeocodingError ? error.code
      : error instanceof Error && (error.message === "invalid_current" || error.message === "invalid_json")
        ? "invalid_response"
        : "unavailable";
    return toolFailure(options, startedAt, {
      code,
      message: code === "timeout" ? "A fonte meteorologica demorou para responder."
        : code === "not_found" ? "Nao encontrei essa localidade."
          : code === "ambiguous_location" ? "Encontrei mais de uma localidade possivel. Informe tambem o estado ou pais."
            : "A fonte meteorologica nao esta disponivel.",
    });
  } finally {
    clearTimeout(timeout);
    options.signal.removeEventListener("abort", onAbort);
  }
}





