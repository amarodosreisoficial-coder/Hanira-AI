import { afterEach, describe, expect, it } from "vitest";
import {
  getReleaseInfo,
  isValidCommitSha,
  normalizeCommitSha,
} from "../lib/version";
import { GET as healthGET } from "../app/api/health/route";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("package 17.6 — release identity", () => {
  it("valida SHA de commit com faixa hexagonal 7-40", () => {
    expect(isValidCommitSha("90fd5051534675bcb72a20df7ee60887cc335fc1")).toBe(true);
    expect(isValidCommitSha("90fd505")).toBe(true);
    expect(isValidCommitSha("abc")).toBe(false);
    expect(isValidCommitSha("ZZZZZZZ")).toBe(false);
    expect(isValidCommitSha(undefined)).toBe(false);
    expect(normalizeCommitSha("90FD505")).toBe("90fd505");
    expect(normalizeCommitSha("não é sha")).toBeNull();
  });

  it("resolve commit de VERCEL_GIT_COMMIT_SHA e ambiente preview", () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "90FD5051534675BCB72A20DF7EE60887CC335FC1";
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_APP_VERSION = "0.4.0";
    const release = getReleaseInfo();
    expect(release.commitSha).toBe("90fd5051534675bcb72a20df7ee60887cc335fc1");
    expect(release.environment).toBe("preview");
    expect(release.version).toBe("0.4.0");
  });

  it("fallback HANIRA_GIT_COMMIT_SHA e self-hosted sem Vercel", () => {
    process.env.HANIRA_GIT_COMMIT_SHA = "90fd505";
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.VERCEL_ENV;
    const release = getReleaseInfo();
    expect(release.commitSha).toBe("90fd505");
    expect(release.environment).toBe("self-hosted");
  });

  it("sha invalido vira null (nunca valor arbitrario do ambiente)", () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "meu-token-secreto-123";
    expect(getReleaseInfo().commitSha).toBeNull();
  });

  it("health publico expoe ambiente/version e NUNCA commit ou segredos", async () => {
    process.env.HANIRA_DEMO_MODE = "false";
    process.env.NEXT_PUBLIC_APP_VERSION = "0.4.0";
    process.env.VERCEL_GIT_COMMIT_SHA = "90fd5051534675bcb72a20df7ee60887cc335fc1";
    process.env.OPENAI_API_KEY = "sk-secret";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";
    const response = healthGET();
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.4.0");
    expect(body.environment).toBe("self-hosted");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("90fd505");
    expect(serialized).not.toContain("sk-secret");
    expect(serialized).not.toContain("service-secret");
  });
});
