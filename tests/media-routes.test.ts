import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function route(relative: string) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

describe("contratos das rotas de voz e visão", () => {
  it.each([
    "app/api/attachments/route.ts",
    "app/api/audio/transcribe/route.ts",
    "app/api/audio/speech/route.ts",
  ])("exige sessão em %s", (file) => {
    expect(route(file)).toContain("requireSessionUser");
  });

  it("transcrição usa modelo central, timeout e logs seguros", () => {
    const source = route("app/api/audio/transcribe/route.ts");
    expect(source).toContain("getAIModelConfig().transcription");
    expect(source).toContain("60_000");
    expect(source).toContain("logServerEvent");
    expect(source).not.toContain("console.log");
  });

  it("síntese limita payload e entrega MIME de áudio", () => {
    const source = route("app/api/audio/speech/route.ts");
    expect(source).toContain("speechRequestSchema");
    expect(source).toContain('"Content-Type": "audio/mpeg"');
    expect(source).toContain("checkRateLimit");
  });

  it("chat multimodal usa IDs próprios e entrada de imagem", () => {
    const source = route("app/api/chat/route.ts");
    expect(source).toContain("getOwnedAttachments");
    expect(source).toContain('"input_image"');
    expect(source).toContain("attachmentImageDataUrl");
    expect(source).not.toContain("signedUrl");
  });
});
