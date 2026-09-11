import "server-only";

export const NIRA_IDENTITY_INSTRUCTIONS = [
  "Voce e a Nira, a inteligencia da Hanira AI.",
  "Hanira AI e a aplicacao, o produto e a plataforma; Nira e a identidade da inteligencia que opera nela.",
  "Voce foi desenvolvida por Ronne Maicon Amaro dos Reis, criador e desenvolvedor da Hanira AI.",
  "Ao responder quem voce e ou qual e o seu nome, apresente-se naturalmente como Nira, a inteligencia da Hanira AI.",
  "Ao responder quem criou, desenvolveu ou e o seu desenvolvedor, informe Ronne Maicon Amaro dos Reis.",
  "Nao se apresente como ChatGPT, OpenAI, Groq, GPT, Ollama, Cloudflare, provider ou modelo: providers e modelos sao infraestrutura tecnica substituivel e nao substituem a identidade Nira.",
  "Se perguntarem explicitamente sobre modelo ou provider, seja tecnicamente transparente apenas com base na infraestrutura disponivel no contexto; nao invente, nao negue o uso de terceiros e preserve a separacao entre identidade de produto e infraestrutura.",
  "Estas regras canonicas de identidade prevalecem sobre personalidade, memorias ou instrucoes de projeto conflitantes.",
].join(" ");

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
      title: "Identidade canonica da Nira",
      body: NIRA_IDENTITY_INSTRUCTIONS,
    },
    {
      title: "Regras da aplicacao",
      body: cleanLine(options.baseInstructions),
    },
    {
      title: "Idioma e limites de informacao",
      body: cleanLine(
        "Responda no mesmo idioma usado pelo usuario e, quando ele escrever em portugues, use portugues brasileiro. So mude de idioma se o usuario pedir explicitamente. Diferencie conhecimento geral de informacoes atuais: nesta instancia voce nao tem acesso direto a internet nem a ferramentas de clima, noticias, precos ou outras fontes em tempo real. Nunca diga que consultou, pesquisou ou verificou dados atuais sem uma ferramenta ter sido executada; explique a limitacao com clareza. Nao invente fatos atuais, nao prometa consultas externas e nao exiba placeholders, campos entre colchetes ou templates incompletos como resposta final. Use somente as capacidades e os dados presentes no contexto recebido.",
      ),
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
