import { describe, expect, it, vi } from "vitest";
import type { AIProvider } from "../lib/ai/provider";
import type { AIChatRequest, AIChatResponse, AIStreamEvent } from "../lib/ai/types";
import { AIProviderError } from "../lib/ai/types";
import {
  buildGroundedSynthesisRequest,
  createWeatherGroundedContext,
  validateGroundedNumbers,
  validateGroundedCategories,
  validateGroundedSynthesis,
} from "../lib/ai/runtime/grounded-tool-context";
import { createGroundedToolResponse } from "../lib/ai/runtime/grounded-response-runtime";
import type { ToolResult } from "../lib/tools/types";
import type { WeatherCurrentResult } from "../lib/tools/weather-current";

const toolResult: ToolResult<WeatherCurrentResult> = {
  ok: true,
  tool: "weather.current",
  source: "open-meteo",
  durationMs: 12,
  data: {
    location: "Ariquemes",
    region: "Rondonia",
    country: "Brasil",
    latitude: -9.91,
    longitude: -63.04,
    timezone: "America/Porto_Velho",
    observedAt: "2026-08-15T12:00",
    temperatureC: 31.4,
    apparentTemperatureC: 34.1,
    humidityPercent: 68,
    precipitationMm: 0,
    weatherCode: 2,
    condition: "parcialmente nublado",
    windSpeedKmh: 12.5,
    source: "open-meteo",
  },
};

class SynthesisProvider implements AIProvider {
  readonly providerId = "fake-ollama";
  readonly capabilities = { supported: ["text-generation", "text-streaming"] as const };
  constructor(
    private readonly events: AIStreamEvent[],
    readonly capture = vi.fn<(request: AIChatRequest) => void>(),
  ) {}
  async generate(): Promise<AIChatResponse> { throw new Error("generate must not be used"); }
  async *stream(request: AIChatRequest) {
    this.capture(request);
    for (const event of this.events) yield event;
  }
  async healthCheck() { return { ok: true, provider: this.providerId }; }
  async listModels() { return []; }
  supports() { return true; }
}

function providerFor(text: string) {
  return new SynthesisProvider([
    { type: "start", provider: "fake-ollama", model: "qwen" },
    { type: "text-delta", textDelta: text },
    { type: "finish", finishReason: "stop" },
  ]);
}

async function events(response: Response) {
  return (await response.text()).split("\n\n").filter(Boolean)
    .map((item) => JSON.parse(item.replace(/^data: /, "")) as Record<string, unknown>);
}

function responseWith(provider: AIProvider, request = new Request("http://local/api/chat")) {
  const context = createWeatherGroundedContext(toolResult, "pt-BR");
  return createGroundedToolResponse({
    request,
    provider,
    providerRequest: buildGroundedSynthesisRequest({ context, signal: request.signal }),
    groundedContext: context,
    deterministicText: "Agora em Ariquemes, 31,4 °C.",
    conversationId: "c1",
    requestId: "r1",
    mode: "weather.current",
  });
}

