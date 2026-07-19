import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SENSITIVE_PATTERN =
  /\b(cpf|rg|cartão|senha|diagnóstico|doença|medicamento|conta bancária|chave pix|telefone|endereço|e-mail)\b/i;

export async function getRelevantMemories(
  userId: string,
  message: string,
): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const { data: settings } = await supabase
    .from("user_settings")
    .select("memory_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (!settings?.memory_enabled) return [];

  const { data } = await supabase
    .from("memories")
    .select("content,importance,created_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  const terms = new Set(
    message
      .toLocaleLowerCase("pt-BR")
      .split(/\W+/)
      .filter((term) => term.length > 3),
  );
  return (data ?? [])
    .map((memory) => ({
      content: memory.content,
      score:
        memory.importance +
        [...terms].filter((term) =>
          memory.content.toLocaleLowerCase("pt-BR").includes(term),
        ).length * 2,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((memory) => memory.content);
}

export async function saveExplicitMemory(
  userId: string,
  conversationId: string,
  message: string,
) {
  if (SENSITIVE_PATTERN.test(message)) return;

  const normalized = message.trim();
  const patterns: Array<{
    regex: RegExp;
    category: string;
    importance: number;
  }> = [
    { regex: /\bmeu nome é\s+(.+)/i, category: "identidade", importance: 5 },
    {
      regex: /\b(?:lembre que|guarde (?:isso:?\s*|que\s*))(.+)/i,
      category: "explícita",
      importance: 4,
    },
    { regex: /\beu prefiro\s+(.+)/i, category: "preferência", importance: 3 },
    { regex: /\bprefiro\s+(.+)/i, category: "preferência", importance: 3 },
    { regex: /\bnão gosto de\s+(.+)/i, category: "preferência", importance: 3 },
  ];
  const match = patterns
    .map((pattern) => ({ pattern, match: normalized.match(pattern.regex) }))
    .find((item) => item.match?.[1]);
  if (!match?.match?.[1]) return;

  const content = match.match[1].trim().slice(0, 500);
  const supabase = await createSupabaseServerClient();
  await supabase?.from("memories").insert({
    user_id: userId,
    content,
    category: match.pattern.category,
    importance: match.pattern.importance,
    source_conversation_id: conversationId,
  });
}
