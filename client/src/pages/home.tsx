import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Play } from "lucide-react";
import HeroSection from "@/components/hero-section";
import ContentRail from "@/components/content-rail";
import PodcastCard from "@/components/podcast-card";
import AnnotationRailCard from "@/components/annotation-rail-card";
import MusicTeaser from "@/components/music-teaser";
import type { Podcast } from "@shared/schema";

interface AnnotationWithMetadata {
  id: string;
  content: string;
  text: string;
  upvotes: number;
  downvotes: number;
  segmentId: string;
  episodeId: string;
  episodeTitle: string;
  podcastTitle: string;
  artworkUrl?: string;
  featured?: boolean;
  featuredAt?: string | null;
  isHero?: boolean;
}

export default function Home() {
  const { data: podcasts, isLoading: podcastsLoading } = useQuery<Podcast[]>({
    queryKey: ["/api/podcasts"],
  });

  const { data: featured, isLoading: featuredLoading } = useQuery<AnnotationWithMetadata[]>({
    queryKey: ["/api/annotations/featured"],
  });

  const { data: trending, isLoading: trendingLoading } = useQuery<AnnotationWithMetadata[]>({
    queryKey: ["/api/annotations/trending"],
  });

  const isLoading = podcastsLoading || featuredLoading || trendingLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Skeleton className="h-[75vh]" />
        <div className="container mx-auto px-6 py-12">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="flex gap-4 overflow-hidden">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="w-64 h-80 flex-shrink-0" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Prioritize hero annotation, then featured, then trending
  const heroAnnotation = featured?.find(f => f.isHero);
  const heroSource = heroAnnotation || (featured && featured.length > 0 ? featured[0] : (trending && trending.length > 0 ? trending[0] : null));
  const featuredAnnotation = heroSource ? {
    id: heroSource.id,
    content: heroSource.content,
    segmentText: heroSource.text,
    episodeTitle: heroSource.episodeTitle,
    podcastTitle: heroSource.podcastTitle,
    artworkUrl: heroSource.artworkUrl,
    upvotes: heroSource.upvotes,
    episodeId: heroSource.episodeId,
  } : null;

  // Get remaining featured annotations (after hero), then fill with trending
  const remainingFeatured = featured && featured.length > 1 ? featured.slice(1) : [];
  const featuredIds = new Set(featured?.map(f => f.id) || []);
  const trendingNotFeatured = trending?.filter(t => !featuredIds.has(t.id)) || [];
  
  // Combine remaining featured + trending (that aren't featured) for the rail
  const railAnnotations = [...remainingFeatured, ...trendingNotFeatured].slice(0, 10);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section with Featured Annotation */}
      {featuredAnnotation && (
        <HeroSection annotation={featuredAnnotation} />
      )}

      {/* Trending Annotations Rail */}
      {railAnnotations.length > 0 && (
        <ContentRail 
          title="Trending Annotations" 
          viewAllHref="/trending"
          testId="rail-trending-annotations"
        >
          {railAnnotations.map((annotation) => (
            <AnnotationRailCard
              key={annotation.id}
              annotation={annotation}
              testId={`annotation-${annotation.id}`}
            />
          ))}
        </ContentRail>
      )}

      {/* PodTap Music Teaser */}
      <MusicTeaser />

      {/* Popular Podcasts Rail */}
      {podcasts && podcasts.length > 0 && (
        <ContentRail 
          title="Popular Podcasts"
          testId="rail-popular-podcasts"
        >
          {podcasts.map((podcast) => (
            <PodcastCard
              key={podcast.id}
              podcast={podcast}
              testId={`podcast-${podcast.id}`}
            />
          ))}
        </ContentRail>
      )}

      {/* Empty state */}
      {(!podcasts || podcasts.length === 0) && (!trending || trending.length === 0) && (
        <div className="text-center py-20 px-6">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Play className="w-10 h-10 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold text-foreground mb-2">No content yet</h3>
          <p className="text-muted-foreground">Check back soon for annotatable podcasts</p>
        </div>
      )}
    </div>
  );
}
