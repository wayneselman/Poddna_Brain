import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import { Headphones, AlertCircle, RefreshCw, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import EpisodeCard from "@/components/episode-card";

interface CatalogEpisode {
  id: string;
  title: string;
  description: string | null;
  publishedAt: string;
  duration: number;
  artworkUrl: string | null;
  podcastId: string;
  podcastTitle: string;
  podcastHost: string | null;
  transcriptStatus: string;
  hasTranscript: boolean;
  processingStatus: string;
  lastError?: string | null;
  viralMomentCount?: number;
}

function CatalogSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-4 p-4 rounded-xl border bg-card">
          <Skeleton className="w-24 h-24 sm:w-28 sm:h-28 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-3 py-1">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Inbox className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No episodes yet</h3>
      <p className="text-muted-foreground max-w-md">
        We're preparing our first batch of episodes. Check back soon.
      </p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
      <p className="text-muted-foreground max-w-md mb-4">
        We couldn't load the episodes. Please try again.
      </p>
      <Button onClick={onRetry} variant="outline" data-testid="button-retry-catalog">
        <RefreshCw className="w-4 h-4 mr-2" />
        Try Again
      </Button>
    </div>
  );
}

export default function CatalogPage() {
  const { 
    data: episodes = [], 
    isLoading, 
    error, 
    refetch 
  } = useQuery<CatalogEpisode[]>({
    queryKey: ["/api/episodes/catalog"],
  });

  return (
    <>
      <Helmet>
        <title>Browse Episodes | PodDNA</title>
        <meta name="description" content="Explore curated podcast episodes on PodDNA. Discover interesting moments, annotations, and insights from top podcasts." />
      </Helmet>
      
      <div className="container max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Headphones className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-catalog-title">Browse Episodes</h1>
            <p className="text-muted-foreground text-sm">
              Curated podcast episodes with transcripts and annotations
            </p>
          </div>
        </div>

        {isLoading ? (
          <CatalogSkeleton />
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : episodes.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4" data-testid="list-catalog-episodes">
            {episodes.map((episode) => (
              <EpisodeCard 
                key={episode.id} 
                episode={episode}
                testId={`episode-card-${episode.id}`}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
