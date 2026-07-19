"use client";

import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase não configurado no navegador. Verifique as variáveis NEXT_PUBLIC_SUPABASE_*.",
    );
  }

  browserClient ??= createBrowserClient(url, key);
  return browserClient;
}
