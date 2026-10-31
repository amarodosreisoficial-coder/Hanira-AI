import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { IkigaiPage } from "@/components/ikigai/ikigai-page";
import { IkigaiPreview } from "@/components/ikigai/ikigai-preview";
import { buildIkigaiPreview, createIkigaiAnswers, isIkigaiReady, answeredQuestions, IKIGAI_QUESTIONS } from "@/lib/ikigai/flow";

const { requireSession } = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requirePageSessionUser: requireSession }));

describe("Ikigai: fundação local", () => {
  it("renderiza apresentação, estado vazio e avisos acessíveis", () => {
    const html = renderToStaticMarkup(<IkigaiPage />);
    expect(html).toContain("Descubra seu");
    expect(html).toContain("Iniciar meu Ikigai");
    expect(html).toContain("Seu mapa de Ikigai aparecerá aqui");
    expect(html).toContain('aria-label="Etapas do Ikigai"');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Ao sair ou recarregar");
    expect(html).toContain("sem envio para análise, banco de dados ou memória da Nira");
  });

  it("rota exige sessão com retorno para /ikigai", async () => {
    const { default: Page } = await import("@/app/ikigai/page");
    requireSession.mockResolvedValue({ displayName: "Pessoa" });
    const html = renderToStaticMarkup(await Page());
    expect(requireSession).toHaveBeenCalledWith("/ikigai");
    expect(html).toContain("Iniciar meu Ikigai");
  });

  it("exige as cinco respostas e ignora espaços em branco", () => {
    const answers = createIkigaiAnswers();
    answers.story = "Uma história opcional";
    answers.identity = "   ";
    expect(isIkigaiReady(answers)).toBe(false);
    expect(answeredQuestions(answers)).toBe(0);
    for (const { id } of IKIGAI_QUESTIONS) answers[id] = `Resposta ${id}`;
    expect(isIkigaiReady(answers)).toBe(true);
    expect(answeredQuestions(answers)).toBe(5);
    answers.impact = "";
    expect(isIkigaiReady(answers)).toBe(false);
  });

  it("organiza as palavras sem inventar análise e escapa HTML", () => {
    const answers = { ...createIkigaiAnswers(), identity: "  Sou artista  ", love: "<script>alert(1)</script>", strengths: "Desenhar", impact: "Ensinar", future: "Um ateliê", story: "Minha história" };
    const profile = buildIkigaiPreview(answers);
    expect(profile.identity).toBe("Sou artista");
    expect(profile.areas.map(({ text }) => text)).toEqual([answers.love, "Desenhar", "Ensinar", "Um ateliê"]);
    const html = renderToStaticMarkup(<IkigaiPreview profile={profile} />);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Minha história");
    expect(html).toContain("não é uma análise da Nira");
  });

  it("instâncias começam independentes e vazias", () => {
    const first = createIkigaiAnswers();
    first.love = "Música";
    expect(createIkigaiAnswers().love).toBe("");
  });
});
