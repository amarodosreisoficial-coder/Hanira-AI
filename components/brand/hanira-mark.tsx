import Image from "next/image";
import { cn } from "@/lib/utils";

/* HANIRA NEON (18.3.6) — branding sem tile branco.
 * AUDITORIA: `public/hanira-symbol.svg` contém DOIS <rect fill="#ffffff"> de
 * fundo + PNG grayscale com feColorMatrix que força branco (filtro a834911308).
 * Por isso QUALQUER uso direto do SVG renderiza um quadrado branco — o "tile"
 * rejeitado. NÃO usar o SVG até ser refeito sem fundo.
 * Asset oficial escolhido: `/icons/hanira-512.png` (RGBA, colorType 6, 512px,
 * fundo transparente nativo). Halo neon permitido via drop-shadow CSS
 * (.nira-mark) — nenhum fundo/tile/moldura no markup. */
const HANIRA_SYMBOL_SRC = "/icons/hanira-512.png";

export function HaniraMark({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Image
        src={HANIRA_SYMBOL_SRC}
        alt=""
        width={32}
        height={32}
        sizes="32px"
        priority
        className="nira-mark size-8 shrink-0 object-contain"
      />
      {!compact && (
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-zinc-100">
          Hanira
        </span>
      )}
    </div>
  );
}

export { HANIRA_SYMBOL_SRC };
