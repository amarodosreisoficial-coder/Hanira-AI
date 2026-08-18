import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { detectCurrentTimeRequest, executeCurrentTimeTool, formatTimeCurrent } from "../lib/tools/time-current";
import { routeTool } from "../lib/tools/router";
import { buildGroundedSynthesisRequest, createTimeGroundedContext, validateGroundedSynthesis } from "../lib/ai/runtime/grounded-tool-context";

const signal = new AbortController().signal;
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
const tokyo = { results: [{ name: "Tokyo", admin1: "Tokyo", country: "Japan", latitude: 35.68, longitude: 139.69, timezone: "Asia/Tokyo" }] };

describe("time.current tool", () => {
  it.each(["Que horas sao em Ariquemes?", "Qual e o horario atual em Sao Paulo?", "Que horas sao agora em Toquio?", "What time is it in London?"])("detecta horario atual: %s", (message) => {
    expect(detectCurrentTimeRequest(message)).not.toBeNull();
  });

  it.each(["Explique o que e fuso horario", "O que e horario de verao?", "Explain time zones"])("nao roteia pergunta conceitual: %s", async (message) => {
    expect(detectCurrentTimeRequest(message)).toBeNull();
    expect(await routeTool({ message, requestId: "r", signal, fetchImpl: vi.fn() })).toBeNull();
  });

  it("resolve timezone e converte hora/data com Intl", async () => {
    const result = await executeCurrentTimeTool({ message: "Que horas sao em Tokyo?", requestId: "r", signal,
      now: new Date("2026-08-17T18:42:00Z"), fetchImpl: async () => json(tokyo) });
    expect(result).toMatchObject({ ok: true, data: { timezone: "Asia/Tokyo", currentTime: "03:42", currentDate: "2026-08-18", source: "open-meteo-geocoding+server-clock" } });
    expect(formatTimeCurrent(result.data!, "pt-BR")).toContain("03:42 do dia 18/08/2026");
    expect(formatTimeCurrent(result.data!, "en")).toContain("2026-08-18");
  });

  it("roteia em portugues e ingles", async () => {
    const fetchImpl = async () => json(tokyo);
    expect((await routeTool({ message: "Que horas sao em Tokyo?", requestId: "r", signal, fetchImpl }))?.tool).toBe("time.current");
    expect((await routeTool({ message: "What time is it in Tokyo?", requestId: "r", signal, fetchImpl }))?.language).toBe("en");
  });

  it("envia ao geocoding somente a localizacao", async () => {
    let requested = "";
    await executeCurrentTimeTool({ message: "Que horas sao em Tokyo?", requestId: "private-request", signal,
      fetchImpl: async (input) => { requested = String(input); return json(tokyo); } });
    expect(new URL(requested).searchParams.get("name")).toBe("Tokyo");
    expect(requested).not.toContain("private-request");
  });

  it("trata cidade inexistente e ambigua", async () => {
    const missing = await executeCurrentTimeTool({ message: "Que horas sao em Narnia?", requestId: "r", signal, fetchImpl: async () => json({ results: [] }) });
    expect(missing).toMatchObject({ ok: false, error: { code: "not_found" } });
    const ambiguous = await executeCurrentTimeTool({ message: "Que horas sao em Paris?", requestId: "r", signal, fetchImpl: async () => json({ results: [
      { name: "Paris", country: "France", latitude: 1, longitude: 1, timezone: "Europe/Paris" },
      { name: "Paris", country: "USA", latitude: 2, longitude: 2, timezone: "America/Chicago" }] }) });
    expect(ambiguous).toMatchObject({ ok: false, error: { code: "ambiguous_location" } });
  });

  it("normaliza erro HTTP e timeout", async () => {
    expect(await executeCurrentTimeTool({ message: "Que horas sao em Tokyo?", requestId: "r", signal, fetchImpl: async () => json({}, 503) })).toMatchObject({ error: { code: "unavailable" } });
    const timeout = await executeCurrentTimeTool({ message: "Que horas sao em Tokyo?", requestId: "r", signal, timeoutMs: 1,
      fetchImpl: async (_input, init) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })) });
    expect(timeout).toMatchObject({ error: { code: "timeout" } });
  });

  it("respeita AbortSignal sem iniciar fetch", async () => {
    const controller = new AbortController(); controller.abort(); const fetchImpl = vi.fn();
    const result = await executeCurrentTimeTool({ message: "Que horas sao em Tokyo?", requestId: "r", signal: controller.signal, fetchImpl });
    expect(result).toMatchObject({ error: { code: "aborted" } }); expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("grounding aceita horario real e rejeita horario ou data alterados", async () => {
    const result = await executeCurrentTimeTool({ message: "Que horas sao em Tokyo?", requestId: "r", signal,
      now: new Date("2026-08-17T18:42:00Z"), fetchImpl: async () => json(tokyo) });
    const context = createTimeGroundedContext(result, "pt-BR");
    expect(buildGroundedSynthesisRequest({ context }).messages[0]?.text).toContain("currentTime: 03:42");
    expect(validateGroundedSynthesis("Em Tokyo sao 03:42 de 2026-08-18.", context).valid).toBe(true);
    expect(validateGroundedSynthesis("Em Tokyo sao 04:15.", context).valid).toBe(false);
    expect(validateGroundedSynthesis("A data e 2026-08-19.", context).valid).toBe(false);
  });
});
