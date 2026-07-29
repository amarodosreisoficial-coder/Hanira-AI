import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerEnv, isDemoMode } from "@/lib/env";

export async function createSupabaseServerClient(options?: {
  persistSessionCookies?: boolean;
}) {
  if (isDemoMode()) return null;
  const env = getServerEnv();
  const cookieStore = await cookies();
  const persistSessionCookies = options?.persistSessionCookies ?? true;

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        ...(persistSessionCookies
          ? {
              setAll: async (
                cookiesToSet: Array<{
                  name: string;
                  value: string;
                  options: CookieOptions;
                }>,
              ) => {
                for (const { name, value, options } of cookiesToSet) {
                  cookieStore.set({ name, value, ...options });
                }
              },
            }
          : {}),
      },
    },
  );
}
