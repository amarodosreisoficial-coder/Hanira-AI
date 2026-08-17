import { detectCurrentWeatherRequest } from "@/lib/ai/runtime/current-weather-fallback";
import { executeCurrentWeatherTool, type WeatherCurrentResult } from "./weather-current";
import type { ToolResult } from "./types";

export interface RoutedWeatherTool {
  tool: "weather.current";
  language: "pt-BR" | "en";
  result: ToolResult<WeatherCurrentResult>;
}

export async function routeTool(options: {
  message: string;
  requestId: string;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<RoutedWeatherTool | null> {
  const detected = detectCurrentWeatherRequest(options.message);
  if (!detected) return null;
  return {
    tool: "weather.current",
    language: detected.language,
    result: await executeCurrentWeatherTool(options),
  };
}
