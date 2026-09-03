import { cn } from "@/lib/utils";

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
        "nira-presence relative inline-grid shrink-0 place-items-center rounded-[35%] border border-primary/25 bg-primary/10",
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
      <span className="nira-presence__halo absolute inset-[14%] rounded-[32%]" />
      <span className="nira-presence__core relative block size-[34%] rotate-45 rounded-[28%]" />
    </span>
  );
}
