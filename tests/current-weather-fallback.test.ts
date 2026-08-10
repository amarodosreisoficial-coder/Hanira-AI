import { describe, expect, it, vi } from "vitest";
import {
  buildCurrentWeatherFallback,
  createCurrentWeatherFallbackResponse,
  detectCurrentWeatherRequest,
} from "../lib/ai/runtime/current-weather-fallback";

async function readEvents(response: Response) {
  return (await response.text())
    .split("\n\n")
    .filter(Boolean)
    .map((block) => JSON.parse(block.replace(/^data: /, "")) as Record<string, unknown>);
}

describe("fallback deterministico de clima", () => {
  it.each([
    "Qual é o clima atual em Ariquemes?",
    "Vai chover hoje?",
    "tempo agora em Rondônia",
  ])("detecta solicitação meteorológica atual: %s", (message) => {
    expect(detectCurrentWeatherRequest(message)).toEqual({ language: "pt-BR" });
  });

  it("detecta inglês somente quando a solicitação é explícita", () => {
    expect(
      detectCurrentWeatherRequest("Responda em inglês: what is the current weather?"),
    ).toEqual({ language: "en" });
    expect(detectCurrentWeatherRequest("Explique o que é clima tropical")).toBeNull();
  });

  it("produz SSE local em português sem placeholders ou temperatura inventada", async () => {
    const onComplete = vi.fn();
    const response = createCurrentWeatherFallbackResponse({
      request: new Request("http://localhost/api/chat"),
      message: "Qual é o clima atual em Ariquemes?",
      conversationId: "conversation-1",
      requestId: "request-1",
      onComplete,
    });

    expect(response).not.toBeNull();
    const events = await readEvents(response!);
    const delta = events.find((event) => event.type === "delta")?.delta as string;
    expect(events.map((event) => event.type)).toEqual(["start", "delta", "done"]);
    expect(delta).toContain("Não tenho acesso a dados meteorológicos");
    expect(delta).not.toMatch(/[\u4e00-\u9fff]/);
    expect(delta).not.toMatch(/\[[^\]]+\]/);
    expect(delta).not.toMatch(/\d+\s*°?\s*[CF]/i);
    expect(onComplete).toHaveBeenCalledWith(delta);
  });

  it("produz fallback em inglês e permite ferramenta futura", async () => {
    expect(buildCurrentWeatherFallback("en")).toContain(
      "I do not have access to real-time weather data",
    );
    const response = createCurrentWeatherFallbackResponse({
      request: new Request("http://localhost/api/chat"),
      message: "weather now in Ariquemes",
      conversationId: "conversation-2",
      requestId: "request-2",
    });
    expect(response).not.toBeNull();
    expect(
      createCurrentWeatherFallbackResponse({
        request: new Request("http://localhost/api/chat"),
        message: "weather now in Ariquemes",
        conversationId: "conversation-2",
        requestId: "request-2",
        weatherToolAvailable: true,
      }),
    ).toBeNull();
  });
});
