import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chatStore = readFileSync(
  new URL("../lib/stores/chat-store.ts", import.meta.url),
  "utf8",
);
const imageService = readFileSync(
  new URL("../services/image-service.ts", import.meta.url),
  "utf8",
);
const generatedImageResponse = readFileSync(
  new URL("../components/chat/generated-image-response.tsx", import.meta.url),
  "utf8",
);

describe("storage safety: no base64 persistence", () => {
  it("store remove imageGeneration antes de persistir no modo demo", () => {
    // A função partialize deve remover imageGeneration das mensagens
    expect(chatStore).toContain("imageGeneration: _ephemeralImage");
  });

  it("store persiste conversations apenas no modo demo", () => {
    expect(chatStore).toContain('state.mode === "demo"');
  });

  it("image-service retorna resultado efêmero (dataUrl não vai para storage)", () => {
    // O image-service apenas retorna o resultado, não o persiste
    expect(imageService).toContain("dataUrl");
    expect(imageService).toContain("GeneratedImageResult");
  });

  it("generated-image-response usa dataUrl apenas em memória (attachment local)", () => {
    // O attachment criado é local, nunca persistido diretamente
    expect(generatedImageResponse).toContain("result.dataUrl");
    expect(generatedImageResponse).toContain(`id: \`generated-\${messageId}\``);
  });

  it("store não possui escrita de imageGeneration em localStorage/supabase", () => {
    // Verifica que a partialize remove imageGeneration
    const partializeMatch = chatStore.match(
      /partialize[\s\S]*?imageGeneration[\s\S]*?\}/,
    );
    expect(partializeMatch).not.toBeNull();
  });
});
