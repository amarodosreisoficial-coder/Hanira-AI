import Image from "next/image";
import { cn } from "@/lib/utils";

export function HaniraMark({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_34%_28%,rgba(167,139,250,0.30),rgba(139,92,246,0.08)_55%,transparent_78%)]">
        <Image
          src="/hanira-symbol.svg"
          alt=""
          fill
          sizes="32px"
          priority
          className="nira-mark object-contain p-[7px]"
        />
      </span>
      {!compact && (
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-zinc-100">
          Hanira
        </span>
      )}
    </div>
  );
}
