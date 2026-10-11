import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Pacote 18.3.5 — composer unificado + microfone inline + sidebar colapsável", () => {
  const composer = source("components/chat/chat-composer.tsx");
  const recorder = source("components/voice/voice-recorder.tsx");
  const sidebar = source("components/chat/sidebar.tsx");

  it("mantém o microfone condicionado aos gates e com requestMediaAccess", () => {
    // Contrato STT (regressão): gates e ponto de entrada preservados.
    expect(composer).toContain(
      'disabled={!sttAvailable || !browserCanRecord || !settings.transcriptionEnabled || store.mode === "demo"}',
    );
    expect(composer).toContain('requestMediaAccess("microphone")');
  });

  it("agrupa ações secundárias em um menu '+' (sem botões soltos)", () => {
    expect(composer).toContain("hanira-menu");
    expect(composer).toContain('aria-label="Mais ações"');
    expect(composer).toContain("Anexar documento");
    expect(composer).toContain("Anexar imagem");
    expect(composer).toContain("Tirar foto");
  });

  it("mantém o microfone na mesma barra, ao lado do enviar", () => {
    // O microfone não é mais um card separado: fica no grupo de envio.
    expect(composer).toContain("Transcrever áudio do microfone");
    expect(composer).toContain("Enviar mensagem");
  });

  it("renderiza a gravação inline na mesma superfície (sem card acima)", () => {
    expect(composer).toContain("is-recording");
    expect(composer).toContain("inline");
    // O gravador em modo inline substitui o textarea dentro da superfície.
    expect(composer).toMatch(/recorderOpen\s*\?\s*\(\s*<VoiceRecorder/);
  });

  it("o gravador inline expõe waveform, duração, pausa, finalizar e cancelar", () => {
    expect(recorder).toContain("waveform");
    expect(recorder).toContain("is-paused");
    expect(recorder).toContain("Finalizar e transcrever");
    expect(recorder).toContain("Cancelar gravação");
    expect(recorder).toContain("Iniciar gravação");
  });

  it("preserva o fluxo de transcrição sem auto-send (texto vai ao composer)", () => {
    // onComplete do gravador escreve no draft do composer (edição manual).
    expect(composer).toContain("store.setDraft(nextDraft)");
  });

  it("sidebar continua colapsável com modo de ícones e rótulos de contrato", () => {
    expect(sidebar).toContain("Recolher barra lateral");
    expect(sidebar).toContain("Nova conversa");
    expect(sidebar).toContain("Buscar conversas");
    expect(sidebar).toContain("sidebarCollapsed");
  });
});
