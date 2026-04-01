import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useParams, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Play, 
  Pause, 
  ExternalLink, 
  MessageSquare, 
  Music, 
  Package, 
  ThumbsUp,
  MoreHorizontal,
  Clock,
  Volume2,
  VolumeX,
  Maximize2,
  Trash2,
  ChevronDown,
  Headphones,
  FileText,
  Video,
  AlertCircle,
  Film,
  Clapperboard,
  Loader2,
  XCircle,
  Sparkles,
  TrendingUp,
  ShieldCheck,
  Plus,
  Minus,
  RefreshCw,
  Share2,
} from "lucide-react";
import { SiYoutube, SiSpotify, SiApplepodcasts } from "react-icons/si";
import TranscriptSegment from "@/components/transcript-segment";
import TranscriptReader from "@/components/transcript-reader";
import AnnotationPopup from "@/components/annotation-popup";
import MusicWidget from "@/components/music-widget";
import AiSuggestionsLane from "@/components/ai-suggestions-lane";
import MentionedEntities from "@/components/mentioned-entities";
import SegmentList from "@/components/segment-list";
import type { Snippet } from "@/components/segment-list";
import MomentsChips from "@/components/moments-chips";
import AttributionBar from "@/components/attribution-bar";
import AudioClipCard from "@/components/audio-clip-card";
import EpisodeSidebar from "@/components/episode-sidebar";
import { AnalysisStatusBadge, getStatusFromJobStatus } from "@/components/analysis-status-badge";
import {
  BentoSection,
  BentoCard,
  BentoCardHeader,
  BentoCardTitle,
  BentoCardBody,
  BentoCardMeta,
  BentoGrid,
  BentoStat,
  BentoMoment,
  BentoEntityBadge,
} from "@/components/bento";
import type { Episode, TranscriptSegment as Segment, Annotation, Podcast, MusicDetection, ClipWithAuthor, EpisodeSource, VideoEvent, SourceTranscriptSegment, EpisodeDiff } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Extended episode type that includes sources from API
interface EpisodeWithSources extends Episode {
  sources?: EpisodeSource[];
  canonicalSourceId?: string | null;
}

// YouTube Player types
declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        config: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: { target: YouTubePlayer }) => void;
            onStateChange?: (event: { data: number; target: YouTubePlayer }) => void;
          };
        }
      ) => YouTubePlayer;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YouTubePlayer {
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
}

function getYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\s?]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function extractSpotifyEpisodeId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/episode\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function extractApplePodcastsEmbedUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(/podcasts\.apple\.com\/([a-z]{2})\/podcast\/[^/]+\/id(\d+)\?i=(\d+)/);
  if (match) {
    return `https://embed.podcasts.apple.com/${match[1]}/podcast/id${match[2]}?i=${match[3]}`;
  }
  const showMatch = url.match(/podcasts\.apple\.com\/([a-z]{2})\/podcast\/[^/]+\/id(\d+)/);
  if (showMatch) {
    return `https://embed.podcasts.apple.com/${showMatch[1]}/podcast/id${showMatch[2]}`;
  }
  return null;
}

let youtubeAPILoaded = false;
let youtubeAPICallbacks: (() => void)[] = [];

