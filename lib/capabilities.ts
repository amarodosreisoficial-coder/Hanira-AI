import {
  Bot,
  BrainCircuit,
  Eye,
  Image,
  Mic2,
  Plug,
  Video,
} from "lucide-react";
import type { HaniraCapability } from "@/types/capabilities";

export const HANIRA_CAPABILITIES: HaniraCapability[] = [
  {
    id: "memory",
    name: "Memória",
    description: "Contexto pessoal entre conversas.",
    status: "ready",
    icon: BrainCircuit,
  },
  {
    id: "voice",
    name: "Voz",
    description: "Conversas naturais em tempo real.",
    status: "ready",
    icon: Mic2,
  },
  {
    id: "vision",
    name: "Visão",
    description: "Compreensão de imagens e documentos.",
    status: "ready",
    icon: Eye,
  },
  {
    id: "images",
    name: "Imagens",
    description: "Criação visual guiada por ideias.",
    status: "planned",
    icon: Image,
  },
  {
    id: "videos",
    name: "Vídeos",
    description: "Narrativas em movimento.",
    status: "planned",
    icon: Video,
  },
  {
    id: "agents",
    name: "Agentes",
    description: "Especialistas que executam tarefas.",
    status: "planned",
    icon: Bot,
  },
  {
    id: "plugins",
    name: "Plugins",
    description: "Conexões com suas ferramentas.",
    status: "planned",
    icon: Plug,
  },
];
