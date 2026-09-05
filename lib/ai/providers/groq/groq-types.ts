export const GROQ_PROVIDER_ID = "groq";
export const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";
export const GROQ_API_BASE_URL = "https://api.groq.com/openai/v1";

export const GROQ_TEXT_CAPABILITIES = ["text-generation", "text-streaming"] as const;

export interface GroqChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqChatRequest {
  model: string;
  messages: GroqChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface GroqUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface GroqChatChoice {
  index: number;
  message?: {
    role: string;
    content?: string;
  };
  delta?: {
    content?: string;
  };
  finish_reason?: string | null;
}

export interface GroqChatResponse {
  id?: string;
  model?: string;
  choices?: GroqChatChoice[];
  usage?: GroqUsage;
}

export interface GroqErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

export interface GroqModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

export interface GroqModelsResponse {
  object?: string;
  data?: GroqModel[];
}
