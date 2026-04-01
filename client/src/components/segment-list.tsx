import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Play, ChevronDown, ChevronUp, MessageSquarePlus, Clock, Volume2, ThumbsUp, ThumbsDown, MessageCircle, HelpCircle, Sparkles, Users, BarChart3, Twitter, Newspaper, Package, Monitor, Presentation, Image, Globe, FileText, Building2, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface SentimentSummary {
  positive: number;
  negative: number;
  neutral: number;
  debate: number;
  confused: number;
  funny: number;
  topComments?: Array<{
    id: string;
    text: string;
    sentiment: string;
    likeCount: number;
  }>;
}

export interface Snippet {
  id: string;
  startSeconds: number;
  endSeconds: number | null;
  label: string;
  snippetText: string;
  segmentType: string;
  isAiGenerated: boolean;
  engagementScore?: number | null;
  sentimentSummary?: SentimentSummary | null;
  visualTags?: string[] | null;
  visualCaption?: string | null;
}

interface SnippetCardProps {
  snippetText: string;
  startSeconds: number;
  onPlay: (startSeconds: number) => void;
  onAddAnnotation?: (startSeconds: number) => void;
}

function SnippetCard({ snippetText, startSeconds, onPlay, onAddAnnotation }: SnippetCardProps) {
  return (
    <div className="mt-3 p-3 bg-muted/50 rounded-md" data-testid={`snippet-content-${startSeconds}`}>
      <p className="text-sm text-muted-foreground leading-relaxed mb-3">
        "{snippetText}"
      </p>
      <div className="flex gap-2">
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => onPlay(startSeconds)}
          data-testid={`button-play-snippet-${startSeconds}`}
        >
          <Play className="w-3 h-3 mr-1" />
          Play
        </Button>
        {onAddAnnotation && (
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => onAddAnnotation(startSeconds)}
            data-testid={`button-annotate-${startSeconds}`}
          >
            <MessageSquarePlus className="w-3 h-3 mr-1" />
            Add Note
          </Button>
        )}
      </div>
    </div>
  );
}

interface SentimentChipsProps {
  sentimentSummary?: SentimentSummary | null;
  engagementScore?: number | null;
  segmentId: string;
}

