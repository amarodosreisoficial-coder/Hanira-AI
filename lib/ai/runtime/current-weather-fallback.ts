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
  /\bclima\s+atual\b/,
  /\btempo\s+agora\b/,
  /\btemperatura\s+agora\b/,
  /\btemperatura\s+atual\b/,
  /\bprevisao\s+do\s+tempo\b/,
  /\bvai\s+chover\s+hoje\b/,
  /\bcomo\s+esta\s+o\s+tempo\b/,
  /\besta\s+chovendo\b/,
];

const ENGLISH_CURRENT_WEATHER_PATTERNS = [
  /\bweather\s+now\b/,
  /\bcurrent\s+weather\b/,
  /\btemperature\s+now\b/,
];

function normalizeWeatherIntent(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function matchesAny(message: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(message));
}

export function detectCurrentWeatherRequest(message: string): {
  language: CurrentWeatherLanguage;
} | null {
  const normalized = normalizeWeatherIntent(message.trim());
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
    : "\u004e\u00e3o tenho acesso a dados meteorol\u00f3gicos em tempo real nesta inst\u00e2ncia. Posso ajudar com informa\u00e7\u00f5es gerais sobre o clima da regi\u00e3o, mas n\u00e3o devo inventar a temperatura ou a previs\u00e3o atual.";
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
