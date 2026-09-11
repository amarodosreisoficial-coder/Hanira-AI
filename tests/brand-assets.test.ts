import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readPngDimensions(relativePath: string) {
  const bytes = readFileSync(join(process.cwd(), relativePath));
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

describe("assets oficiais derivados da Hanira", () => {
  it.each([
    ["public/icons/hanira-192.png", 192, 192],
    ["public/icons/hanira-512.png", 512, 512],
    ["public/icons/hanira-maskable-512.png", 512, 512],
    ["app/apple-icon.png", 180, 180],
    ["app/icon.png", 512, 512],
    ["public/brand/hanira-social.png", 1200, 630],
  ])("valida PNG e dimensões de %s", (path, width, height) => {
    expect(readPngDimensions(path)).toEqual({ width, height });
  });

  it("mantém um favicon ICO versionado no segmento raiz", () => {
    const bytes = readFileSync(join(process.cwd(), "app/favicon.ico"));
    expect(bytes.readUInt16LE(0)).toBe(0);
    expect(bytes.readUInt16LE(2)).toBe(1);
    expect(bytes.readUInt16LE(4)).toBeGreaterThan(0);
  });
});
