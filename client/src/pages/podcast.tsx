import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Play, Clock, Calendar, Repeat, TrendingUp, ExternalLink } from "lucide-react";
import type { Episode, Podcast } from "@shared/schema";

interface PatternOccurrence {
  relationId: string;
  confidence: number;
  matchText: string;
  episodeId: string;
  episodeTitle: string;
  publishedAt: string;
  startTime: number;
}

interface Pattern {
  statementId: string;
  representativeText: string;
  occurrenceCount: number;
  episodeCount: number;
  firstSeen: string;
  lastSeen: string;
  avgConfidence: number;
  frequencyLabel: string;
  occurrences: PatternOccurrence[];
}

interface PatternsResponse {
  podcastId: string;
  podcastName: string;
  patterns: Pattern[];
  meta: { totalPatterns: number };
}

export default function PodcastPage() {
  const { id } = useParams<{ id: string }>();
  
  const { data: podcast, isLoading: podcastLoading } = useQuery<Podcast>({
    queryKey: ["/api/podcasts", id],
  });

  const { data: episodes, isLoading: episodesLoading } = useQuery<Episode[]>({
    queryKey: ["/api/podcasts", id, "episodes"],
  });

  const { data: patternsData } = useQuery<PatternsResponse>({
    queryKey: ["/api/podcasts", id, "patterns"],
    enabled: !!id,
  });

  const isLoading = podcastLoading || episodesLoading;

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <Skeleton className="h-10 w-32 mb-8" />
          <Skeleton className="h-32 mb-8" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!podcast) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">Podcast not found</h2>
          <Link href="/">
            <Button variant="default">Back to home</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Link href="/">
          <Button variant="ghost" className="mb-6" data-testid="button-back-home">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to podcasts
          </Button>
        </Link>

        <div className="mb-12">
          <div className="flex gap-6 items-start">
            <div className="w-32 h-32 bg-gradient-to-br from-primary/20 to-primary/40 rounded-md flex items-center justify-center flex-shrink-0">
              <Play className="w-16 h-16 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-4xl font-display font-bold text-foreground mb-2" data-testid="text-podcast-title">
                {podcast.title}
              </h1>
              <p className="text-xl text-muted-foreground mb-4">{podcast.host}</p>
              {podcast.description && (
                <p className="text-foreground leading-relaxed">{podcast.description}</p>
              )}
            </div>
          </div>
        </div>

        {patternsData && patternsData.patterns.length > 0 && (
          <div className="mb-12" data-testid="section-patterns">
            <div className="flex items-center gap-3 mb-6">
              <TrendingUp className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-display font-bold text-foreground">Recurring Patterns</h2>
              <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">
                {patternsData.patterns.length} found
              </Badge>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {patternsData.patterns.slice(0, 6).map((pattern) => (
                <Card key={pattern.statementId} className="p-4" data-testid={`card-pattern-${pattern.statementId}`}>
                  <div className="flex items-start gap-3 mb-3">
                    <Repeat className="w-4 h-4 text-primary flex-shrink-0 mt-1" />
                    <p className="text-sm font-medium text-foreground leading-snug">
                      {pattern.representativeText}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    {pattern.frequencyLabel && (
                      <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate text-xs">
                        {pattern.frequencyLabel}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate text-xs">
                      {pattern.episodeCount} episode{pattern.episodeCount !== 1 ? "s" : ""}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(pattern.avgConfidence * 100)}% match
                    </span>
                  </div>
                  {pattern.occurrences.slice(0, 3).map((occ) => (
                    <Link key={occ.relationId} href={`/episode/${occ.episodeId}`}>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground hover-elevate rounded px-2 py-1 cursor-pointer" data-testid={`link-pattern-occurrence-${occ.relationId}`}>
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{occ.episodeTitle}</span>
                      </div>
                    </Link>
                  ))}
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="mb-6">
          <h2 className="text-2xl font-display font-bold text-foreground mb-4">Episodes</h2>
        </div>

        <div className="space-y-4">
          {episodes?.map((episode) => (
            <Link key={episode.id} href={`/episode/${episode.id}`}>
              <Card className="hover-elevate transition-all duration-200 cursor-pointer" data-testid={`card-episode-${episode.id}`}>
                <CardContent className="p-6">
                  <div className="flex gap-4 items-start">
                    <div className="w-12 h-12 bg-primary/10 rounded-md flex items-center justify-center flex-shrink-0">
                      <Play className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        {episode.episodeNumber && (
                          <span className="text-sm font-mono text-muted-foreground">
                            #{episode.episodeNumber}
                          </span>
                        )}
                        <h3 className="text-lg font-semibold text-foreground line-clamp-2" data-testid={`text-episode-title-${episode.id}`}>
                          {episode.title}
                        </h3>
                      </div>
                      {episode.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                          {episode.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(episode.publishedAt)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>{formatDuration(episode.duration)}</span>
                        </div>
                        <span className="px-2 py-0.5 bg-muted rounded text-xs font-medium">
                          {episode.type === "video" ? "Video" : "Audio"}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {episodes?.length === 0 && (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Play className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No episodes yet</h3>
            <p className="text-muted-foreground">Check back soon for new content</p>
          </div>
        )}
      </div>
    </div>
  );
}
