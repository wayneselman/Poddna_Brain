import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  FileText,
  Headphones,
  Video,
  Share2,
  ExternalLink,
  Copy,
  Download,
  Clock,
  Calendar,
  ChevronLeft,
  Play,
  Pause,
  Lightbulb,
  Tag,
  Users,
  TrendingUp,
  MessageCircle,
  Volume2,
  VolumeX,
  Mic2,
  Scissors,
  CheckSquare,
  Square,
} from "lucide-react";
import type { Episode, Podcast, EpisodeSegment, EpisodeInsights, EpisodeChapter } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const TAB_NAMES = ["summary", "highlights", "transcript", "integrity", "annotations", "media"] as const;
type TabName = typeof TAB_NAMES[number];

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function formatDate(dateStr: string | Date | null): string {
  if (!dateStr) return "—";
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CompactPlayer({
  episode,
  onTimeUpdate,
  currentTime,
  seekTo,
}: {
  episode: Episode;
  onTimeUpdate: (time: number) => void;
  currentTime: number;
  seekTo: number | undefined;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastSeekRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [localTime, setLocalTime] = useState(0);
  const [duration, setDuration] = useState(episode.duration || 0);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (seekTo === undefined || seekTo === lastSeekRef.current) return;
    if (audioRef.current) {
      audioRef.current.currentTime = seekTo;
      setLocalTime(seekTo);
      onTimeUpdate(seekTo);
      lastSeekRef.current = seekTo;
    }
  }, [seekTo, onTimeUpdate]);

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const time = audioRef.current.currentTime;
      setLocalTime(time);
      onTimeUpdate(time);
    }
  };

  const handleSeek = (value: number[]) => {
    const time = value[0];
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setLocalTime(time);
      onTimeUpdate(time);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0
      ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      : `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-muted/30 rounded-lg p-3" data-testid="compact-player">
      <audio
        ref={audioRef}
        src={episode.mediaUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 flex-shrink-0"
          onClick={handlePlayPause}
          data-testid="button-compact-play"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>
        <div className="flex-1 flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground w-12 text-right">
            {formatTime(localTime)}
          </span>
          <Slider
            value={[localTime]}
            min={0}
            max={duration || 1}
            step={0.1}
            onValueChange={handleSeek}
            className="flex-1"
            data-testid="slider-compact-seek"
          />
          <span className="text-xs font-mono text-muted-foreground w-12">
            {formatTime(duration)}
          </span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 flex-shrink-0"
          onClick={() => {
            if (audioRef.current) {
              audioRef.current.muted = !isMuted;
              setIsMuted(!isMuted);
            }
          }}
          data-testid="button-compact-mute"
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

function LeftColumn({
  podcastId,
  currentEpisodeId,
  onEpisodeSelect,
}: {
  podcastId: string | null;
  currentEpisodeId: string;
  onEpisodeSelect: (episodeId: string) => void;
}) {
  const { data: podcast, isLoading: podcastLoading } = useQuery<Podcast>({
    queryKey: ["/api/podcasts", podcastId],
    enabled: !!podcastId,
  });

  const { data: episodes, isLoading: episodesLoading } = useQuery<Episode[]>({
    queryKey: ["/api/podcasts", podcastId, "episodes"],
    enabled: !!podcastId,
  });

  if (!podcastId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm p-4">
        No podcast context
      </div>
    );
  }

  if (podcastLoading || episodesLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-12 w-12 rounded" />
        <Skeleton className="h-4 w-3/4" />
        <div className="space-y-2 mt-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border/50">
        {podcast?.artworkUrl && (
          <img
            src={podcast.artworkUrl}
            alt={podcast.title}
            className="w-12 h-12 rounded object-cover mb-3"
            data-testid="img-podcast-artwork"
          />
        )}
        <h3 className="font-medium text-sm leading-tight" data-testid="text-podcast-title">
          {podcast?.title ?? "Podcast"}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {episodes?.length ?? 0} episodes
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {episodes?.map((ep) => {
            const isActive = ep.id === currentEpisodeId;
            return (
              <button
                key={ep.id}
                onClick={() => onEpisodeSelect(ep.id)}
                className={`w-full text-left p-3 rounded-md transition-colors ${
                  isActive
                    ? "bg-primary/10 border-l-2 border-primary"
                    : "hover-elevate"
                }`}
                data-testid={`button-episode-${ep.id}`}
              >
                <p
                  className={`text-sm leading-tight ${
                    isActive ? "font-medium" : ""
                  }`}
                >
                  {ep.title}
                </p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span>{formatDuration(ep.duration)}</span>
                  <span>·</span>
                  <span>{formatDate(ep.publishedAt)}</span>
                  {ep.transcriptStatus === "ready" && (
                    <>
                      <span>·</span>
                      <FileText className="w-3 h-3" />
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function CenterColumn({
  episode,
  podcast,
  activeTab,
  onTabChange,
  currentTime,
  onTimeUpdate,
  seekTo,
  onSeek,
}: {
  episode: Episode | null;
  podcast: Podcast | null;
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  seekTo: number | undefined;
  onSeek: (time: number) => void;
}) {
  if (!episode) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>Select an episode to view</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-border/50">
        <div className="flex items-start gap-4">
          {podcast?.artworkUrl && (
            <img
              src={podcast.artworkUrl}
              alt={podcast.title}
              className="w-16 h-16 rounded object-cover flex-shrink-0"
              data-testid="img-episode-artwork"
            />
          )}
          <div className="flex-1 min-w-0">
            <h1
              className="text-xl font-semibold leading-tight"
              data-testid="text-episode-title"
            >
              {episode.title}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {podcast?.title}
            </p>
            <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatDuration(episode.duration)}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(episode.publishedAt)}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Badge variant="outline" className="text-xs">
                <Headphones className="w-3 h-3 mr-1" />
                Audio
              </Badge>
              {episode.transcriptStatus === "ready" && (
                <Badge variant="outline" className="text-xs">
                  <FileText className="w-3 h-3 mr-1" />
                  Transcript
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <CompactPlayer
            episode={episode}
            onTimeUpdate={onTimeUpdate}
            currentTime={currentTime}
            seekTo={seekTo}
          />
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => onTabChange(v as TabName)}
        className="flex-1 flex flex-col"
      >
        <div className="border-b border-border/50 px-6">
          <TabsList className="h-11 bg-transparent p-0 gap-1">
            {TAB_NAMES.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="capitalize data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-4"
                data-testid={`tab-${tab}`}
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6">
            <TabsContent value="summary" className="mt-0">
              <SummaryTab episodeId={episode.id} onSeek={onSeek} />
            </TabsContent>

            <TabsContent value="highlights" className="mt-0">
              <HighlightsTab episodeId={episode.id} />
            </TabsContent>

            <TabsContent value="transcript" className="mt-0">
              <TranscriptTab episodeId={episode.id} />
            </TabsContent>

            <TabsContent value="integrity" className="mt-0">
              <IntegrityTab episodeId={episode.id} />
            </TabsContent>

            <TabsContent value="annotations" className="mt-0">
              <AnnotationsTab episodeId={episode.id} />
            </TabsContent>

            <TabsContent value="media" className="mt-0">
              <MediaTab episodeId={episode.id} episode={episode} />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

function TabPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div
      className="py-16 text-center"
      data-testid={`placeholder-${title.toLowerCase()}`}
    >
      <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
        <FileText className="w-6 h-6 text-muted-foreground/50" />
      </div>
      <h3 className="text-lg font-medium text-muted-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground/70 mt-2 max-w-md mx-auto">
        {description}
      </p>
    </div>
  );
}

function formatTimestamp(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function stripHtmlAndCapWords(html: string, maxWords: number = 150): string {
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  
  const words = text.split(' ').filter(w => w.length > 0);
  if (words.length <= maxWords) return text;
  
  let capped = words.slice(0, maxWords).join(' ');
  capped = capped.replace(/\.{2,}$/, '').replace(/…$/, '').trim();
  if (capped && !/[.!?]$/.test(capped)) {
    capped = capped + '.';
  }
  return capped;
}

function SummaryTab({ episodeId, onSeek }: { episodeId: string; onSeek: (time: number) => void }) {
  const { toast } = useToast();

  const { data: chapters, isLoading: chaptersLoading } = useQuery<EpisodeChapter[]>({
    queryKey: ["/api/episodes", episodeId, "chapters"],
    enabled: !!episodeId,
  });

  const { data: segments, isLoading: segmentsLoading } = useQuery<EpisodeSegment[]>({
    queryKey: ["/api/episodes", episodeId, "episode-segments"],
    enabled: !!episodeId,
  });

  const { data: knowledge, isLoading: knowledgeLoading } = useQuery<EpisodeInsights>({
    queryKey: ["/api/episodes", episodeId, "knowledge"],
    enabled: !!episodeId,
  });

  const { data: episode } = useQuery<Episode>({
    queryKey: ["/api/episodes", episodeId],
    enabled: !!episodeId,
  });

  const isLoading = chaptersLoading || segmentsLoading || knowledgeLoading;

  const handleChapterClick = (startTime: number, title: string) => {
    onSeek(startTime);
    toast({
      title: "Jumping to chapter",
      description: title,
      duration: 2000,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="summary-loading">
        <Skeleton className="h-6 w-48" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
        <Skeleton className="h-6 w-32 mt-6" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-6 w-20" />
          ))}
        </div>
      </div>
    );
  }

  const hasChapters = chapters && chapters.length > 0;
  const hasSegments = segments && segments.length > 0;
  const hasKeyClaims = knowledge?.keyClaims && knowledge.keyClaims.length > 0;
  const hasTopics = knowledge?.topics && knowledge.topics.length > 0;
  const hasEntities = knowledge?.entities && knowledge.entities.length > 0;
  const hasDescription = episode?.description && episode.description.trim().length > 0;

  if (!hasChapters && !hasSegments && !hasKeyClaims && !hasTopics && !hasEntities) {
    return (
      <div className="py-16 text-center" data-testid="summary-empty">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
          <Lightbulb className="w-6 h-6 text-muted-foreground/50" />
        </div>
        <h3 className="text-lg font-medium text-muted-foreground">No Summary Available</h3>
        <p className="text-sm text-muted-foreground/70 mt-2 max-w-md mx-auto">
          AI-generated insights will appear here once the episode is processed.
        </p>
      </div>
    );
  }

  const summaryText = hasDescription ? stripHtmlAndCapWords(episode.description!, 150) : null;

  return (
    <div className="space-y-8" data-testid="summary-content">
      {summaryText && (
        <section data-testid="section-summary">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Summary
          </h2>
          <p className="text-sm leading-relaxed">{summaryText}</p>
        </section>
      )}

      {hasKeyClaims && (
        <section data-testid="section-key-takeaways">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Key Takeaways
          </h2>
          <ul className="space-y-3">
            {knowledge.keyClaims.slice(0, 5).map((claim, idx) => (
              <li
                key={claim.statementId}
                className="flex items-start gap-3"
                data-testid={`takeaway-${idx}`}
              >
                <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                <p className="text-sm leading-relaxed">{claim.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasChapters && (
        <section data-testid="section-chapters">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
            <MessageCircle className="w-4 h-4" />
            Episode Chapters
          </h2>
          <div className="space-y-1">
            {chapters.map((chapter) => (
              <div
                key={chapter.id}
                onClick={() => handleChapterClick(chapter.startTime, chapter.title)}
                className="flex items-center gap-3 py-2 px-2 -mx-2 rounded hover-elevate cursor-pointer"
                data-testid={`chapter-${chapter.id}`}
              >
                <span className="flex-shrink-0 text-xs text-primary font-mono bg-primary/10 px-2 py-0.5 rounded">
                  {formatTimestamp(chapter.startTime)}
                </span>
                <span className="text-sm">{chapter.title}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!hasChapters && hasSegments && (
        <section data-testid="section-segments">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
            <MessageCircle className="w-4 h-4" />
            Episode Segments
          </h2>
          <div className="space-y-1">
            {segments.map((segment) => (
              <div
                key={segment.id}
                onClick={() => handleChapterClick(segment.startTime, segment.label)}
                className="flex items-center gap-3 py-2 px-2 -mx-2 rounded hover-elevate cursor-pointer"
                data-testid={`segment-${segment.id}`}
              >
                <span className="flex-shrink-0 text-xs text-primary font-mono bg-primary/10 px-2 py-0.5 rounded">
                  {formatTimestamp(segment.startTime)}
                </span>
                <span className="text-sm">{segment.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(hasTopics || hasEntities) && (
        <section data-testid="section-topics-entities">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
            <Tag className="w-4 h-4" />
            Topics & Entities
          </h2>
          <div className="flex flex-wrap gap-2">
            {knowledge?.topics?.map((topic) => (
              <Badge
                key={topic.id}
                variant="outline"
                className="text-sm"
                data-testid={`topic-${topic.id}`}
              >
                {topic.name}
              </Badge>
            ))}
            {knowledge?.entities?.slice(0, 8).map((entity) => (
              <Badge
                key={entity.id}
                variant="secondary"
                className="text-sm"
                data-testid={`entity-${entity.id}`}
              >
                {entity.name}
              </Badge>
            ))}
            {knowledge?.entities && knowledge.entities.length > 8 && (
              <Badge variant="outline" className="text-sm text-muted-foreground">
                +{knowledge.entities.length - 8} more
              </Badge>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

type Moment = {
  segmentId: string;
  startTime: number;
  endTime: number | null;
  title: string;
  summary: string | null;
  engagementScore: number;
  sentimentSummary: {
    totalComments: number;
    positive: number;
    negative: number;
    neutral: number;
  };
};

type VideoEvent = {
  id: string;
  startTime: number;
  endTime: number | null;
  eventType: string;
  label: string | null;
  description: string | null;
  confidence: number | null;
  sourceLabel: string;
};

const HIGHLIGHT_TYPES = ["Quote", "Insight", "Story", "Humor", "Emotional Peak"] as const;
type HighlightType = typeof HIGHLIGHT_TYPES[number];

function getHighlightType(moment: Moment, event?: VideoEvent): HighlightType {
  if (event?.eventType === "humor" || event?.eventType === "joke") return "Humor";
  if (event?.eventType === "story" || event?.eventType === "anecdote") return "Story";
  if (moment.sentimentSummary.positive > moment.sentimentSummary.negative * 2) return "Insight";
  if (moment.engagementScore > 50) return "Emotional Peak";
  return "Quote";
}

function getHighlightBadgeVariant(type: HighlightType): "default" | "secondary" | "outline" {
  switch (type) {
    case "Emotional Peak": return "default";
    case "Insight": return "default";
    case "Story": return "secondary";
    case "Humor": return "secondary";
    default: return "outline";
  }
}

type EpisodeHighlight = {
  id: string;
  title: string;
  quoteText: string;
  description: string | null;
  highlightType: string;
  startTime: number;
  endTime: number;
  confidence: number;
  displayOrder: number;
};

function getHighlightIcon(type: string) {
  switch (type) {
    case "insight": return <Lightbulb className="w-5 h-5" />;
    case "quotable": return <MessageCircle className="w-5 h-5" />;
    case "quote": return <MessageCircle className="w-5 h-5" />;
    case "humor": return <Play className="w-5 h-5" />;
    case "actionable": return <CheckSquare className="w-5 h-5" />;
    case "story": return <FileText className="w-5 h-5" />;
    case "controversial": return <TrendingUp className="w-5 h-5" />;
    default: return <Lightbulb className="w-5 h-5" />;
  }
}

function getHighlightBadgeStyle(type: string): "default" | "secondary" | "outline" {
  switch (type) {
    case "insight": return "default";
    case "quotable": return "default";
    case "controversial": return "default";
    case "actionable": return "secondary";
    case "story": return "secondary";
    case "humor": return "secondary";
    default: return "outline";
  }
}

function HighlightsTab({ episodeId }: { episodeId: string }) {
  const { data: highlights, isLoading: highlightsLoading } = useQuery<EpisodeHighlight[]>({
    queryKey: ["/api/episodes", episodeId, "highlights"],
    enabled: !!episodeId,
  });

  const { data: moments, isLoading: momentsLoading } = useQuery<Moment[]>({
    queryKey: ["/api/episodes", episodeId, "moments"],
    enabled: !!episodeId,
  });

  const { data: videoEvents, isLoading: eventsLoading } = useQuery<VideoEvent[]>({
    queryKey: ["/api/episodes", episodeId, "video-events"],
    enabled: !!episodeId,
  });

  const { data: knowledge } = useQuery<EpisodeInsights>({
    queryKey: ["/api/episodes", episodeId, "knowledge"],
    enabled: !!episodeId,
  });

  const isLoading = highlightsLoading || momentsLoading || eventsLoading;

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="highlights-loading">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  const hasHighlights = highlights && highlights.length > 0;
  const hasMoments = moments && moments.length > 0;
  const hasEvents = videoEvents && videoEvents.length > 0;
  const hasEmotionalPeaks = knowledge?.emotionalPeaks && knowledge.emotionalPeaks.length > 0;

  if (!hasHighlights && !hasMoments && !hasEvents && !hasEmotionalPeaks) {
    return (
      <div className="py-16 text-center" data-testid="highlights-empty">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
          <TrendingUp className="w-6 h-6 text-muted-foreground/50" />
        </div>
        <h3 className="text-lg font-medium text-muted-foreground">No Highlights Yet</h3>
        <p className="text-sm text-muted-foreground/70 mt-2 max-w-md mx-auto">
          Key moments and highlights will appear here once the episode is analyzed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="highlights-content">
      {hasHighlights && highlights.map((highlight) => (
        <div
          key={highlight.id}
          className="p-4 rounded-lg border border-border/50 hover-elevate cursor-pointer"
          data-testid={`highlight-${highlight.id}`}
        >
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              {getHighlightIcon(highlight.highlightType)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs text-primary font-mono bg-primary/10 px-2 py-0.5 rounded">
                  {formatTimestamp(highlight.startTime)}
                </span>
                <Badge variant={getHighlightBadgeStyle(highlight.highlightType)} className="text-xs capitalize">
                  {highlight.highlightType}
                </Badge>
                {highlight.confidence >= 0.95 && (
                  <Badge variant="outline" className="text-xs">Top Pick</Badge>
                )}
              </div>
              <p className="font-medium text-sm mb-1">{highlight.title}</p>
              <p className="text-sm text-muted-foreground leading-relaxed italic">
                "{highlight.quoteText}"
              </p>
              {highlight.description && (
                <p className="text-xs text-muted-foreground/70 mt-2">
                  {highlight.description}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}

      {hasMoments && moments.map((moment, idx) => {
        const highlightType = getHighlightType(moment);
        return (
          <div
            key={moment.segmentId}
            className="p-4 rounded-lg border border-border/50 hover-elevate cursor-pointer"
            data-testid={`highlight-${idx}`}
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-muted/50 flex items-center justify-center">
                <Play className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-primary font-mono bg-primary/10 px-2 py-0.5 rounded">
                    {formatTimestamp(moment.startTime)}
                  </span>
                  <Badge variant={getHighlightBadgeVariant(highlightType)} className="text-xs">
                    {highlightType}
                  </Badge>
                </div>
                <p className="font-medium text-sm mb-1">{moment.title}</p>
                {moment.summary && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {moment.summary}
                  </p>
                )}
                {moment.engagementScore > 0 && (
                  <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      {moment.engagementScore} engagement
                    </span>
                    {moment.sentimentSummary.totalComments > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" />
                        {moment.sentimentSummary.totalComments} comments
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {hasEmotionalPeaks && knowledge.emotionalPeaks.map((peak, idx) => (
        <div
          key={peak.statementId}
          className="p-4 rounded-lg border border-border/50 hover-elevate cursor-pointer"
          data-testid={`emotional-peak-${idx}`}
        >
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center">
              <Lightbulb className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {peak.startTime !== null && (
                  <span className="text-xs text-primary font-mono bg-primary/10 px-2 py-0.5 rounded">
                    {formatTimestamp(peak.startTime)}
                  </span>
                )}
                <Badge variant="default" className="text-xs">
                  Emotional Peak
                </Badge>
              </div>
              <p className="text-sm leading-relaxed">{peak.text}</p>
            </div>
          </div>
        </div>
      ))}

      {hasEvents && videoEvents.slice(0, 8).map((event) => (
        <div
          key={event.id}
          className="p-4 rounded-lg border border-border/50 hover-elevate cursor-pointer"
          data-testid={`video-event-${event.id}`}
        >
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-muted/50 flex items-center justify-center">
              <Video className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-primary font-mono bg-primary/10 px-2 py-0.5 rounded">
                  {formatTimestamp(event.startTime)}
                </span>
                <Badge variant="outline" className="text-xs">
                  {event.eventType}
                </Badge>
              </div>
              <p className="text-sm leading-relaxed">
                {event.label || event.description || event.eventType}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

type TranscriptSegment = {
  id: string;
  startTime: number;
  endTime: number;
  speaker: string | null;
  text: string;
};

type Annotation = {
  id: string;
  startSeconds: number;
  endSeconds: number | null;
  text: string;
  userId: string | null;
  isAiGenerated: boolean;
  upvotes: number;
  createdAt: string;
};

type Claim = {
  id: string;
  startTime: number;
  endTime: number | null;
  claimText: string;
  claimType: string;
  confidence: number;
};

type EpisodeSource = {
  id: string;
  kind: string;
  platform: string | null;
  url: string;
  isCanonical: boolean;
  transcriptStatus: string | null;
};

function TranscriptTab({ episodeId }: { episodeId: string }) {
  const { data: segments, isLoading } = useQuery<TranscriptSegment[]>({
    queryKey: ["/api/episodes", episodeId, "segments"],
    enabled: !!episodeId,
  });

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="transcript-loading">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!segments || segments.length === 0) {
    return (
      <div className="py-16 text-center" data-testid="transcript-empty">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
          <FileText className="w-6 h-6 text-muted-foreground/50" />
        </div>
        <h3 className="text-lg font-medium text-muted-foreground">No Transcript Available</h3>
        <p className="text-sm text-muted-foreground/70 mt-2 max-w-md mx-auto">
          The transcript will appear here once it's been processed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1" data-testid="transcript-content">
      {segments.map((segment) => (
        <div
          key={segment.id}
          className="flex gap-3 py-2 hover-elevate rounded px-2 -mx-2 cursor-pointer"
          data-testid={`segment-${segment.id}`}
        >
          <div className="flex-shrink-0 text-xs text-muted-foreground font-mono w-12">
            {formatTimestamp(segment.startTime)}
          </div>
          {segment.speaker && (
            <div className="flex-shrink-0 text-xs font-medium text-primary w-24 truncate">
              {segment.speaker}
            </div>
          )}
          <p className="flex-1 text-sm leading-relaxed">{segment.text}</p>
        </div>
      ))}
    </div>
  );
}

function IntegrityTab({ episodeId }: { episodeId: string }) {
  const { data: claimsData, isLoading: claimsLoading } = useQuery<{ claims: Claim[] }>({
    queryKey: ["/api/episodes", episodeId, "claims"],
    enabled: !!episodeId,
  });

  const { data: knowledge, isLoading: knowledgeLoading } = useQuery<EpisodeInsights>({
    queryKey: ["/api/episodes", episodeId, "knowledge"],
    enabled: !!episodeId,
  });

  const isLoading = claimsLoading || knowledgeLoading;
  const claims = claimsData?.claims || [];

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="integrity-loading">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const hasIntegrity = knowledge?.integrity;
  const hasClaims = claims.length > 0;
  const hasContradictions = knowledge?.contradictions && knowledge.contradictions.length > 0;

  if (!hasIntegrity && !hasClaims) {
    return (
      <div className="py-16 text-center" data-testid="integrity-empty">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
          <Lightbulb className="w-6 h-6 text-muted-foreground/50" />
        </div>
        <h3 className="text-lg font-medium text-muted-foreground">No Integrity Analysis</h3>
        <p className="text-sm text-muted-foreground/70 mt-2 max-w-md mx-auto">
          Consistency scores and claims will appear here once analyzed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="integrity-content">
      {hasIntegrity && knowledge?.integrity && (
        <section className="p-6 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-4 mb-4">
            <div className="text-4xl font-bold">{knowledge.integrity.score}</div>
            <div>
              <Badge variant={
                knowledge.integrity.band === "high" ? "default" :
                knowledge.integrity.band === "medium" ? "secondary" : "outline"
              }>
                {knowledge.integrity.band} consistency
              </Badge>
              <p className="text-sm text-muted-foreground mt-1">{knowledge.integrity.summary}</p>
            </div>
          </div>
        </section>
      )}

      {hasClaims && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">
            Detected Claims ({claims.length})
          </h2>
          <div className="space-y-3">
            {claims.slice(0, 10).map((claim) => (
              <div
                key={claim.id}
                className="p-4 rounded-lg border border-border/50"
                data-testid={`claim-${claim.id}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Badge variant="outline" className="text-xs">
                    {claim.claimType}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(claim.confidence * 100)}% confidence
                  </span>
                </div>
                <p className="text-sm">{claim.claimText}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  at {formatTimestamp(claim.startTime)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {hasContradictions && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">
            Contradictions Found ({knowledge.contradictions.length})
          </h2>
          <div className="space-y-4">
            {knowledge.contradictions.map((c, idx) => (
              <div key={idx} className="p-4 bg-destructive/5 rounded-lg border border-destructive/20">
                <p className="text-sm mb-2">{c.statementAText}</p>
                <p className="text-xs text-muted-foreground mb-2">contradicts</p>
                <p className="text-sm">{c.statementBText}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AnnotationsTab({ episodeId }: { episodeId: string }) {
  const { data: annotations, isLoading } = useQuery<Annotation[]>({
    queryKey: ["/api/episodes", episodeId, "annotations"],
    enabled: !!episodeId,
  });

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="annotations-loading">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!annotations || annotations.length === 0) {
    return (
      <div className="py-16 text-center" data-testid="annotations-empty">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
          <MessageCircle className="w-6 h-6 text-muted-foreground/50" />
        </div>
        <h3 className="text-lg font-medium text-muted-foreground">No Annotations Yet</h3>
        <p className="text-sm text-muted-foreground/70 mt-2 max-w-md mx-auto">
          Be the first to add an annotation to this episode.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="annotations-content">
      {annotations.map((annotation) => (
        <div
          key={annotation.id}
          className="p-4 rounded-lg border border-border/50"
          data-testid={`annotation-${annotation.id}`}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-xs text-muted-foreground font-mono">
              {formatTimestamp(annotation.startSeconds)}
            </span>
            <div className="flex items-center gap-2">
              {annotation.isAiGenerated && (
                <Badge variant="secondary" className="text-xs">AI</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {annotation.upvotes} upvotes
              </span>
            </div>
          </div>
          <p className="text-sm">{annotation.text}</p>
        </div>
      ))}
    </div>
  );
}

function MediaTab({ episodeId, episode }: { episodeId: string; episode: Episode }) {
  const { data: sources, isLoading } = useQuery<EpisodeSource[]>({
    queryKey: ["/api/episodes", episodeId, "sources"],
    enabled: !!episodeId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="media-loading">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const audioSources = sources?.filter(s => s.kind === "audio") || [];
  const videoSources = sources?.filter(s => s.kind === "video") || [];

  return (
    <div className="space-y-8" data-testid="media-content">
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
          <Headphones className="w-4 h-4" />
          Audio Sources
        </h2>
        {audioSources.length > 0 ? (
          <div className="space-y-2">
            {audioSources.map((source) => (
              <div
                key={source.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border/50"
                data-testid={`source-${source.id}`}
              >
                <Headphones className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{source.platform || "Audio"}</p>
                  <p className="text-xs text-muted-foreground truncate">{source.url}</p>
                </div>
                {source.isCanonical && <Badge variant="default" className="text-xs">Primary</Badge>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No audio sources listed</p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
          <Video className="w-4 h-4" />
          Video Sources
        </h2>
        {videoSources.length > 0 ? (
          <div className="space-y-2">
            {videoSources.map((source) => (
              <div
                key={source.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border/50"
                data-testid={`source-${source.id}`}
              >
                <Video className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{source.platform || "Video"}</p>
                  <p className="text-xs text-muted-foreground truncate">{source.url}</p>
                </div>
                {source.transcriptStatus === "ready" && (
                  <Badge variant="outline" className="text-xs">Transcript</Badge>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No video sources available</p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Transcript Info
        </h2>
        <div className="p-4 bg-muted/30 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm">Status</span>
            <Badge variant={episode.transcriptStatus === "ready" ? "default" : "secondary"}>
              {episode.transcriptStatus || "none"}
            </Badge>
          </div>
          {episode.transcriptSource && (
            <div className="flex items-center justify-between">
              <span className="text-sm">Source</span>
              <span className="text-sm text-muted-foreground">{episode.transcriptSource}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

type Speaker = {
  name: string;
  talkTimePercent: number;
};

function RightColumn({
  episode,
  podcast,
}: {
  episode: Episode | null;
  podcast: Podcast | null;
}) {
  const { data: moments } = useQuery<Moment[]>({
    queryKey: ["/api/episodes", episode?.id, "moments"],
    enabled: !!episode?.id,
  });

  const { data: knowledge } = useQuery<EpisodeInsights>({
    queryKey: ["/api/episodes", episode?.id, "knowledge"],
    enabled: !!episode?.id,
  });

  const { data: transcriptSegments } = useQuery<TranscriptSegment[]>({
    queryKey: ["/api/episodes", episode?.id, "segments"],
    enabled: !!episode?.id,
  });

  const [followUps, setFollowUps] = useState<{ id: string; label: string; done: boolean }[]>([
    { id: "1", label: "Create clip from highlight", done: false },
    { id: "2", label: "Share key insight", done: false },
    { id: "3", label: "Export transcript", done: false },
  ]);

  if (!episode) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm p-4">
        No episode selected
      </div>
    );
  }

  const speakers: Speaker[] = [];
  if (transcriptSegments && transcriptSegments.length > 0) {
    const speakerTimes: Record<string, number> = {};
    let totalTime = 0;
    transcriptSegments.forEach((seg) => {
      const duration = seg.endTime - seg.startTime;
      const speaker = seg.speaker || "Unknown";
      speakerTimes[speaker] = (speakerTimes[speaker] || 0) + duration;
      totalTime += duration;
    });
    Object.entries(speakerTimes).forEach(([name, time]) => {
      speakers.push({ name, talkTimePercent: Math.round((time / totalTime) * 100) });
    });
    speakers.sort((a, b) => b.talkTimePercent - a.talkTimePercent);
  }

  const topClips = moments?.slice(0, 3) || [];
  const tags = knowledge?.topics?.slice(0, 6) || [];

  const toggleFollowUp = (id: string) => {
    setFollowUps((prev) =>
      prev.map((f) => (f.id === id ? { ...f, done: !f.done } : f))
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border/50">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Context & Actions
        </h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {speakers.length > 0 && (
            <section data-testid="section-speakers">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Mic2 className="w-3.5 h-3.5" />
                Speakers
              </h4>
              <div className="space-y-2">
                {speakers.slice(0, 4).map((speaker) => (
                  <div
                    key={speaker.name}
                    className="flex items-center justify-between"
                    data-testid={`speaker-${speaker.name}`}
                  >
                    <span className="text-sm truncate">{speaker.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {speaker.talkTimePercent}%
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {topClips.length > 0 && (
            <section data-testid="section-clips">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Scissors className="w-3.5 h-3.5" />
                Top Clips
              </h4>
              <div className="space-y-2">
                {topClips.map((clip, idx) => (
                  <div
                    key={clip.segmentId}
                    className="flex items-center gap-2 p-2 rounded hover-elevate cursor-pointer"
                    data-testid={`clip-${idx}`}
                  >
                    <div className="w-8 h-8 rounded bg-muted/50 flex items-center justify-center flex-shrink-0">
                      <Play className="w-3 h-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate">{clip.title}</p>
                      <span className="text-xs text-muted-foreground font-mono">
                        {formatTimestamp(clip.startTime)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section data-testid="section-followups">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <CheckSquare className="w-3.5 h-3.5" />
              Follow-Ups
            </h4>
            <div className="space-y-1">
              {followUps.map((item) => (
                <button
                  key={item.id}
                  onClick={() => toggleFollowUp(item.id)}
                  className="flex items-center gap-2 w-full text-left p-1.5 rounded hover-elevate"
                  data-testid={`followup-${item.id}`}
                >
                  {item.done ? (
                    <CheckSquare className="w-4 h-4 text-primary" />
                  ) : (
                    <Square className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className={`text-xs ${item.done ? "line-through text-muted-foreground" : ""}`}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {tags.length > 0 && (
            <section data-testid="section-tags">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Tag className="w-3.5 h-3.5" />
                Tags
              </h4>
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <Badge key={tag.id} variant="outline" className="text-xs" data-testid={`tag-${tag.id}`}>
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          <section className="pt-4 border-t border-border/50 space-y-2" data-testid="section-actions">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Actions
            </h4>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              data-testid="button-share"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share Episode
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              data-testid="button-copy-link"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Link to Moment
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              data-testid="button-export"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Highlight
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              data-testid="button-view-original"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              View Original
            </Button>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

export default function EpisodePageV2() {
  const { id: episodeId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const searchParams = new URLSearchParams(window.location.search);
  const tabFromUrl = searchParams.get("tab") as TabName | null;
  const [activeTab, setActiveTab] = useState<TabName>(
    tabFromUrl && TAB_NAMES.includes(tabFromUrl) ? tabFromUrl : "summary"
  );

  const [currentTime, setCurrentTime] = useState(0);
  const [seekTo, setSeekTo] = useState<number | undefined>(undefined);

  const { data: episode, isLoading: episodeLoading } = useQuery<Episode>({
    queryKey: ["/api/episodes", episodeId],
    enabled: !!episodeId,
  });

  const { data: podcast, isLoading: podcastLoading } = useQuery<Podcast>({
    queryKey: ["/api/podcasts", episode?.podcastId],
    enabled: !!episode?.podcastId,
  });

  useEffect(() => {
    const newParams = new URLSearchParams(window.location.search);
    newParams.set("tab", activeTab);
    const newUrl = `${window.location.pathname}?${newParams.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [activeTab]);

  const handleEpisodeSelect = (newEpisodeId: string) => {
    setLocation(`/episodes/${newEpisodeId}?tab=${activeTab}`);
  };

  const handleTabChange = (tab: TabName) => {
    setActiveTab(tab);
  };

  if (episodeLoading) {
    return (
      <div className="h-screen flex">
        <div className="w-64 border-r border-border/50 bg-muted/20 p-4">
          <Skeleton className="h-12 w-12 rounded mb-3" />
          <Skeleton className="h-4 w-3/4 mb-6" />
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full mb-2" />
          ))}
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-16 w-full mb-4" />
          <Skeleton className="h-20 w-full mb-4" />
          <Skeleton className="h-10 w-full mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="w-64 border-l border-border/50 bg-muted/20 p-4">
          <Skeleton className="h-4 w-full mb-4" />
          <Skeleton className="h-4 w-3/4 mb-4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-background" data-testid="episode-page-v2">
      <aside
        className="w-64 flex-shrink-0 border-r border-border/50 bg-muted/10 hidden lg:block"
        data-testid="left-column"
      >
        <LeftColumn
          podcastId={episode?.podcastId ?? null}
          currentEpisodeId={episodeId ?? ""}
          onEpisodeSelect={handleEpisodeSelect}
        />
      </aside>

      <main className="flex-1 min-w-0" data-testid="center-column">
        <CenterColumn
          episode={episode ?? null}
          podcast={podcast ?? null}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          currentTime={currentTime}
          onTimeUpdate={setCurrentTime}
          seekTo={seekTo}
          onSeek={setSeekTo}
        />
      </main>

      <aside
        className="w-72 flex-shrink-0 border-l border-border/50 bg-muted/10 hidden xl:block"
        data-testid="right-column"
      >
        <RightColumn episode={episode ?? null} podcast={podcast ?? null} />
      </aside>
    </div>
  );
}
