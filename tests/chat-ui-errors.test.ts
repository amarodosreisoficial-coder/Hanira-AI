import { describe, expect, it } from "vitest";
import {
  chatIssueForCode,
  isChatErrorCode,
  toChatIssue,
} from "../lib/chat/chat-errors";

describe("chat public experience errors", () => {
  it("apresenta capacity_unavailable sem detalhes de billing ou provider", () => {
    const issue = toChatIssue({
      code: "capacity_unavailable",
      message: "provider-x quota API_KEY billing",
    });

    expect(issue).toEqual({
      code: "capacity_unavailable",
      title: "Capacidade temporariamente indisponível",
      message:
        "A Nira está temporariamente sem capacidade gratuita disponível. Tente novamente em alguns instantes.",
      retryable: true,
    });
    expect(JSON.stringify(issue)).not.toMatch(/provider-x|API_KEY|billing|quota/);
  });

  it("distingue offline, timeout, indisponibilidade e erro inesperado", () => {
    expect(toChatIssue(new TypeError("Failed to fetch"), { online: false }).code).toBe("offline");
    expect(toChatIssue({ code: "timeout" }).code).toBe("timeout");
    expect(toChatIssue({ status: 503 }).code).toBe("unavailable");
    expect(toChatIssue(new Error("detalhe interno")).code).toBe("unknown");
  });

  it("mantém apenas códigos públicos conhecidos", () => {
    expect(isChatErrorCode("capacity_unavailable")).toBe(true);
    expect(isChatErrorCode("cost_blocked_paid")).toBe(false);
    expect(chatIssueForCode("invalid_request").retryable).toBe(false);
  });
});
