import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeAudio } from "@/services/media-service";

const audio = new File(["audio"], "hanira-voz.webm", { type: "audio/webm" });

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Package 18.3.8 — o VoiceRecorder repassa `caught.message` direto para a UI.
// Estes testes garantem que a mensagem mostrada ao usuário é sempre amigável
// e em pt-BR: nada de "Failed to fetch", HTML de proxy ou corpo malformado.
describe("transcribeAudio — mensagens de erro seguras", () => {
  it("falha de rede vira aviso amigável em pt-BR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(transcribeAudio(audio)).rejects.toThrow(
      "Falha de conexão. Verifique sua internet e tente novamente.",
    );
  });

  it("cancelamento do usuário (AbortError) é propagado sem mensagem nova", async () => {
    const abort = new DOMException("aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
    await expect(transcribeAudio(audio)).rejects.toBe(abort);
  });

  it("resposta sem JSON válido usa a mensagem genérica", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>gateway</html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    await expect(transcribeAudio(audio)).rejects.toThrow(
      "Não foi possível transcrever o áudio.",
    );
  });

  it("preserva a mensagem segura do servidor quando existe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: "Aguarde antes de transcrever outro áudio." }, 429),
      ),
    );
    await expect(transcribeAudio(audio)).rejects.toThrow(
      "Aguarde antes de transcrever outro áudio.",
    );
  });

  it("corpo de erro vazio cai na mensagem genérica", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 500 })),
    );
    await expect(transcribeAudio(audio)).rejects.toThrow(
      "Não foi possível transcrever o áudio.",
    );
  });

  it("retorna o transcript quando o servidor responde ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ transcript: "Olá Nira" }, 200)),
    );
    await expect(transcribeAudio(audio)).resolves.toBe("Olá Nira");
  });

  it("transcript vazio é rejeitado com mensagem amigável", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ transcript: "   " }, 200)),
    );
    await expect(transcribeAudio(audio)).rejects.toThrow(
      "A transcrição retornou vazia.",
    );
  });
});
