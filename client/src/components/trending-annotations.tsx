import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import PodcastArtwork from "./podcast-artwork";
import { TrendingUp, ArrowUp } from "lucide-react";
import type { AnnotationWithAuthor, Episode, Podcast } from "@shared/schema";

interface TrendingAnnotationsProps {
  annotations: AnnotationWithAuthor[];
  onSelectAnnotation: (id: string) => void;
  episode?: Episode;
  podcast?: Podcast;
}

export default function TrendingAnnotations({
  annotations,
  onSelectAnnotation,
  episode,
  podcast,
}: TrendingAnnotationsProps) {
  const topAnnotations = [...annotations]
    .sort((a, b) => b.upvotes - a.upvotes)
    .slice(0, 5);

  const formatTimeAgo = (date: Date | string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <Card className="sticky top-8" data-testid="card-trending">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <CardTitle className="text-lg">Top Annotations</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-4">
        {topAnnotations.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
              <TrendingUp className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No annotations yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Be the first to annotate
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {topAnnotations.map((annotation, index) => (
              <div
                key={annotation.id}
                className="hover-elevate cursor-pointer p-3 rounded-md transition-all duration-200 border border-border"
                onClick={() => onSelectAnnotation(annotation.id)}
                data-testid={`trending-annotation-${annotation.id}`}
              >
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-lg font-bold text-primary w-6 flex-shrink-0">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    {podcast && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <PodcastArtwork
                          src={podcast.artworkUrl}
                          alt={podcast.title}
                          size="sm"
                        />
                        <span className="text-xs font-medium text-muted-foreground truncate">
                          {podcast.title}
                        </span>
                      </div>
                    )}
                    <p className="text-sm text-foreground line-clamp-2 mb-2 italic">
                      {annotation.content}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-5 h-5">
                          <AvatarImage src={annotation.authorAvatar || undefined} />
                          <AvatarFallback className="text-[10px]">
                            {(annotation.authorName || 'U')[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground truncate">
                          {annotation.authorName || 'Unknown User'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-primary font-semibold text-xs">
                        <ArrowUp className="w-3 h-3" />
                        <span data-testid={`trending-votes-${annotation.id}`}>
                          {annotation.upvotes}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
