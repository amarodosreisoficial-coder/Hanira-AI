import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildAnalysisInput, ikigaiAnalysisRequestSchema, validateIkigaiAnalysis } from "@/lib/ikigai/analysis-contract";
import { parseGeneratedAnalysis } from "@/lib/ikigai/analysis-generator";
import { IkigaiAnalysisResult } from "@/components/ikigai/ikigai-analysis";
import { analysisAnswers, createAnalysisReport } from "./helpers/ikigai-analysis";

const input = () => buildAnalysisInput(analysisAnswers, []);
describe("Ikigai: análise versionada e fundamentação", () => {
  it("analisa cinco respostas sem história ou aprofundamento", () => {
    expect(validateIkigaiAnalysis(createAnalysisReport(), input()).contractVersion).toBe("1.0");
    expect(input().answers.story).toBe("");
    const withoutStory: Partial<typeof analysisAnswers> = { ...analysisAnswers };
    delete withoutStory.story;
    expect(ikigaiAnalysisRequestSchema.parse({ analysisConsent: true, answers: withoutStory }).answers.story).toBe("");
  });

  it("exige consentimento específico, sem reaproveitar consentimento da entrevista", () => {
    for (const payload of [{ consent: true, answers: analysisAnswers }, { analysisConsent: false, answers: analysisAnswers }]) {
      expect(ikigaiAnalysisRequestSchema.safeParse(payload).success).toBe(false);
    }
  });

  it("filtra respostas puladas e usa somente fontes respondidas como evidência", () => {
    const payload = buildAnalysisInput(analysisAnswers, [
      { id: "nira-1", text: "Que recurso falta para criar sua escola?", answer: "Falta tempo para ensinar" },
      { id: "nira-2", text: "Qual papel a tecnologia teria nesse projeto?", answer: "  " },
    ]);
    expect(payload.followUps).toHaveLength(1);
    const report = createAnalysisReport();
    report.challenges = [{ text: "Falta tempo para ensinar", evidence: [{ source: "nira-1", quote: "Falta tempo para ensinar" }] }];
    expect(validateIkigaiAnalysis(report, payload).challenges).toHaveLength(1);
    report.challenges[0].evidence[0].source = "nira-2";
    expect(() => validateIkigaiAnalysis(report, payload)).toThrow();
  });

  it("aceita história opcional preenchida e valida sua evidência", () => {
    const payload = buildAnalysisInput({ ...analysisAnswers, story: "Tenho dúvida sobre o tempo para ensinar" }, []);
    const report = createAnalysisReport();
    report.challenges = [{ text: payload.answers.story, evidence: [{ source: "story", quote: payload.answers.story }] }];
    expect(validateIkigaiAnalysis(report, payload).challenges[0].text).toContain("dúvida");
    expect(() => validateIkigaiAnalysis(report, input())).toThrow();
  });

  it("rejeita JSON malformado, campo obrigatório ausente e versão desconhecida", () => {
    expect(() => parseGeneratedAnalysis("not JSON personal", input())).toThrow("INVALID_IKIGAI_ANALYSIS");
    const incomplete: Partial<ReturnType<typeof createAnalysisReport>> = createAnalysisReport();
    delete incomplete.actionPlan;
    expect(() => validateIkigaiAnalysis(incomplete, input())).toThrow();
    expect(() => validateIkigaiAnalysis({ ...createAnalysisReport(), contractVersion: "2" }, input())).toThrow();
  });

  it("rejeita referências inexistentes e citações inventadas", () => {
    const report = createAnalysisReport();
    report.passions[0].evidence[0].source = "nira-3";
    expect(() => validateIkigaiAnalysis(report, input())).toThrow();
    report.passions[0].evidence = [{ source: "love", quote: "Ensinar robótica avançada" }];
    expect(() => validateIkigaiAnalysis(report, input())).toThrow();
  });

  it("rejeita interpretações sem vínculo lexical, diplomas inventados e obstáculos inferidos", () => {
    const report = createAnalysisReport();
    report.strengths[0].text = "Sua experiência com agricultura parece consolidada.";
    expect(() => validateIkigaiAnalysis(report, input())).toThrow();
    report.strengths[0].text = "Seu doutorado para escutar estudantes é uma conquista demonstrada.";
    expect(() => validateIkigaiAnalysis(report, input())).toThrow();
    const other = createAnalysisReport();
    other.challenges = [{ text: "Criar uma escola", evidence: [{ source: "future", quote: "Criar uma escola" }] }];
    expect(() => validateIkigaiAnalysis(other, input())).toThrow();
  });

  it("rejeita percentuais psicológicos, campos extras e mais de três direções", () => {
    const report = createAnalysisReport();
    expect(() => validateIkigaiAnalysis({ ...report, reflection: "Você tem 99% de compatibilidade psicológica com ensinar." }, input())).toThrow();
    expect(() => validateIkigaiAnalysis({ ...report, score: 98 }, input())).toThrow();
    report.possibleDirections = Array.from({ length: 4 }, () => report.possibleDirections[0]);
    expect(() => validateIkigaiAnalysis(report, input())).toThrow();
  });

  it("renderiza dimensões, evidências e plano sem liberar PDF", () => {
    const html = renderToStaticMarkup(<IkigaiAnalysisResult report={createAnalysisReport()} input={input()} onEdit={() => {}} onDiscard={() => {}} onRestart={() => {}} />);
    expect(html).toContain("Seu Ikigai personalizado");
    expect(html).toContain("Ver base nas suas respostas");
    for (const days of [7, 30, 90]) expect(html).toContain(`Nos próximos ${days} dias`);
    expect(html).toContain("Possibilidade a explorar");
    expect(html).toContain("Nenhum obstáculo explícito");
    expect(html).toContain("Baixar meu Ikigai em PDF");
  });

  it("não altera o questionário nem o objeto retornado durante validação", () => {
    const data = input(); const report = createAnalysisReport();
    const before = JSON.stringify({ data, report });
    validateIkigaiAnalysis(report, data);
    expect(JSON.stringify({ data, report })).toBe(before);
  });
});
