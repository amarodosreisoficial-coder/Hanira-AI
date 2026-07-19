import type { LucideIcon } from "lucide-react";

export type CapabilityStatus = "ready" | "planned";

export interface HaniraCapability {
  id:
    | "memory"
    | "voice"
    | "vision"
    | "images"
    | "videos"
    | "agents"
    | "plugins";
  name: string;
  description: string;
  status: CapabilityStatus;
  icon: LucideIcon;
}
