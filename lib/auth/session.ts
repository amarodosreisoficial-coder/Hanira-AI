import "server-only";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email?: string;
  displayName?: string;
  demo: boolean;
}

export interface GetSessionUserOptions {
  /**
   * Persist refreshed session cookies (Supabase refresh-token rotation) on the
   * outgoing response.
   *
   * Route Handlers (`app/api/*`) and Server Actions MAY set cookies, so they
   * pass `true`. Without it, an expired access token triggers an on-demand
   * refresh that rotates the refresh token, but the `@supabase/ssr` cookie
   * adapter discards the write (its `setAll` becomes a no-op when omitted) —
   * the next request then reuses a consumed refresh token, Supabase revokes the
   * session, and the user is forced to sign in again ("random logouts").
   *
   * Server Components (RSC) MUST keep this `false`: `cookies().set()` throws
   * outside a Route Handler/Server Action. RSC pages are safe with `false`
   * because the middleware (`proxy.ts`) already refreshes and persists the
   * session on `/chat` and `/settings` before they render.
   */
  persistSessionCookies?: boolean;
}

export async function getSessionUser(
  options?: GetSessionUserOptions,
): Promise<SessionUser | null> {
  if (isDemoMode()) {
    return {
      id: "00000000-0000-0000-0000-000000000000",
      displayName: "Visitante",
      demo: true,
    };
  }

  const supabase = await createSupabaseServerClient({
    persistSessionCookies: options?.persistSessionCookies ?? false,
  });
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    displayName: user.user_metadata.display_name as string | undefined,
    demo: false,
  };
}

// Usado APENAS em Route Handlers (`app/api/*`), onde `cookies().set()` é
// permitido. Persiste a rotação do refresh token para não perder a sessão.
export async function requireSessionUser() {
  const user = await getSessionUser({ persistSessionCookies: true });
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return user;
}

// Usado APENAS em Server Components (RSC), onde `cookies().set()` lança erro.
// O middleware (`proxy.ts`) já renova e persiste a sessão nas páginas
// protegidas antes deste ponto, então aqui apenas lemos.
export async function requirePageSessionUser(nextPath = "/chat") {
  const user = await getSessionUser({ persistSessionCookies: false });
  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(nextPath)}&error=session_expired`,
    );
  }
  return user;
}
