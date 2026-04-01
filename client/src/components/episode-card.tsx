import { Link } from "wouter";
import { Clock, Calendar, FileText, Loader2, CheckCircle, AlertCircle, Download, Sparkles } from "lucide-react";
import PodcastArtwork from "@/components/podcast-artwork";
import { Badge } from "@/components/ui/badge";

interface EpisodeCardProps {
  episode: {
    id: string;
    title: string;
    description?: string | null;
    publishedAt: string | Date;
    duration: number;
    artworkUrl?: string | null;
    podcastId: string;
    podcastTitle: string;
    podcastHost?: string | null;
    transcriptStatus?: string;
    hasTranscript?: boolean;
    processingStatus?: string;
    lastError?: string | null;
    viralMomentCount?: number;
  };
  testId?: string;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { 
    month: "short", 
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined
  });
}

function getProcessingBadgeConfig(processingStatus?: string, transcriptStatus?: string) {
  const status = processingStatus || "new";
  
  switch (status) {
    case "importing":
      return {
        show: true,
        icon: Download,
        label: "Importing",
        className: "text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/20",
        animate: true
      };
    case "ready_for_analysis":
      return {
        show: true,
        icon: Loader2,
        label: "Queued",
        className: "text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/20",
        animate: false
      };
    case "analyzing":
      return {
        show: true,
        icon: Loader2,
        label: "Analyzing",
        className: "text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/20",
        animate: true
      };
    case "complete":
      return {
        show: false,
        icon: CheckCircle,
        label: "Ready",
        className: "text-green-700 bg-green-100 dark:bg-green-950/30 border-green-200",
        animate: false
      };
    case "error":
      return {
        show: true,
        icon: AlertCircle,
        label: "Error",
        className: "text-red-600 border-red-300 bg-red-50 dark:bg-red-950/20",
        animate: false
      };
    case "new":
    default:
      if (transcriptStatus === "pending" || transcriptStatus === "running") {
        return {
          show: true,
          icon: Loader2,
          label: transcriptStatus === "pending" ? "Queued" : "Processing",
          className: "text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/20",
          animate: transcriptStatus === "running"
        };
      }
      return { show: false, icon: null, label: "", className: "", animate: false };
  }
}

export default function EpisodeCard({ episode, testId }: EpisodeCardProps) {
  const badgeConfig = getProcessingBadgeConfig(episode.processingStatus, episode.transcriptStatus);
  const isProcessingAny = badgeConfig.show && badgeConfig.animate;
  
  return (
    <Link href={`/episode/${episode.id}`}>
      <div
        className="group flex gap-4 p-4 rounded-xl border bg-card hover-elevate transition-all duration-200 cursor-pointer"
        data-testid={testId || `episode-card-${episode.id}`}
      >
        <div className="flex-shrink-0 w-24 h-24 sm:w-28 sm:h-28 relative">
          <PodcastArtwork
            src={episode.artworkUrl}
            alt={episode.podcastTitle}
            size="md"
            className="rounded-lg"
          />
          {isProcessingAny && (
            <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
          <div>
            <h3 
              className="font-semibold text-sm sm:text-base line-clamp-2 mb-1 group-hover:text-primary transition-colors"
              data-testid={`${testId || episode.id}-title`}
            >
              {episode.title}
            </h3>
            <p 
              className="text-muted-foreground text-xs sm:text-sm line-clamp-1 mb-2"
              data-testid={`${testId || episode.id}-podcast`}
            >
              {episode.podcastTitle}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(episode.duration)}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(episode.publishedAt)}
            </span>
            {episode.viralMomentCount && episode.viralMomentCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-primary bg-primary/10 border-primary/20">
                <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                {episode.viralMomentCount} Moments
              </Badge>
            )}
            {episode.hasTranscript && !badgeConfig.show && !episode.viralMomentCount && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                <FileText className="w-2.5 h-2.5 mr-0.5" />
                Transcript
              </Badge>
            )}
            {episode.processingStatus === "complete" && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-green-700 bg-green-100 dark:bg-green-950/30 border-green-200">
                <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
                Ready
              </Badge>
            )}
            {badgeConfig.show && badgeConfig.icon && (
              <Badge 
                variant="outline" 
                className={`text-[10px] px-1.5 py-0 ${badgeConfig.className}`}
                data-testid={`badge-processing-${episode.processingStatus || 'unknown'}`}
              >
                <badgeConfig.icon className={`w-2.5 h-2.5 mr-0.5 ${badgeConfig.animate ? "animate-spin" : ""}`} />
                {badgeConfig.label}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
