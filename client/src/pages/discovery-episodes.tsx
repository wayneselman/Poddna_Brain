import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Mic, ChevronLeft, ChevronRight, MessageSquare, Play } from "lucide-react";

interface AnnotatedEpisode {
  id: string;
  title: string;
  description: string | null;
  podcastId: string;
  podcastTitle: string;
  artworkUrl: string | null;
  audioUrl: string | null;
  pubDate: Date | string | null;
  annotationCount: number;
}

interface MostAnnotatedResponse {
  episodes: AnnotatedEpisode[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export default function DiscoveryEpisodesPage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = useQuery<MostAnnotatedResponse>({
    queryKey: [`/api/episodes/most-annotated?page=${page}&pageSize=${pageSize}`],
  });

  const formatDate = (date: Date | string | null) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <Skeleton className="h-12 w-96 mb-8" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-80" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const episodes = data?.episodes || [];
  const pagination = data?.pagination;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <Mic className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-display font-bold text-foreground" data-testid="text-page-title">
              Most Annotated Episodes
            </h1>
          </div>
          <p className="text-lg text-muted-foreground">
            Explore episodes with the most community insights and discussions
          </p>
        </div>

        {episodes.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-foreground mb-2">No annotated episodes yet</h2>
            <p className="text-muted-foreground">
              Be the first to add annotations to podcast episodes!
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {episodes.map((episode, index) => (
                <Link key={episode.id} href={`/episode/${episode.id}`}>
                  <Card className="hover-elevate transition-all duration-200 cursor-pointer h-full group" data-testid={`card-episode-${episode.id}`}>
                    <CardContent className="p-0">
                      <div className="relative aspect-square overflow-hidden rounded-t-lg">
                        {episode.artworkUrl ? (
                          <img 
                            src={episode.artworkUrl} 
                            alt={episode.podcastTitle}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
                            <Play className="w-16 h-16 text-primary" />
                          </div>
                        )}
                        
                        <div className="absolute top-3 left-3">
                          <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded-full">
                            #{index + 1 + (page - 1) * pageSize}
                          </span>
                        </div>
                        
                        <div className="absolute bottom-3 right-3 bg-background/90 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-1.5">
                          <MessageSquare className="w-4 h-4 text-primary" />
                          <span className="text-sm font-semibold text-foreground" data-testid={`text-count-${episode.id}`}>
                            {episode.annotationCount}
                          </span>
                        </div>
                      </div>
                      
                      <div className="p-4">
                        <p className="text-sm text-muted-foreground mb-1 line-clamp-1">
                          {episode.podcastTitle}
                        </p>
                        <h3 className="font-semibold text-foreground line-clamp-2 mb-2" data-testid={`text-episode-${episode.id}`}>
                          {episode.title}
                        </h3>
                        {episode.pubDate && (
                          <p className="text-xs text-muted-foreground">
                            {formatDate(episode.pubDate)}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-12">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                
                <span className="text-sm text-muted-foreground" data-testid="text-pagination-info">
                  Page {page} of {pagination.totalPages}
                </span>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  data-testid="button-next-page"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
