import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  executeCurrentWeatherTool,
  formatWeatherCurrent,
} from "../lib/tools/weather-current";
import { routeTool } from "../lib/tools/router";

const context = {
  requestId: "request-weather-1",
  signal: new AbortController().signal,
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function weatherPayload() {
  return {
    current: {
      time: "2026-08-15T12:00",
      temperature_2m: 31.4,
      apparent_temperature: 35.2,
      relative_humidity_2m: 68,
      precipitation: 0.2,
      rain: 0.2,
      showers: 0,
      weather_code: 61,
      cloud_cover: 74,
      wind_speed_10m: 12.5,
      wind_direction_10m: 90,
      wind_gusts_10m: 18,
      is_day: 1,
    },
  };
}

describe("weather.current tool", () => {
  it("roteia clima atual e nao roteia explicacao conceitual", async () => {
    const calls: URL[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      calls.push(url);
      return calls.length === 1
        ? jsonResponse({ results: [{ name: "Ariquemes", admin1: "Rondônia", country: "Brasil", latitude: -9.91, longitude: -63.04, timezone: "America/Porto_Velho" }] })
        : jsonResponse(weatherPayload());
    };

    const routed = await routeTool({
      ...context,
      message: "Qual é o clima atual em Ariquemes, Rondônia?",
      fetchImpl,
    });
    expect(routed?.tool).toBe("weather.current");
    expect(routed?.result.ok).toBe(true);
    expect(calls[0]?.hostname).toBe("geocoding-api.open-meteo.com");
    expect(calls[1]?.hostname).toBe("api.open-meteo.com");
    expect(calls[1]?.searchParams.get("current")).toContain("temperature_2m");
    expect(calls[0]?.search).not.toContain("pergunta privada");
    expect(await routeTool({ ...context, message: "Explique o que é clima tropical", fetchImpl })).toBeNull();
  });

  it("normaliza dados atuais sem inventar campos", async () => {
    const result = await executeCurrentWeatherTool({
      ...context,
      message: "Como está o tempo agora em Porto Velho?",
      fetchImpl: async (input) =>
        new URL(String(input)).hostname === "geocoding-api.open-meteo.com"
          ? jsonResponse({ results: [{ name: "Porto Velho", admin1: "Rondônia", country: "Brasil", latitude: -8.76, longitude: -63.9, timezone: "America/Porto_Velho" }] })
          : jsonResponse(weatherPayload()),
    });

    expect(result).toMatchObject({ ok: true, source: "open-meteo" });
    expect(result.data).toMatchObject({
      temperatureC: 31.4,
      apparentTemperatureC: 35.2,
      humidityPercent: 68,
      precipitationMm: 0.2,
      weatherCode: 61,
      windSpeedKmh: 12.5,
      timezone: "America/Porto_Velho",
    });
    expect(formatWeatherCurrent(result.data!, "pt-BR")).toContain("31,4 °C");
    expect(formatWeatherCurrent(result.data!, "pt-BR")).toContain("chuva fraca");
  });

  it("retorna ambiguidade sem escolher silenciosamente", async () => {
    const result = await executeCurrentWeatherTool({
      ...context,
      message: "Qual a temperatura atual em Paris?",
      fetchImpl: async () =>
        jsonResponse({
          results: [
            { name: "Paris", country: "France", latitude: 48, longitude: 2 },
            { name: "Paris", country: "United States", latitude: 33, longitude: -95 },
          ],
        }),
    });

    expect(result).toMatchObject({ ok: false, error: { code: "ambiguous_location" } });
  });

  it("normaliza HTTP error, JSON invalido e timeout", async () => {
    const httpError = await executeCurrentWeatherTool({
      ...context,
      message: "Qual é o clima atual em Paris?",
      fetchImpl: async () => jsonResponse({}, { status: 503 }),
    });
    expect(httpError).toMatchObject({ ok: false, error: { code: "unavailable" } });

    const invalidJson = await executeCurrentWeatherTool({
      ...context,
      message: "Qual é o clima atual em Paris?",
      fetchImpl: async () => new Response("{bad", { status: 200 }),
    });
    expect(invalidJson).toMatchObject({ ok: false, error: { code: "invalid_response" } });

    const timeout = await executeCurrentWeatherTool({
      ...context,
      message: "Qual é o clima atual em Paris?",
      timeoutMs: 1,
      fetchImpl: async (_input, init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        }),
    });
    expect(timeout).toMatchObject({ ok: false, error: { code: "timeout" } });
  });

  it("respeita AbortSignal ja cancelado sem iniciar fetch", async () => {
    const controller = new AbortController();
    controller.abort();
    let fetchCalls = 0;
    const result = await executeCurrentWeatherTool({
      requestId: context.requestId,
      signal: controller.signal,
      message: "Qual é o clima atual em Paris?",
      fetchImpl: async () => {
        fetchCalls += 1;
        return jsonResponse({});
      },
    });

    expect(fetchCalls).toBe(0);
    expect(result).toMatchObject({ ok: false, error: { code: "aborted" } });
  });
});
