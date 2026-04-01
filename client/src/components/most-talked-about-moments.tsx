import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Flame, MessageCircle, Clock, ThumbsUp, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface SentimentSummary {
  totalComments: number;
  positive: number;
  negative: number;
  neutral: number;
  debate: number;
  funny: number;
}

interface TopComment {
  id: string;
  text: string;
  sentiment: string;
  likeCount: number;
}

interface Moment {
  segmentId: string;
  startTime: number;
  endTime: number;
  title: string | null;
  summary: string | null;
  engagementScore: number;
  sentimentSummary: SentimentSummary;
  topComments: TopComment[];
}

interface MostTalkedAboutMomentsProps {
  episodeId: string;
  onSelectSegment: (segmentId: string, startTime: number) => void;
  className?: string;
}

function formatTimeRange(startSeconds: number, endSeconds: number | null): string {
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };
  
  const start = formatTime(startSeconds);
  const end = endSeconds ? formatTime(endSeconds) : "";
  return end ? `${start} – ${end}` : start;
}

function buildSentimentLabel(summary: SentimentSummary): { label: string; icon: typeof Flame; className: string } {
  const { totalComments, positive, negative, debate, funny } = summary;
  
  if (!totalComments || totalComments < 3) {
    return { 
      label: "Low data", 
      icon: MessageCircle, 
      className: "text-muted-foreground" 
    };
  }

  if (funny > positive && funny > negative && funny > debate) {
    return { 
      label: "Funny moment", 
      icon: Sparkles, 
      className: "text-pink-600 dark:text-pink-400" 
    };
  }

  if (debate + negative > positive) {
    return { 
      label: "Debated moment", 
      icon: MessageCircle, 
      className: "text-amber-600 dark:text-amber-400" 
    };
  }

  if (positive >= negative && positive >= debate) {
    const pct = Math.round((positive / totalComments) * 100);
    return { 
      label: `Mostly positive (${pct}%)`, 
      icon: ThumbsUp, 
      className: "text-emerald-600 dark:text-emerald-400" 
    };
  }

  return { 
    label: "Active discussion", 
    icon: Users, 
    className: "text-blue-600 dark:text-blue-400" 
  };
}

function MomentCard({ 
  moment, 
  onSelect 
}: { 
  moment: Moment; 
  onSelect: () => void;
}) {
  const sentiment = buildSentimentLabel(moment.sentimentSummary);
  const SentimentIcon = sentiment.icon;
  const topComment = moment.topComments[0];

  return (
    <button
      onClick={onSelect}
      className="min-w-[280px] max-w-[320px] shrink-0 text-left"
      data-testid={`moment-card-${moment.segmentId}`}
    >
      <Card className="p-4 h-full hover-elevate active-elevate-2 transition-all">
        <div className="flex items-center justify-between mb-2 gap-2">
          <Badge 
            variant="secondary" 
            className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 gap-1"
            data-testid={`moment-score-${moment.segmentId}`}
          >
            <Flame className="w-3 h-3" />
            {moment.engagementScore}
          </Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTimeRange(moment.startTime, moment.endTime)}
          </span>
        </div>

        <h4 className="font-medium text-sm line-clamp-2 mb-1" data-testid={`moment-title-${moment.segmentId}`}>
          {moment.title || "Segment"}
        </h4>

        {moment.summary && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
            {moment.summary}
          </p>
        )}

        <div className="flex items-center justify-between text-xs border-t pt-2 mt-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn("flex items-center gap-1 font-medium", sentiment.className)}>
                <SentimentIcon className="w-3 h-3" />
                {sentiment.label}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                +{moment.sentimentSummary.positive} positive, {moment.sentimentSummary.neutral} neutral
                {moment.sentimentSummary.funny > 0 && `, ${moment.sentimentSummary.funny} funny`}
              </p>
            </TooltipContent>
          </Tooltip>
          <span className="text-muted-foreground flex items-center gap-1">
            <MessageCircle className="w-3 h-3" />
            {moment.sentimentSummary.totalComments}
          </span>
        </div>

        {topComment && (
          <div className="mt-3 pt-2 border-t">
            <p className="text-xs text-muted-foreground line-clamp-2 italic">
              "{topComment.text.slice(0, 100)}{topComment.text.length > 100 ? '...' : ''}"
            </p>
            {topComment.likeCount > 0 && (
              <span className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <ThumbsUp className="w-3 h-3" />
                {topComment.likeCount} likes
              </span>
            )}
          </div>
        )}
      </Card>
    </button>
  );
}

function MomentsSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="min-w-[280px] shrink-0">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-5 w-full mb-2" />
            <Skeleton className="h-4 w-3/4 mb-3" />
            <div className="flex items-center justify-between pt-2 border-t">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-12" />
            </div>
          </Card>
        </div>
      ))}
    </div>
  );
}

export default function MostTalkedAboutMoments({ 
  episodeId, 
  onSelectSegment,
  className 
}: MostTalkedAboutMomentsProps) {
  const { data: moments, isLoading, error } = useQuery<Moment[]>({
    queryKey: ["/api/episodes", episodeId, "moments"],
  });

  if (isLoading) {
    return (
      <section className={cn("mb-6", className)} data-testid="moments-loading">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-500" />
          Most Talked About Moments
        </h2>
        <MomentsSkeleton />
      </section>
    );
  }

  if (error || !moments || moments.length === 0) {
    return null;
  }

  return (
    <section className={cn("mb-6", className)} data-testid="moments-section">
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Flame className="w-5 h-5 text-orange-500" />
        Most Talked About Moments
      </h2>

      <div className="flex gap-3 overflow-x-auto pb-2" data-testid="moments-carousel">
        {moments.map((moment) => (
          <MomentCard
            key={moment.segmentId}
            moment={moment}
            onSelect={() => onSelectSegment(moment.segmentId, moment.startTime)}
          />
        ))}
      </div>
    </section>
  );
}

export { MomentCard, MomentsSkeleton };
export type { Moment, MostTalkedAboutMomentsProps };