function SentimentChips({ sentimentSummary, engagementScore, segmentId }: SentimentChipsProps) {
  if (!sentimentSummary) return null;
  
  const total = sentimentSummary.positive + sentimentSummary.negative + 
                sentimentSummary.neutral + sentimentSummary.debate + 
                sentimentSummary.confused + sentimentSummary.funny;
  
  if (total === 0) return null;
  
  const getSentimentConfig = (type: string, count: number) => {
    const configs: Record<string, { icon: typeof ThumbsUp; label: string; className: string }> = {
      positive: { 
        icon: ThumbsUp, 
        label: 'Positive', 
        className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' 
      },
      negative: { 
        icon: ThumbsDown, 
        label: 'Critical', 
        className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' 
      },
      debate: { 
        icon: MessageCircle, 
        label: 'Debate', 
        className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' 
      },
      confused: { 
        icon: HelpCircle, 
        label: 'Confused', 
        className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' 
      },
      funny: { 
        icon: Sparkles, 
        label: 'Funny', 
        className: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' 
      },
    };
    return configs[type];
  };
  
  const sentimentTypes = [
    { type: 'positive', count: sentimentSummary.positive },
    { type: 'negative', count: sentimentSummary.negative },
    { type: 'debate', count: sentimentSummary.debate },
    { type: 'confused', count: sentimentSummary.confused },
    { type: 'funny', count: sentimentSummary.funny },
  ].filter(s => s.count > 0).slice(0, 3);
  
  if (sentimentTypes.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap" data-testid={`sentiment-chips-${segmentId}`}>
      {engagementScore && engagementScore > 20 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className="text-xs gap-1 bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300"
              data-testid={`engagement-score-${segmentId}`}
            >
              <Users className="w-3 h-3" />
              {engagementScore}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Engagement score based on {total} comments</p>
          </TooltipContent>
        </Tooltip>
      )}
      {sentimentTypes.map(({ type, count }) => {
        const config = getSentimentConfig(type, count);
        if (!config) return null;
        const Icon = config.icon;
        const percentage = Math.round((count / total) * 100);
        
        return (
          <Tooltip key={type}>
            <TooltipTrigger asChild>
              <Badge 
                variant="secondary" 
                className={cn("text-xs gap-1", config.className)}
                data-testid={`sentiment-${type}-${segmentId}`}
              >
                <Icon className="w-3 h-3" />
                {percentage}%
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{config.label}: {count} comment{count !== 1 ? 's' : ''}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

interface TopCommentsSectionProps {
  comments: Array<{
    id: string;
    text: string;
    sentiment: string;
    likeCount: number;
  }>;
  segmentId: string;
}

function TopCommentsSection({ comments, segmentId }: TopCommentsSectionProps) {
  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return <ThumbsUp className="w-3 h-3 text-emerald-600" />;
      case 'negative': return <ThumbsDown className="w-3 h-3 text-red-600" />;
      case 'debate': return <MessageCircle className="w-3 h-3 text-amber-600" />;
      case 'confused': return <HelpCircle className="w-3 h-3 text-purple-600" />;
      case 'funny': return <Sparkles className="w-3 h-3 text-pink-600" />;
      default: return <MessageCircle className="w-3 h-3 text-muted-foreground" />;
    }
  };

  return (
    <div className="mt-3 border-t pt-3" data-testid={`top-comments-${segmentId}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Users className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Audience Reactions</span>
      </div>
      <div className="space-y-2">
        {comments.map((comment, idx) => (
          <div 
            key={comment.id || idx}
            className="flex gap-2 text-xs bg-muted/30 rounded-md p-2"
            data-testid={`comment-${segmentId}-${idx}`}
          >
            {getSentimentIcon(comment.sentiment)}
            <p className="flex-1 text-muted-foreground line-clamp-2">{comment.text}</p>
            {comment.likeCount > 0 && (
              <Badge variant="outline" className="text-xs shrink-0 h-5">
                {comment.likeCount}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface VisualMarkersProps {
  visualTags?: string[] | null;
  visualCaption?: string | null;
  segmentId: string;
}

function VisualMarkers({ visualTags, visualCaption, segmentId }: VisualMarkersProps) {
  if (!visualTags || visualTags.length === 0) return null;
  
  const getTagConfig = (tag: string): { icon: typeof BarChart3; label: string; className: string } | null => {
    const configs: Record<string, { icon: typeof BarChart3; label: string; className: string }> = {
      chart: { icon: BarChart3, label: 'Chart/Graph', className: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
      tweet: { icon: Twitter, label: 'Tweet/X Post', className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' },
      article: { icon: Newspaper, label: 'Article/News', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
      product: { icon: Package, label: 'Product Demo', className: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300' },
      screen: { icon: Monitor, label: 'Screen Share', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
      slide: { icon: Presentation, label: 'Presentation', className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
      image: { icon: Image, label: 'Image/Photo', className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
      website: { icon: Globe, label: 'Website', className: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
      document: { icon: FileText, label: 'Document', className: 'bg-stone-100 text-stone-700 dark:bg-stone-900/30 dark:text-stone-300' },
      logo: { icon: Building2, label: 'Logo/Brand', className: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300' },
      face: { icon: User, label: 'Guest/Face', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
    };
    return configs[tag.toLowerCase()] || null;
  };

  return (
    <div className="flex items-center gap-1.5 mt-1" data-testid={`visual-markers-${segmentId}`}>
      {visualTags.slice(0, 4).map((tag, idx) => {
        const config = getTagConfig(tag);
        if (!config) return null;
        const Icon = config.icon;
        
        return (
          <Tooltip key={`${tag}-${idx}`}>
            <TooltipTrigger asChild>
              <Badge 
                variant="secondary" 
                className={cn("text-xs gap-1", config.className)}
                data-testid={`visual-tag-${tag}-${segmentId}`}
              >
                <Icon className="w-3 h-3" />
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs font-medium">{config.label}</p>
              {visualCaption && (
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">{visualCaption}</p>
              )}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

interface SegmentCardProps {
  segment: Snippet;
  isActive: boolean;
  isExpanded: boolean;
  onPlay: (startSeconds: number) => void;
  onExpand: (segmentId: string) => void;
  onAddAnnotation?: (startSeconds: number) => void;
}

function SegmentCard({ 
  segment, 
  isActive, 
  isExpanded, 
  onPlay, 
  onExpand,
  onAddAnnotation 
}: SegmentCardProps) {
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0 
      ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      : `${m}:${s.toString().padStart(2, "0")}`;
  };

  const getSegmentTypeColor = (type: string) => {
    switch (type) {
      case "intro": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      case "outro": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
      case "ad": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "music": return "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300";
      case "qa": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Card 
      className={cn(
        "transition-all hover-elevate cursor-pointer",
        isActive && "ring-2 ring-primary bg-primary/5",
        isExpanded && "bg-muted/30"
      )}
      data-testid={`card-segment-${segment.id}`}
      onClick={() => onExpand(segment.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isActive && (
                <Badge variant="default" className="text-xs animate-pulse">
                  <Volume2 className="w-3 h-3 mr-1" />
                  Now Playing
                </Badge>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPlay(segment.startSeconds);
                }}
                className={cn(
                  "text-xs font-mono hover:underline flex items-center gap-1",
                  isActive ? "text-primary font-semibold" : "text-primary"
                )}
                data-testid={`button-timestamp-${segment.id}`}
              >
                <Clock className="w-3 h-3" />
                {formatTime(segment.startSeconds)}
              </button>
              {segment.segmentType !== "topic" && (
                <Badge 
                  variant="secondary" 
                  className={cn("text-xs", getSegmentTypeColor(segment.segmentType))}
                >
                  {segment.segmentType}
                </Badge>
              )}
              {segment.isAiGenerated && (
                <Badge variant="outline" className="text-xs">
                  AI
                </Badge>
              )}
            </div>
            <h4 className="font-medium text-sm line-clamp-2" data-testid={`text-segment-label-${segment.id}`}>
              {segment.label}
            </h4>
            <SentimentChips 
              sentimentSummary={segment.sentimentSummary} 
              engagementScore={segment.engagementScore}
              segmentId={segment.id}
            />
            <VisualMarkers
              visualTags={segment.visualTags}
              visualCaption={segment.visualCaption}
              segmentId={segment.id}
            />
          </div>
          <Button 
            size="icon" 
            variant="ghost"
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onExpand(segment.id);
            }}
            data-testid={`button-expand-${segment.id}`}
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
        </div>
        
        {isExpanded && segment.snippetText && (
          <SnippetCard
            snippetText={segment.snippetText}
            startSeconds={segment.startSeconds}
            onPlay={onPlay}
            onAddAnnotation={onAddAnnotation}
          />
        )}
        
        {isExpanded && segment.sentimentSummary?.topComments && segment.sentimentSummary.topComments.length > 0 && (
          <TopCommentsSection 
            comments={segment.sentimentSummary.topComments} 
            segmentId={segment.id}
          />
        )}
      </CardContent>
    </Card>
  );
}

interface SegmentListProps {
  segments: Snippet[];
  currentTime: number;
  onPlay: (startSeconds: number) => void;
  onAddAnnotation?: (startSeconds: number) => void;
  className?: string;
  autoScroll?: boolean;
}

export default function SegmentList({ 
  segments, 
  currentTime, 
  onPlay, 
  onAddAnnotation,
  className,
  autoScroll = true
}: SegmentListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [userScrolled, setUserScrolled] = useState(false);
  const scrollTimeoutRef = useRef<number | null>(null);
  const segmentRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const lastActiveId = useRef<string | null>(null);

  const findActiveSegment = () => {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].startSeconds <= currentTime) {
        return segments[i].id;
      }
    }
    return segments[0]?.id || null;
  };

  const activeSegmentId = findActiveSegment();

  // Auto-scroll to active segment when it changes
  useEffect(() => {
    if (!autoScroll || userScrolled || !activeSegmentId) return;
    if (activeSegmentId === lastActiveId.current) return;
    
    lastActiveId.current = activeSegmentId;
    const element = segmentRefs.current.get(activeSegmentId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeSegmentId, autoScroll, userScrolled]);

  // Track user interaction (wheel/touch) to temporarily disable auto-scroll
  // This works regardless of which container is actually scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleUserInteraction = () => {
      setUserScrolled(true);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = window.setTimeout(() => setUserScrolled(false), 5000);
    };

    // Listen for wheel and touch events which indicate user is manually scrolling
    container.addEventListener('wheel', handleUserInteraction, { passive: true });
    container.addEventListener('touchmove', handleUserInteraction, { passive: true });
    
    return () => {
      container.removeEventListener('wheel', handleUserInteraction);
      container.removeEventListener('touchmove', handleUserInteraction);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  const handleExpand = (segmentId: string) => {
    setExpandedId(expandedId === segmentId ? null : segmentId);
  };

  if (segments.length === 0) {
    return (
      <div className={cn("text-center py-8", className)} data-testid="segment-list-empty">
        <p className="text-muted-foreground">No segments available for this episode.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("space-y-2", className)} data-testid="segment-list">
      {segments.map((segment) => (
        <div
          key={segment.id}
          ref={(el) => {
            if (el) {
              segmentRefs.current.set(segment.id, el);
            } else {
              segmentRefs.current.delete(segment.id);
            }
          }}
        >
          <SegmentCard
            segment={segment}
            isActive={segment.id === activeSegmentId}
            isExpanded={segment.id === expandedId}
            onPlay={onPlay}
            onExpand={handleExpand}
            onAddAnnotation={onAddAnnotation}
          />
        </div>
      ))}
    </div>
  );
}

export { SegmentCard, SnippetCard };
export type { SegmentCardProps, SnippetCardProps, SegmentListProps };
