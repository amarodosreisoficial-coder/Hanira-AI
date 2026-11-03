import { describe, expect, it } from "vitest";
import { buildAnalysisInput, validateIkigaiAnalysis } from "@/lib/ikigai/analysis-contract";
import { analysisAnswers, createAnalysisReport } from "./helpers/ikigai-analysis";

const input = () => buildAnalysisInput(analysisAnswers, []);
function passion(text: string) {
  const report = createAnalysisReport();
  report.passions[0].text = text;
  return report;
}

describe("fundamentação com dados fictícios", () => {
  it("reconhece sinônimo controlado mantendo outra âncora da evidência", () => {
    expect(() => validateIkigaiAnalysis(passion("Lecionar com tecnologias parece uma possibilidade de realização."), input())).not.toThrow();
  });
  it("reconhece flexões verbais e de número", () => {
    expect(() => validateIkigaiAnalysis(passion("Ensinando com tecnologias você pode explorar novos encontros."), input())).not.toThrow();
  });
  it("reconhece flexões de gênero e número em famílias explícitas", () => {
    const data = buildAnalysisInput({ ...analysisAnswers, love: "Ensinar com tecnologia; educadora comunitária" }, []);
    const report = passion("Educadores comunitários parecem valorizar esses encontros.");
    report.passions[0].evidence = [{ source: "love", quote: "educadora comunitária" }];
    expect(() => validateIkigaiAnalysis(report, data)).not.toThrow();
  });
  it("normaliza acentos e Unicode em ambas as âncoras", () => {
    const data = buildAnalysisInput({ ...analysisAnswers, love: "Ensinar com tecnologia; Organizar a educação comunitária" }, []);
    const report = passion("Organizando a educação comunitaria você pode experimentar algo novo.");
    report.passions[0].evidence = [{ source: "love", quote: "Organizar a educação comunitária" }];
    expect(() => validateIkigaiAnalysis(report, data)).not.toThrow();
  });
  it("rejeita uma palavra isolada associada a fatos inventados", () => {
    expect(() => validateIkigaiAnalysis(passion("Tecnologia comprova que você liderou uma missão espacial na NASA."), input())).toThrow();
  });
  it("rejeita afirmação categórica inventada mesmo com duas âncoras", () => {
    expect(() => validateIkigaiAnalysis(passion("Ensinar com tecnologia comprova que você mora em Marte."), input())).toThrow();
  });
  it("rejeita um fato pessoal não citado mesmo com duas âncoras", () => {
    expect(() => validateIkigaiAnalysis(passion("Ensinar com tecnologia sugere que você mora em Marte."), input())).toThrow();
  });
  it("rejeita qualificações não informadas", () => {
    expect(() => validateIkigaiAnalysis(passion("Ensinar com tecnologia comprova que você possui um doutorado."), input())).toThrow();
  });
  it("rejeita conquista não informada mesmo com duas âncoras", () => {
    expect(() => validateIkigaiAnalysis(passion("Ensinar com tecnologia prova que você ganhou um prêmio nacional."), input())).toThrow();
  });
  it("não inverte uma negativa explicitamente informada", () => {
    const data = buildAnalysisInput({ ...analysisAnswers, love: "Ensinar com tecnologia; Não organizo educação comunitária" }, []);
    const report = passion("Organizar educação comunitária parece fazer parte da sua rotina.");
    report.passions[0].evidence = [{ source: "love", quote: "Não organizo educação comunitária" }];
    expect(() => validateIkigaiAnalysis(report, data)).toThrow();
  });
  it("rejeita fontes citadas sem relação com a interpretação", () => {
    const report = passion("Ensinar com tecnologia parece uma fonte de realização.");
    report.passions[0].evidence.push({ source: "impact", quote: analysisAnswers.impact });
    expect(() => validateIkigaiAnalysis(report, input())).toThrow();
  });
});
