import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type IconButtonVariant = "ghost" | "soft" | "primary" | "danger";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tooltip?: string;
  variant?: IconButtonVariant;
  children: ReactNode;
}

export function IconButton({
  label,
  tooltip,
  variant = "ghost",
  className,
  type = "button",
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={tooltip ?? label}
      className={cn(
        "inline-grid size-9 shrink-0 place-items-center rounded-xl transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35",
        variant === "ghost" &&
          "text-muted-foreground hover:bg-accent hover:text-foreground",
        variant === "soft" &&
          "border border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
        variant === "primary" &&
          "bg-primary text-primary-foreground shadow-[0_8px_24px_var(--primary-glow)] hover:bg-primary/90",
        variant === "danger" &&
          "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
