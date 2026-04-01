import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BentoCardSize = "sm" | "md" | "lg";

interface BentoCardProps {
  size?: BentoCardSize;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function BentoCard({ size = "md", children, onClick, className }: BentoCardProps) {
  const padding =
    size === "sm" ? "p-3" : size === "lg" ? "p-5 md:p-6" : "p-4";

  return (
    <div
      className={cn(
        "group rounded-[12px] border border-[#e6e6e6] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition",
        "hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]",
        padding,
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
      data-testid="bento-card"
    >
      {children}
    </div>
  );
}

interface BentoCardHeaderProps {
  label?: string;
  icon?: ReactNode;
}

export function BentoCardHeader({ label, icon }: BentoCardHeaderProps) {
  if (!label && !icon) return null;
  return (
    <div className="mb-2 flex items-center gap-2 text-xs text-[#6d6d6d]">
      {icon && <span className="text-[#ffe166]">{icon}</span>}
      {label && <span className="uppercase tracking-wide">{label}</span>}
    </div>
  );
}

interface BentoCardTitleProps {
  children: ReactNode;
}

export function BentoCardTitle({ children }: BentoCardTitleProps) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>;
}

interface BentoCardBodyProps {
  children: ReactNode;
}

export function BentoCardBody({ children }: BentoCardBodyProps) {
  return <p className="mt-1 text-xs text-[#6d6d6d] leading-relaxed">{children}</p>;
}

interface BentoCardMetaProps {
  time?: string;
  importance?: string | number;
  extra?: ReactNode;
}

export function BentoCardMeta({ time, importance, extra }: BentoCardMetaProps) {
  if (!time && !importance && !extra) return null;
  
  const importanceDisplay = typeof importance === "number" 
    ? `${Math.round(importance * 100)}%` 
    : importance;
  
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#6d6d6d]">
      {time && (
        <span className="inline-flex items-center gap-1">
          <span className="text-[#ffe166]">⏱</span> {time}
        </span>
      )}
      {importance != null && (
        <span className="inline-flex items-center gap-1">
          <span className="text-[#ffe166]">★</span> {importanceDisplay}
        </span>
      )}
      {extra}
    </div>
  );
}
