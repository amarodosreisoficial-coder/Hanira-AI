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

export async function getSessionUser(): Promise<SessionUser | null> {
  if (isDemoMode()) {
    return {
      id: "00000000-0000-0000-0000-000000000000",
      displayName: "Visitante",
      demo: true,
    };
  }

  const supabase = await createSupabaseServerClient({
    persistSessionCookies: false,
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

export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return user;
}

export async function requirePageSessionUser(nextPath = "/chat") {
  const user = await getSessionUser();
  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(nextPath)}&error=session_expired`,
    );
  }
  return user;
}
