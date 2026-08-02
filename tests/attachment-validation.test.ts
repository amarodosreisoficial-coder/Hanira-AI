import { describe, expect, it } from "vitest";
import {
  inferAttachmentTypeFromMimeType,
  validateMediaFile,
} from "../lib/validation/media";

describe("validacao central por tipo de anexo", () => {
  it("reconhece documentos e valida txt, md e pdf", async () => {
    expect(inferAttachmentTypeFromMimeType("text/plain")).toBe("document");
    expect(inferAttachmentTypeFromMimeType("text/markdown")).toBe("document");
    expect(inferAttachmentTypeFromMimeType("application/pdf")).toBe("document");

    await expect(
      validateMediaFile(
        new File(["texto"], "arquivo.txt", { type: "text/plain" }),
        "document",
      ),
    ).resolves.toMatchObject({ extension: "txt", mimeType: "text/plain" });

    await expect(
      validateMediaFile(
        new File(["# titulo"], "arquivo.md", { type: "text/markdown" }),
        "document",
      ),
    ).resolves.toMatchObject({ extension: "md", mimeType: "text/markdown" });
  });

  it("rejeita extensao incoerente e documento vazio", async () => {
    await expect(
      validateMediaFile(new File([], "vazio.txt", { type: "text/plain" }), "document"),
    ).rejects.toThrow("vazio");
    await expect(
      validateMediaFile(
        new File(["texto"], "arquivo.pdf", { type: "text/plain" }),
        "document",
      ),
    ).rejects.toThrow("extensao");
  });
});
