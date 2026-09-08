// Pacote 16.4 — Estado de runtime Nira para a UI.
//
// A interface NUNCA adivinha o runtime por texto estatico: o estado deriva
// de evidencia real (evento `start` do stream ou resposta do backend).
// Nenhum identificador de provider/modelo (Groq, GPT-OSS, Ollama, qwen)
// aparece nos rotulos de usuario final.
export type NiraRuntimeState =
  | "demo"
  | "cloud-free"
  | "local"
  | "unavailable"
  | "unknown";

export interface NiraRuntimeEvidence {
  mode?: string | null;
  providerId?: string | null;
  niraProfileId?: string | null;
}

export function resolveNiraRuntimeState(
  evidence: NiraRuntimeEvidence,
): NiraRuntimeState {
  const mode = evidence.mode?.trim().toLowerCase() ?? "";
  if (mode === "demo") return "demo";

  const profile = evidence.niraProfileId?.trim().toLowerCase() ?? "";
  if (profile === "nira-cloud-free") return "cloud-free";

  const providerId = evidence.providerId?.trim().toLowerCase() ?? "";
  if (providerId === "groq") return "cloud-free";
  if (providerId === "ollama") return "local";

  return "unknown";
}

export interface NiraRuntimeBadge {
  state: NiraRuntimeState;
  // null = nao exibir badge (estado desconhecido nao mente para o usuario).
  label: string | null;
  dotClassName: string;
}

export function niraRuntimeBadge(state: NiraRuntimeState): NiraRuntimeBadge {
  switch (state) {
    case "demo":
      return {
        state,
        label: "Modo demonstração",
        dotClassName: "bg-warning",
      };
    case "cloud-free":
      return { state, label: "Nira Online", dotClassName: "bg-success" };
    case "local":
      return { state, label: "Nira Local", dotClassName: "bg-primary" };
    case "unavailable":
      return {
        state,
        label: "Nira indisponível",
        dotClassName: "bg-destructive",
      };
    default:
      return { state: "unknown", label: null, dotClassName: "" };
  }
}
