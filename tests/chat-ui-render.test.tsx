import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HaniraWelcome, NiraThinkingIndicator } from "../components/chat/chat-states";
import { NiraPresence } from "../components/chat/nira-presence";

describe("Hanira premium chat states", () => {
  it("apresenta Hanira como produto e Nira como inteligência", () => {
    const html = renderToStaticMarkup(
      <HaniraWelcome userName="Ronne" onPrompt={vi.fn()} />,
    );

    expect(html).toContain("Olá, Ronne");
    expect(html).toContain("Nira Intelligence");
    expect(html).toContain("A inteligência da Hanira");
    expect(html).toContain("Organizar uma ideia");
    expect(html).toContain("<button");
  });

  it("expõe o estado de pensamento para tecnologia assistiva", () => {
    const html = renderToStaticMarkup(<NiraThinkingIndicator />);

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Nira está pensando");
  });

  it("mantém o símbolo abstrato decorativo fora da árvore acessível", () => {
    const html = renderToStaticMarkup(<NiraPresence status="unavailable" />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("is-unavailable");
  });
});