describe("grounded tool runtime", () => {
  it("converte apenas fatos normalizados, sem JSON bruto ou coordenadas", () => {
    const context = createWeatherGroundedContext(toolResult, "pt-BR");
    const request = buildGroundedSynthesisRequest({ context });
    const prompt = request.messages[0]?.text ?? "";
    expect(context.tool).toBe("weather.current");
    expect(prompt).toContain("temperature: 31.4 C");
    expect(prompt).toContain("humidity: 68 %");
    expect(prompt).not.toContain("latitude");
    expect(prompt).not.toContain("-9.91");
    expect(prompt).not.toContain("weatherCode");
    expect(prompt).not.toContain(JSON.stringify(toolResult));
  });

  it("aceita equivalencias de separador decimal", () => {
    const context = createWeatherGroundedContext(toolResult, "pt-BR");
    expect(validateGroundedNumbers("Faz 31,4 °C, sensacao de 34.1 °C e umidade de 68%.", context)).toEqual({ valid: true, unexpected: [] });
  });

  it("rejeita numero inventado ou alterado", () => {
    const context = createWeatherGroundedContext(toolResult, "pt-BR");
    expect(validateGroundedNumbers("Vai fazer 40 °C.", context)).toMatchObject({ valid: false, unexpected: [40] });
    expect(validateGroundedNumbers("Agora faz 31,5 °C.", context)).toMatchObject({ valid: false, unexpected: [31.5] });
  });

  it("aceita sintese natural valida e mantem SSE", async () => {
    const onComplete = vi.fn();
    const context = createWeatherGroundedContext(toolResult, "pt-BR");
    const provider = providerFor("Agora em Ariquemes faz 31,4 °C, com umidade de 68%.");
    const response = createGroundedToolResponse({
      request: new Request("http://local/api/chat"), provider,
      providerRequest: buildGroundedSynthesisRequest({ context }), groundedContext: context,
      deterministicText: "fallback", conversationId: "c1", requestId: "r1", mode: "weather.current", onComplete,
    });
    const result = await events(response);
    expect(result.map((event) => event.type)).toEqual(["start", "delta", "done"]);
    expect(result[1]?.delta).toContain("31,4 °C");
    expect(onComplete).toHaveBeenCalledWith(result[1]?.delta);
  });

  it("usa resposta deterministica para grounding invalido", async () => {
    const result = await events(responseWith(providerFor("Agora faz 40 °C.")));
    expect(result[1]?.delta).toBe("Agora em Ariquemes, 31,4 °C.");
  });

  it("usa resposta deterministica quando Ollama falha ou termina incompleto", async () => {
    const failed = new SynthesisProvider([{ type: "error", error: new AIProviderError({ code: "unavailable", message: "offline" }) }]);
    const incomplete = new SynthesisProvider([{ type: "text-delta", textDelta: "31,4 °C" }]);
    expect((await events(responseWith(failed)))[1]?.delta).toContain("31,4");
    expect((await events(responseWith(incomplete)))[1]?.delta).toContain("31,4");
  });

  it("cancelamento nao emite nem persiste resposta", async () => {
    const controller = new AbortController();
    const onComplete = vi.fn();
    const provider = new SynthesisProvider([{ type: "error", error: new AIProviderError({ code: "cancelled", message: "cancelled" }) }]);
    controller.abort();
    const context = createWeatherGroundedContext(toolResult, "pt-BR");
    const result = await events(createGroundedToolResponse({
      request: new Request("http://local/api/chat", { signal: controller.signal }), provider,
      providerRequest: buildGroundedSynthesisRequest({ context, signal: controller.signal }), groundedContext: context,
      deterministicText: "fallback", conversationId: "c1", requestId: "r1", mode: "weather.current", onComplete,
    }));
    expect(result.map((event) => event.type)).toEqual(["start"]);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("instrui idioma ingles sem incluir historico ou dados internos", () => {
    const context = createWeatherGroundedContext(toolResult, "en");
    const request = buildGroundedSynthesisRequest({ context });
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0]?.text).toContain("Respond in English");
    expect(request.messages[0]?.text).not.toContain("conversationId");
  });

  it("aceita condicao categorica valida", () => {
    const context = createWeatherGroundedContext(toolResult, "pt-BR");
    expect(validateGroundedCategories("O tempo esta parcialmente nublado durante o dia.", context).valid).toBe(true);
  });

  it("rejeita chuva, tempestade e noite inventadas", () => {
    const context = createWeatherGroundedContext({ ...toolResult, data: { ...toolResult.data!, isDay: true } }, "pt-BR");
    expect(validateGroundedSynthesis("Esta chovendo forte.", context).valid).toBe(false);
    expect(validateGroundedSynthesis("Ha tempestade durante a noite.", context).categoricalConflicts).toEqual(expect.arrayContaining(["weatherCondition", "precipitationState", "dayPeriod"]));
  });

  it("rejeita ceu limpo inventado quando existe chuva e usa fallback", async () => {
    const rainy = { ...toolResult, data: { ...toolResult.data!, condition: "chuva fraca", precipitationMm: 1 } };
    const context = createWeatherGroundedContext(rainy, "pt-BR");
    expect(validateGroundedCategories("O ceu esta completamente limpo.", context).valid).toBe(false);
    const result = await events(createGroundedToolResponse({ request: new Request("http://local/api/chat"),
      provider: providerFor("O ceu esta completamente limpo."), providerRequest: buildGroundedSynthesisRequest({ context }),
      groundedContext: context, deterministicText: "Chuva fraca.", conversationId: "c1", requestId: "r1", mode: "weather.current" }));
    expect(result[1]?.delta).toBe("Chuva fraca.");
  });
});
