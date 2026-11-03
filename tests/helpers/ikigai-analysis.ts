import type { IkigaiAnalysis } from "@/lib/ikigai/analysis-contract";

export const analysisAnswers = { identity: "Sou professora", love: "Ensinar com tecnologia", strengths: "Escutar estudantes", impact: "Apoiar jovens", future: "Criar uma escola", story: "" };
export function createAnalysisReport(): IkigaiAnalysis {
  const love = [{ source: "love" as const, quote: "Ensinar com tecnologia" }];
  const strengths = [{ source: "strengths" as const, quote: "Escutar estudantes" }];
  const future = [{ source: "future" as const, quote: "Criar uma escola" }];
  const impact = [{ source: "impact" as const, quote: "Apoiar jovens" }];
  return {
    contractVersion: "1.0", title: "Ensinar e escutar com propósito",
    synthesis: { kind: "interpretation", text: "Ensinar com tecnologia e escutar estudantes sugere uma direção ligada à aprendizagem e ao cuidado com quem aprende.", evidence: [...love, ...strengths] },
    passions: [{ kind: "interpretation", text: "Ensinar com tecnologia parece ser uma fonte de realização para você.", evidence: love }],
    strengths: [{ kind: "interpretation", text: "Escutar estudantes sugere uma habilidade de acolhimento que você reconhece em si.", evidence: strengths }],
    values: [{ kind: "interpretation", text: "Apoiar jovens pode indicar valorização de vínculos e oportunidades de aprendizagem.", evidence: impact }],
    contribution: [{ kind: "interpretation", text: "Apoiar jovens parece expressar sua vontade de contribuir para outras trajetórias.", evidence: impact }],
    sustainablePaths: [{ kind: "possibility", text: "Experimente ensinar com tecnologia em encontros curtos, respeitando sua rotina e seus recursos.", evidence: love }],
    possibleDirections: [{ kind: "possibility", text: "Uma possibilidade é explorar a ideia de criar uma escola em um pequeno projeto educativo antes de compromissos maiores.", evidence: future }],
    challenges: [],
    actionPlan: {
      days7: { kind: "possibility", text: "Reserve um momento nesta semana para ensinar com tecnologia em uma atividade pequena.", evidence: love },
      days30: { kind: "possibility", text: "Experimente escutar estudantes sobre uma necessidade de aprendizagem ao longo do mês.", evidence: strengths },
      days90: { kind: "possibility", text: "Reavalie a ideia de criar uma escola a partir dos experimentos, sem assumir que precisa mudar de carreira.", evidence: future },
    },
    reflection: "Use esta leitura como um convite para refletir. Observe o que faz sentido hoje e permita que seus próximos passos mudem conforme suas experiências.",
  };
}

export function createGeneratedAnalysisReport() {
  const report = createAnalysisReport();
  const item = (value: IkigaiAnalysis["passions"][number]) => ({ ...value, evidence: value.evidence.map(({ source }) => `${source}:1`) });
  return { ...report, synthesis: item(report.synthesis), passions: report.passions.map(item), strengths: report.strengths.map(item),
    values: report.values.map(item), contribution: report.contribution.map(item), sustainablePaths: report.sustainablePaths.map(item), possibleDirections: report.possibleDirections.map(item),
    challenges: [] as { evidenceId: string }[], actionPlan: { days7: item(report.actionPlan.days7), days30: item(report.actionPlan.days30), days90: item(report.actionPlan.days90) } };
}
