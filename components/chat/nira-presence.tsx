import Image from "next/image";
import { cn } from "@/lib/utils";
import { HANIRA_SYMBOL_SRC } from "@/components/brand/hanira-mark";

export type NiraPresenceStatus =
  | "idle"
  | "thinking"
  | "responding"
  | "unavailable";

export function NiraPresence({
  status = "idle",
  size = "md",
  className,
}: {
  status?: NiraPresenceStatus;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "nira-presence relative inline-grid shrink-0 place-items-center",
        size === "sm" && "size-7",
        size === "md" && "size-9",
        size === "lg" && "size-16",
        status === "thinking" && "is-thinking",
        status === "responding" && "is-responding",
        status === "unavailable" && "is-unavailable",
        className,
      )}
      aria-hidden="true"
    >
      {/* HANIRA NEON (18.3.6): símbolo oficial transparente SEM tile/quadrado/
          moldura — somente a imagem + halo neon via CSS (.nira-mark). */}
      <Image
        src={HANIRA_SYMBOL_SRC}
        alt=""
        fill
        sizes="36px"
        className="nira-mark object-contain"
      />
    </span>
  );
}
