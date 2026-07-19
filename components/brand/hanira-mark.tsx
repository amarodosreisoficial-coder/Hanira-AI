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
      <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-[11px] border border-violet-300/20 bg-violet-950/30 shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_8px_28px_rgba(109,40,217,.18)]">
        <Image
          src="/Ícone estilizado de H com perfil feminino.png"
          alt=""
          fill
          sizes="32px"
          priority
          className="object-cover"
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
