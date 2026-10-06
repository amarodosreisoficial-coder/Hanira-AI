import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("contrato Browser TTS V1", () => {
  it("usa somente speechSynthesis local no controle normal", () => {
    const controls = source("components/voice/speech-controls.tsx");
    expect(controls).toContain("speechSynthesis");
    expect(controls).not.toContain("requestSpeech");
    expect(controls).not.toContain("/api/audio/speech");
    expect(controls).not.toContain("fetch(");
    expect(controls).not.toContain("autoSpeak");
  });

  it("mantém STT e conversa ao vivo fora dos pontos de entrada normais", () => {
    const chat = source("components/chat/chat-interface.tsx");
    const composer = source("components/chat/chat-composer.tsx");
    expect(chat).not.toContain("VoiceConversationModal");
    expect(composer).toMatch(/disabled\s+aria-label="Transcrição de áudio indisponível"/);
  });
});
