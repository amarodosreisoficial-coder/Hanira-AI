"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createConversation,
  deleteConversationRequest,
  getConversation,
  listConversations,
  updateConversation,
} from "@/services/chat-service";
import type {
  ChatMessage,
  Conversation,
  LoadStatus,
} from "@/types/chat";

interface ChatState {
  conversations: Conversation[];
  activeId: string | null;
  mode: "supabase" | "demo" | null;
  status: LoadStatus;
  error: string | null;
  isThinking: boolean;
  sidebarOpen: boolean;
  draft: string;
  initialize: () => Promise<void>;
  setDraft: (draft: string) => void;
  setSidebarOpen: (open: boolean) => void;
  newConversation: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  archiveConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, content: string, pending?: boolean) => void;
  markMessageFailed: (id: string) => void;
  removeMessage: (id: string) => void;
  removeAttachment: (messageId: string, attachmentId: string) => void;
  replaceConversationId: (temporaryId: string, id: string) => void;
  setThinking: (thinking: boolean) => void;
  activeConversation: () => Conversation | null;
}

function localConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "Uma nova conversa",
    updatedAt: new Date().toISOString(),
    messages: [],
  };
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeId: null,
      mode: null,
      status: "idle",
      error: null,
      isThinking: false,
      sidebarOpen: false,
      draft: "",
      initialize: async () => {
        if (get().status === "loading") return;
        set({ status: "loading", error: null });
        try {
          const result = await listConversations();
          if (result.mode === "demo") {
            const existing = get().conversations;
            const conversations = existing.length ? existing : [localConversation()];
            set({
              mode: "demo",
              conversations,
              activeId: get().activeId ?? conversations[0].id,
              status: "ready",
            });
          } else {
            set({
              mode: "supabase",
              conversations: result.conversations,
              activeId: result.conversations[0]?.id ?? null,
              status: "ready",
            });
            if (result.conversations[0]) {
              await get().selectConversation(result.conversations[0].id);
            }
          }
        } catch (error) {
          set({
            status: "error",
            error:
              error instanceof Error
                ? error.message
                : "Não foi possível carregar as conversas.",
          });
        }
      },
      setDraft: (draft) => set({ draft }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      newConversation: async () => {
        try {
          const conversation =
            get().mode === "demo"
              ? localConversation()
              : await createConversation();
          set((state) => ({
            conversations: [conversation, ...state.conversations],
            activeId: conversation.id,
            sidebarOpen: false,
            error: null,
          }));
        } catch (error) {
          set({
            error:
              error instanceof Error
                ? error.message
                : "Não foi possível criar a conversa.",
          });
        }
      },
      selectConversation: async (id) => {
        set({ activeId: id, sidebarOpen: false, error: null });
        const existing = get().conversations.find((item) => item.id === id);
        if (get().mode !== "supabase" || existing?.messages.length) return;
        set({ status: "loading" });
        try {
          const conversation = await getConversation(id);
          set((state) => ({
            conversations: state.conversations.map((item) =>
              item.id === id ? conversation : item,
            ),
            status: "ready",
          }));
        } catch (error) {
          set({
            status: "error",
            error:
              error instanceof Error
                ? error.message
                : "Não foi possível abrir a conversa.",
          });
        }
      },
      renameConversation: async (id, title) => {
        await updateConversation(id, { title });
        set((state) => ({
          conversations: state.conversations.map((item) =>
            item.id === id ? { ...item, title } : item,
          ),
        }));
      },
      archiveConversation: async (id) => {
        await updateConversation(id, { archived: true });
        set((state) => {
          const conversations = state.conversations.filter(
            (item) => item.id !== id,
          );
          return {
            conversations,
            activeId:
              state.activeId === id
                ? (conversations[0]?.id ?? null)
                : state.activeId,
          };
        });
      },
      deleteConversation: async (id) => {
        await deleteConversationRequest(id);
        set((state) => {
          const conversations = state.conversations.filter(
            (item) => item.id !== id,
          );
          return {
            conversations,
            activeId:
              state.activeId === id
                ? (conversations[0]?.id ?? null)
                : state.activeId,
          };
        });
      },
      addMessage: (message) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) => {
            if (conversation.id !== state.activeId) return conversation;
            const isFirstUserMessage =
              message.role === "user" &&
              !conversation.messages.some((item) => item.role === "user");
            return {
              ...conversation,
              title: isFirstUserMessage
                ? message.content.slice(0, 60) || "Mídia enviada"
                : conversation.title,
              updatedAt: message.createdAt,
              messages: [...conversation.messages, message],
            };
          }),
        })),
      updateMessage: (id, content, pending = true) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) => ({
            ...conversation,
            messages: conversation.messages.map((message) =>
              message.id === id
                ? { ...message, content, pending, failed: false }
                : message,
            ),
          })),
        })),
      markMessageFailed: (id) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) => ({
            ...conversation,
            messages: conversation.messages.map((message) =>
              message.id === id
                ? { ...message, pending: false, failed: true }
                : message,
            ),
          })),
        })),
      removeMessage: (id) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) => ({
            ...conversation,
            messages: conversation.messages.filter(
              (message) => message.id !== id,
            ),
          })),
        })),
      removeAttachment: (messageId, attachmentId) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) => ({
            ...conversation,
            messages: conversation.messages.map((message) =>
              message.id === messageId
                ? {
                    ...message,
                    attachments: (message.attachments ?? []).filter(
                      (attachment) => attachment.id !== attachmentId,
                    ),
                  }
                : message,
            ),
          })),
        })),
      replaceConversationId: (temporaryId, id) =>
        set((state) => ({
          activeId: state.activeId === temporaryId ? id : state.activeId,
          conversations: state.conversations.map((conversation) =>
            conversation.id === temporaryId
              ? { ...conversation, id }
              : conversation,
          ),
        })),
      setThinking: (isThinking) => set({ isThinking }),
      activeConversation: () =>
        get().conversations.find((item) => item.id === get().activeId) ?? null,
    }),
    {
      name: "hanira-chat",
      partialize: (state) => ({
        conversations: state.mode === "demo" ? state.conversations : [],
        activeId: state.mode === "demo" ? state.activeId : null,
      }),
    },
  ),
);
