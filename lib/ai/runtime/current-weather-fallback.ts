import { streamEvent, streamHeaders } from "./text-chat-runtime";

export type CurrentWeatherLanguage = "pt-BR" | "en";

export interface CurrentWeatherFallbackOptions {
  request: Request;
  message: string;
  conversationId: string;
  requestId: string;
  weatherToolAvailable?: boolean;
  onComplete?: (assistantContent: string) => Promise<void> | void;
}

const PORTUGUESE_CURRENT_WEATHER_PATTERNS = [
  /\bclima\s+atual\b/i,
  /\btempo\s+agora\b/i,
  /\btemperatura\s+agora\b/i,
  /\bprevis(?:ã|a)o\s+do\s+tempo\b/i,
  /\bvai\s+chover\s+hoje\b/i,
  /\bcomo\s+est(?:á|a)\s+o\s+tempo\b/i,
];

const ENGLISH_CURRENT_WEATHER_PATTERNS = [
  /\bweather\s+now\b/i,
  /\bcurrent\s+weather\b/i,
];

function matchesAny(message: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(message));
}

export function detectCurrentWeatherRequest(message: string): {
  language: CurrentWeatherLanguage;
} | null {
  const normalized = message.trim();
  if (!normalized) return null;

  if (matchesAny(normalized, ENGLISH_CURRENT_WEATHER_PATTERNS)) {
    return { language: "en" };
  }
  if (matchesAny(normalized, PORTUGUESE_CURRENT_WEATHER_PATTERNS)) {
    return { language: "pt-BR" };
  }
  return null;
}

export function buildCurrentWeatherFallback(language: CurrentWeatherLanguage) {
  return language === "en"
    ? "I do not have access to real-time weather data in this instance. I can help with general information about the region's climate, but I should not invent the current temperature or forecast."
    : "Não tenho acesso a dados meteorológicos em tempo real nesta instância. Posso ajudar com informações gerais sobre o clima da região, mas não devo inventar a temperatura ou a previsão atual.";
}

export function createCurrentWeatherFallbackResponse(
  options: CurrentWeatherFallbackOptions,
) {
  if (options.weatherToolAvailable) return null;
  const detected = detectCurrentWeatherRequest(options.message);
  if (!detected) return null;

  const answer = buildCurrentWeatherFallback(detected.language);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          streamEvent("start", {
            conversationId: options.conversationId,
            requestId: options.requestId,
            mode: "local-fallback",
          }),
        ),
      );
      if (!options.request.signal.aborted) {
        controller.enqueue(encoder.encode(streamEvent("delta", { delta: answer })));
        await options.onComplete?.(answer);
        controller.enqueue(
          encoder.encode(
            streamEvent("done", { conversationId: options.conversationId }),
          ),
        );
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: streamHeaders(options.conversationId, options.requestId),
  });
}
