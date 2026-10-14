import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Package 18.3.9 — Real Device Audio Validation.
// O painel manual de /diagnostics/audio ganhou PAUSAR / CONTINUAR / CANCELAR
// para que a validação em aparelho real cubra a camada de captura inteira
// (gravar → pausar → continuar → parar → cancelar) SEM chamar provider.
// Este teste fixa o contrato do painel por inspeção de fonte (mesmo padrão dos
// testes de contrato de UI do projeto) e garante o caráter local/efêmero.

const source = readFileSync(
  path.join(process.cwd(), "components/diagnostics/audio-diagnostic-panel.tsx"),
  "utf8",
);

describe("diagnostics manual controls — pause/resume/cancel (18.3.9)", () => {
  it("expõe os três controles novos no modo manual", () => {
    expect(source).toContain("PAUSAR");
    expect(source).toContain("CONTINUAR");
    expect(source).toContain("CANCELAR");
  });

  it("pausa/retomada só agem quando há capability real (nunca user-agent)", () => {
    // pause só chama recorder.pause() quando features.pauseResumeSupported.
    const pauseBlock = source.slice(
      source.indexOf("const pause = useCallback"),
      source.indexOf("const resume = useCallback"),
    );
    expect(pauseBlock).toContain('recorder?.state === "recording"');
    expect(pauseBlock).toContain("features?.pauseResumeSupported");
    expect(pauseBlock).toContain("recorder.pause()");

    const resumeBlock = source.slice(
      source.indexOf("const resume = useCallback"),
      source.indexOf("const cancelRecording = useCallback"),
    );
    expect(resumeBlock).toContain('recorder?.state === "paused"');
    expect(resumeBlock).toContain("features?.pauseResumeSupported");
    expect(resumeBlock).toContain("recorder.resume()");
  });

  it("estado PAUSED integra o ciclo (para-parar e botões ativos)", () => {
    expect(source).toContain('| "PAUSED"');
    // PARAR habilitado também durante PAUSED.
    expect(source).toContain('disabled={state !== "RECORDING" && state !== "PAUSED"}');
    // active inclui PAUSED (CANCELAR/LIMPAR continuam corretos).
    expect(source).toContain('state === "PAUSED"');
  });

  it("cancelar descarta o áudio (discardRef) sem montar Blob nem playback", () => {
    expect(source).toContain("discardRef.current = true");
    // onstop respeita o descarte antes de resolver o formato.
    const onstopBlock = source.slice(
      source.indexOf("recorder.onstop = () =>"),
      source.indexOf("const resolved = resolveRecordedAudioFormat"),
    );
    expect(onstopBlock).toContain("if (discardRef.current)");
    expect(onstopBlock).toContain('setMessage("Gravação descartada.")');
  });

  it("o painel manual continua sem qualquer chamada de provider/transcrição", () => {
    // Só a validação server-side SEM IA é permitida; nada de transcribe/STT.
    expect(source).not.toContain("transcribeAudio");
    expect(source).not.toContain("/api/audio/transcribe");
    expect(source).not.toContain("CloudflareWorkersAITranscriptionProvider");
    // O único fetch do painel é a validação de container (sem IA).
    expect(source).toContain("/api/diagnostics/audio/validate");
  });
});
