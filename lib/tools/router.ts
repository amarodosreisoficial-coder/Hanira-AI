import { detectCurrentWeatherRequest } from "@/lib/ai/runtime/current-weather-fallback";
import { executeCurrentWeatherTool, type WeatherCurrentResult } from "./weather-current";
import type { ToolResult } from "./types";
import { detectCurrentTimeRequest, executeCurrentTimeTool, type TimeCurrentResult } from "./time-current";

export interface RoutedWeatherTool {
  tool: "weather.current";
  language: "pt-BR" | "en";
  result: ToolResult<WeatherCurrentResult>;
}

export interface RoutedTimeTool {
  tool: "time.current";
  language: "pt-BR" | "en";
  result: ToolResult<TimeCurrentResult>;
}

export async function routeTool(options: {
  message: string;
  requestId: string;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<RoutedWeatherTool | RoutedTimeTool | null> {
  const time = detectCurrentTimeRequest(options.message);
  if (time) return { tool: "time.current", language: time.language,
    result: await executeCurrentTimeTool(options) };
  const detected = detectCurrentWeatherRequest(options.message);
  if (!detected) return null;
  return {
    tool: "weather.current",
    language: detected.language,
    result: await executeCurrentWeatherTool(options),
  };
}
