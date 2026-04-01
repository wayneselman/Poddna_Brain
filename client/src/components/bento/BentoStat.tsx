interface BentoStatProps {
  label: string;
  value: string | number;
  variant?: "default" | "success" | "warning" | "danger";
}

export function BentoStat({ label, value, variant = "default" }: BentoStatProps) {
  const variantClasses = {
    default: "bg-gray-100 text-[#6d6d6d]",
    success: "bg-green-100 text-green-700",
    warning: "bg-[#ffe166]/20 text-[#d4a800]",
    danger: "bg-red-100 text-red-700",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${variantClasses[variant]}`}>
      <span className="uppercase tracking-wide font-medium">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}
