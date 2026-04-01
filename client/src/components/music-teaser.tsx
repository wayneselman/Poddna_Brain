import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, Disc3 } from "lucide-react";
import { SiSpotify, SiApplemusic } from "react-icons/si";
import { Link } from "wouter";
import type { MusicDetection } from "@shared/schema";
import poddnaLogoFallback from "@assets/poddna-logo-fallback.png";

interface TrendingMusicItem extends MusicDetection {
  episodeTitle: string;
  podcastTitle: string;
  podcastArtworkUrl: string | null;
}

export default function MusicTeaser() {
  const { data: music = [], isLoading } = useQuery<TrendingMusicItem[]>({
    queryKey: ["/api/music/trending"],
  });

  if (isLoading) {
    return (
      <section className="py-4" data-testid="section-music-teaser">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl md:text-3xl font-bold">PodTap</h2>
          </div>
          <div className="flex gap-4 overflow-hidden">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="w-72 h-24 flex-shrink-0 rounded-lg" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (music.length === 0) {
    return null;
  }

  const topThree = music.slice(0, 3);

  return (
    <section className="py-4" data-testid="section-music-teaser">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl md:text-3xl font-bold">PodTap</h2>
            <span className="text-sm text-muted-foreground hidden sm:inline">Music discovered in podcasts</span>
          </div>
          <Link href="/podtap">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-muted-foreground hover:text-foreground"
              data-testid="button-explore-podtap"
            >
              View All
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
        
        <div className="relative -mx-6 px-6">
          <div 
            className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory pb-4"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {topThree.map((item) => (
              <Link key={item.id} href={`/episode/${item.episodeId}`} className="flex-shrink-0 snap-start">
                <Card className="group overflow-hidden hover-elevate cursor-pointer w-72" data-testid={`music-teaser-card-${item.id}`}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="relative flex-shrink-0">
                      <img
                        src={item.artworkUrl || poddnaLogoFallback}
                        alt={`${item.title} album art`}
                        className="w-16 h-16 rounded-lg object-cover bg-muted shadow-md"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (target.src !== poddnaLogoFallback) {
                            target.src = poddnaLogoFallback;
                          }
                        }}
                      />
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-sm">
                        <Disc3 className="w-3 h-3 text-primary-foreground" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate" data-testid={`music-teaser-title-${item.id}`}>
                        {item.title}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {item.artist}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {item.spotifyUrl && (
                          <SiSpotify className="w-3.5 h-3.5 text-[#1DB954]" />
                        )}
                        {item.appleMusicUrl && (
                          <SiApplemusic className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        <span className="text-xs text-muted-foreground/70 truncate">
                          {item.podcastTitle}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
      
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </section>
  );
}
