import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TrendingUp, ArrowUp, Play, ChevronLeft, ChevronRight } from "lucide-react";
import type { AnnotationWithAuthor } from "@shared/schema";

interface TrendingAnnotationWithEpisode extends AnnotationWithAuthor {
  episodeTitle: string;
  podcastTitle: string;
  artworkUrl?: string;
  text: string;
  score: number;
}

interface TrendingResponse {
  annotations: TrendingAnnotationWithEpisode[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export default function TrendingPage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = useQuery<TrendingResponse>({
    queryKey: [`/api/annotations/trending?page=${page}&pageSize=${pageSize}`],
  });

  const formatTimeAgo = (date: Date | string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <Skeleton className="h-12 w-96 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const annotations = data?.annotations || [];
  const pagination = data?.pagination;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-display font-bold text-foreground" data-testid="text-page-title">
              Trending Insights
            </h1>
          </div>
          <p className="text-lg text-muted-foreground">
            Discover the most upvoted annotations and viral moments across all podcasts
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {annotations.map((annotation) => (
            <Link key={annotation.id} href={`/episode/${annotation.episodeId}#annotation-${annotation.id}`}>
              <Card className="hover-elevate transition-all duration-200 cursor-pointer h-full" data-testid={`card-annotation-${annotation.id}`}>
                <CardContent className="p-6">
                  <div className="flex gap-3 mb-4">
                    {annotation.artworkUrl ? (
                      <img 
                        src={annotation.artworkUrl} 
                        alt={annotation.podcastTitle}
                        className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-primary/40 rounded-md flex items-center justify-center flex-shrink-0">
                        <Play className="w-6 h-6 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground line-clamp-1 mb-1" data-testid={`text-podcast-${annotation.id}`}>
                        {annotation.podcastTitle}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {annotation.episodeTitle}
                      </p>
                    </div>
                  </div>

                  {annotation.text && (
                    <div className="bg-yellow-400/10 border-l-4 border-yellow-400 p-3 mb-4 rounded-r-md">
                      <p className="text-foreground font-serif text-base line-clamp-3" data-testid={`text-quote-${annotation.id}`}>
                        "{annotation.text}"
                      </p>
                    </div>
                  )}

                  <div className="bg-muted/50 p-4 rounded-md mb-4">
                    <p className="text-sm text-foreground line-clamp-4">
                      {annotation.content}
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={annotation.authorAvatar || undefined} />
                        <AvatarFallback className="text-xs">
                          {(annotation.authorName || 'U')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-muted-foreground">
                        {annotation.authorName || 'Unknown User'}
                      </span>
                      <span className="text-sm text-muted-foreground">•</span>
                      <span className="text-sm text-muted-foreground">
                        {formatTimeAgo(annotation.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-primary font-semibold">
                      <ArrowUp className="w-4 h-4" />
                      <span data-testid={`text-upvotes-${annotation.id}`}>{annotation.upvotes}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {annotations.length === 0 && (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No trending annotations yet</h3>
            <p className="text-muted-foreground">Be the first to annotate and share insights</p>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <Button
              variant="outline"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
              data-testid="button-next-page"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
