import type { Metadata } from "next";
import { ChatInterface } from "@/components/chat/chat-interface";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Chat",
};

export default async function ChatPage() {
  const user = await requireSessionUser();
  return <ChatInterface userName={user.displayName ?? user.email ?? "Pessoa"} />;
}
