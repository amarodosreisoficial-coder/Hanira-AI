import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const session = source("lib/auth/session.ts");
const logout = source("app/actions/auth.ts");
const proxy = source("proxy.ts");
const supabaseProxy = source("lib/supabase/proxy.ts");

describe("Pacote 18.3.6 — persistência de sessão (refresh token)", () => {
  it("getSessionUser expõe a opção persistSessionCookies com default false (RSC-safe)", () => {
    // A causa objetiva do "logout aleatório": sem setAll, o @supabase/ssr vira
    // no-op e a rotação do refresh token é descartada.
    expect(session).toContain("persistSessionCookies?: boolean");
    expect(session).toContain(
      "persistSessionCookies: options?.persistSessionCookies ?? false",
    );
  });

  it("Route Handlers persistem a rotação (requireSessionUser => true)", () => {
    expect(session).toMatch(
      /requireSessionUser\(\)\s*\{[\s\S]*?getSessionUser\(\{\s*persistSessionCookies:\s*true\s*\}\)/,
    );
  });

  it("Server Components não persistem (requirePageSessionUser => false)", () => {
    expect(session).toMatch(
      /requirePageSessionUser\([\s\S]*?getSessionUser\(\{\s*persistSessionCookies:\s*false\s*\}\)/,
    );
  });

  it("nenhum chamador de getSessionUser permanece sem a opção explícita", () => {
    const bare = session.match(/getSessionUser\(\s*\)/g) ?? [];
    expect(bare).toHaveLength(0);
  });

  it("rotas de API que chamam getSessionUser diretamente persistem cookies", () => {
    for (const route of [
      "app/api/image/route.ts",
      "app/api/system/diagnostics/route.ts",
      "app/api/usage/route.ts",
    ]) {
      expect(source(route)).toContain(
        "getSessionUser({ persistSessionCookies: true })",
      );
    }
  });
});

describe("Pacote 18.3.6 — logout preservado", () => {
  it("logoutAction encerra a sessão no Supabase e redireciona para /login", () => {
    expect(logout).toMatch(/export async function logoutAction/);
    expect(logout).toContain("supabase?.auth.signOut()");
    expect(logout).toContain('redirect("/login")');
  });

  it("logoutAction não armazena senha nem cria cookie/localStorage manual", () => {
    // Isola apenas o corpo de logoutAction (o arquivo tem "password" em
    // outras funções legítimas, como loginAction/signupAction).
    const body =
      logout.match(
        /export async function logoutAction\(\)[\s\S]*?\n\}/,
      )?.[0] ?? "";
    expect(body).toContain("supabase?.auth.signOut()");
    expect(body).toContain('redirect("/login")');
    expect(body).not.toContain("localStorage.setItem");
    expect(body).not.toContain("document.cookie");
  });
});

describe("Pacote 18.3.6 — redirecionamento de autenticação (middleware)", () => {
  it("rota protegida sem sessão redireciona para /login com session_expired", () => {
    expect(proxy).toContain('protectedPaths = ["/chat", "/settings", "/ikigai"]');
    expect(proxy).toMatch(/protectedRoute && !user[\s\S]*?session_expired/);
  });

  it("usuário autenticado em rota de auth é levado para /chat", () => {
    expect(proxy).toMatch(/user && authPaths\.includes\(pathname\)/);
    expect(proxy).toContain('"/chat"');
  });

  it("middleware renova a sessão com setAll (persiste o refresh token)", () => {
    // O proxy do Supabase precisa prover setAll para gravar a rotação.
    expect(supabaseProxy).toContain("setAll:");
    expect(supabaseProxy).toContain("supabase.auth.getUser()");
  });

  it("usuário anônimo segue para login normalmente (sem bypass)", () => {
    expect(proxy).not.toContain("bypass");
    expect(proxy).not.toContain("ignore");
  });
});
