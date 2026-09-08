import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FREE_EXTRA_CANDIDATES_ENV,
  buildFreeCapacityCandidates,
  resolveFreeCapacityCandidates,
} from "../lib/ai/capacity/free-capacity-registry";
import { ModelRouterError } from "../lib/ai/router/errors";
import { NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID } from "../lib/ai/nira/profiles";
import type { RouterCandidate } from "../lib/ai/router/types";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function defaultCandidate(
  overrides: Partial<RouterCandidate> = {},
): RouterCandidate {
  return {
    id: NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
    provider: "groq",
    model: "openai/gpt-oss-20b",
    capabilities: ["text"],
    priority: 1,
    enabled: true,
    deployment: "cloud",
    costClass: "free",
    label: "Nira Cloud Free (Groq)",
    ...overrides,
  };
}

describe("Nira Free Capacity Registry (16.5)", () => {
  it("sem env extra: apenas o candidato padrao auditado", () => {
    const result = buildFreeCapacityCandidates({
      defaultCandidate: defaultCandidate(),
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].id).toBe(
      NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
    );
    expect(result.candidates[0].costClass).toBe("free");
    expect(result.candidates[0].priority).toBe(1);
    expect(result.extraCandidateIds).toEqual([]);
  });

  it("candidatos extra validos entram com prioridade crescente e capability text", () => {
    const result = buildFreeCapacityCandidates({
      defaultCandidate: defaultCandidate(),
      rawExtraCandidates: JSON.stringify([
        { id: "nira-cloud-free-secondary-1", model: "modelo-auditado-1" },
        {
          id: "nira-cloud-free-secondary-2",
          model: "modelo-auditado-2",
          enabled: false,
        },
      ]),
    });
    expect(result.candidates.map((candidate) => candidate.id)).toEqual([
      NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
      "nira-cloud-free-secondary-1",
      "nira-cloud-free-secondary-2",
    ]);
    expect(result.candidates[1].priority).toBe(2);
    expect(result.candidates[2].priority).toBe(3);
    expect(result.candidates[1].deployment).toBe("cloud");
    expect(result.candidates[1].capabilities).toEqual(["text"]);
    expect(result.candidates[2].enabled).toBe(false);
    expect(result.extraCandidateIds).toEqual([
      "nira-cloud-free-secondary-1",
      "nira-cloud-free-secondary-2",
    ]);
  });

  it("costClass NAO e configuravel: extra declarando paid continua free por construcao", () => {
    const result = buildFreeCapacityCandidates({
      defaultCandidate: defaultCandidate(),
      rawExtraCandidates: JSON.stringify([
        { id: "nira-cloud-free-x", model: "m", costClass: "paid" },
      ]),
    });
    expect(result.candidates[1].costClass).toBe("free");
  });

  it("fail-closed: JSON invalido, nao-array, id sem prefixo, duplicado, reservado, model vazio e provider nao auditado", () => {
    const base = { defaultCandidate: defaultCandidate() };

    expect(() =>
      buildFreeCapacityCandidates({ ...base, rawExtraCandidates: "{" }),
    ).toThrowError(ModelRouterError);

    expect(() =>
      buildFreeCapacityCandidates({
        ...base,
        rawExtraCandidates: '{"id":"x"}',
      }),
    ).toThrowError(ModelRouterError);

    expect(() =>
      buildFreeCapacityCandidates({
        ...base,
        rawExtraCandidates: JSON.stringify([
          { id: "fora-do-escopo", model: "m" },
        ]),
      }),
    ).toThrowError(ModelRouterError);

    expect(() =>
      buildFreeCapacityCandidates({
        ...base,
        rawExtraCandidates: JSON.stringify([
          { id: "nira-cloud-free-a", model: "m" },
          { id: "nira-cloud-free-a", model: "m2" },
        ]),
      }),
    ).toThrowError(ModelRouterError);

    expect(() =>
      buildFreeCapacityCandidates({
        ...base,
        rawExtraCandidates: JSON.stringify([
          { id: NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID, model: "m" },
        ]),
      }),
    ).toThrowError(ModelRouterError);

    expect(() =>
      buildFreeCapacityCandidates({
        ...base,
        rawExtraCandidates: JSON.stringify([
          { id: "nira-cloud-free-b", model: "" },
        ]),
      }),
    ).toThrowError(ModelRouterError);

    expect(() =>
      buildFreeCapacityCandidates({
        ...base,
        rawExtraCandidates: JSON.stringify([
          { id: "nira-cloud-free-c", model: "m", provider: "openai" },
        ]),
      }),
    ).toThrowError(ModelRouterError);
  });

  it("fail-closed: candidato padrao invalido e rejeitado (protecao do composition root)", () => {
    expect(() =>
      buildFreeCapacityCandidates({
        defaultCandidate: defaultCandidate({ costClass: "paid" }),
      }),
    ).toThrowError(ModelRouterError);
    expect(() =>
      buildFreeCapacityCandidates({
        defaultCandidate: defaultCandidate({ id: "outro" }),
      }),
    ).toThrowError(ModelRouterError);
    expect(() =>
      buildFreeCapacityCandidates({
        defaultCandidate: defaultCandidate({ provider: "openai" }),
      }),
    ).toThrowError(ModelRouterError);
    expect(() =>
      buildFreeCapacityCandidates({
        defaultCandidate: defaultCandidate({ enabled: false }),
      }),
    ).toThrowError(ModelRouterError);
  });

  it("env vazia/whitespace nao cria extras; resolve le a env", () => {
    delete process.env[FREE_EXTRA_CANDIDATES_ENV];
    const resolved = resolveFreeCapacityCandidates({
      defaultCandidate: defaultCandidate(),
    });
    expect(resolved.candidates).toHaveLength(1);

    vi.stubEnv(FREE_EXTRA_CANDIDATES_ENV, "   ");
    const resolvedBlank = resolveFreeCapacityCandidates({
      defaultCandidate: defaultCandidate(),
    });
    expect(resolvedBlank.candidates).toHaveLength(1);
    vi.unstubAllEnvs();

    vi.stubEnv(
      FREE_EXTRA_CANDIDATES_ENV,
      JSON.stringify([
        { id: "nira-cloud-free-secondary-1", model: "modelo-auditado-1" },
      ]),
    );
    const resolvedConfigured = resolveFreeCapacityCandidates({
      defaultCandidate: defaultCandidate(),
    });
    expect(resolvedConfigured.extraCandidateIds).toEqual([
      "nira-cloud-free-secondary-1",
    ]);
    vi.unstubAllEnvs();
  });
});