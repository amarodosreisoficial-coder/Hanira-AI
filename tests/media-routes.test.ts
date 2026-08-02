import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function route(relative: string) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

describe("contratos das rotas de voz e visao", () => {
  it.each([
    "app/api/attachments/route.ts",
    "app/api/audio/transcribe/route.ts",
    "app/api/audio/speech/route.ts",
  ])("exige sessao em %s", (file) => {
    expect(route(file)).toContain("requireSessionUser");
  });

  it("transcricao usa configuracao central, timeout e logs seguros", () => {
    const source = route("app/api/audio/transcribe/route.ts");
    expect(source).toContain('from "@/lib/ai/models"');
    expect(source).toContain("getOpenAIVoiceConfig().transcription");
    expect(source).toContain("60_000");
    expect(source).toContain("logServerEvent");
    expect(source).not.toContain("console.log");
  });

  it("sintese limita payload e entrega MIME de audio", () => {
    const source = route("app/api/audio/speech/route.ts");
    expect(source).toContain("speechRequestSchema");
    expect(source).toContain('"Content-Type": "audio/mpeg"');
    expect(source).toContain("checkRateLimit");
  });

  it("chat principal usa anexos proprios e roteamento explicito por capacidade", () => {
    const source = route("app/api/chat/route.ts");
    expect(source).toContain("getOwnedAttachments");
    expect(source).toContain("routeChatCapability");
    expect(source).toContain("capability_routing_selected");
    expect(source).not.toContain('"input_image"');
    expect(source).not.toContain("signedUrl");
  });
});
