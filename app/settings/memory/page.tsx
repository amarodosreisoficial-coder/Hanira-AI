import type { Metadata } from "next";
import { MemoryPage } from "@/components/settings/memory-page";
import { requirePageSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Memorias" };

export default async function SettingsMemoryPage(props: {
  searchParams?: Promise<{ conversationId?: string | string[] }>;
}) {
  await requirePageSessionUser("/settings/memory");
  const searchParams = await props.searchParams;
  const rawConversationId = searchParams?.conversationId;
  const conversationId =
    typeof rawConversationId === "string"
      ? rawConversationId
      : Array.isArray(rawConversationId)
        ? rawConversationId[0]
        : undefined;

  return <MemoryPage conversationId={conversationId} />;
}
