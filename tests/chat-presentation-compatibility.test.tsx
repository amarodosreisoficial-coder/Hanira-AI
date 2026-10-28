import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_SETTINGS } from "@/lib/settings/defaults";
import type { ChatMessage as ChatMessageData } from "@/types/chat";

const { speech, buttons } = vi.hoisted(() => ({ speech: vi.fn(), buttons: new Map<string, () => void>() }));
vi.mock("@/components/voice/speech-controls", () => ({ SpeechControls: (props: { text: string }) => { speech(props); return null; } }));
vi.mock("@/components/media/message-attachments", () => ({ MessageAttachments: () => null }));
vi.mock("@/components/chat/generated-image-response", () => ({ GeneratedImageResponse: () => null }));
vi.mock("@/components/chat/nira-presence", () => ({ NiraPresence: () => null }));
vi.mock("@/components/ui/icon-button", () => ({ IconButton: (props: { label: string; onClick: () => void; children: ReactNode }) => {
  buttons.set(props.label, props.onClick);
  return <button>{props.children}</button>;
} }));
import { ChatMessage } from "@/components/chat/chat-message";

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); buttons.clear(); });

describe("19.2-J: apresentação preserva conteúdo e controles", () => {
  it("cópia e leitura de voz recebem o conteúdo original sem CSS ou instruções visuais", () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const message = Object.freeze<ChatMessageData>({ id: "message", role: "assistant", content: "# Um título\n\nℹ️ **Informação:** Use `codigo` com *cuidado*.", createdAt: "2026-10-28" });
    const html = renderToStaticMarkup(<ChatMessage message={message} settings={{ ...DEFAULT_USER_SETTINGS, voiceEnabled: true }} />);
    expect(html).toContain("chat-callout--info");
    expect(speech).toHaveBeenCalledWith(expect.objectContaining({ text: message.content }));
    expect(buttons.get("Copiar resposta")).toBeDefined();
    vi.stubGlobal("window", { setTimeout: vi.fn() });
    buttons.get("Copiar resposta")!();
    expect(writeText).toHaveBeenCalledWith(message.content);
    expect(message.content).not.toContain("chat-callout");
  });
  it("fontes antigas continuam acessíveis e URLs perigosas não viram links", () => {
    const message: ChatMessageData = { id: "old", role: "assistant", content: "## Publicação encontrada\n\nTexto de uma resposta antiga.", createdAt: "2025-01-01", webSearchSources: [
      { title: "Fonte segura", url: "https://example.com/artigo", domain: "example.com" },
      { title: "Link perigoso", url: "javascript:alert(1)", domain: "unknown" },
    ] };
    const html = renderToStaticMarkup(<ChatMessage message={message} settings={DEFAULT_USER_SETTINGS} />);
    expect(html).toContain('aria-label="Fontes consultadas"');
    expect(html).toContain('href="https://example.com/artigo"');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("Link perigoso");
  });
});
