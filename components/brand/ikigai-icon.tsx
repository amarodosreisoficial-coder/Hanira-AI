import Image from "next/image";

export function IkigaiIcon({ size = 36, className = "" }: { size?: number; className?: string }) {
  return <Image src="/media/ikigai/icons/ikigai-icon-enso-neon.png" alt="" width={size} height={size} sizes={`${size}px`} className={`shrink-0 object-contain ${className}`} />;
}
