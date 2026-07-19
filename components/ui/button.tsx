import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" &&
          "bg-white text-black shadow-[0_10px_32px_rgba(255,255,255,.1)] hover:-translate-y-0.5 hover:bg-violet-100",
        variant === "secondary" &&
          "border border-white/10 bg-white/[0.045] text-white hover:border-white/20 hover:bg-white/[0.08]",
        variant === "ghost" &&
          "text-zinc-400 hover:bg-white/[0.06] hover:text-white",
        className,
      )}
      {...props}
    />
  );
}
