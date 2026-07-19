import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/env";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/chat";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/chat";

  if (isDemoMode()) {
    return NextResponse.redirect(new URL(safeNext, url.origin));
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.redirect(
        new URL("/login?error=supabase_unavailable", url.origin),
      );
    }
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(safeNext, url.origin));
    } catch {
      return NextResponse.redirect(
        new URL("/login?error=supabase_unavailable", url.origin),
      );
    }
  }

  return NextResponse.redirect(
    new URL("/login?error=callback", url.origin),
  );
}
