import { describe, expect, it, vi } from "vitest";

// Server Action + suas dependências: mocks mantêm o teste node-side e sem rede.
vi.mock("@/lib/env", () => ({
  isDemoMode: vi.fn(() => false),
  getServerEnv: vi.fn(() => ({ NEXT_PUBLIC_APP_URL: "https://app.hanira.ai" })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/lib/auth/errors", () => ({
  translateAuthError: (message?: string) => message ?? "Erro de autenticacao.",
}));

import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signInWithGoogleAction } from "@/app/actions/auth";

describe("Pacote 18.4 — login com Google (OAuth)", () => {
  it("inicia OAuth com provider google e redirectTo no callback /auth/callback", async () => {
    vi.mocked(isDemoMode).mockReturnValue(false);
    const signInWithOAuth = vi.fn().mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/auth?client_id=abc" },
      error: null,
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { signInWithOAuth },
    } as never);

    const result = await signInWithGoogleAction({ status: "idle" }, new FormData());

    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google" }),
    );
    const args = signInWithOAuth.mock.calls[0][0] as {
      options: { redirectTo: string };
    };
    expect(args.options.redirectTo).toContain("/auth/callback");
    expect(result.status).toBe("success");
    expect(result.redirectTo).toContain("accounts.google.com");
  });

  it("erro do provider retorna status error sem redirecionar", async () => {
    vi.mocked(isDemoMode).mockReturnValue(false);
    const signInWithOAuth = vi.fn().mockResolvedValue({
      data: null,
      error: new Error("provider_disabled"),
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { signInWithOAuth },
    } as never);

    const result = await signInWithGoogleAction({ status: "idle" }, new FormData());

    expect(result.status).toBe("error");
    expect(result.redirectTo).toBeUndefined();
  });

  it("modo demonstracao redireciona para /chat sem tocar o provider", async () => {
    vi.mocked(isDemoMode).mockReturnValue(true);
    vi.mocked(createSupabaseServerClient).mockClear();

    const result = await signInWithGoogleAction({ status: "idle" }, new FormData());

    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "success", redirectTo: "/chat" });
  });
});