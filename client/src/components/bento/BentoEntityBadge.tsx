interface BentoEntityBadgeProps {
  label: string;
  count?: number;
  onClick?: () => void;
}

export function BentoEntityBadge({ label, count, onClick }: BentoEntityBadgeProps) {
  const Component = onClick ? "button" : "span";
  
  return (
    <Component
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border border-[#e6e6e6] bg-gray-50 px-3 py-1.5 text-xs text-foreground transition ${
        onClick ? "cursor-pointer hover:border-[#ffe166] hover:bg-[#ffe166]/10" : ""
      }`}
      data-testid="bento-entity-badge"
    >
      <span className="font-medium">{label}</span>
      {count != null && (
        <span className="rounded-full bg-[#e6e6e6] px-1.5 py-0.5 text-[0.65rem] font-semibold text-[#6d6d6d]">
          {count}
        </span>
      )}
    </Component>
  );
}
