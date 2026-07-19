import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../app/api/health/route";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("health check público", () => {
  it("retorna somente metadados públicos no modo demo", async () => {
    process.env.HANIRA_DEMO_MODE = "true";
    process.env.NEXT_PUBLIC_APP_VERSION = "0.4.0";
    process.env.OPENAI_API_KEY = "sk-secret";
    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      app: "Hanira AI",
      version: "0.4.0",
      mode: "demo",
    });
    expect(JSON.stringify(body)).not.toContain("sk-secret");
  });
});
