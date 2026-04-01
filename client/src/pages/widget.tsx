import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowUp, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Annotation, Episode, Podcast } from "@shared/schema";

export default function WidgetPage() {
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [theme, setTheme] = useState("light");
  const [limit, setLimit] = useState(5);
  const [originUrl, setOriginUrl] = useState("");

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const searchParams = new URLSearchParams(window.location.search);
    setEpisodeId(searchParams.get("episode"));
    setTheme(searchParams.get("theme") || "light");
    setLimit(parseInt(searchParams.get("limit") || "5"));
    setOriginUrl(window.location.origin);
  }, []);

  const { data: episode } = useQuery<Episode>({
    queryKey: [`/api/episodes/${episodeId}`],
    enabled: !!episodeId,
  });

  const { data: podcast } = useQuery<Podcast>({
    queryKey: [`/api/podcasts/${episode?.podcastId}`],
    enabled: !!episode?.podcastId,
  });

  const { data: annotations = [] } = useQuery<Annotation[]>({
    queryKey: [`/api/episodes/${episodeId}/annotations`],
    enabled: !!episodeId,
  });

  const topAnnotations = [...annotations]
    .sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes))
    .slice(0, limit);

  if (!episodeId) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No episode specified
      </div>
    );
  }

  const isDark = theme === "dark";

  const handleAnnotationClick = (annotationId: string) => {
    if (typeof window === 'undefined') return;
    window.open(`${originUrl}/episode/${episodeId}?annotation=${annotationId}`, "_blank");
  };

  return (
    <div className={`min-h-screen ${isDark ? "dark bg-background" : "bg-white"}`}>
      <div className="max-w-2xl mx-auto p-4">
        <div className="mb-4 pb-3 border-b">
          <div className="flex items-center gap-3 mb-2">
            {podcast?.artworkUrl && (
              <img 
                src={podcast.artworkUrl} 
                alt={podcast.title}
                className="w-12 h-12 rounded"
              />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-sm truncate" data-testid="widget-episode-title">
                {episode?.title || "Loading..."}
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                {podcast?.title}
              </p>
            </div>
          </div>
          <a
            href={`${originUrl}/episode/${episodeId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            data-testid="widget-view-full"
          >
            <span className="font-bold text-primary">PodDNA</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="space-y-3">
          {topAnnotations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No annotations yet
            </p>
          ) : (
            topAnnotations.map((annotation) => (
              <Card 
                key={annotation.id} 
                className="hover-elevate cursor-pointer"
                onClick={() => handleAnnotationClick(annotation.id)}
                data-testid={`widget-annotation-${annotation.id}`}
              >
                <CardContent className="p-3">
                  <div className="flex gap-2">
                    <Avatar className="w-7 h-7 flex-shrink-0">
                      <AvatarImage src={annotation.authorAvatar ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {annotation.authorName[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold">
                          {annotation.authorName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          @{formatTimestamp(annotation.startTime)}
                        </span>
                      </div>

                      <p className="text-xs bg-yellow-200 dark:bg-yellow-900/30 px-1 py-0.5 mb-2 inline-block rounded">
                        "{annotation.text}"
                      </p>

                      <p className="text-xs text-foreground leading-relaxed">
                        {annotation.content}
                      </p>
                    </div>

                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <ArrowUp className="w-3 h-3" />
                      </Button>
                      <span className="text-xs font-medium">
                        {annotation.upvotes - annotation.downvotes}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="mt-4 pt-3 border-t text-center">
          <a
            href={`${originUrl}/episode/${episodeId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            View all annotations on PodDNA →
          </a>
        </div>
      </div>
    </div>
  );
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
