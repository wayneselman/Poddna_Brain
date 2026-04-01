import type { ReactNode } from "react";

interface BentoSectionProps {
  title: string;
  icon?: ReactNode;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function BentoSection({ title, icon, description, children, className }: BentoSectionProps) {
  return (
    <section className={`mb-7 rounded-[12px] border border-[#e6e6e6] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${className ?? ""}`}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            {icon && <span className="text-[#ffe166]">{icon}</span>}
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#6d6d6d]">
              {title}
            </h2>
          </div>
          {description && (
            <p className="mt-1 text-xs text-[#6d6d6d]">{description}</p>
          )}
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}
