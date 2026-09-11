import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../app/manifest";

describe("manifest da Hanira", () => {
  it("declara identidade, escopo e modo standalone", () => {
    const value = manifest();

    expect(value.name).toBe("Hanira AI");
    expect(value.short_name).toBe("Hanira");
    expect(value.description).toContain("Nira");
    expect(value.start_url).toBe("/");
    expect(value.scope).toBe("/");
    expect(value.display).toBe("standalone");
  });

  it("referencia ícones reais e uma variante maskable dedicada", () => {
    const icons = manifest().icons ?? [];

    expect(icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", purpose: "any" }),
        expect.objectContaining({ sizes: "512x512", purpose: "any" }),
        expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
      ]),
    );

    for (const icon of icons) {
      expect(existsSync(join(process.cwd(), "public", icon.src))).toBe(true);
      expect(icon.type).toBe("image/png");
    }
  });
});
