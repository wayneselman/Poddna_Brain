import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Flame, Play } from "lucide-react";

interface Moment {
  segmentId: string;
  startTime: number;
  endTime: number;
  title: string | null;
  summary: string | null;
  engagementScore: number;
}

interface MomentsChipsProps {
  episodeId: string;
  onSelectMoment: (segmentId: string, startTime: number) => void;
  maxItems?: number;
  className?: string;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hrs}:${remainingMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function MomentsChips({ 
  episodeId, 
  onSelectMoment,
  maxItems = 3,
  className = ""
}: MomentsChipsProps) {
  const { data: moments = [], isLoading } = useQuery<Moment[]>({
    queryKey: ['/api/episodes', episodeId, 'moments'],
    enabled: !!episodeId,
  });

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-28 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
    );
  }

  if (moments.length === 0) {
    return null;
  }

  const topMoments = moments
    .sort((a, b) => b.engagementScore - a.engagementScore)
    .slice(0, maxItems);

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`} data-testid="moments-chips">
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        <Flame className="w-3 h-3 text-orange-500" />
        Hot moments:
      </span>
      {topMoments.map((moment) => (
        <button
          key={moment.segmentId}
          type="button"
          onClick={() => onSelectMoment(moment.segmentId, moment.startTime)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"
          data-testid={`moment-chip-${moment.segmentId}`}
        >
          <Play className="w-2.5 h-2.5" />
          <span className="line-clamp-1 max-w-[120px]">
            {moment.title || moment.summary?.slice(0, 20) || formatTime(moment.startTime)}
          </span>
          <span className="text-orange-500 dark:text-orange-400 font-mono text-[10px]">
            {formatTime(moment.startTime)}
          </span>
        </button>
      ))}
    </div>
  );
}
