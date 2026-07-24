import "server-only";

function cleanLine(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function buildSystemPrompt(options: {
  baseInstructions: string;
  personalityInstructions?: string;
  projectLabel: string;
  relevantMemories?: string[];
}) {
  const sections = [
    {
      title: "Regras da aplicacao",
      body: cleanLine(options.baseInstructions),
    },
    {
      title: "Contexto do projeto",
      body: cleanLine(
        `Projeto ativo: ${options.projectLabel}.\nRestrinja a resposta a este contexto e nao misture dados de outros projetos.`,
      ),
    },
    {
      title: "Personalizacao validada",
      body: cleanLine(options.personalityInstructions),
    },
    {
      title: "Memorias relevantes",
      body:
        options.relevantMemories
          ?.map((memory) => cleanLine(memory))
          .filter((memory): memory is string => Boolean(memory))
          .map((memory) => `- ${memory}`)
          .join("\n") ?? null,
    },
  ].filter((section) => section.body);

  return sections
    .map((section) => `### ${section.title}\n${section.body}`)
    .join("\n\n");
}
