export interface GeocodedLocation {
  location: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

interface GeocodingResult {
  name?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  admin1?: unknown;
  country?: unknown;
  timezone?: unknown;
}

type GeocodingFailure = "ambiguous_location" | "invalid_response" | "not_found" | "unavailable";

export class GeocodingError extends Error {
  constructor(readonly code: GeocodingFailure) {
    super(code);
    this.name = "GeocodingError";
  }
}

function normalizedText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").trim();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function locationTokens(value: string) {
  return normalizedText(value).split(/[\s,/-]+/u).filter((token) => token.length > 1);
}

function chooseResult(results: GeocodingResult[], requested: string) {
  const tokens = locationTokens(requested);
  const ranked = results.filter((result) =>
    isFiniteNumber(result.latitude) && isFiniteNumber(result.longitude) && typeof result.name === "string")
    .map((result) => {
      const fields = [result.name, result.admin1, result.country]
        .filter((field): field is string => typeof field === "string").map(normalizedText);
      return { result, score: tokens.reduce((sum, token) =>
        sum + (fields.some((field) => field.includes(token)) ? 1 : 0), 0) };
    }).sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.score === 0) throw new GeocodingError("not_found");
  if (ranked[1]?.score === best.score) throw new GeocodingError("ambiguous_location");
  return best.result;
}

export async function resolveGeocodedLocation(options: {
  query: string;
  language: "pt-BR" | "en";
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", options.query);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", options.language === "pt-BR" ? "pt" : "en");
  url.searchParams.set("format", "json");
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      method: "GET", signal: options.signal, headers: { accept: "application/json" },
    });
  } catch (error) {
    if (options.signal.aborted) throw error;
    throw new GeocodingError("unavailable");
  }
  if (!response.ok) throw new GeocodingError("unavailable");
  let body: { results?: unknown };
  try { body = await response.json() as { results?: unknown }; }
  catch { throw new GeocodingError("invalid_response"); }
  const selected = chooseResult(Array.isArray(body.results) ? body.results as GeocodingResult[] : [], options.query);
  return {
    location: String(selected.name),
    ...(typeof selected.admin1 === "string" && { region: selected.admin1 }),
    ...(typeof selected.country === "string" && { country: selected.country }),
    latitude: Number(selected.latitude), longitude: Number(selected.longitude),
    ...(typeof selected.timezone === "string" && { timezone: selected.timezone }),
  } satisfies GeocodedLocation;
}
