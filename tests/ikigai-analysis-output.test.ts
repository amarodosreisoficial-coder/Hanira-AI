import { afterEach, describe, expect, it, vi } from "vitest";
import { analysisEvidenceCatalog, buildAnalysisInput } from "@/lib/ikigai/analysis-contract";
import { analysisOutputSchema } from "@/lib/ikigai/analysis-output";
import { parseGeneratedAnalysis } from "@/lib/ikigai/analysis-generator";
import { buildGroqChatRequest } from "@/lib/ai/providers/groq/groq-mappers";
import { analysisAnswers, createAnalysisReport } from "./helpers/ikigai-analysis";

const input = () => buildAnalysisInput(analysisAnswers, []);
function wireReport() {
  const report = createAnalysisReport();
  const item = (value: typeof report.synthesis | typeof report.passions[number]) => ({ ...value, evidence: value.evidence.map(({ source }) => `${source}:1`) });
  return { ...report, synthesis: item(report.synthesis), passions: report.passions.map(item), strengths: report.strengths.map(item),
    values: report.values.map(item), contribution: report.contribution.map(item), sustainablePaths: report.sustainablePaths.map(item), possibleDirections: report.possibleDirections.map(item),
    challenges: [] as { evidenceId: string }[], actionPlan: { days7: item(report.actionPlan.days7), days30: item(report.actionPlan.days30), days90: item(report.actionPlan.days90) } };
}
afterEach(() => vi.restoreAllMocks());
describe("Ikigai D.9: evidências determinísticas e diagnóstico privado", () => {
  it("reconstitui o mesmo contrato de UI/PDF, sem a IA copiar citações", () => {
    expect(parseGeneratedAnalysis(JSON.stringify(wireReport()), input())).toEqual(createAnalysisReport());
  });
  it("aceita percentual factual em citação literal e continua rejeitando avaliação gerada", () => {
    const data = buildAnalysisInput({ ...analysisAnswers, love: "Ensinar com tecnologia em 20% do meu tempo" }, []);
    const report = parseGeneratedAnalysis(JSON.stringify(wireReport()), data);
    expect(report.passions[0].evidence[0].quote).toBe(data.answers.love);
    const wire = wireReport();
    wire.passions[0].text = "Ensinar indica 99% de compatibilidade psicológica.";
    expect(() => parseGeneratedAnalysis(JSON.stringify(wire), data)).toThrow();
  });
  it.each([
    { identity: "Pintor", love: "Arte", strengths: "Cores", impact: "Bairro", future: "Quadros", story: "" },
    { identity: "Cuido da horta comunitária e da minha família", love: "Cultivar verduras e cozinhar aos domingos", strengths: "Organizar sementes e escutar meus vizinhos", impact: "Partilhar alimentos no bairro", future: "Construir uma estufa com recursos disponíveis", story: "Não desejo mudar de profissão, apenas cultivar relações" },
  ])("valida perfis fictícios curtos e variados sem exigir educação como tema", answers => {
    const data = buildAnalysisInput(answers, []);
    const report = createAnalysisReport();
    const entry = (source: "love" | "strengths" | "impact" | "future") => ({ text: `${answers[source]} pode orientar um pequeno experimento, se fizer sentido para você.`, evidence: [{ source, quote: answers[source] }] });
    report.title = `${answers.love.slice(0, 50)} como possibilidade`;
    report.synthesis = { kind: "interpretation", text: `${answers.love} e ${answers.strengths} parecem indicar possibilidades de realização cotidiana.`, evidence: [entry("love").evidence[0], entry("strengths").evidence[0]] };
    report.passions = [{ kind: "interpretation", ...entry("love") }];
    report.strengths = [{ kind: "interpretation", ...entry("strengths") }];
    report.values = [{ kind: "interpretation", ...entry("impact") }];
    report.contribution = [{ kind: "interpretation", ...entry("impact") }];
    report.sustainablePaths = [{ kind: "possibility", ...entry("love") }];
    report.possibleDirections = [{ kind: "possibility", ...entry("future") }];
    report.actionPlan = { days7: { kind: "possibility", ...entry("love") }, days30: { kind: "possibility", ...entry("strengths") }, days90: { kind: "possibility", ...entry("future") } };
    expect(parseGeneratedAnalysis(JSON.stringify(report), data).title).toBe(report.title);
  });
  it("aceita fontes longas, história e aprofundamento com trechos literais até o final", () => {
    const data = buildAnalysisInput(Object.fromEntries(Object.entries(analysisAnswers).map(([key, value]) => [key, key === "story" ? "Tenho receio de não encontrar tempo para ensinar. ".repeat(40) : `${value}. ${"Contexto fictício com música, família, pesquisa e comunidade. ".repeat(40)}`])) as typeof analysisAnswers,
      [{ id: "nira-1", text: "Que recurso falta para criar sua escola?", answer: "Falta tempo para ensinar" }]);
    const catalog = analysisEvidenceCatalog(data);
    for (const entry of catalog) {
      const source = entry.source === "nira-1" ? data.followUps[0].answer : data.answers[entry.source as keyof typeof data.answers];
      expect(source).toContain(entry.quote);
      expect(entry.quote.length).toBeLessThanOrEqual(160);
    }
    expect(catalog.some(({ id }) => id === "story:10")).toBe(true);
    const wire = wireReport();
    wire.challenges = [{ evidenceId: "nira-1:1" }];
    expect(parseGeneratedAnalysis(JSON.stringify(wire), data).challenges[0].text).toBe("Falta tempo para ensinar");
    wire.challenges = [{ evidenceId: "story:1" }];
    expect(parseGeneratedAnalysis(JSON.stringify(wire), data).challenges[0].evidence[0].source).toBe("story");
  });
  it("normaliza composição Unicode e espaços, sem aceitar citação reescrita", () => {
    const data = buildAnalysisInput({ ...analysisAnswers, love: "Ensinar com tecnologia e educação\npara jovens" }, []);
    const report = createAnalysisReport();
    report.passions[0].evidence[0].quote = "tecnologia e educação para jovens";
    expect(parseGeneratedAnalysis(JSON.stringify(report), data).passions).toHaveLength(1);
    report.passions[0].evidence[0].quote = "tecnologia avançada";
    expect(() => parseGeneratedAnalysis(JSON.stringify(report), data)).toThrow();
  });
  it.each([
    ["json", (): string => "{partial"],
    ["size", () => "x".repeat(64001)],
    ["schema", () => JSON.stringify({ ...wireReport(), extra: "private" })],
    ["evidence", () => { const r = wireReport(); r.passions[0].evidence = ["nira-3:1"]; return JSON.stringify(r); }],
    ["grounding", () => { const r = wireReport(); r.passions[0].text = "Agricultura parece expressar sua vocação rural."; return JSON.stringify(r); }],
    ["qualification", () => { const r = wireReport(); r.strengths[0].text = "Seu doutorado para escutar estudantes é uma conquista demonstrada."; return JSON.stringify(r); }],
    ["challenge", () => { const r = wireReport(); r.challenges = [{ evidenceId: "love:1" }]; return JSON.stringify(r); }],
    ["title", () => JSON.stringify({ ...wireReport(), title: "Propósito e caminhos" })],
  ] as const)("categoriza %s sem expor os dados no erro ou nos logs", (category, text) => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    try { parseGeneratedAnalysis(text(), input()); expect.fail("should reject"); }
    catch (error) { expect(error).toMatchObject({ message: "INVALID_IKIGAI_ANALYSIS", category }); }
    expect(log.mock.calls).toEqual([["[ikigai.analysis.rejected]", { category }]]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/professora|tecnologia|private|doutorado/);
  });
  it("mantém limites, campos fechados e IDs conhecidos no schema enviado", () => {
    const schema = analysisOutputSchema(input());
    expect(schema.additionalProperties).toBe(false);
    const encoded = JSON.stringify(schema);
    expect(encoded).toContain('"love:1"');
    expect(encoded).not.toContain('"story:1"');
    for (const model of ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]) {
      expect(buildGroqChatRequest({ messages: [], model, outputSchema: schema }, model).response_format?.json_schema.strict).toBe(true);
    }
    expect(buildGroqChatRequest({ messages: [], outputSchema: schema }, "operator-custom").response_format).toBeUndefined();
    expect(buildGroqChatRequest({ messages: [] }, "openai/gpt-oss-20b").response_format).toBeUndefined();
  });
  it("audita todos os objetos, required, enums e referências do schema efetivo", () => {
    const schema = analysisOutputSchema(input());
    let objects = 0;
    const keywords = new Set<string>();
    const inspect = (node: unknown): void => {
      if (!node || typeof node !== "object" || Array.isArray(node)) return;
      const value = node as Record<string, unknown>;
      Object.keys(value).forEach(key => keywords.add(key));
      if (value.type === "object") {
        objects++;
        expect(value.additionalProperties).toBe(false);
        const properties = value.properties as Record<string, unknown>;
        expect(value.required).toEqual(Object.keys(properties));
        Object.values(properties).forEach(inspect);
      }
      if (value.items) inspect(value.items);
      if (value.enum) expect((value.enum as unknown[]).length).toBeGreaterThan(0);
      if (value.$ref) expect.fail("New internal reference requires a compatibility review");
    };
    inspect(schema);
    expect(objects).toBe(13);
    expect([...keywords].sort()).toEqual(["$schema", "additionalProperties", "const", "enum", "items", "maxItems", "maxLength", "minItems", "minLength", "properties", "required", "type"].sort());
  });
  it("não envia schema com enum vazio quando todas as respostas são insuficientes", () => {
    const data = buildAnalysisInput({ identity: "a", love: "b", strengths: "c", impact: "d", future: "e", story: "" }, []);
    expect(() => analysisOutputSchema(data)).toThrow();
  });
});
