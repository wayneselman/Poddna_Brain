import { Play } from "lucide-react";

interface BentoMomentProps {
  time: string;
  label: string;
  score?: number;
  onClick?: () => void;
}

export function BentoMoment({ time, label, score, onClick }: BentoMomentProps) {
  const pct = score != null ? Math.round(score * 100) : undefined;
  
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-[12px] border border-[#e6e6e6] bg-white px-4 py-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] group"
      data-testid="bento-moment"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ffe166]/20 text-[#d4a800] group-hover:bg-[#ffe166] group-hover:text-white transition">
          <Play className="h-3.5 w-3.5" />
        </div>
        <div>
          <div className="text-sm font-medium text-foreground">{label}</div>
          <div className="text-xs text-[#6d6d6d]">{time}</div>
        </div>
      </div>
      {pct != null && (
        <div className="flex flex-col items-end text-xs">
          <span className="text-[#6d6d6d]">Intensity</span>
          <span className="font-semibold text-foreground">{pct}%</span>
        </div>
      )}
    </button>
  );
}
