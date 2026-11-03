import { describe, expect, it } from "vitest";
import { classifyFailedGeneration } from "./helpers/groq-failed-generation";

describe("diagnóstico privado do smoke Groq", () => {
  it.each([
    ["not json", "body_invalid_json"],
    [JSON.stringify({ error: {} }), "not_available"],
    [JSON.stringify({ error: { failed_generation: "{partial private answer" } }), "generated_invalid_json"],
    [JSON.stringify({ error: { failed_generation: JSON.stringify({ title: "private answer" }) } }), "wire_invalid_value"],
  ])("extrai somente uma categoria fixa", (body, expected) => {
    const category = classifyFailedGeneration(body);
    expect(category).toBe(expected);
    expect(category).not.toContain("private");
  });
  it("limita o tamanho antes de analisar o corpo", () => {
    expect(classifyFailedGeneration("x".repeat(1_000_001))).toBe("body_too_large");
  });
});
