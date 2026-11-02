import type { IkigaiAnswers, IkigaiProfilePreview, IkigaiQuestionId } from "./types";

export const IKIGAI_MAX_LENGTH = 3000;
export const IKIGAI_QUESTIONS: { id: IkigaiQuestionId; label: string; placeholder: string }[] = [
  { id: "identity", label: "Quem é você hoje?", placeholder: "Conte seu momento de vida, sua rotina e o que importa para você." },
  { id: "love", label: "O que você mais gosta de fazer?", placeholder: "Quais atividades despertam sua curiosidade e fazem o tempo passar?" },
  { id: "strengths", label: "Em que você sente que é bom ou tem potencial?", placeholder: "Pense em habilidades, qualidades e coisas que gostaria de aprender." },
  { id: "impact", label: "Que tipo de impacto gostaria de causar no mundo ou nas pessoas?", placeholder: "Quem você gostaria de ajudar? Que mudança gostaria de ver?" },
  { id: "future", label: "O que você gostaria de construir para sua vida nos próximos anos?", placeholder: "Imagine seus projetos, relações e caminhos de realização." },
];

export function createIkigaiAnswers(): IkigaiAnswers {
  return { identity: "", love: "", strengths: "", impact: "", future: "", story: "" };
}

export function answeredQuestions(answers: IkigaiAnswers): number {
  return IKIGAI_QUESTIONS.filter(({ id }) => answers[id].trim().length > 0).length;
}

export function isIkigaiReady(answers: IkigaiAnswers): boolean {
  return answeredQuestions(answers) === IKIGAI_QUESTIONS.length;
}

export function buildIkigaiPreview(answers: IkigaiAnswers): IkigaiProfilePreview {
  return {
    identity: answers.identity.trim(),
    story: answers.story.trim(),
    areas: [
      { id: "love", title: "O que você ama", text: answers.love.trim() },
      { id: "strengths", title: "No que você é bom", text: answers.strengths.trim() },
      { id: "impact", title: "Como pode contribuir", text: answers.impact.trim() },
      { id: "future", title: "Seu caminho de realização", text: answers.future.trim() },
    ],
  };
}
