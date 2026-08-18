import { logServerEvent } from "@/lib/logging/server";
import { GeocodingError, resolveGeocodedLocation } from "./geocoding";
import type { ToolExecutionContext, ToolResult } from "./types";

export const CURRENT_TIME_TOOL = "time.current";
export const CURRENT_TIME_SOURCE = "open-meteo-geocoding+server-clock";
export const TIME_TOOL_TIMEOUT_MS = 8_000;
export type CurrentTimeLanguage = "pt-BR" | "en";

export interface TimeCurrentResult {
  location: string;
  region?: string;
  country?: string;
  timezone: string;
  currentDate: string;
  currentTime: string;
  utcOffset?: string;
  source: typeof CURRENT_TIME_SOURCE;
}

export function detectCurrentTimeRequest(message: string): { language: CurrentTimeLanguage; location: string | null } | null {
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const conceptual = /\b(?:explique|o que e|como funciona|conceito|fuso(?:s)? horario(?:s)?|horario de verao|what is|explain|time zone(?:s)?|daylight saving)\b/u.test(normalized);
  const current = /\b(?:que horas (?:sao|e)|horario atual|hora atual|agora que horas|what time is it|current time|time now)\b/u.test(normalized);
  if (conceptual || !current) return null;
  const language: CurrentTimeLanguage = /\b(?:what time|current time|time now|respond in english|in english)\b/u.test(normalized) ? "en" : "pt-BR";
  const match = message.match(/\b(?:em|no|na|in|at)\s+(.+?)[?!.]*$/iu);
  return { language, location: match?.[1]?.trim() || null };
}

function report(context: ToolExecutionContext, event: string, startedAt: number, status: number, errorCode?: string) {
  logServerEvent({ level: status >= 400 ? "warn" : "info", requestId: context.requestId,
    route: "/api/chat", event, status, durationMs: Date.now() - startedAt,
    providerId: CURRENT_TIME_SOURCE,
    details: { tool: CURRENT_TIME_TOOL, ...(errorCode ? { errorCode } : {}) } });
}

function failure(context: ToolExecutionContext, startedAt: number, code: NonNullable<ToolResult<TimeCurrentResult>["error"]>["code"], message: string) {
  report(context, "tool_execution_failed", startedAt, code === "aborted" ? 499 : 502, code);
  return { ok: false, tool: CURRENT_TIME_TOOL, source: CURRENT_TIME_SOURCE,
    durationMs: Date.now() - startedAt, error: { code, message } } satisfies ToolResult<TimeCurrentResult>;
}

function zonedParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = value("year"); const month = value("month"); const day = value("day");
  const hour = value("hour"); const minute = value("minute");
  if (!year || !month || !day || !hour || !minute) throw new Error("invalid_timezone_parts");
  let utcOffset: string | undefined;
  try {
    const offsetName = new Intl.DateTimeFormat("en", { timeZone: timezone, timeZoneName: "longOffset" })
      .formatToParts(now).find((part) => part.type === "timeZoneName")?.value;
    if (offsetName) utcOffset = offsetName.replace("GMT", "UTC");
  } catch { /* Optional on runtimes without longOffset support. */ }
  return { currentDate: `${year}-${month}-${day}`, currentTime: `${hour}:${minute}`, utcOffset };
}

export function formatTimeCurrent(result: TimeCurrentResult, language: CurrentTimeLanguage) {
  const place = [result.location, result.region, result.country].filter(Boolean).join(", ");
  const [year, month, day] = result.currentDate.split("-");
  return language === "pt-BR"
    ? `Agora em ${place} sao ${result.currentTime} do dia ${day}/${month}/${year} (${result.timezone}).`
    : `It is now ${result.currentTime} on ${result.currentDate} in ${place} (${result.timezone}).`;
}

export async function executeCurrentTimeTool(options: ToolExecutionContext & {
  message: string; fetchImpl?: typeof fetch; timeoutMs?: number; now?: Date;
}): Promise<ToolResult<TimeCurrentResult>> {
  const startedAt = Date.now();
  const detected = detectCurrentTimeRequest(options.message);
  if (!detected) return failure(options, startedAt, "not_found", "Not a current time request.");
  if (!detected.location) return failure(options, startedAt, "missing_location",
    detected.language === "pt-BR" ? "Informe a cidade ou regiao para consultar o horario atual." : "Provide a city or region for the current time.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal.aborted) controller.abort(); else options.signal.addEventListener("abort", abort, { once: true });
  if (controller.signal.aborted) return failure(options, startedAt, "aborted", "A consulta de horario foi cancelada.");
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? TIME_TOOL_TIMEOUT_MS);
  report(options, "tool_execution_started", startedAt, 200);
  try {
    const place = await resolveGeocodedLocation({ query: detected.location, language: detected.language,
      signal: controller.signal, fetchImpl: options.fetchImpl });
    if (!place.timezone) throw new GeocodingError("invalid_response");
    const clock = zonedParts(options.now ?? new Date(), place.timezone);
    const data: TimeCurrentResult = { location: place.location, ...(place.region && { region: place.region }),
      ...(place.country && { country: place.country }), timezone: place.timezone,
      currentDate: clock.currentDate, currentTime: clock.currentTime,
      ...(clock.utcOffset && { utcOffset: clock.utcOffset }), source: CURRENT_TIME_SOURCE };
    report(options, "tool_execution_completed", startedAt, 200);
    return { ok: true, tool: CURRENT_TIME_TOOL, source: CURRENT_TIME_SOURCE, durationMs: Date.now() - startedAt, data };
  } catch (error) {
    const code = controller.signal.aborted ? (options.signal.aborted ? "aborted" : "timeout")
      : error instanceof GeocodingError ? error.code : "invalid_response";
    const message = code === "ambiguous_location" ? "Encontrei mais de uma localidade possivel. Informe tambem o estado ou pais."
      : code === "not_found" ? "Nao encontrei essa localidade."
        : code === "timeout" ? "A resolucao de fuso horario demorou para responder."
          : "Nao foi possivel determinar o fuso horario dessa localidade.";
    return failure(options, startedAt, code, message);
  } finally { clearTimeout(timeout); options.signal.removeEventListener("abort", abort); }
}
