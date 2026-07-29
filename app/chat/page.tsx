import type { Metadata } from "next";
import { ChatInterface } from "@/components/chat/chat-interface";
import { requirePageSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Chat",
};

export default async function ChatPage() {
  const user = await requirePageSessionUser("/chat");
  return <ChatInterface userName={user.displayName ?? user.email ?? "Pessoa"} />;
}
