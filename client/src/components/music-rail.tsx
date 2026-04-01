import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Music, Play } from "lucide-react";
import { SiSpotify, SiApplemusic } from "react-icons/si";
import { Link } from "wouter";
import type { MusicDetection } from "@shared/schema";
import poddnaLogoFallback from "@assets/poddna-logo-fallback.png";
import InlineMusicPlayer from "./inline-music-player";

interface TrendingMusicItem extends MusicDetection {
  episodeTitle: string;
  podcastTitle: string;
  podcastArtworkUrl: string | null;
}

export default function MusicRail() {
  const [activeMusic, setActiveMusic] = useState<MusicDetection | null>(null);
  const { data: music = [], isLoading } = useQuery<TrendingMusicItem[]>({
    queryKey: ["/api/music/trending"],
  });

  if (isLoading) {
    return (
      <section className="py-8" data-testid="section-music-rail">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Music className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold">Recently Played Music</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  if (music.length === 0) {
    return null;
  }

  return (
    <section className="py-8" data-testid="section-music-rail">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Music className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold">Recently Played Music</h2>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {music.slice(0, 10).map((item) => (
          <Link key={item.id} href={`/episode/${item.episodeId}`}>
            <Card className="group overflow-hidden hover-elevate cursor-pointer h-full" data-testid={`music-rail-card-${item.id}`}>
              <CardContent className="p-0">
                <div className="relative aspect-square">
                  <img
                    src={item.artworkUrl || poddnaLogoFallback}
                    alt={`${item.title} album art`}
                    className="w-full h-full object-cover bg-muted"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (target.src !== poddnaLogoFallback) {
                        target.src = poddnaLogoFallback;
                      }
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  {(item.spotifyUrl || item.appleMusicUrl) && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setActiveMusic(item);
                      }}
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-3 bg-white/90 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      aria-label="Play preview"
                      data-testid={`play-rail-music-${item.id}`}
                    >
                      <Play className="w-6 h-6 text-black fill-black" />
                    </button>
                  )}
                  
                  <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.spotifyUrl && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.open(item.spotifyUrl!, "_blank", "noopener,noreferrer");
                        }}
                        className="p-1.5 bg-black/60 rounded-full hover:bg-black/80 transition-colors"
                        aria-label="Open in Spotify"
                      >
                        <SiSpotify className="w-4 h-4 text-[#1DB954]" />
                      </button>
                    )}
                    {item.appleMusicUrl && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.open(item.appleMusicUrl!, "_blank", "noopener,noreferrer");
                        }}
                        className="p-1.5 bg-black/60 rounded-full hover:bg-black/80 transition-colors"
                        aria-label="Open in Apple Music"
                      >
                        <SiApplemusic className="w-4 h-4 text-[#FC3C44]" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="p-3">
                  <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                    {item.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {item.artist}
                  </p>
                  <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground/70">
                    {item.podcastArtworkUrl && (
                      <img
                        src={item.podcastArtworkUrl}
                        alt=""
                        className="w-4 h-4 rounded"
                      />
                    )}
                    <span className="truncate">{item.podcastTitle}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {activeMusic && (
        <InlineMusicPlayer
          music={activeMusic}
          onClose={() => setActiveMusic(null)}
        />
      )}
    </section>
  );
}
