import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ShieldCheck, 
  Sparkles, 
  Users, 
  Tag, 
  AlertTriangle,
  TrendingUp,
  Play,
  ThumbsUp,
  ThumbsDown,
  ArrowRight,
  Zap,
  MessageCircle
} from "lucide-react";
import type { EpisodeInsights } from "@shared/schema";

interface InsightsPanelProps {
  episodeId: string;
  onSeek?: (seconds: number) => void;
}

function formatTime(ms: number | null): string {
  if (ms === null) return "--:--";
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hrs}:${remainingMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getIntegrityColor(band: string): string {
  switch (band) {
    case "high": return "text-green-600 dark:text-green-400";
    case "medium": return "text-yellow-600 dark:text-yellow-400";
    case "low": return "text-red-600 dark:text-red-400";
    default: return "text-muted-foreground";
  }
}

function getIntegrityBgColor(band: string): string {
  switch (band) {
    case "high": return "bg-green-500/10 border-green-500/20";
    case "medium": return "bg-yellow-500/10 border-yellow-500/20";
    case "low": return "bg-red-500/10 border-red-500/20";
    default: return "bg-muted/10 border-muted/20";
  }
}

function getEntityIcon(type: string) {
  switch (type) {
    case "person": return <Users className="w-3 h-3" />;
    case "company": return <Tag className="w-3 h-3" />;
    default: return <Tag className="w-3 h-3" />;
  }
}

export default function InsightsPanel({ episodeId, onSeek }: InsightsPanelProps) {
  const { data: insights, isLoading, error } = useQuery<EpisodeInsights>({
    queryKey: ['/api/episodes', episodeId, 'insights'],
    enabled: !!episodeId,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="insights-panel-loading">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !insights) {
    return null;
  }

  const hasIntegrity = insights.integrity !== null;
  const hasTopics = insights.topics.length > 0;
  const hasEntities = insights.entities.length > 0;
  const hasKeyClaims = insights.keyClaims.length > 0;
  const hasContradictions = insights.contradictions.length > 0;
  const hasEmotionalPeaks = insights.emotionalPeaks.length > 0;

  const hasAnyData = hasIntegrity || hasTopics || hasEntities || hasKeyClaims || hasContradictions || hasEmotionalPeaks;

  if (!hasAnyData) {
    return null;
  }

  const handleSeek = (timeMs: number | null) => {
    if (timeMs !== null && onSeek) {
      onSeek(Math.floor(timeMs / 1000));
    }
  };

  return (
    <div className="space-y-6" data-testid="insights-panel">
      {hasIntegrity && insights.integrity && (
        <Card className={`p-5 border ${getIntegrityBgColor(insights.integrity.band)}`} data-testid="integrity-card">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 w-16 h-16 rounded-full flex items-center justify-center ${getIntegrityBgColor(insights.integrity.band)}`}>
              <span className={`text-2xl font-bold ${getIntegrityColor(insights.integrity.band)}`}>
                {insights.integrity.score}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className={`w-4 h-4 ${getIntegrityColor(insights.integrity.band)}`} />
                <span className={`text-sm font-semibold capitalize ${getIntegrityColor(insights.integrity.band)}`}>
                  {insights.integrity.band} Integrity
                </span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {insights.integrity.summary}
              </p>
              <div className="flex flex-wrap gap-3 mt-3">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="font-medium">Certainty:</span>
                  <span>{Math.round(insights.integrity.metrics.certainty * 100)}%</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="font-medium">Skepticism:</span>
                  <span>{Math.round(insights.integrity.metrics.skepticism * 100)}%</span>
                </div>
                {insights.integrity.metrics.contradictionsCount !== undefined && insights.integrity.metrics.contradictionsCount > 0 && (
                  <div className="flex items-center gap-1 text-xs text-red-500">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{insights.integrity.metrics.contradictionsCount} contradictions</span>
                  </div>
                )}
                {insights.integrity.metrics.supportsCount !== undefined && insights.integrity.metrics.supportsCount > 0 && (
                  <div className="flex items-center gap-1 text-xs text-green-500">
                    <ThumbsUp className="w-3 h-3" />
                    <span>{insights.integrity.metrics.supportsCount} supports</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {(hasTopics || hasEntities) && (
        <Card className="p-5" data-testid="topics-entities-card">
          {hasTopics && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Topics</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {insights.topics.map((topic) => (
                  <Badge 
                    key={topic.id} 
                    variant="secondary"
                    className="text-xs"
                    data-testid={`topic-badge-${topic.id}`}
                  >
                    {topic.name}
                    <span className="ml-1 opacity-60">({topic.statementCount})</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {hasEntities && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Key Mentions</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {insights.entities.slice(0, 8).map((entity) => (
                  <Badge 
                    key={entity.id} 
                    variant="outline"
                    className="text-xs gap-1"
                    data-testid={`entity-badge-${entity.id}`}
                  >
                    {getEntityIcon(entity.type)}
                    {entity.name}
                    <span className="opacity-60">({entity.mentionCount})</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {hasKeyClaims && (
        <Card className="p-5" data-testid="key-claims-card">
          <div className="flex items-center gap-2 mb-4">
            <MessageCircle className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Key Claims</span>
          </div>
          <div className="space-y-3">
            {insights.keyClaims.map((claim) => (
              <button
                key={claim.statementId}
                type="button"
                onClick={() => handleSeek(claim.startTime)}
                className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover-elevate text-left transition-all"
                data-testid={`key-claim-${claim.statementId}`}
              >
                <div className="flex-shrink-0 text-xs font-mono text-primary flex items-center gap-1 pt-0.5">
                  <Play className="w-3 h-3" />
                  {formatTime(claim.startTime)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground line-clamp-2">{claim.text}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary" className="text-xs">
                      {Math.round(claim.certainty * 100)}% certain
                    </Badge>
                    {claim.polarity && (
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${
                          claim.polarity === 'supportive' ? 'border-green-500/50 text-green-600' :
                          claim.polarity === 'skeptical' ? 'border-red-500/50 text-red-600' :
                          'border-muted'
                        }`}
                      >
                        {claim.polarity}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {hasContradictions && (
        <Card className="p-5 border-red-500/20" data-testid="contradictions-card">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-sm font-semibold">Tensions & Contradictions</span>
            <Badge variant="destructive" className="text-xs ml-auto">
              {insights.contradictions.length}
            </Badge>
          </div>
          <div className="space-y-4">
            {insights.contradictions.map((contradiction, idx) => (
              <div 
                key={`${contradiction.statementAId}-${contradiction.statementBId}`} 
                className="space-y-2"
                data-testid={`contradiction-${idx}`}
              >
                <button
                  type="button"
                  onClick={() => handleSeek(contradiction.statementAStartTime)}
                  className="w-full flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/10 hover-elevate text-left"
                >
                  <div className="flex-shrink-0 text-xs font-mono text-red-500 flex items-center gap-1 pt-0.5">
                    <Play className="w-3 h-3" />
                    {formatTime(contradiction.statementAStartTime)}
                  </div>
                  <p className="text-sm text-foreground line-clamp-2">{contradiction.statementAText}</p>
                </button>
                <div className="flex items-center gap-2 pl-4">
                  <ThumbsDown className="w-3 h-3 text-red-400" />
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">contradicted by</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSeek(contradiction.statementBStartTime)}
                  className="w-full flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/10 hover-elevate text-left"
                >
                  <div className="flex-shrink-0 text-xs font-mono text-red-500 flex items-center gap-1 pt-0.5">
                    <Play className="w-3 h-3" />
                    {formatTime(contradiction.statementBStartTime)}
                  </div>
                  <p className="text-sm text-foreground line-clamp-2">{contradiction.statementBText}</p>
                </button>
                <div className="flex justify-end">
                  <span className="text-xs text-muted-foreground">
                    {Math.round(contradiction.confidence * 100)}% confidence
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {hasEmotionalPeaks && (
        <Card className="p-5" data-testid="emotional-peaks-card">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-yellow-500" />
            <span className="text-sm font-semibold">Emotional Peaks</span>
          </div>
          <div className="space-y-2">
            {insights.emotionalPeaks.map((peak) => (
              <button
                key={peak.statementId}
                type="button"
                onClick={() => handleSeek(peak.startTime)}
                className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover-elevate text-left transition-all"
                data-testid={`emotional-peak-${peak.statementId}`}
              >
                <div className="flex-shrink-0 text-xs font-mono text-primary flex items-center gap-1 pt-0.5">
                  <Play className="w-3 h-3" />
                  {formatTime(peak.startTime)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground line-clamp-2">{peak.text}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className={`w-2 h-2 rounded-full ${peak.sentiment > 0 ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-xs text-muted-foreground">
                      {peak.sentiment > 0 ? 'Positive' : 'Negative'} ({Math.round(peak.intensity * 100)}% intensity)
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
