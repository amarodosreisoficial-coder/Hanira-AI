import { describe, expect, it } from "vitest";
import { parseChatMarkdown } from "../components/chat/message-content";

describe("chat markdown", () => {
  it("preserva estrutura editorial de títulos, listas, código e tabelas", () => {
    const blocks = parseChatMarkdown(`# Plano

- Primeiro passo
- Segundo passo

\`\`\`ts
const ativo = true;
\`\`\`

| Estado | Ação |
| --- | --- |
| Pronto | Enviar |`);

    expect(blocks).toEqual([
      { type: "heading", level: 1, text: "Plano" },
      { type: "list", ordered: false, items: ["Primeiro passo", "Segundo passo"] },
      { type: "code", language: "ts", text: "const ativo = true;" },
      {
        type: "table",
        header: ["Estado", "Ação"],
        rows: [["Pronto", "Enviar"]],
      },
    ]);
  });

  it("mantém conteúdo comum como texto, sem interpretar HTML", () => {
    expect(parseChatMarkdown("Olá <script>alert(1)</script>")).toEqual([
      { type: "paragraph", text: "Olá <script>alert(1)</script>" },
    ]);
  });
});