function loadYouTubeAPI(callback: () => void) {
  if (youtubeAPILoaded && window.YT) {
    callback();
    return;
  }
  youtubeAPICallbacks.push(callback);
  if (document.getElementById("youtube-iframe-api")) return;
  
  const tag = document.createElement("script");
  tag.id = "youtube-iframe-api";
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScriptTag = document.getElementsByTagName("script")[0];
  firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
  
  window.onYouTubeIframeAPIReady = () => {
    youtubeAPILoaded = true;
    youtubeAPICallbacks.forEach((cb) => cb());
    youtubeAPICallbacks = [];
  };
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// Diff sample types matching the backend
interface DiffSampleAdded {
  text: string;
  approxStartTime: number;
  approxEndTime: number;
}

interface DiffSampleRemoved {
  text: string;
  approxStartTime: number;
  approxEndTime: number;
}

interface DiffSampleModified {
  before: string;
  after: string;
  approxStartTime: number;
  approxEndTime: number;
}

interface DiffSamples {
  added: DiffSampleAdded[];
  removed: DiffSampleRemoved[];
  modified: DiffSampleModified[];
}

interface DiffMetrics {
  similarity: number;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  totalComparedChars: number;
  totalComparedSegments: number;
}

interface DiffResponse {
  hasDiff: boolean;
  diff?: {
    id: string;
    episodeId: string;
    primarySource: string;
    secondarySource: string;
    summary: string | null;
    metrics: DiffMetrics;
    samples: DiffSamples;
    createdAt: string;
  };
  message?: string;
}

interface SponsorSegment {
  id: string;
  startTime: number;
  endTime: number | null;
  brand: string | null;
  confidence: number;
  excerpt: string;
}

interface SponsorsResponse {
  sponsors: SponsorSegment[];
}

interface EpisodeClaim {
  id: string;
  startTime: number;
  endTime: number | null;
  claimText: string;
  claimType: string;
  confidence: number;
}

interface ClaimsResponse {
  claims: EpisodeClaim[];
}

interface EpisodeKeyIdea {
  id: string;
  title: string;
  summary: string;
  startTime: number;
  endTime: number;
  topicCategory?: string | null;
  subTopic?: string | null;
  importanceScore?: number | null;
  segmentIds: string[];
}

interface EpisodeKnowledge {
  episodeId: string;
  keyIdeas: EpisodeKeyIdea[];
  relatedEpisodes: Array<{
    episodeId: string;
    title: string;
    podcastTitle: string;
    overlapTopics: string[];
    overlapScore: number;
  }>;
  relatedClaims: Array<{
    claimId: string;
    text: string;
    confidenceScore?: number | null;
    episodesCount?: number | null;
  }>;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface AIHealthTask {
  type: string;
  label: string;
  stage: string;
  status: "not_started" | "pending" | "running" | "done" | "error";
  lastError: string | null;
  attempts: number;
  jobCount: number;
}

interface AIHealthResponse {
  episodeId: string;
  episodeTitle: string;
  tasks: AIHealthTask[];
  summary: {
    total: number;
    done: number;
    pending: number;
    running: number;
    error: number;
    notStarted: number;
  };
}

function AIHealthPanel({ episodeId }: { episodeId: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { data, isLoading, error } = useQuery<AIHealthResponse>({
    queryKey: ['/api/admin/episodes', episodeId, 'ai-health'],
    enabled: isAdmin,
    refetchInterval: 10000,
  });

  if (!isAdmin) return null;

  if (isLoading) {
    return (
      <Card className="p-4" data-testid="ai-health-loading">
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-4 text-center text-muted-foreground" data-testid="ai-health-error">
        <AlertCircle className="w-6 h-6 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Failed to load AI health status</p>
      </Card>
    );
  }

  const statusIcon = (status: AIHealthTask["status"]) => {
    switch (status) {
      case "done":
        return <ShieldCheck className="w-4 h-4 text-green-600" />;
      case "running":
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      case "pending":
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case "error":
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const statusColor = (status: AIHealthTask["status"]) => {
    switch (status) {
      case "done": return "bg-green-100 dark:bg-green-950/30";
      case "running": return "bg-blue-100 dark:bg-blue-950/30";
      case "pending": return "bg-yellow-100 dark:bg-yellow-950/30";
      case "error": return "bg-red-100 dark:bg-red-950/30";
      default: return "bg-muted/50";
    }
  };

  const ingestTasks = data.tasks.filter(t => t.stage === "INGEST");
  const intelTasks = data.tasks.filter(t => t.stage === "INTEL");

  return (
    <Card className="p-4" data-testid="ai-health-panel">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold flex items-center gap-2 text-sm">
          <Sparkles className="w-4 h-4" />
          AI Pipeline Health
        </h4>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="text-green-600">{data.summary.done} done</span>
          {data.summary.running > 0 && <span className="text-blue-600">{data.summary.running} running</span>}
          {data.summary.pending > 0 && <span className="text-yellow-600">{data.summary.pending} pending</span>}
          {data.summary.error > 0 && <span className="text-red-600">{data.summary.error} failed</span>}
        </div>
      </div>

      <div className="space-y-3">
        {/* INGEST Stage */}
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">Content Ingest</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {ingestTasks.map(task => (
              <div 
                key={task.type} 
                className={`flex items-center gap-1.5 p-1.5 rounded text-xs ${statusColor(task.status)}`}
                title={task.lastError ? `Error: ${task.lastError}` : undefined}
                data-testid={`health-task-${task.type}`}
              >
                {statusIcon(task.status)}
                <span className="truncate">{task.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* INTEL Stage */}
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">AI Analysis</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {intelTasks.map(task => (
              <div 
                key={task.type} 
                className={`flex items-center gap-1.5 p-1.5 rounded text-xs ${statusColor(task.status)}`}
                title={task.lastError ? `Error: ${task.lastError}` : undefined}
                data-testid={`health-task-${task.type}`}
              >
                {statusIcon(task.status)}
                <span className="truncate">{task.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Error details */}
        {data.summary.error > 0 && (
          <div className="mt-2 pt-2 border-t">
            <div className="text-xs font-medium text-red-600 mb-1">Failed Tasks:</div>
            <div className="space-y-1">
              {data.tasks.filter(t => t.status === "error").map(task => (
                <div key={task.type} className="text-xs p-2 bg-red-50 dark:bg-red-950/20 rounded">
                  <div className="font-medium">{task.label}</div>
                  <div className="text-muted-foreground mt-0.5 break-words">
                    {task.lastError || "Unknown error"} (Attempts: {task.attempts})
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function IntegrityPanel({ episodeId, onSeek }: { episodeId: string; onSeek: (time: number) => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === 'admin';

  const { data: diffData, isLoading: diffLoading, error: diffError } = useQuery<DiffResponse>({
    queryKey: ['/api/episodes', episodeId, 'diff'],
  });

  const { data: sponsorsData, isLoading: sponsorsLoading, error: sponsorsError } = useQuery<SponsorsResponse>({
    queryKey: ['/api/episodes', episodeId, 'sponsors'],
  });

  const { data: claimsData, isLoading: claimsLoading, error: claimsError } = useQuery<ClaimsResponse>({
    queryKey: ['/api/episodes', episodeId, 'claims'],
  });

  const runDiffMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/admin/episodes/${episodeId}/diff`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/episodes', episodeId, 'diff'] });
      toast({ 
        title: "Diff analysis complete", 
        description: "Integrity panel updated with new comparison data." 
      });
    },
    onError: (err: Error) => {
      const message = err.message || "Failed to run diff analysis. Please try again.";
      toast({ 
        title: "Diff analysis failed", 
        description: message, 
        variant: "destructive" 
      });
    },
  });

  const sponsors = sponsorsData?.sponsors ?? [];
  const claims = claimsData?.claims ?? [];
  const hasDiff = diffData?.hasDiff ?? false;
  const hasSponsors = sponsors.length > 0;
  const hasClaims = claims.length > 0;
  const hasContent = hasDiff || hasSponsors || hasClaims;
  const diff = diffData?.diff;

  // Calculate claim type counts
  const claimTypeCounts = claims.reduce((acc, claim) => {
    acc[claim.claimType] = (acc[claim.claimType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (diffLoading || sponsorsLoading || claimsLoading) {
    return (
      <div className="space-y-4" data-testid="integrity-loading">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (diffError && sponsorsError && claimsError) {
    return (
      <div className="text-center py-12 text-muted-foreground" data-testid="integrity-error">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Failed to load integrity analysis</p>
        <p className="text-sm mt-1">Try refreshing the page</p>
      </div>
    );
  }

  if (!hasContent) {
    return (
      <div className="text-center py-12 text-muted-foreground" data-testid="integrity-empty">
        <ShieldCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No integrity analysis available</p>
        <p className="text-sm mt-1">Analysis will be available once the episode has multiple transcript sources</p>
        {isAdmin && (
          <Button
            onClick={() => runDiffMutation.mutate()}
            disabled={runDiffMutation.isPending}
            variant="outline"
            size="sm"
            className="mt-4"
            data-testid="button-run-diff-empty"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${runDiffMutation.isPending ? 'animate-spin' : ''}`} />
            {runDiffMutation.isPending ? "Running..." : "Run Diff Analysis"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="integrity-panel">
      {/* ===== INTEGRITY SUMMARY CARD ===== */}
      <Card className="p-5" data-testid="integrity-summary-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Integrity Summary
          </h3>
          {isAdmin && (
            <Button
              onClick={() => runDiffMutation.mutate()}
              disabled={runDiffMutation.isPending}
              variant="outline"
              size="sm"
              data-testid="button-run-diff"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${runDiffMutation.isPending ? 'animate-spin' : ''}`} />
              {runDiffMutation.isPending ? "Analyzing..." : "Re-analyze"}
            </Button>
          )}
        </div>

        {/* Summary Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Transcript Consistency */}
          <div className="text-center p-3 rounded-lg bg-muted/50" data-testid="stat-consistency">
            <div className={`text-2xl font-bold ${
              hasDiff && diff 
                ? (Math.round(diff.metrics.similarity * 100) >= 95 ? 'text-green-600' : Math.round(diff.metrics.similarity * 100) >= 80 ? 'text-yellow-600' : 'text-red-600')
                : 'text-muted-foreground'
            }`}>
              {hasDiff && diff ? `${Math.round(diff.metrics.similarity * 100)}%` : '—'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Transcript Consistency</div>
          </div>

          {/* Changes Count */}
          <div className="text-center p-3 rounded-lg bg-muted/50" data-testid="stat-changes">
            <div className="text-2xl font-bold text-foreground">
              {hasDiff && diff 
                ? (diff.metrics.addedCount + diff.metrics.removedCount + diff.metrics.modifiedCount) 
                : '—'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {hasDiff && diff && (
                <span className="flex items-center justify-center gap-1">
                  <span className="text-green-600">+{diff.metrics.addedCount}</span>
                  <span className="text-red-600">-{diff.metrics.removedCount}</span>
                  <span className="text-yellow-600">~{diff.metrics.modifiedCount}</span>
                </span>
              )}
              {(!hasDiff || !diff) && 'Transcript Changes'}
            </div>
          </div>

          {/* Sponsors */}
          <div className="text-center p-3 rounded-lg bg-muted/50" data-testid="stat-sponsors">
            <div className="text-2xl font-bold text-foreground flex items-center justify-center gap-1">
              <Package className="w-4 h-4 text-muted-foreground" />
              {sponsors.length}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Sponsor Segments</div>
          </div>

          {/* Claims */}
          <div className="text-center p-3 rounded-lg bg-muted/50" data-testid="stat-claims">
            <div className="text-2xl font-bold text-foreground flex items-center justify-center gap-1">
              <AlertCircle className="w-4 h-4 text-muted-foreground" />
              {claims.length}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {claims.length > 0 && Object.keys(claimTypeCounts).length > 0 ? (
                <span>
                  {Object.entries(claimTypeCounts).map(([type, count], i) => (
                    <span key={type}>
                      {i > 0 && ', '}
                      {type}: {count}
                    </span>
                  ))}
                </span>
              ) : (
                'Claims Detected'
              )}
            </div>
          </div>
        </div>

        {/* Source comparison info */}
        {hasDiff && diff && (
          <div className="mt-4 pt-4 border-t text-sm text-muted-foreground flex items-center justify-between">
            <span>
              Comparing <span className="font-medium text-foreground">{diff.primarySource}</span> vs <span className="font-medium text-foreground">{diff.secondarySource}</span>
            </span>
            <span className="text-xs">
              Analyzed {new Date(diff.createdAt).toLocaleDateString()}
            </span>
          </div>
        )}
      </Card>

      {/* ===== DIFF SAMPLES CARD ===== */}
      {hasDiff && diff && (diff.metrics.addedCount + diff.metrics.removedCount + diff.metrics.modifiedCount) > 0 && (
        <Card className="p-5" data-testid="diff-samples-card">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4" />
            Transcript Differences
            <span className="text-xs font-normal text-muted-foreground">
              ({diff.metrics.addedCount + diff.metrics.removedCount + diff.metrics.modifiedCount} changes)
            </span>
          </h3>

          {/* Summary text */}
          {diff.summary && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm mb-4">
              {diff.summary}
            </div>
          )}

          <div className="space-y-4">
            {/* Modified Samples */}
            {diff.samples.modified.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                  <RefreshCw className="w-3 h-3 text-yellow-600" />
                  Modified ({diff.samples.modified.length})
                </h5>
                {diff.samples.modified.slice(0, 5).map((sample, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2 bg-yellow-50/50 dark:bg-yellow-950/20" data-testid={`sample-modified-${i}`}>
                    <div className="flex items-start gap-2">
                      <span className="text-xs bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded shrink-0">Before</span>
                      <p className="text-sm line-through text-muted-foreground">{sample.before}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-xs bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded shrink-0">After</span>
                      <p className="text-sm">{sample.after}</p>
                    </div>
                    <button 
                      type="button"
                      className="text-xs font-mono text-primary hover:underline flex items-center gap-1"
                      onClick={() => onSeek(sample.approxStartTime)}
                      data-testid={`button-jump-modified-${i}`}
                    >
                      <Play className="w-3 h-3" />
                      {formatTime(sample.approxStartTime)}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Added Samples */}
            {diff.samples.added.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                  <Plus className="w-3 h-3 text-green-600" />
                  Added in {diff.secondarySource} ({diff.samples.added.length})
                </h5>
                {diff.samples.added.slice(0, 5).map((sample, i) => (
                  <div key={i} className="border rounded-lg p-3 border-l-4 border-l-green-500 bg-green-50/50 dark:bg-green-950/20" data-testid={`sample-added-${i}`}>
                    <p className="text-sm text-green-700 dark:text-green-300">{sample.text}</p>
                    <button 
                      type="button"
                      className="text-xs font-mono text-primary hover:underline flex items-center gap-1 mt-2"
                      onClick={() => onSeek(sample.approxStartTime)}
                      data-testid={`button-jump-added-${i}`}
                    >
                      <Play className="w-3 h-3" />
                      {formatTime(sample.approxStartTime)}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Removed Samples */}
            {diff.samples.removed.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                  <Minus className="w-3 h-3 text-red-600" />
                  Removed from {diff.primarySource} ({diff.samples.removed.length})
                </h5>
                {diff.samples.removed.slice(0, 5).map((sample, i) => (
                  <div key={i} className="border rounded-lg p-3 border-l-4 border-l-red-500 bg-red-50/50 dark:bg-red-950/20" data-testid={`sample-removed-${i}`}>
                    <p className="text-sm text-red-700 dark:text-red-300 line-through">{sample.text}</p>
                    <button 
                      type="button"
                      className="text-xs font-mono text-primary hover:underline flex items-center gap-1 mt-2"
                      onClick={() => onSeek(sample.approxStartTime)}
                      data-testid={`button-jump-removed-${i}`}
                    >
                      <Play className="w-3 h-3" />
                      {formatTime(sample.approxStartTime)}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ===== SPONSOR TIMELINE CARD ===== */}
      {hasSponsors && (
        <Card className="p-5" data-testid="sponsor-timeline-card">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <Package className="w-4 h-4" />
            Sponsor Timeline
            <span className="text-xs font-normal text-muted-foreground">({sponsors.length} detected)</span>
          </h3>
          <div className="space-y-2">
            {sponsors.map((sponsor) => (
              <div
                key={sponsor.id}
                className="flex items-start justify-between rounded-md border px-3 py-2 gap-3 hover-elevate"
                data-testid={`sponsor-segment-${sponsor.id}`}
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <button
                    type="button"
                    className="text-sm font-mono text-primary hover:underline"
                    onClick={() => onSeek(sponsor.startTime)}
                    data-testid={`button-jump-sponsor-${sponsor.id}`}
                  >
                    {formatTime(sponsor.startTime)} {sponsor.endTime ? `→ ${formatTime(sponsor.endTime)}` : ''}
                  </button>
                  <div className="text-sm text-muted-foreground line-clamp-2">
                    {sponsor.excerpt}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {sponsor.brand && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium" data-testid={`badge-sponsor-brand-${sponsor.id}`}>
                      {sponsor.brand}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {sponsor.confidence}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ===== CLAIMS TIMELINE CARD ===== */}
      {hasClaims && (
        <Card className="p-5" data-testid="claims-timeline-card">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <AlertCircle className="w-4 h-4" />
            Claims Detected
            <span className="text-xs font-normal text-muted-foreground">({claims.length} found)</span>
          </h3>
          <div className="space-y-2">
            {claims.map((claim) => (
              <div
                key={claim.id}
                className="flex items-start justify-between rounded-md border px-3 py-2 gap-3 hover-elevate"
                data-testid={`claim-segment-${claim.id}`}
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <button
                    type="button"
                    className="text-sm font-mono text-primary hover:underline"
                    onClick={() => onSeek(claim.startTime)}
                    data-testid={`button-jump-claim-${claim.id}`}
                  >
                    {formatTime(claim.startTime)} {claim.endTime ? `→ ${formatTime(claim.endTime)}` : ''}
                  </button>
                  <div className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-claim-${claim.id}`}>
                    {claim.claimText}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span 
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      claim.claimType === 'financial' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' :
                      claim.claimType === 'medical' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' :
                      claim.claimType === 'sensitive' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300' :
                      'bg-muted text-muted-foreground'
                    }`}
                    data-testid={`badge-claimtype-${claim.id}`}
                  >
                    {claim.claimType}
                  </span>
                  <span 
                    className="text-xs text-muted-foreground"
                    data-testid={`text-claim-confidence-${claim.id}`}
                  >
                    {claim.confidence}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ===== REPORT BUTTONS ===== */}
      <div className="flex flex-wrap gap-3 justify-end pt-2" data-testid="integrity-report-buttons">
        <Button
          variant="outline"
          size="sm"
          data-testid="button-share-integrity"
          onClick={() => {
            const shareUrl = `${window.location.origin}/share/integrity/${episodeId}`;
            if (navigator.share) {
              navigator.share({
                title: "Podcast Integrity Snapshot · PodDNA",
                text: "Check out this episode's integrity score.",
                url: shareUrl,
              }).catch(() => {});
            } else {
              navigator.clipboard.writeText(shareUrl).then(() => {
                toast({ title: "Link copied", description: "Share link copied to clipboard" });
              }).catch(() => {
                toast({ title: "Copy failed", description: "Could not copy link", variant: "destructive" });
              });
            }
          }}
        >
          <Share2 className="w-4 h-4 mr-2" />
          Share Score
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="button-open-report"
          onClick={() => window.open(`/reports/${episodeId}`, '_blank')}
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          Open Integrity Report
        </Button>
      </div>

      {/* Analyzer CTA footer */}
      <div className="text-center pt-4 border-t border-muted/30">
        <Link href="/analyzer">
          <span className="text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer" data-testid="link-analyzer-cta">
            Analyze another episode <span className="ml-1">→</span>
          </span>
        </Link>
      </div>
    </div>
  );
}

function KnowledgeMapPanel({ episodeId, onSeek }: { episodeId: string; onSeek: (time: number) => void }) {
  const { data, isLoading, error } = useQuery<EpisodeKnowledge>({
    queryKey: ['/api/episodes', episodeId, 'knowledge'],
  });

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="knowledge-loading">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-muted-foreground" data-testid="knowledge-error">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Failed to load knowledge map</p>
        <p className="text-sm mt-1">Try refreshing the page</p>
      </div>
    );
  }

  const keyIdeas = data?.keyIdeas ?? [];

  if (keyIdeas.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground" data-testid="knowledge-empty">
        <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No key ideas available yet</p>
        <p className="text-sm mt-1">Run semantic analysis from the admin panel to generate key ideas</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="knowledge-panel">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          Key Ideas
        </h3>
        <span className="text-sm text-muted-foreground">
          {keyIdeas.length} idea{keyIdeas.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-3">
        {keyIdeas.map((idea, idx) => (
          <Card 
            key={idea.id} 
            className="p-4 hover-elevate cursor-pointer"
            onClick={() => onSeek(idea.startTime)}
            data-testid={`card-key-idea-${idea.id}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-medium">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-medium truncate">{idea.title}</span>
                  {idea.topicCategory && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                      {idea.topicCategory}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {idea.summary}
                </p>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(idea.startTime)} - {formatTime(idea.endTime)}
                  </span>
                  {idea.importanceScore !== null && idea.importanceScore !== undefined && (
                    <span className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      {Math.round(idea.importanceScore * 100)}% importance
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(idea.startTime);
                }}
                data-testid={`button-play-idea-${idea.id}`}
              >
                <Play className="w-3 h-3 mr-1" />
                Play
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

interface BentoInsightsPanelProps {
  episodeId: string;
  snippets: Snippet[];
  currentTime: number;
  onSeek: (time: number) => void;
  onAddAnnotation: (startTime: number) => void;
  clips?: ClipWithAuthor[];
  annotations?: Annotation[];
}

function BentoInsightsPanel({ 
  episodeId, 
  snippets, 
  currentTime, 
  onSeek,
  onAddAnnotation,
  clips = [],
  annotations = [],
}: BentoInsightsPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === 'admin';

  const { data: knowledgeData, isLoading: knowledgeLoading } = useQuery<EpisodeKnowledge>({
    queryKey: ['/api/episodes', episodeId, 'knowledge'],
  });

  const { data: sponsorsData, isLoading: sponsorsLoading } = useQuery<SponsorsResponse>({
    queryKey: ['/api/episodes', episodeId, 'sponsors'],
  });

  const { data: claimsData, isLoading: claimsLoading } = useQuery<ClaimsResponse>({
    queryKey: ['/api/episodes', episodeId, 'claims'],
  });

  const { data: diffData } = useQuery<DiffResponse>({
    queryKey: ['/api/episodes', episodeId, 'diff'],
  });

  const keyIdeas = knowledgeData?.keyIdeas ?? [];
  const sponsors = sponsorsData?.sponsors ?? [];
  const claims = claimsData?.claims ?? [];
  const hasDiff = diffData?.hasDiff ?? false;
  const diff = diffData?.diff;

  // Derive Emotional Peaks from high-importance key ideas (>= 70%)
  const emotionalPeaks = keyIdeas
    .filter(idea => (idea.importanceScore ?? 0) >= 70)
    .sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0))
    .slice(0, 4);

  // Regular key ideas (excluding emotional peaks for display)
  const regularKeyIdeas = keyIdeas
    .filter(idea => (idea.importanceScore ?? 0) < 70)
    .slice(0, 4);

  const claimTypeCounts = claims.reduce((acc, claim) => {
    acc[claim.claimType] = (acc[claim.claimType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Show loading skeleton if ANY data is still loading
  if (knowledgeLoading || sponsorsLoading || claimsLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8" data-testid="bento-insights-loading">
        <div className="space-y-6">
          <Skeleton className="h-32 w-full rounded-[12px]" />
          <Skeleton className="h-24 w-full rounded-[12px]" />
          <Skeleton className="h-48 w-full rounded-[12px]" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-40 w-full rounded-[12px]" />
          <Skeleton className="h-32 w-full rounded-[12px]" />
        </div>
      </div>
    );
  }

  // Check if we have any left column content (right column components handle their own empty states)
  const hasLeftContent = keyIdeas.length > 0 || emotionalPeaks.length > 0 || claims.length > 0 || sponsors.length > 0 || snippets.length > 0;

  // Show empty state only if left column has no content
  // Right column (AI Suggestions, Entities) will render their own components which handle empty states internally
  if (!hasLeftContent) {
    return (
      <div className="text-center py-12" data-testid="bento-insights-empty">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-slate-400" />
        </div>
        <p className="text-foreground font-medium">No insights available yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Run semantic analysis from the admin panel to generate insights
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8" data-testid="bento-insights-panel">
      {/* ===== LEFT COLUMN: Primary Insights ===== */}
      <div className="space-y-8">
        {/* SECTION 1: Key Ideas - Topic cards with importance % */}
        {keyIdeas.length > 0 && (
          <BentoSection 
            title="Key Ideas" 
            icon={<Sparkles className="w-4 h-4" />}
            description={`${keyIdeas.length} semantic insights`}
          >
            <div className="grid grid-cols-2 gap-3">
              {keyIdeas.slice(0, 6).map((idea) => (
                <button
                  key={idea.id}
                  type="button"
                  onClick={() => onSeek(idea.startTime)}
                  className="text-left p-4 rounded-[12px] border border-[#e6e6e6] bg-white dark:bg-card hover-elevate transition-all"
                  data-testid={`key-idea-${idea.id}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-foreground line-clamp-2">
                      {idea.title}
                    </span>
                    {idea.importanceScore && (
                      <span className="shrink-0 text-xs font-semibold text-[#ffe166] bg-[#ffe166]/10 px-2 py-0.5 rounded-full">
                        {idea.importanceScore}%
                      </span>
                    )}
                  </div>
                  {idea.topicCategory && (
                    <span className="text-xs text-muted-foreground">
                      {idea.topicCategory}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </BentoSection>
        )}

        {/* SECTION 2: Emotional Peaks - High-impact moments */}
        {emotionalPeaks.length > 0 && (
          <BentoSection 
            title="Emotional Peaks" 
            icon={<TrendingUp className="w-4 h-4" />}
            description="High-impact moments"
          >
            <Card className="rounded-[12px] border-[#e6e6e6] p-4">
              <div className="space-y-3">
                {emotionalPeaks.map((peak) => (
                  <button
                    key={peak.id}
                    type="button"
                    onClick={() => onSeek(peak.startTime)}
                    className="w-full flex items-start gap-3 p-3 rounded-lg hover-elevate text-left border-l-2 border-[#ffe166]"
                    data-testid={`emotional-peak-${peak.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground font-medium line-clamp-2">
                        "{peak.summary || peak.title}"
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs font-mono text-primary flex items-center gap-1">
                          <Play className="w-2.5 h-2.5" />
                          {formatTime(peak.startTime)}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-[#ffe166]">
                      {peak.importanceScore}%
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          </BentoSection>
        )}

        {/* SECTION 3: Claims & Integrity */}
        {(claims.length > 0 || sponsors.length > 0 || hasDiff) && (
          <BentoSection 
            title="Claims & Integrity" 
            icon={<ShieldCheck className="w-4 h-4" />}
            description="Fact-checks, sponsors, and analysis"
          >
            {/* Stats Row */}
            <div className="flex flex-wrap gap-2 mb-4">
              {hasDiff && diff && (
                <BentoStat 
                  label="Consistency" 
                  value={`${Math.round(diff.metrics.similarity * 100)}%`}
                  variant={diff.metrics.similarity >= 0.95 ? "success" : diff.metrics.similarity >= 0.8 ? "warning" : "danger"}
                />
              )}
              {Object.entries(claimTypeCounts).map(([type, count]) => (
                <BentoStat 
                  key={type}
                  label={type} 
                  value={count}
                  variant={type === 'medical' ? 'danger' : type === 'financial' ? 'warning' : 'default'}
                />
              ))}
              {sponsors.length > 0 && (
                <BentoStat 
                  label="Sponsors" 
                  value={sponsors.length}
                  variant="default"
                />
              )}
            </div>

            {/* Claims List */}
            {claims.length > 0 && (
              <Card className="rounded-[12px] border-[#e6e6e6] p-4 mb-4">
                <div className="space-y-2">
                  {claims.slice(0, 5).map((claim) => (
                    <button
                      key={claim.id}
                      type="button"
                      onClick={() => onSeek(claim.startTime)}
                      className="w-full flex items-start gap-3 p-2 rounded-lg hover-elevate text-left"
                      data-testid={`claim-item-${claim.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground line-clamp-2">{claim.claimText}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-mono text-primary">{formatTime(claim.startTime)}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            claim.claimType === 'medical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                            claim.claimType === 'financial' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                            'bg-muted text-muted-foreground'
                          }`}>{claim.claimType}</span>
                        </div>
                      </div>
                      <div className="shrink-0 w-12">
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full" 
                            style={{ width: `${claim.confidence}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{claim.confidence}%</span>
                      </div>
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {/* Sponsor Segments */}
            {sponsors.length > 0 && (
              <Card className="rounded-[12px] border-[#e6e6e6] p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Sponsor Segments</p>
                <div className="space-y-2">
                  {sponsors.slice(0, 3).map((sponsor) => (
                    <button
                      key={sponsor.id}
                      type="button"
                      onClick={() => onSeek(sponsor.startTime)}
                      className="w-full flex items-center justify-between p-2 rounded-lg hover-elevate"
                      data-testid={`sponsor-item-${sponsor.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Play className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs font-mono text-primary">{formatTime(sponsor.startTime)}</span>
                        {sponsor.brand && (
                          <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{sponsor.brand}</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{sponsor.confidence}%</span>
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </BentoSection>
        )}

        {/* SECTION 4: Chapters */}
        {snippets.length > 0 && (
          <BentoSection 
            title="Chapters" 
            icon={<Clock className="w-4 h-4" />}
            description={`${snippets.length} segments`}
          >
            <Card className="rounded-[12px] border-[#e6e6e6] p-4">
              <div className="space-y-1">
                {snippets.slice(0, 10).map((snippet) => (
                  <button
                    key={snippet.id}
                    type="button"
                    onClick={() => onSeek(snippet.startSeconds)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover-elevate text-left transition-colors"
                    data-testid={`chapter-segment-${snippet.id}`}
                  >
                    <Play className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm text-foreground flex-1 line-clamp-1">
                      {snippet.label || snippet.snippetText.slice(0, 60)}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground shrink-0">
                      {formatTime(snippet.startSeconds)}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          </BentoSection>
        )}
      </div>

      {/* ===== RIGHT COLUMN: Supporting Insights ===== */}
      <div className="space-y-6">
        {/* AI Suggestions */}
        <AiSuggestionsLane 
          episodeId={episodeId}
          onAnnotationClick={(annotationId) => {
            const annotation = annotations.find(a => a.id === annotationId);
            if (annotation?.timestamp) {
              onSeek(annotation.timestamp);
            }
          }}
        />

        {/* Annotations Feed */}
        {annotations.length > 0 && (
          <Card className="rounded-[12px] border-[#e6e6e6] overflow-hidden" data-testid="annotations-feed">
            <div className="p-4 border-b border-[#e6e6e6] flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Annotations</h3>
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{annotations.length}</span>
            </div>
            <div className="p-3 space-y-3 max-h-[300px] overflow-y-auto">
              {annotations.slice(0, 5).map((annotation) => (
                <div 
                  key={annotation.id}
                  className="p-3 rounded-lg border border-[#e6e6e6] hover-elevate"
                  data-testid={`annotation-item-${annotation.id}`}
                >
                  {annotation.text && (
                    <p className="text-xs text-muted-foreground italic border-l-2 border-[#ffe166] pl-2 mb-2 line-clamp-2">
                      "{annotation.text}"
                    </p>
                  )}
                  <p className="text-sm text-foreground line-clamp-2">{annotation.content}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => onSeek(annotation.timestamp || 0)}
                      className="text-xs font-mono text-primary hover:underline flex items-center gap-1"
                      data-testid={`button-jump-annotation-${annotation.id}`}
                    >
                      <Play className="w-2.5 h-2.5" />
                      {formatTime(annotation.timestamp || 0)}
                    </button>
                    {annotation.upvotes > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <ThumbsUp className="w-3 h-3" />
                        {annotation.upvotes}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Mentioned Entities */}
        <MentionedEntities 
          episodeId={episodeId}
          onSeek={onSeek}
        />

        {/* Audio Clips */}
        {clips.length > 0 && (
          <Card className="rounded-[12px] border-[#e6e6e6] overflow-hidden" data-testid="clips-sidebar">
            <div className="p-4 border-b border-[#e6e6e6] flex items-center gap-2">
              <Headphones className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Audio Clips</h3>
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{clips.length}</span>
            </div>
            <div className="p-3 space-y-2">
              {clips.slice(0, 3).map((clip) => (
                <button
                  key={clip.id}
                  type="button"
                  onClick={() => onSeek(clip.startTime)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover-elevate text-left"
                  data-testid={`clip-sidebar-${clip.id}`}
                >
                  <Play className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground flex-1 line-clamp-1">
                    {clip.title || `Clip at ${formatTime(clip.startTime)}`}
                  </span>
                  <span className="text-xs font-mono text-primary shrink-0">
                    {formatTime(clip.startTime)}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function EpisodePage() {
  const { id } = useParams<{ id: string }>();
  const [location] = useLocation();
  const { toast } = useToast();
  const { user, isStaff } = useAuth();
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTo, setSeekTo] = useState<number | undefined>(undefined);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("insights");
  const [showPlatformLinks, setShowPlatformLinks] = useState(false);
  
  // Annotation sorting - read from URL or default to "top"
  const urlParams = new URLSearchParams(window.location.search);
  const [annotationSort, setAnnotationSort] = useState<"top" | "new" | "ai">(
    (urlParams.get("sort") as "top" | "new" | "ai") || "top"
  );
  
  // Handler for changing annotation sort with URL persistence
  const handleAnnotationSortChange = useCallback((newSort: "top" | "new" | "ai") => {
    setAnnotationSort(newSort);
    const url = new URL(window.location.href);
    if (newSort === "top") {
      url.searchParams.delete("sort");
    } else {
      url.searchParams.set("sort", newSort);
    }
    window.history.replaceState({}, "", url.toString());
  }, []);
  
  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [youtubeReady, setYoutubeReady] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  
  // Transcript selection state
  const [selection, setSelection] = useState<{
    segmentId: string;
    text: string;
    startOffset: number;
    endOffset: number;
  } | null>(null);
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);
  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number } | null>(null);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [userScrolled, setUserScrolled] = useState(false);
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const timeUpdateIntervalRef = useRef<number | null>(null);
  const lastSeekRef = useRef<number | null>(null);
  const segmentRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<number | null>(null);

  // Source selection state
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  
  // Playback mode: 'audio' or 'video' - allows switching between sources
  const [playbackMode, setPlaybackMode] = useState<'audio' | 'video'>('audio');

  // Queries
  const { data: episode, isLoading: episodeLoading } = useQuery<EpisodeWithSources>({
    queryKey: ["/api/episodes", id],
  });

  const { data: podcast, isLoading: podcastLoading } = useQuery<Podcast>({
    queryKey: ["/api/podcasts", episode?.podcastId],
    enabled: !!episode?.podcastId,
  });

  const { data: segments, isLoading: segmentsLoading } = useQuery<Segment[]>({
    queryKey: ["/api/episodes", id, "segments"],
  });

  // Source-specific transcript segments - fetches when a source is selected
  // Use stable key with fallback to ensure React Query properly tracks source changes
  const { data: sourceTranscriptSegments, isLoading: sourceSegmentsLoading } = useQuery<SourceTranscriptSegment[]>({
    queryKey: ["/api/episode-sources", selectedSourceId ?? "none", "source-transcript-segments"],
    enabled: !!selectedSourceId,
    staleTime: 0, // Always refetch when source changes
  });

  const { data: annotations = [], isLoading: annotationsLoading } = useQuery<Annotation[]>({
    queryKey: [`/api/episodes/${id}/annotations?sort=${annotationSort}`],
  });

  const { data: musicDetections = [] } = useQuery<MusicDetection[]>({
    queryKey: ["/api/episodes", id, "music"],
  });

  interface EpisodeStatus {
    transcriptStatus: "none" | "pending" | "processing" | "ready" | "failed";
    musicStatus: "none" | "pending" | "processing" | "ready" | "failed";
    hasTranscript: boolean;
    hasMusic: boolean;
    segmentCount: number;
    musicCount: number;
    processingStatus?: "new" | "importing" | "ready_for_analysis" | "analyzing" | "complete" | "error";
    lastError?: string | null;
  }
  const { 
    data: episodeStatus,
    isError: statusError,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useQuery<EpisodeStatus>({
    queryKey: ["/api/episodes", id, "status"],
    refetchInterval: (query) => {
      const status = query.state.data;
      const transcriptTerminal = !status?.transcriptStatus || 
        ["none", "ready", "failed"].includes(status.transcriptStatus);
      const musicTerminal = !status?.musicStatus || 
        ["none", "ready", "failed"].includes(status.musicStatus);
      if (!transcriptTerminal || !musicTerminal) {
        return 10000;
      }
      return false;
    },
    retry: 3,
    retryDelay: 30000,
  });

  const { data: clips = [], isLoading: clipsLoading } = useQuery<ClipWithAuthor[]>({
    queryKey: ["/api/episodes", id, "clips"],
  });

  // Entity mentions for Products tab count
  const { data: entityMentions = [] } = useQuery<{ id: string }[]>({
    queryKey: ["/api/episodes", id, "entities"],
  });

  // Video events (AI-detected scenes from video sources)
  interface VideoEventWithLabel extends VideoEvent {
    sourceLabel?: string;
  }
  const { data: videoEvents = [] } = useQuery<VideoEventWithLabel[]>({
    queryKey: ["/api/episodes", id, "video-events"],
  });

  // Feature flag for video playback
  const { data: featureFlags = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings/feature-flags"],
  });
  const videoPlaybackEnabled = featureFlags["VIDEO_PLAYBACK_ENABLED"] === "true";

  const { data: snippetsResponse } = useQuery<{ snippets: Snippet[]; source: string; hasFullTranscript: boolean }>({
    queryKey: ["/api/episodes", id, "snippets"],
  });
  const snippets = snippetsResponse?.snippets ?? [];

  const { data: fullTranscriptsFlag } = useQuery<{ key: string; value: string }>({
    queryKey: ["/api/feature-flags", "PUBLIC_FULL_TRANSCRIPTS_ENABLED"],
    staleTime: 60000, // Cache for 1 minute
  });
  
  const { data: annotationLimits } = useQuery<{ maxAnnotationChars: number; maxSnippetChars: number }>({
    queryKey: ["/api/config/annotation-limits"],
    staleTime: 60000, // Cache for 1 minute
  });

  // Knowledge data for insight hints in transcript tab
  const { data: transcriptKnowledge } = useQuery<EpisodeKnowledge>({
    queryKey: ['/api/episodes', id, 'knowledge'],
    enabled: !!id,
  });
  const topInsights = transcriptKnowledge?.keyIdeas?.slice(0, 5) ?? [];

  // Sponsors and claims for AI tags in TranscriptReader
  const { data: mainSponsorsData } = useQuery<SponsorsResponse>({
    queryKey: ['/api/episodes', id, 'sponsors'],
    enabled: !!id,
  });
  const { data: mainClaimsData } = useQuery<ClaimsResponse>({
    queryKey: ['/api/episodes', id, 'claims'],
    enabled: !!id,
  });
  
  const showFullTranscript = fullTranscriptsFlag?.value === "true";
  const maxAnnotationChars = annotationLimits?.maxAnnotationChars ?? 300;

  // Episode sources - multi-source support
  const sources = episode?.sources ?? [];
  const audioSources = sources.filter(s => s.kind === "audio" || s.kind === "upload");
  const videoSources = sources.filter(s => s.kind === "video");
  const hasMultipleSources = sources.length > 1;
  const hasBothModes = audioSources.length > 0 && videoSources.length > 0;
  
  // Get the selected source (defaults to canonical, then first available)
  const selectedSource = sources.find(s => s.id === selectedSourceId) 
    || sources.find(s => s.isCanonical) 
    || sources[0];
  
  // Get the appropriate media URL from the selected source
  const sourceMediaUrl = selectedSource?.storageUrl || selectedSource?.sourceUrl || episode?.mediaUrl;
  const sourceAlignmentOffset = selectedSource?.alignmentOffsetSeconds ?? 0;
  
  // Compute display segments: use source-specific transcript when available, fallback to episode-level
  const hasSourceTranscript = sourceTranscriptSegments && sourceTranscriptSegments.length > 0;
  
  // Convert source transcript segments (milliseconds) to display segments (seconds)
  // Use floor for startTime and ceil for endTime to preserve segment duration for AI tag matching
  const displaySegments: Segment[] | undefined = hasSourceTranscript
    ? sourceTranscriptSegments.map((seg, index) => ({
        id: seg.id,
        episodeId: episode?.id || "",
        startTime: seg.startTime / 1000, // Preserve fractional seconds for accurate matching
        endTime: seg.endTime / 1000,
        text: seg.text,
        type: "transcript" as const,
        speaker: seg.speaker || null,
        isStale: false,
      }))
    : segments;
  
  // Track which transcript source is active
  const transcriptSource = hasSourceTranscript 
    ? (selectedSource?.platform === "youtube" ? "YouTube Captions" : "Source Transcript")
    : (segments && segments.length > 0 ? "Episode Transcript" : null);

  // Build AI tags for TranscriptReader (key ideas, claims, sponsors)
  // Note: emotionalPeak tagging is reserved for future sentiment analysis feature
  const aiTags = useMemo(() => {
    const tags: Record<string, { keyIdea?: boolean; emotionalPeak?: boolean; claim?: boolean; sponsor?: boolean }> = {};
    
    if (!displaySegments || displaySegments.length === 0) return tags;
    
    // Find segment containing a timestamp using precise floating-point comparison
    // Treats endTime as exclusive: [startTime, endTime)
    const findSegmentId = (timestamp: number): string | undefined => {
      for (const seg of displaySegments) {
        if (timestamp >= seg.startTime && timestamp < seg.endTime) {
          return seg.id;
        }
      }
      // Edge case: timestamp exactly equals endTime of last segment
      const lastSeg = displaySegments[displaySegments.length - 1];
      if (lastSeg && timestamp === lastSeg.endTime) {
        return lastSeg.id;
      }
      return undefined;
    };
    
    // Key ideas from knowledge - use direct segment IDs
    transcriptKnowledge?.keyIdeas?.forEach((idea) => {
      idea.segmentIds?.forEach((segId) => {
        if (!tags[segId]) tags[segId] = {};
        tags[segId].keyIdea = true;
      });
    });
    
    // Claims - map by timestamp to segment
    mainClaimsData?.claims?.forEach((claim) => {
      const segId = findSegmentId(claim.startTime);
      if (segId) {
        if (!tags[segId]) tags[segId] = {};
        tags[segId].claim = true;
      }
    });
    
    // Sponsors - map by timestamp to segment
    mainSponsorsData?.sponsors?.forEach((sponsor) => {
      const segId = findSegmentId(sponsor.startTime);
      if (segId) {
        if (!tags[segId]) tags[segId] = {};
        tags[segId].sponsor = true;
      }
    });
    
    return tags;
  }, [transcriptKnowledge, mainClaimsData, mainSponsorsData, displaySegments]);
  
  // Get the best source for the current playback mode
  const getModeSource = useCallback((mode: 'audio' | 'video') => {
    if (mode === 'video') {
      return videoSources.find(s => s.isCanonical) || videoSources[0];
    }
    return audioSources.find(s => s.isCanonical) || audioSources[0];
  }, [audioSources, videoSources]);
  
  // Handle mode toggle - switch to appropriate source
  const handleModeToggle = useCallback((newMode: 'audio' | 'video') => {
    setPlaybackMode(newMode);
    const modeSource = getModeSource(newMode);
    if (modeSource) {
      setSelectedSourceId(modeSource.id);
    }
  }, [getModeSource]);
  
  // Auto-select canonical source when episode loads and set initial mode
  useEffect(() => {
    if (episode?.sources && episode.sources.length > 0 && !selectedSourceId) {
      const canonical = episode.sources.find(s => s.isCanonical);
      const initialSource = canonical || episode.sources[0];
      if (initialSource) {
        setSelectedSourceId(initialSource.id);
        // Set initial playback mode based on canonical source kind
        if (initialSource.kind === 'video') {
          setPlaybackMode('video');
        } else {
          setPlaybackMode('audio');
        }
      }
    }
  }, [episode?.sources, selectedSourceId]);

  // Reload players when source changes
  useEffect(() => {
    // Reset playback state when source changes
    setCurrentTime(0);
    setIsPlaying(false);
    setDuration(0);
    setAudioReady(false);
    
    // Reload audio player if available
    if (audioRef.current && sourceMediaUrl && hasDirectAudio) {
      audioRef.current.src = sourceMediaUrl;
      audioRef.current.load();
    }
    
    // Reload video player if available
    if (videoRef.current && sourceMediaUrl && isDirectVideo) {
      videoRef.current.src = sourceMediaUrl;
      videoRef.current.load();
    }
    
    // For YouTube, the player will be recreated by the existing useEffect
    // when youtubeVideoId changes (which depends on selectedSource)
  }, [selectedSourceId, sourceMediaUrl]);

  // Mutations
  const createClipMutation = useMutation({
    mutationFn: async (data: { title: string; startTime: number; endTime: number; annotationId?: string; transcriptText?: string }) => {
      return await apiRequest("POST", `/api/episodes/${id}/clips`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", id, "clips"] });
      toast({
        title: "Clip created",
        description: "Your clip has been saved successfully.",
      });
      setActiveTab("media");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create clip",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteClipMutation = useMutation({
    mutationFn: async (clipId: string) => {
      return await apiRequest("DELETE", `/api/clips/${clipId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", id, "clips"] });
      toast({
        title: "Clip deleted",
        description: "The clip has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete clip",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const isLoading = episodeLoading || segmentsLoading || annotationsLoading || podcastLoading;

  // Media type detection based on selected source (respects VIDEO_PLAYBACK_ENABLED feature flag)
  // Multi-source takes precedence over legacy fields when sources exist
  const hasMultiSourceSupport = sources.length > 0;
  const selectedSourceUrl = selectedSource?.storageUrl || selectedSource?.sourceUrl || "";
  const selectedSourceKind = selectedSource?.kind;
  const selectedSourcePlatform = selectedSource?.platform;
  
  // Detect YouTube from selected source (when using multi-source) or legacy fields (fallback)
  // Check YouTube URL pattern regardless of platform setting (user might select "other" for YouTube URLs)
  const sourceYoutubeId = (selectedSourcePlatform === "youtube" || selectedSourceKind === "video") 
    ? getYouTubeVideoId(selectedSourceUrl) 
    : null;
  // Only use legacy YouTube detection if no multi-source support
  const legacyYoutubeId = !hasMultiSourceSupport 
    ? (getYouTubeVideoId(episode?.videoUrl || "") || getYouTubeVideoId(episode?.mediaUrl || ""))
    : null;
  const rawYoutubeVideoId = sourceYoutubeId || legacyYoutubeId;
  const youtubeVideoId = videoPlaybackEnabled ? rawYoutubeVideoId : null; // Disable YouTube if video flag is off
  
  // Determine if current source is video type (only when in video playback mode and source is video)
  const sourceIsVideo = selectedSourceKind === "video" || selectedSourcePlatform === "youtube" || selectedSourcePlatform === "vimeo";
  // YouTube player only shown when source is explicitly YouTube AND we're in video mode
  const isYouTubeVideo = (playbackMode === 'video' || !hasMultiSourceSupport) && youtubeVideoId !== null && videoPlaybackEnabled;
  const isDirectVideo = (sourceIsVideo || episode?.type === "video") && !youtubeVideoId && videoPlaybackEnabled && (playbackMode === 'video' || !hasMultiSourceSupport);
  const hasVideo = (isYouTubeVideo || isDirectVideo) && videoPlaybackEnabled;
  const hasTranscript = (displaySegments && displaySegments.length > 0) || (segments && segments.length > 0);
  const canCreateClips = hasTranscript; // Audio clips work without video
  const youtubeContainerId = `youtube-player-${id}`;
  
  // Direct audio detection - audio source or when video is disabled
  const sourceIsAudio = selectedSourceKind === "audio" || selectedSourceKind === "upload" || !selectedSourceKind;
  const hasDirectAudio = !!(sourceMediaUrl && (sourceIsAudio || !videoPlaybackEnabled || playbackMode === 'audio') && !isYouTubeVideo);
  const [audioReady, setAudioReady] = useState(false);
  
  // Platform embeds for audio-only episodes
  const spotifyEpisodeId = extractSpotifyEpisodeId(episode?.spotifyUrl || "");
  const applePodcastsEmbedUrl = extractApplePodcastsEmbedUrl(episode?.applePodcastsUrl || "");
  const hasPlatformEmbed = !!spotifyEpisodeId || !!applePodcastsEmbedUrl;
  const hasPlaybackOption = hasVideo || hasPlatformEmbed || hasDirectAudio;
  const hasControllablePlayer = hasVideo || hasDirectAudio; // Players we can seek programmatically

  // YouTube API setup
  const startTimeTracking = useCallback(() => {
    if (timeUpdateIntervalRef.current) return;
    timeUpdateIntervalRef.current = window.setInterval(() => {
      if (youtubePlayerRef.current) {
        const time = youtubePlayerRef.current.getCurrentTime();
        setCurrentTime(time);
      }
    }, 250);
  }, []);

  const stopTimeTracking = useCallback(() => {
    if (timeUpdateIntervalRef.current) {
      clearInterval(timeUpdateIntervalRef.current);
      timeUpdateIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isYouTubeVideo || !youtubeVideoId) return;

    loadYouTubeAPI(() => {
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.destroy();
        youtubePlayerRef.current = null;
      }
      setYoutubeReady(false);

      new window.YT.Player(youtubeContainerId, {
        videoId: youtubeVideoId,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          fs: 1,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
        },
        events: {
          onReady: (event) => {
            youtubePlayerRef.current = event.target;
            setYoutubeReady(true);
            setDuration(event.target.getDuration());
            // Sync volume state with YouTube player
            event.target.setVolume(volume * 100);
            if (isMuted) {
              event.target.mute();
            } else {
              event.target.unMute();
            }
          },
          onStateChange: (event) => {
            const state = event.data;
            if (state === window.YT.PlayerState.PLAYING || state === window.YT.PlayerState.BUFFERING) {
              setIsPlaying(true);
              startTimeTracking();
            } else {
              setIsPlaying(false);
              stopTimeTracking();
            }
          },
        },
      });
    });

    return () => {
      stopTimeTracking();
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.destroy();
        youtubePlayerRef.current = null;
      }
    };
  }, [youtubeVideoId, isYouTubeVideo, youtubeContainerId, startTimeTracking, stopTimeTracking]);

  // Handle seek from external sources
  useEffect(() => {
    if (seekTo === undefined) return;
    if (seekTo === lastSeekRef.current) return;

    if (isYouTubeVideo && youtubePlayerRef.current && youtubeReady) {
      youtubePlayerRef.current.seekTo(seekTo, true);
      setCurrentTime(seekTo);
      lastSeekRef.current = seekTo;
    } else if (isDirectVideo && videoRef.current) {
      videoRef.current.currentTime = seekTo;
      setCurrentTime(seekTo);
      lastSeekRef.current = seekTo;
    } else if (hasDirectAudio && audioRef.current) {
      audioRef.current.currentTime = seekTo;
      audioRef.current.play();
      setCurrentTime(seekTo);
      lastSeekRef.current = seekTo;
    }
  }, [seekTo, isYouTubeVideo, youtubeReady, isDirectVideo, hasDirectAudio]);

  // URL handling for annotation deep links (supports ?a=, ?annotation=, and #annotation- hash)
  useEffect(() => {
    if (isLoading || !annotations || annotations.length === 0) return;
    
    // Check for query parameters (supports both ?a= and ?annotation= for backwards compat)
    const searchParams = new URLSearchParams(window.location.search);
    const queryAnnotationId = searchParams.get("a") || searchParams.get("annotation");
    
    // Also check for hash-based links for backwards compatibility
    const hash = window.location.hash;
    const hashAnnotationId = hash?.startsWith("#annotation-") 
      ? hash.replace("#annotation-", "") 
      : null;
    
    const targetAnnotationId = queryAnnotationId || hashAnnotationId;
    
    if (targetAnnotationId) {
      const annotation = annotations.find((a) => a.id === targetAnnotationId);
      
      if (annotation) {
        // Switch to annotations tab if not already there
        setActiveTab("annotations");
        setSelectedAnnotation(targetAnnotationId);
        
        // Scroll to the annotation card with highlight effect
        setTimeout(() => {
          const el = document.getElementById(`annotation-${targetAnnotationId}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("ring-2", "ring-primary");
            
            setTimeout(() => {
              el.classList.remove("ring-2", "ring-primary");
            }, 2000);
          }
        }, 100);
        
        // Seek to the annotation's segment if we have segments
        if (displaySegments) {
          const segment = displaySegments.find((s) => s.id === annotation.segmentId);
          if (segment) {
            setSeekTo(segment.startTime);
            setCurrentTime(segment.startTime);
          }
        }
        
        // Clean up URL
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, [isLoading, annotations, displaySegments]);

  // Auto-scroll to active segment
  useEffect(() => {
    if (!displaySegments) return;
    const current = displaySegments.find(
      (s) => currentTime >= s.startTime && currentTime <= s.endTime
    );
    if (current && current.id !== activeSegmentId) {
      setActiveSegmentId(current.id);
      
      if (!userScrolled) {
        const element = segmentRefs.current.get(current.id);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }
  }, [currentTime, displaySegments, activeSegmentId, userScrolled]);

  // Handle user scroll
  useEffect(() => {
    const handleScroll = () => {
      setUserScrolled(true);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = window.setTimeout(() => setUserScrolled(false), 3000);
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll, { passive: true });
    }
    return () => {
      if (container) container.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  const handlePlayPause = () => {
    if (isYouTubeVideo && youtubePlayerRef.current && youtubeReady) {
      if (isPlaying) {
        youtubePlayerRef.current.pauseVideo();
      } else {
        youtubePlayerRef.current.playVideo();
      }
    } else if (isDirectVideo && videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Seek with alignment offset - applies offset when seeking to transcript/annotation timestamps
  // The offset adjusts for timing differences between the canonical transcript and alternate sources
  const seekToWithOffset = useCallback((transcriptTime: number) => {
    // Apply alignment offset: if offset is +5s, the source starts 5s later than the transcript
    // So we need to seek to (transcriptTime - offset) in the source
    // Example: transcript time 30s with +5s offset = seek to 25s in the source media
    const adjustedTime = Math.max(0, transcriptTime - sourceAlignmentOffset);
    setSeekTo(adjustedTime);
    setCurrentTime(transcriptTime); // Display transcript time to user
  }, [sourceAlignmentOffset]);

  const handleSeek = (time: number) => {
    setSeekTo(time);
    setCurrentTime(time);
  };

  const handleSliderSeek = (value: number[]) => {
    handleSeek(value[0]);
  };

  const handleTimeUpdate = () => {
    if (isDirectVideo && videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const cyclePlaybackSpeed = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    const newSpeed = PLAYBACK_SPEEDS[nextIndex];
    setPlaybackSpeed(newSpeed);
    
    if (isYouTubeVideo && youtubePlayerRef.current && youtubeReady) {
      youtubePlayerRef.current.setPlaybackRate(newSpeed);
    } else if (isDirectVideo && videoRef.current) {
      videoRef.current.playbackRate = newSpeed;
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const vol = value[0];
    setVolume(vol);
    setIsMuted(vol === 0);
    
    if (isYouTubeVideo && youtubePlayerRef.current && youtubeReady) {
      youtubePlayerRef.current.setVolume(vol * 100);
      if (vol === 0) {
        youtubePlayerRef.current.mute();
      } else {
        youtubePlayerRef.current.unMute();
      }
    } else if (isDirectVideo && videoRef.current) {
      videoRef.current.volume = vol;
    }
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    
    if (isYouTubeVideo && youtubePlayerRef.current && youtubeReady) {
      if (newMuted) {
        youtubePlayerRef.current.mute();
      } else {
        youtubePlayerRef.current.unMute();
      }
    } else if (isDirectVideo && videoRef.current) {
      videoRef.current.muted = newMuted;
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

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m} min`;
  };

  const handleTextSelect = (
    segmentId: string,
    text: string,
    startOffset: number,
    endOffset: number,
    rect: DOMRect
  ) => {
    setSelection({ segmentId, text, startOffset, endOffset });
    setPopupPosition({
      top: rect.bottom + window.scrollY + 8,
      left: rect.left + rect.width / 2,
    });
    setShowAnnotationForm(true);
  };

  const setSegmentRef = (id: string, element: HTMLDivElement | null) => {
    if (element) {
      segmentRefs.current.set(id, element);
    } else {
      segmentRefs.current.delete(id);
    }
  };

  // Sort annotations by upvotes (top) or date (recent)
  const sortedAnnotations = [...annotations].sort((a, b) => {
    return b.upvotes - a.upvotes;
  });

  // Create clip from annotation
  const handleCreateClipFromAnnotation = (annotation: Annotation) => {
    const segment = displaySegments?.find(s => s.id === annotation.segmentId);
    if (!segment) return;
    
    // Clip is the segment's time range with a buffer
    const startTime = Math.max(0, segment.startTime - 2);
    const endTime = Math.min(effectiveDuration, segment.endTime + 2);
    
    createClipMutation.mutate({
      title: annotation.text.slice(0, 50) + (annotation.text.length > 50 ? "..." : ""),
      startTime,
      endTime,
      annotationId: annotation.id,
      transcriptText: segment.text,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" data-testid="episode-loading">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
          {/* Header skeleton */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex-1 min-w-0">
              <Skeleton className="h-9 w-3/4 mb-2" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
            <Skeleton className="h-10 w-32 hidden md:block" />
          </div>
          
          {/* Player skeleton */}
          <Card className="p-4 mb-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-2 flex-1 rounded-full" />
              <Skeleton className="h-5 w-16" />
            </div>
          </Card>
          
          {/* Two-column layout skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
            {/* Left: Content tabs skeleton */}
            <Card className="overflow-hidden">
              <div className="border-b p-2 flex gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-8 w-24" />
                ))}
              </div>
              <div className="p-4 space-y-4">
                {/* Transcript segments skeleton */}
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-5 w-12 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            
            {/* Right: Annotations skeleton */}
            <Card className="overflow-hidden">
              <div className="border-b p-4 flex items-center gap-2">
                <Skeleton className="h-5 w-5" />
                <Skeleton className="h-5 w-24" />
              </div>
              <div className="p-4 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="border rounded-lg p-4 space-y-3">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-6 w-6 rounded-full" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" data-testid="episode-not-found">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Episode not found</h2>
          <p className="text-muted-foreground mb-6">
            This episode may have been removed or the link might be incorrect.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/">
              <Button variant="default" data-testid="button-back-home-error">
                Back to home
              </Button>
            </Link>
            <Button 
              variant="outline" 
              onClick={() => window.location.reload()}
              data-testid="button-try-again"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const effectiveDuration = duration || episode.duration || 0;

  const processingStatus = episodeStatus?.processingStatus;
  const isProcessing = processingStatus && 
    ["importing", "ready_for_analysis", "analyzing"].includes(processingStatus);
  const hasError = processingStatus === "error";

  return (
    <div className="min-h-screen bg-background">
      {/* Main container: 992px max-width centered with consistent spacing */}
      <div className="max-w-[992px] mx-auto px-4 md:px-6 py-8">
        {/* Processing Status Banner */}
        {isProcessing && (
          <div 
            className="mb-6 p-4 rounded-lg border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
            data-testid="banner-processing-status"
          >
            <div className="flex items-start gap-3">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-blue-800 dark:text-blue-200">
                  {processingStatus === "importing" && "Importing Episode"}
                  {processingStatus === "ready_for_analysis" && "Queued for Analysis"}
                  {processingStatus === "analyzing" && "Analyzing Content"}
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-0.5">
                  {processingStatus === "importing" && "Fetching episode data and sources. This usually takes a few moments."}
                  {processingStatus === "ready_for_analysis" && "Transcript retrieved. Waiting in queue for AI analysis."}
                  {processingStatus === "analyzing" && "AI is generating chapters, entities, and annotations. This typically takes 1-3 minutes."}
                </p>
              </div>
            </div>
          </div>
        )}
        
        {hasError && episodeStatus?.lastError && (
          <div 
            className="mb-6 p-4 rounded-lg border bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
            data-testid="banner-error-status"
          >
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-red-800 dark:text-red-200">Processing Error</h3>
                <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">
                  {episodeStatus.lastError}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 1: Episode Header - Clean title with metadata row */}
        <div className="mb-4">
          <h1 className="text-[32px] font-medium text-foreground leading-tight mb-4" data-testid="text-episode-title">
            {episode.title}
          </h1>
          <div className="flex items-center gap-2 text-sm text-[#6d6d6d] flex-wrap">
            {podcast && (
              <Link href={`/podcast/${podcast.id}`}>
                <span className="font-medium hover:text-foreground transition-colors cursor-pointer" data-testid="link-podcast-name">
                  {podcast.title}
                </span>
              </Link>
            )}
            {podcast && effectiveDuration > 0 && <span className="text-[#e7e7e7]">•</span>}
            {effectiveDuration > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatDuration(effectiveDuration)}
              </span>
            )}
            {episodeStatus && episodeStatus.transcriptStatus === "ready" && (
              <>
                <span className="text-[#e7e7e7]">•</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  Transcript
                </span>
              </>
            )}
            {episodeStatus && episodeStatus.transcriptStatus !== "none" && episodeStatus.transcriptStatus !== "ready" && (
              <>
                <span className="text-[#e7e7e7]">•</span>
                <AnalysisStatusBadge 
                  status={getStatusFromJobStatus(episodeStatus.transcriptStatus)}
                  compact
                  testId="badge-transcript-status"
                />
              </>
            )}
          </div>
        </div>

        {/* SECTION 2: Player Section - Full width with controls */}

        {/* Video Player (YouTube) - 16:9 ratio, rounded-[16px] per spec */}
        {isYouTubeVideo && (
          <div className="aspect-video bg-black rounded-[16px] mb-6 overflow-hidden">
            <div id={youtubeContainerId} className="w-full h-full" data-testid="youtube-player" />
          </div>
        )}

        {/* Direct Video Player - 16:9 ratio, rounded-[16px] per spec */}
        {isDirectVideo && sourceMediaUrl && (
          <div className="aspect-video bg-black rounded-[16px] mb-6 overflow-hidden">
            <video
              ref={videoRef}
              src={sourceMediaUrl}
              className="w-full h-full"
              crossOrigin="anonymous"
              playsInline
              preload="metadata"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              data-testid="video-player"
            />
          </div>
        )}

        {/* Player Controls Row - Audio/Video toggle pills + Speed selector */}
        {(hasVideo || hasBothModes) && (
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap" data-testid="player-controls-row">
            {/* Audio/Video Toggle Pills */}
            {hasBothModes && (
              <div className="inline-flex rounded-full border bg-muted/30 p-1" data-testid="mode-toggle">
                <button
                  type="button"
                  onClick={() => handleModeToggle('audio')}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                    playbackMode === 'audio' 
                      ? 'bg-background text-foreground shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  data-testid="button-audio-mode"
                >
                  <Headphones className="w-3.5 h-3.5" />
                  Audio
                </button>
                <button
                  type="button"
                  onClick={() => handleModeToggle('video')}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                    playbackMode === 'video' 
                      ? 'bg-background text-foreground shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  data-testid="button-video-mode"
                >
                  <Video className="w-3.5 h-3.5" />
                  Video
                </button>
              </div>
            )}
            
            {/* Playback Speed Selector */}
            <button
              type="button"
              onClick={cyclePlaybackSpeed}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-background text-sm font-medium hover:bg-muted/50 transition-colors"
              data-testid="button-playback-speed"
            >
              {playbackSpeed}x
            </button>
          </div>
        )}

        {/* Video Player Controls (only shown when video is available) */}
        {hasVideo && (
          <Card className="p-4 mb-6" data-testid="card-player-controls">
            <div className="flex items-center gap-4 flex-wrap">
              <Button
                size="icon"
                variant="default"
                onClick={handlePlayPause}
                className="shrink-0"
                data-testid="button-play-pause"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </Button>
              
              <div className="flex-1 flex items-center gap-3 min-w-[200px]">
                <span className="text-sm font-mono text-muted-foreground w-14 text-right shrink-0">
                  {formatTime(currentTime)}
                </span>
                <Slider
                  value={[currentTime]}
                  min={0}
                  max={effectiveDuration || 1}
                  step={0.1}
                  onValueChange={handleSliderSeek}
                  className="flex-1"
                  data-testid="slider-seek"
                />
                <span className="text-sm font-mono text-muted-foreground w-14 shrink-0">
                  {formatTime(effectiveDuration)}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={toggleMute}
                  data-testid="button-mute"
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={handleVolumeChange}
                  className="w-20"
                  data-testid="slider-volume"
                />
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={cyclePlaybackSpeed}
                className="shrink-0 font-mono text-sm min-w-[3rem]"
                data-testid="button-playback-speed"
              >
                {playbackSpeed}x
              </Button>
              
              {isDirectVideo && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => videoRef.current?.requestFullscreen()}
                  data-testid="button-fullscreen"
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* PodDNA Player (PRIMARY - controllable, powers segment jumping) */}
        {/* Show when: no external video (YouTube), and we have audio OR video sources */}
        {!hasVideo && (hasDirectAudio || (videoPlaybackEnabled && playbackMode === 'video' && videoSources.length > 0)) && sourceMediaUrl && (
          <Card className="p-4 mb-4" data-testid="card-poddna-player">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  {playbackMode === 'video' ? (
                    <Video className="w-4 h-4 text-primary" />
                  ) : (
                    <Headphones className="w-4 h-4 text-primary" />
                  )}
                  <h3 className="font-medium text-sm">Play with PodDNA</h3>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Mode toggle - show when both audio and video sources are available */}
                  {hasBothModes && videoPlaybackEnabled && (
                    <div className="flex rounded-md border" data-testid="mode-toggle">
                      <Button
                        size="sm"
                        variant={playbackMode === 'audio' ? 'default' : 'ghost'}
                        className="rounded-r-none h-8 px-3"
                        onClick={() => handleModeToggle('audio')}
                        data-testid="button-audio-mode"
                      >
                        <Headphones className="w-3 h-3 mr-1" />
                        Audio
                      </Button>
                      <Button
                        size="sm"
                        variant={playbackMode === 'video' ? 'default' : 'ghost'}
                        className="rounded-l-none h-8 px-3"
                        onClick={() => handleModeToggle('video')}
                        data-testid="button-video-mode"
                      >
                        <Video className="w-3 h-3 mr-1" />
                        Video
                      </Button>
                    </div>
                  )}
                  
                  {/* Source selector - show when multiple sources of same type */}
                  {hasMultipleSources && (
                    <Select
                      value={selectedSourceId || undefined}
                      onValueChange={(value) => setSelectedSourceId(value)}
                    >
                      <SelectTrigger className="w-[160px] h-8" data-testid="select-source">
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent>
                        {sources.map((source) => (
                          <SelectItem 
                            key={source.id} 
                            value={source.id}
                            data-testid={`source-option-${source.id}`}
                          >
                            {source.kind === "audio" ? <Headphones className="w-3 h-3 inline mr-1" /> : 
                             source.kind === "video" ? <Video className="w-3 h-3 inline mr-1" /> : 
                             <FileText className="w-3 h-3 inline mr-1" />}
                            {source.platform === "podcast_host" ? "RSS Feed" : 
                             source.platform === "youtube" ? "YouTube" :
                             source.platform === "spotify" ? "Spotify" :
                             source.platform === "apple_podcasts" ? "Apple" :
                             source.platform === "vimeo" ? "Vimeo" :
                             source.platform === "replit_storage" ? "Uploaded" :
                             source.platform}
                            {source.isCanonical && " ★"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              
              {/* Video player - show when in video mode */}
              {playbackMode === 'video' && videoPlaybackEnabled && selectedSource?.kind === 'video' && (
                <div className="relative aspect-video bg-black rounded-md overflow-hidden">
                  <video
                    ref={videoRef}
                    src={sourceMediaUrl}
                    controls
                    className="w-full h-full"
                    onLoadedMetadata={(e) => {
                      setDuration(e.currentTarget.duration);
                      setAudioReady(true);
                    }}
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    data-testid="video-player"
                  />
                </div>
              )}
              
              {/* Audio player - show when in audio mode */}
              {playbackMode === 'audio' && (selectedSource?.kind === 'audio' || selectedSource?.kind === 'upload' || !selectedSource?.kind) && (
                <audio
                  ref={audioRef}
                  src={sourceMediaUrl}
                  controls
                  className="w-full"
                  onLoadedMetadata={(e) => {
                    setDuration(e.currentTarget.duration);
                    setAudioReady(true);
                  }}
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  data-testid="audio-player"
                />
              )}
              
              {/* Alignment offset indicator */}
              {sourceAlignmentOffset !== 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1" data-testid="offset-indicator">
                  <AlertCircle className="w-3 h-3" />
                  <span>
                    This source has a {sourceAlignmentOffset > 0 ? '+' : ''}{sourceAlignmentOffset.toFixed(1)}s timing offset from the transcript.
                    Seeking will be adjusted automatically.
                  </span>
                </div>
              )}
              
              <p className="text-xs text-muted-foreground">
                Jump between segments, annotations, products, and music using the controls below.
              </p>
            </div>
          </Card>
        )}

        {/* Platform Links (SECONDARY - collapsible, badge-style) */}
        {!hasVideo && hasPlatformEmbed && (
          <div className="mb-6" data-testid="platform-links-section">
            <button
              onClick={() => setShowPlatformLinks(!showPlatformLinks)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
              data-testid="button-toggle-platform-links"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${showPlatformLinks ? 'rotate-180' : ''}`} />
              <span>Or open in your podcast app</span>
            </button>
            
            {showPlatformLinks && (
              <div className="mt-3 flex flex-wrap gap-3">
                {episode?.applePodcastsUrl && (
                  <a
                    href={episode.applePodcastsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#9933FF]/10 text-[#9933FF] hover:bg-[#9933FF]/20 transition-colors text-sm font-medium"
                    data-testid="link-apple-podcasts"
                  >
                    <SiApplepodcasts className="w-4 h-4" />
                    Listen on Apple Podcasts
                  </a>
                )}
                
                {episode?.spotifyUrl && (
                  <a
                    href={episode.spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#1DB954]/10 text-[#1DB954] hover:bg-[#1DB954]/20 transition-colors text-sm font-medium"
                    data-testid="link-spotify"
                  >
                    <SiSpotify className="w-4 h-4" />
                    Listen on Spotify
                  </a>
                )}
                
                <p className="w-full text-xs text-muted-foreground mt-2">
                  Opening in another app disables PodDNA's segment jumping and annotations.
                </p>
              </div>
            )}
          </div>
        )}

        {/* No Audio Available (shown when no video, no audio, and no platform embeds) */}
        {!hasVideo && !hasDirectAudio && !hasPlatformEmbed && (
          <Card className="p-6 mb-6 text-center" data-testid="card-no-audio">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <VolumeX className="w-10 h-10" />
              <div>
                <p className="font-medium">No audio available</p>
                <p className="text-sm">This episode doesn't have playback options configured yet.</p>
              </div>
            </div>
          </Card>
        )}


        {/* Hot Moments - Compact chips for quick navigation */}
        <MomentsChips
          episodeId={id!}
          onSelectMoment={(segmentId, startTime) => {
            seekToWithOffset(startTime);
            setActiveTab("insights");
          }}
          maxItems={3}
          className="mb-4"
        />

        {/* Two-Column Layout: LEFT=Tabbed Content, RIGHT=Annotations (always visible on desktop) */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
          {/* Left Column: Tabbed Content (Segments, Clips, Products, Music) */}
          <Card className="p-0 overflow-hidden" data-testid="card-content-panel">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="sticky top-0 z-50 bg-background border-b border-[#e7e7e7] overflow-x-auto">
                <TabsList className="w-full justify-start rounded-none border-0 h-12 p-0 bg-transparent flex-nowrap">
                  <TabsTrigger 
                    value="insights" 
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#ffe166] data-[state=active]:bg-transparent px-4 py-3 whitespace-nowrap text-[#6d6d6d] data-[state=active]:text-foreground"
                    data-testid="tab-insights"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Insights
                  </TabsTrigger>
                  <TabsTrigger 
                    value="transcript" 
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#ffe166] data-[state=active]:bg-transparent px-4 py-3 whitespace-nowrap text-[#6d6d6d] data-[state=active]:text-foreground"
                    data-testid="tab-transcript"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Transcript
                    {displaySegments && displaySegments.length > 0 && (
                      <span className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded">
                        {displaySegments.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="media"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#ffe166] data-[state=active]:bg-transparent px-4 py-3 whitespace-nowrap text-[#6d6d6d] data-[state=active]:text-foreground"
                    data-testid="tab-media"
                  >
                    <Headphones className="w-4 h-4 mr-2" />
                    Media
                    {(clips.length + musicDetections.length + entityMentions.length) > 0 && (
                      <span className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded">
                        {clips.length + musicDetections.length + entityMentions.length}
                      </span>
                    )}
                  </TabsTrigger>
                  {isStaff && (
                    <TabsTrigger 
                      value="admin"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#ffe166] data-[state=active]:bg-transparent px-4 py-3 whitespace-nowrap text-[#6d6d6d] data-[state=active]:text-foreground"
                      data-testid="tab-admin"
                    >
                      <ShieldCheck className="w-4 h-4 mr-2" />
                      Admin
                    </TabsTrigger>
                  )}
                </TabsList>
              </div>

              <ScrollArea className="h-[600px]" ref={scrollContainerRef}>
                {/* Insights Tab - AI-powered analysis: Key Ideas, Claims, Emotional Peaks, Entities */}
                <TabsContent value="insights" className="m-0 p-4">
                  <BentoInsightsPanel
                    episodeId={id!}
                    snippets={snippets}
                    currentTime={currentTime}
                    onSeek={seekToWithOffset}
                    clips={clips}
                    annotations={annotations}
                    onAddAnnotation={(startTime) => {
                      const snippet = snippets.find(s => s.startSeconds === startTime);
                      if (!snippet) {
                        toast({
                          title: "Error",
                          description: "Could not find segment for annotation",
                          variant: "destructive",
                        });
                        return;
                      }
                      const segmentId = snippet.id.startsWith("derived-") 
                        ? snippet.id.substring(8) 
                        : snippet.id;
                      const selectedText = snippet.snippetText;
                      setSelection({
                        segmentId,
                        text: selectedText,
                        startOffset: 0,
                        endOffset: selectedText.length,
                      });
                      setPopupPosition({
                        top: window.innerHeight / 3,
                        left: window.innerWidth / 2,
                      });
                      setShowAnnotationForm(true);
                    }}
                  />
                </TabsContent>

                {/* Legacy Segments Tab - redirect to insights */}
                <TabsContent value="segments" className="m-0 p-4">
                  {snippets.length > 0 ? (
                    <SegmentList
                      segments={snippets}
                      currentTime={currentTime}
                      onPlay={seekToWithOffset}
                      onAddAnnotation={(startTime) => {
                        const snippet = snippets.find(s => s.startSeconds === startTime);
                        if (!snippet) {
                          toast({
                            title: "Error",
                            description: "Could not find segment for annotation",
                            variant: "destructive",
                          });
                          return;
                        }
                        const segmentId = snippet.id.startsWith("derived-") 
                          ? snippet.id.substring(8) 
                          : snippet.id;
                        const selectedText = snippet.snippetText;
                        setSelection({
                          segmentId,
                          text: selectedText,
                          startOffset: 0,
                          endOffset: selectedText.length,
                        });
                        setPopupPosition({
                          top: window.innerHeight / 3,
                          left: window.innerWidth / 2,
                        });
                        setShowAnnotationForm(true);
                      }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                        <Clock className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">No Segments Available</h3>
                      <p className="text-muted-foreground max-w-sm">
                        AI-generated chapters and topic segments will appear here once the episode is processed.
                      </p>
                    </div>
                  )}
                </TabsContent>

                {/* Transcript Tab - Clean reader layout with TranscriptReader */}
                <TabsContent value="transcript" className="m-0">
                  {/* Annotation Sorting Tabs */}
                  {annotations.length > 0 && (
                    <div className="sticky top-0 z-30 bg-background border-b px-4 py-2" data-testid="annotation-sort-tabs">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground mr-2">Sort by:</span>
                        <Button
                          variant={annotationSort === "top" ? "default" : "ghost"}
                          size="sm"
                          onClick={() => handleAnnotationSortChange("top")}
                          className="h-7 text-xs"
                          data-testid="button-sort-top"
                        >
                          <TrendingUp className="w-3 h-3 mr-1" />
                          Top
                        </Button>
                        <Button
                          variant={annotationSort === "new" ? "default" : "ghost"}
                          size="sm"
                          onClick={() => handleAnnotationSortChange("new")}
                          className="h-7 text-xs"
                          data-testid="button-sort-new"
                        >
                          <Clock className="w-3 h-3 mr-1" />
                          Newest
                        </Button>
                        <Button
                          variant={annotationSort === "ai" ? "default" : "ghost"}
                          size="sm"
                          onClick={() => handleAnnotationSortChange("ai")}
                          className="h-7 text-xs"
                          data-testid="button-sort-ai"
                        >
                          <Sparkles className="w-3 h-3 mr-1" />
                          AI Suggestions
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Insight Hints - Quick jump to key moments */}
                  {topInsights.length > 0 && (
                    <div className="border-b bg-muted/30 px-4 py-2" data-testid="insight-hints">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-medium text-muted-foreground">Key Moments</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {topInsights.map((insight) => (
                          <button
                            key={insight.id}
                            type="button"
                            onClick={() => seekToWithOffset(insight.startTime)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            data-testid={`insight-chip-${insight.id}`}
                          >
                            <Play className="w-2.5 h-2.5" />
                            <span className="truncate max-w-[120px]" data-testid={`insight-chip-title-${insight.id}`}>{insight.title}</span>
                            <span className="text-primary/60 shrink-0" data-testid={`insight-chip-time-${insight.id}`}>{formatTime(insight.startTime)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {displaySegments && displaySegments.length > 0 ? (
                    <div>
                      {/* Transcript Source Indicator */}
                      {transcriptSource && (
                        <div 
                          className="sticky top-0 z-20 bg-muted/80 border-b px-4 py-1.5 backdrop-blur-sm flex items-center gap-2"
                          data-testid="transcript-source-indicator"
                        >
                          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {transcriptSource}
                            {selectedSource && ` (${selectedSource.platform === 'youtube' ? 'YouTube' : selectedSource.kind})`}
                          </span>
                          {hasSourceTranscript && (
                            <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded">
                              {displaySegments.length} segments
                            </span>
                          )}
                        </div>
                      )}
                      {/* Current Segment Indicator */}
                      {snippets.length > 0 && (() => {
                        const currentSnippet = snippets.find(
                          s => currentTime >= s.startSeconds && (s.endSeconds === null || currentTime < s.endSeconds)
                        );
                        if (!currentSnippet) return null;
                        return (
                          <div 
                            className="sticky top-0 z-10 bg-primary/10 border-b border-primary/20 px-4 py-2 backdrop-blur-sm"
                            data-testid="current-segment-indicator"
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1.5">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                </span>
                                <span className="text-xs font-medium text-primary">NOW PLAYING</span>
                              </div>
                              <span className="text-sm font-medium truncate">{currentSnippet.label}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="ml-auto h-6 px-2 text-xs"
                                onClick={() => setActiveTab("insights")}
                                data-testid="button-view-all-segments"
                              >
                                View All Segments
                              </Button>
                            </div>
                          </div>
                        );
                      })()}
                      {/* TranscriptReader for clean reading experience */}
                      <TranscriptReader
                        segments={displaySegments}
                        annotations={annotations}
                        aiTags={aiTags}
                        currentTime={currentTime}
                        activeSegmentId={activeSegmentId}
                        onSeek={seekToWithOffset}
                        setSegmentRef={setSegmentRef}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 px-6 text-center" data-testid="transcript-empty-state">
                      {statusError ? (
                        <>
                          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
                            <AlertCircle className="w-8 h-8 text-amber-500" />
                          </div>
                          <h3 className="text-lg font-semibold text-foreground mb-2">Connection Issue</h3>
                          <p className="text-muted-foreground mb-4 max-w-sm">
                            We're having trouble loading the transcript status. This is usually temporary.
                          </p>
                          <Button 
                            variant="outline" 
                            onClick={() => refetchStatus()}
                            data-testid="button-retry-status"
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Try Again
                          </Button>
                        </>
                      ) : episodeStatus?.transcriptStatus === "processing" ? (
                        <>
                          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                            <Loader2 className="w-8 h-8 text-primary animate-spin" />
                          </div>
                          <h3 className="text-lg font-semibold text-foreground mb-2">Generating Transcript</h3>
                          <p className="text-muted-foreground max-w-sm">
                            Our AI is processing the audio. This typically takes 1-3 minutes depending on episode length.
                          </p>
                          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                            </span>
                            Processing in progress...
                          </div>
                        </>
                      ) : episodeStatus?.transcriptStatus === "pending" ? (
                        <>
                          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                            <Clock className="w-8 h-8 text-muted-foreground" />
                          </div>
                          <h3 className="text-lg font-semibold text-foreground mb-2">Queued for Processing</h3>
                          <p className="text-muted-foreground max-w-sm">
                            This episode is in line to be transcribed. It should start processing shortly.
                          </p>
                        </>
                      ) : episodeStatus?.transcriptStatus === "failed" ? (
                        <>
                          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                            <XCircle className="w-8 h-8 text-destructive" />
                          </div>
                          <h3 className="text-lg font-semibold text-foreground mb-2">Transcript Unavailable</h3>
                          <p className="text-muted-foreground mb-4 max-w-sm">
                            {isStaff 
                              ? "The transcription job failed. Check the admin panel for details and retry if needed."
                              : "We couldn't generate a transcript for this episode. This can happen with audio quality issues."
                            }
                          </p>
                          {isStaff && (
                            <Link href="/admin" data-testid="link-admin-jobs">
                              <Button variant="outline">
                                View Job Details
                              </Button>
                            </Link>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                            <FileText className="w-8 h-8 text-muted-foreground" />
                          </div>
                          <h3 className="text-lg font-semibold text-foreground mb-2">No Transcript Available</h3>
                          <p className="text-muted-foreground max-w-sm">
                            A transcript hasn't been generated for this episode yet.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </TabsContent>

                {/* Clips Tab */}
                {canCreateClips && (
                  <TabsContent value="clips" className="m-0 p-4">
                    {clips.length > 0 ? (
                      <div className="space-y-4">
                        {clips.map((clip) => {
                          const canDelete = user && (user.id === clip.userId || user.role === "admin");
                          return (
                            <div key={clip.id} className="relative">
                              <AudioClipCard
                                clip={clip}
                                podcast={podcast}
                                mediaUrl={episode?.mediaUrl || ""}
                                episodeTitle={episode?.title}
                                compact
                              />
                              {canDelete && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="absolute top-2 right-2 h-7 w-7 text-zinc-400 hover:text-red-400"
                                  onClick={() => {
                                    if (confirm("Are you sure you want to delete this clip?")) {
                                      deleteClipMutation.mutate(clip.id);
                                    }
                                  }}
                                  disabled={deleteClipMutation.isPending}
                                  data-testid={`button-delete-clip-${clip.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                          <Headphones className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">No Audio Clips Yet</h3>
                        <p className="text-muted-foreground max-w-sm">
                          Create shareable audio clips from annotations to highlight memorable moments.
                        </p>
                      </div>
                    )}
                  </TabsContent>
                )}

                {/* Products Tab */}
                <TabsContent value="products" className="m-0 p-4">
                  <MentionedEntities episodeId={id!} onSeek={seekToWithOffset} />
                </TabsContent>

                {/* Music Tab */}
                <TabsContent value="music" className="m-0 p-4">
                  {musicDetections.length > 0 ? (
                    <MusicWidget
                      musicDetections={musicDetections}
                      onSeek={seekToWithOffset}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 px-6 text-center" data-testid="music-empty-state">
                      {statusError ? (
                        <>
                          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
                            <AlertCircle className="w-8 h-8 text-amber-500" />
                          </div>
                          <h3 className="text-lg font-semibold text-foreground mb-2">Connection Issue</h3>
                          <p className="text-muted-foreground mb-4 max-w-sm">
                            Unable to load music detection status.
                          </p>
                          <Button 
                            variant="outline" 
                            onClick={() => refetchStatus()}
                            data-testid="button-retry-music-status"
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Try Again
                          </Button>
                        </>
                      ) : episodeStatus?.musicStatus === "processing" ? (
                        <>
                          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                            <Loader2 className="w-8 h-8 text-primary animate-spin" />
                          </div>
                          <h3 className="text-lg font-semibold text-foreground mb-2">Detecting Music</h3>
                          <p className="text-muted-foreground max-w-sm">
                            Analyzing audio to identify songs and background music.
                          </p>
                        </>
                      ) : episodeStatus?.musicStatus === "pending" ? (
                        <>
                          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                            <Clock className="w-8 h-8 text-muted-foreground" />
                          </div>
                          <h3 className="text-lg font-semibold text-foreground mb-2">Queued for Detection</h3>
                          <p className="text-muted-foreground max-w-sm">
                            Music detection is scheduled and will start soon.
                          </p>
                        </>
                      ) : episodeStatus?.musicStatus === "failed" ? (
                        <>
                          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                            <XCircle className="w-8 h-8 text-destructive" />
                          </div>
                          <h3 className="text-lg font-semibold text-foreground mb-2">Detection Failed</h3>
                          <p className="text-muted-foreground mb-4 max-w-sm">
                            {isStaff 
                              ? "Music detection job failed. Check the admin panel for details."
                              : "We couldn't detect music in this episode."
                            }
                          </p>
                          {isStaff && (
                            <Link href="/admin" data-testid="link-admin-music-jobs">
                              <Button variant="outline">
                                View Job Details
                              </Button>
                            </Link>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                            <Music className="w-8 h-8 text-muted-foreground" />
                          </div>
                          <h3 className="text-lg font-semibold text-foreground mb-2">No Music Detected</h3>
                          <p className="text-muted-foreground max-w-sm">
                            No songs or background music were identified in this episode.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </TabsContent>

                {/* Video Scenes Tab - AI-detected scenes from video analysis */}
                {videoEvents.length > 0 && (
                  <TabsContent value="scenes" className="m-0 p-4">
                    <div className="space-y-3">
                      {videoEvents.map((event, index) => {
                        const formatTime = (seconds: number) => {
                          const mins = Math.floor(seconds / 60);
                          const secs = Math.floor(seconds % 60);
                          return `${mins}:${secs.toString().padStart(2, '0')}`;
                        };
                        const isCurrentScene = currentTime >= event.startTime && 
                          (event.endTime === null || currentTime < event.endTime);
                        
                        return (
                          <div
                            key={event.id}
                            className={`p-4 rounded-lg border transition-colors ${
                              isCurrentScene 
                                ? "border-primary bg-primary/5" 
                                : "border-border hover-elevate"
                            }`}
                            data-testid={`card-video-scene-${event.id}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Film className="w-4 h-4 text-muted-foreground shrink-0" />
                                  <span className="text-xs text-muted-foreground">
                                    {formatTime(event.startTime)}
                                    {event.endTime && ` - ${formatTime(event.endTime)}`}
                                  </span>
                                  {isCurrentScene && (
                                    <span className="text-xs font-medium text-primary flex items-center gap-1">
                                      <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                      </span>
                                      NOW
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm font-medium">
                                  {event.label}
                                </p>
                                {(() => {
                                  const payload = event.payload as Record<string, unknown> | null;
                                  if (payload && typeof payload === 'object' && 'keyElements' in payload && Array.isArray(payload.keyElements)) {
                                    const elements = payload.keyElements as string[];
                                    return (
                                      <div className="flex flex-wrap gap-1 mt-2">
                                        {elements.map((element, i) => (
                                          <span 
                                            key={i}
                                            className="text-xs bg-muted px-2 py-0.5 rounded"
                                          >
                                            {element}
                                          </span>
                                        ))}
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="shrink-0"
                                onClick={() => {
                                  // Jump to this scene in the video
                                  // For video sources, we use the raw timestamp (no offset adjustment)
                                  // since video events are already in video time
                                  handleSeek(event.startTime);
                                }}
                                data-testid={`button-jump-scene-${event.id}`}
                              >
                                <Play className="w-3 h-3 mr-1" />
                                Jump
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>
                )}

                {/* Media Tab - Consolidated: Clips, Music, Products, Video Scenes */}
                <TabsContent value="media" className="m-0 p-4">
                  <div className="space-y-7" data-testid="media-tab-content">
                    {/* ===== AUDIO SOURCES SECTION ===== */}
                    <BentoSection
                      title="Audio Sources"
                      icon={<Headphones className="w-4 h-4" />}
                      description={audioSources.length > 0 ? `${audioSources.length} source${audioSources.length !== 1 ? 's' : ''} available` : "Podcast audio players and embeds"}
                    >
                      <div className="space-y-4" data-testid="media-audio-sources">
                        {/* Spotify Embed */}
                        {(() => {
                          const spotifySource = audioSources.find(s => s.platform === 'spotify');
                          const spotifyUrl = spotifySource?.sourceUrl || episode?.spotifyUrl;
                          const spotifyId = spotifyUrl ? extractSpotifyEpisodeId(spotifyUrl) : null;
                          if (spotifyId) {
                            return (
                              <Card className="p-4 rounded-[12px] border-[#e6e6e6]" data-testid="spotify-embed-card">
                                <div className="flex items-center gap-2 mb-3">
                                  <SiSpotify className="w-5 h-5 text-[#1DB954]" />
                                  <span className="font-medium text-sm">Spotify</span>
                                </div>
                                <iframe
                                  src={`https://open.spotify.com/embed/episode/${spotifyId}?utm_source=generator&theme=0`}
                                  width="100%"
                                  height="152"
                                  frameBorder="0"
                                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                                  loading="lazy"
                                  className="rounded-lg"
                                  title="Spotify Player"
                                />
                              </Card>
                            );
                          }
                          return null;
                        })()}
                        
                        {/* Apple Podcasts Embed */}
                        {(() => {
                          const appleSource = audioSources.find(s => s.platform === 'apple');
                          const appleUrl = appleSource?.sourceUrl || episode?.applePodcastsUrl;
                          const appleEmbedUrl = appleUrl ? extractApplePodcastsEmbedUrl(appleUrl) : null;
                          if (appleEmbedUrl) {
                            return (
                              <Card className="p-4 rounded-[12px] border-[#e6e6e6]" data-testid="apple-embed-card">
                                <div className="flex items-center gap-2 mb-3">
                                  <SiApplepodcasts className="w-5 h-5 text-[#9933CC]" />
                                  <span className="font-medium text-sm">Apple Podcasts</span>
                                </div>
                                <iframe
                                  src={appleEmbedUrl}
                                  width="100%"
                                  height="175"
                                  frameBorder="0"
                                  allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"
                                  sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
                                  loading="lazy"
                                  className="rounded-lg overflow-hidden"
                                  title="Apple Podcasts Player"
                                />
                              </Card>
                            );
                          }
                          return null;
                        })()}
                        
                        {/* RSS / Direct Audio Source Info */}
                        {episode?.mediaUrl && (
                          <Card className="p-4 rounded-[12px] border-[#e6e6e6]" data-testid="rss-audio-card">
                            <div className="flex items-center gap-2 mb-2">
                              <Headphones className="w-5 h-5 text-muted-foreground" />
                              <span className="font-medium text-sm">RSS Audio</span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-3">
                              Direct audio from podcast feed
                            </p>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(episode.mediaUrl!, '_blank')}
                                data-testid="button-open-audio"
                              >
                                <ExternalLink className="w-3 h-3 mr-1" />
                                Open Audio
                              </Button>
                              <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {episode.mediaUrl?.split('/').pop()?.split('?')[0] || 'audio file'}
                              </span>
                            </div>
                          </Card>
                        )}
                        
                        {/* Empty state if no audio sources */}
                        {!episode?.mediaUrl && audioSources.length === 0 && (
                          <BentoCard size="sm" className="flex flex-col items-center justify-center py-8 text-center">
                            <Headphones className="w-8 h-8 mb-2 text-muted-foreground/50" />
                            <p className="text-sm text-muted-foreground">No audio sources available</p>
                          </BentoCard>
                        )}
                      </div>
                    </BentoSection>

                    {/* ===== VIDEO SOURCES SECTION ===== */}
                    <BentoSection
                      title="Video Sources"
                      icon={<Video className="w-4 h-4" />}
                      description={videoSources.length > 0 ? `${videoSources.length} video source${videoSources.length !== 1 ? 's' : ''}` : "YouTube and video embeds"}
                    >
                      <div className="space-y-4" data-testid="media-video-sources">
                        {/* YouTube Embed for each video source */}
                        {videoSources.map((source) => {
                          const videoId = getYouTubeVideoId(source.sourceUrl || '');
                          if (videoId && source.platform === 'youtube') {
                            return (
                              <Card key={source.id} className="p-4 rounded-[12px] border-[#e6e6e6]" data-testid={`youtube-source-card-${source.id}`}>
                                <div className="flex items-center justify-between gap-2 mb-3">
                                  <div className="flex items-center gap-2">
                                    <SiYoutube className="w-5 h-5 text-[#FF0000]" />
                                    <span className="font-medium text-sm">YouTube</span>
                                    {source.isCanonical && (
                                      <span className="text-[10px] px-1.5 py-0.5 bg-primary/20 text-primary rounded-full">Primary</span>
                                    )}
                                  </div>
                                  {source.quality && (
                                    <span className="text-xs text-muted-foreground">{source.quality}</span>
                                  )}
                                </div>
                                <div className="aspect-video rounded-[16px] overflow-hidden bg-black">
                                  <iframe
                                    src={`https://www.youtube.com/embed/${videoId}`}
                                    width="100%"
                                    height="100%"
                                    frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    loading="lazy"
                                    title={`YouTube - ${source.label || 'Video'}`}
                                  />
                                </div>
                                {source.label && (
                                  <p className="text-xs text-muted-foreground mt-2">{source.label}</p>
                                )}
                              </Card>
                            );
                          }
                          return null;
                        })}
                        
                        {/* Video Scenes if available */}
                        {videoEvents.length > 0 && (
                          <Card className="p-4 rounded-[12px] border-[#e6e6e6]" data-testid="video-scenes-card">
                            <div className="flex items-center gap-2 mb-3">
                              <Clapperboard className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium text-sm">Detected Scenes</span>
                              <span className="text-xs text-muted-foreground">({videoEvents.length})</span>
                            </div>
                            <BentoGrid columns={2}>
                              {videoEvents.slice(0, 6).map((event) => {
                                const formatSceneTime = (seconds: number) => {
                                  const mins = Math.floor(seconds / 60);
                                  const secs = Math.floor(seconds % 60);
                                  return `${mins}:${secs.toString().padStart(2, '0')}`;
                                };
                                const isCurrentScene = currentTime >= event.startTime && 
                                  (event.endTime === null || currentTime < event.endTime);
                                
                                return (
                                  <BentoCard
                                    key={event.id}
                                    size="sm"
                                    onClick={() => handleSeek(event.startTime)}
                                    className={isCurrentScene ? "ring-2 ring-primary" : ""}
                                  >
                                    <BentoCardHeader label={formatSceneTime(event.startTime)} />
                                    <BentoCardTitle>{event.label || "Scene"}</BentoCardTitle>
                                    {isCurrentScene && (
                                      <div className="flex items-center gap-1 mt-2">
                                        <span className="relative flex h-2 w-2">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                        </span>
                                        <span className="text-xs text-primary font-medium">Now Playing</span>
                                      </div>
                                    )}
                                  </BentoCard>
                                );
                              })}
                            </BentoGrid>
                            {videoEvents.length > 6 && (
                              <p className="text-xs text-muted-foreground text-center mt-3">
                                +{videoEvents.length - 6} more scenes
                              </p>
                            )}
                          </Card>
                        )}
                        
                        {/* Empty state if no video sources */}
                        {videoSources.length === 0 && videoEvents.length === 0 && (
                          <BentoCard size="sm" className="flex flex-col items-center justify-center py-8 text-center">
                            <Video className="w-8 h-8 mb-2 text-muted-foreground/50" />
                            <p className="text-sm text-muted-foreground">No video sources available</p>
                            <p className="text-xs text-muted-foreground mt-1">YouTube videos will appear here when linked</p>
                          </BentoCard>
                        )}
                      </div>
                    </BentoSection>

                    {/* ===== EXTERNAL RESOURCES SECTION ===== */}
                    <BentoSection
                      title="External Resources"
                      icon={<ExternalLink className="w-4 h-4" />}
                      description="Links, music, and products mentioned in this episode"
                    >
                      <div className="space-y-4" data-testid="media-external-resources">
                        {/* Music Detected */}
                        {musicDetections.length > 0 && (
                          <Card className="p-4 rounded-[12px] border-[#e6e6e6]" data-testid="music-detected-card">
                            <div className="flex items-center gap-2 mb-3">
                              <Music className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium text-sm">Music Detected</span>
                              <span className="text-xs text-muted-foreground">({musicDetections.length})</span>
                            </div>
                            <MusicWidget
                              musicDetections={musicDetections}
                              onSeek={seekToWithOffset}
                            />
                          </Card>
                        )}
                        
                        {/* Products & Entities */}
                        <Card className="p-4 rounded-[12px] border-[#e6e6e6]" data-testid="products-mentions-card">
                          <div className="flex items-center gap-2 mb-3">
                            <Package className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium text-sm">Products & Mentions</span>
                            {entityMentions.length > 0 && (
                              <span className="text-xs text-muted-foreground">({entityMentions.length})</span>
                            )}
                          </div>
                          <MentionedEntities episodeId={id!} onSeek={seekToWithOffset} />
                        </Card>
                        
                        {/* Audio Clips (if feature enabled) */}
                        {canCreateClips && clips.length > 0 && (
                          <Card className="p-4 rounded-[12px] border-[#e6e6e6]" data-testid="audio-clips-card">
                            <div className="flex items-center gap-2 mb-3">
                              <Share2 className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium text-sm">Audio Clips</span>
                              <span className="text-xs text-muted-foreground">({clips.length})</span>
                            </div>
                            <div className="space-y-3">
                              {clips.map((clip) => {
                                const canDelete = user && (user.id === clip.userId || user.role === "admin");
                                return (
                                  <div key={clip.id} className="relative">
                                    <AudioClipCard
                                      clip={clip}
                                      podcast={podcast}
                                      mediaUrl={episode?.mediaUrl || ""}
                                      episodeTitle={episode?.title}
                                      compact
                                    />
                                    {canDelete && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="absolute top-2 right-2 text-zinc-400 hover:text-red-400"
                                        onClick={() => {
                                          if (confirm("Are you sure you want to delete this clip?")) {
                                            deleteClipMutation.mutate(clip.id);
                                          }
                                        }}
                                        disabled={deleteClipMutation.isPending}
                                        data-testid={`button-delete-clip-${clip.id}`}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </Card>
                        )}
                      </div>
                    </BentoSection>
                  </div>
                </TabsContent>

                {/* Admin Tab - Staff only: Integrity analysis, semantic status, debug */}
                {isStaff && (
                  <TabsContent value="admin" className="m-0 p-4">
                    <div className="space-y-5" data-testid="admin-tab-content">
                      {/* Admin Notice */}
                      <Card className="p-4 rounded-[12px] border-[#e6e6e6] bg-amber-50/50 dark:bg-amber-950/20">
                        <h3 className="font-semibold flex items-center gap-2 text-amber-800 dark:text-amber-200">
                          <ShieldCheck className="w-4 h-4" />
                          Admin Tools
                        </h3>
                        <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                          These tools are only visible to staff members.
                        </p>
                      </Card>

                      {/* Episode Status Card */}
                      <Card className="p-4 rounded-[12px] border-[#e6e6e6]" data-testid="admin-status-card">
                        <div className="flex items-center gap-2 mb-4">
                          <AlertCircle className="w-4 h-4 text-[#6d6d6d]" />
                          <span className="font-medium text-sm">Episode Status</span>
                        </div>
                        <div className="flex flex-wrap gap-2" data-testid="admin-status-section">
                          <BentoStat 
                            label="Transcript" 
                            value={episodeStatus?.transcriptStatus || 'unknown'}
                            variant={episodeStatus?.transcriptStatus === 'ready' ? 'success' : episodeStatus?.transcriptStatus === 'processing' ? 'warning' : 'default'}
                          />
                          <BentoStat 
                            label="Music" 
                            value={episodeStatus?.musicStatus || 'unknown'}
                            variant={episodeStatus?.musicStatus === 'ready' ? 'success' : episodeStatus?.musicStatus === 'processing' ? 'warning' : 'default'}
                          />
                          <BentoStat 
                            label="Sources" 
                            value={sources.length}
                            variant="default"
                          />
                          <BentoStat 
                            label="Segments" 
                            value={displaySegments?.length || 0}
                            variant="default"
                          />
                          <BentoStat 
                            label="Annotations" 
                            value={annotations.length}
                            variant="default"
                          />
                        </div>
                      </Card>
                      
                      {/* Integrity Analysis Card */}
                      <Card className="p-4 rounded-[12px] border-[#e6e6e6]" data-testid="admin-integrity-card">
                        <div className="flex items-center gap-2 mb-4">
                          <ShieldCheck className="w-4 h-4 text-[#6d6d6d]" />
                          <span className="font-medium text-sm">Integrity Analysis</span>
                          <span className="text-xs text-[#6d6d6d]">Transcript diff, sponsors, and claims</span>
                        </div>
                        
                        {/* AI Pipeline Health Panel */}
                        <AIHealthPanel episodeId={id} />
                        
                        <div data-testid="admin-integrity-section">
                          <IntegrityPanel 
                            episodeId={id} 
                            onSeek={seekToWithOffset}
                          />
                        </div>
                      </Card>
                      
                      {/* Knowledge Map Card */}
                      <Card className="p-4 rounded-[12px] border-[#e6e6e6]" data-testid="admin-knowledge-card">
                        <div className="flex items-center gap-2 mb-4">
                          <Sparkles className="w-4 h-4 text-[#6d6d6d]" />
                          <span className="font-medium text-sm">Knowledge Map</span>
                          <span className="text-xs text-[#6d6d6d]">AI-extracted key ideas</span>
                        </div>
                        <div data-testid="admin-knowledge-section">
                          <KnowledgeMapPanel 
                            episodeId={id} 
                            onSeek={seekToWithOffset}
                          />
                        </div>
                      </Card>
                      
                      {/* Debug Info Card */}
                      <Card className="p-4 rounded-[12px] border-[#e6e6e6]" data-testid="admin-debug-card">
                        <div className="flex items-center gap-2 mb-4">
                          <FileText className="w-4 h-4 text-[#6d6d6d]" />
                          <span className="font-medium text-sm">Debug Info</span>
                        </div>
                        <div className="font-mono text-xs space-y-2" data-testid="admin-debug-section">
                          <div className="flex justify-between gap-2">
                            <span className="text-[#6d6d6d]">Episode ID:</span>
                            <span className="select-all truncate">{id}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-[#6d6d6d]">Transcript Source:</span>
                            <span>{transcriptSource || 'none'}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-[#6d6d6d]">Selected Source:</span>
                            <span>{selectedSource?.platform || 'none'}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-[#6d6d6d]">Key Ideas:</span>
                            <span>{topInsights.length}</span>
                          </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-[#e6e6e6]">
                          <Link href="/admin" data-testid="link-admin-dashboard">
                            <Button variant="outline" size="sm" className="rounded-[10px]">
                              Open Admin Dashboard
                            </Button>
                          </Link>
                        </div>
                      </Card>
                    </div>
                  </TabsContent>
                )}
              </ScrollArea>
            </Tabs>
          </Card>

          {/* Right Column: Consolidated Sidebar with tabs */}
          <div className="lg:sticky lg:top-4">
            <EpisodeSidebar
              episodeId={id!}
              annotations={annotations}
              clips={clips}
              onSeek={seekToWithOffset}
              onAnnotationClick={(annotationId) => {
                setSelectedAnnotation(annotationId);
                const annotation = annotations.find(a => a.id === annotationId);
                if (annotation) {
                  const segment = displaySegments?.find(s => s.id === annotation.segmentId);
                  if (segment) {
                    seekToWithOffset(segment.startTime);
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Attribution Bar - Footer */}
        {podcast && (
          <AttributionBar
            sourceLink={episode.videoUrl}
            youtubeUrl={isYouTubeVideo && youtubeVideoId ? `https://youtube.com/watch?v=${youtubeVideoId}` : null}
            spotifyUrl={episode.spotifyUrl}
            applePodcastsUrl={episode.applePodcastsUrl}
            className="mt-8"
          />
        )}
      </div>

      {/* Annotation Popup */}
      {showAnnotationForm && selection && popupPosition && (
        <AnnotationPopup
          segmentId={selection.segmentId}
          selectedText={selection.text}
          startOffset={selection.startOffset}
          endOffset={selection.endOffset}
          position={popupPosition}
          maxChars={maxAnnotationChars}
          onClose={() => {
            setShowAnnotationForm(false);
            setSelection(null);
          }}
        />
      )}
    </div>
  );
}
