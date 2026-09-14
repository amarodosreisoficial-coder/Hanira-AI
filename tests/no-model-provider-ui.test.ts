import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const composer = readFileSync(
  new URL("../components/chat/chat-composer.tsx", import.meta.url),
  "utf8",
);
const imageComposerOptions = readFileSync(
  new URL("../components/chat/image-composer-options.tsx", import.meta.url),
  "utf8",
);
const generatedImageResponse = readFileSync(
  new URL("../components/chat/generated-image-response.tsx", import.meta.url),
  "utf8",
);

describe("no model/provider UI in image mode", () => {
  it("composer não exibe modelId na UI de imagem", () => {
    expect(composer).not.toContain("modelId");
  });

  it("composer não exibe providerId na UI de imagem", () => {
    expect(composer).not.toContain("providerId");
  });

  it("image-composer-options não exibe Flux", () => {
    expect(imageComposerOptions).not.toContain("Flux");
  });

  it("image-composer-options não exibe Cloudflare", () => {
    expect(imageComposerOptions).not.toContain("Cloudflare");
  });

  it("generated-image-response não exibe modelId", () => {
    expect(generatedImageResponse).not.toContain("modelId");
  });

  it("generated-image-response não exibe providerId", () => {
    expect(generatedImageResponse).not.toContain("providerId");
  });

  it("generated-image-response não exibe Flux", () => {
    expect(generatedImageResponse).not.toContain("Flux");
  });

  it("generated-image-response não exibe Cloudflare", () => {
    expect(generatedImageResponse).not.toContain("Cloudflare");
  });
});
