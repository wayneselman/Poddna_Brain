import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Music, Play, Clock, Disc3, TrendingUp, Headphones, ExternalLink } from "lucide-react";
import { SiSpotify, SiApplemusic } from "react-icons/si";
import { Link } from "wouter";
import type { MusicDetection } from "@shared/schema";
import poddnaLogoFallback from "@assets/poddna-logo-fallback.png";
import InlineMusicPlayer from "@/components/inline-music-player";

interface TrendingMusicItem extends MusicDetection {
  episodeTitle: string;
  podcastTitle: string;
  podcastArtworkUrl: string | null;
}

export default function PodTapPage() {
  const [activeMusic, setActiveMusic] = useState<MusicDetection | null>(null);
  const { data: music = [], isLoading } = useQuery<TrendingMusicItem[]>({
    queryKey: ["/api/music/trending"],
  });

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handlePlayClick = (e: React.MouseEvent, item: MusicDetection) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveMusic(item);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            <Skeleton className="h-10 w-48 mb-2" />
            <Skeleton className="h-5 w-80" />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const featuredMusic = music.slice(0, 5);
  const recentMusic = music.slice(5);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 rounded-xl bg-primary/10">
                  <Disc3 className="w-6 h-6 text-primary" />
                </div>
                <h1 className="text-3xl font-bold text-gray-900" data-testid="podtap-title">
                  PodTap
                </h1>
              </div>
              <p className="text-gray-500">
                Discover music mentioned in your favorite podcasts
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
                <Music className="w-3.5 h-3.5" />
                {music.length} tracks discovered
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Featured Tracks */}
        {featuredMusic.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-gray-900">Featured Tracks</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {featuredMusic.map((item, index) => (
                <FeaturedMusicCard
                  key={item.id}
                  item={item}
                  index={index}
                  onPlayClick={handlePlayClick}
                />
              ))}
            </div>
          </section>
        )}

        {/* Recently Discovered */}
        {recentMusic.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-5">
              <Clock className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">Recently Discovered</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentMusic.map((item) => (
                <RecentMusicCard
                  key={item.id}
                  item={item}
                  onPlayClick={handlePlayClick}
                  formatTime={formatTime}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {music.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Music className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No music discovered yet</h3>
            <p className="text-gray-500 mb-4">
              Music will appear here as it's detected in podcast episodes
            </p>
            <Link href="/explore">
              <Button variant="outline">Browse Podcasts</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Music Player */}
      {activeMusic && (
        <InlineMusicPlayer
          music={activeMusic}
          onClose={() => setActiveMusic(null)}
        />
      )}
    </div>
  );
}

function FeaturedMusicCard({
  item,
  index,
  onPlayClick,
}: {
  item: TrendingMusicItem;
  index: number;
  onPlayClick: (e: React.MouseEvent, item: MusicDetection) => void;
}) {
  return (
    <Link href={`/episode/${item.episodeId}`}>
      <Card
        className="overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer group h-full"
        data-testid={`featured-music-card-${item.id}`}
      >
        <div className="aspect-square relative overflow-hidden">
          <img
            src={item.artworkUrl || poddnaLogoFallback}
            alt={`${item.title} album art`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (target.src !== poddnaLogoFallback) {
                target.src = poddnaLogoFallback;
              }
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

          {/* Ranking badge */}
          <div className="absolute top-2 left-2">
            <Badge className="bg-highlight text-black font-bold text-xs">
              #{index + 1}
            </Badge>
          </div>

          {/* Play button */}
          {(item.spotifyUrl || item.appleMusicUrl) && (
            <button
              onClick={(e) => onPlayClick(e, item)}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg hover:scale-110"
              data-testid={`play-button-${item.id}`}
            >
              <Play className="w-5 h-5 text-gray-900 ml-0.5" fill="currentColor" />
            </button>
          )}

          {/* Info overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <p className="font-semibold text-white text-sm truncate">{item.title}</p>
            <p className="text-white/80 text-xs truncate">{item.artist}</p>
            <div className="flex items-center gap-2 mt-1.5">
              {item.spotifyUrl && (
                <SiSpotify className="w-3.5 h-3.5 text-[#1DB954]" />
              )}
              {item.appleMusicUrl && (
                <SiApplemusic className="w-3.5 h-3.5 text-white" />
              )}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function RecentMusicCard({
  item,
  onPlayClick,
  formatTime,
}: {
  item: TrendingMusicItem;
  onPlayClick: (e: React.MouseEvent, item: MusicDetection) => void;
  formatTime: (seconds: number) => string;
}) {
  return (
    <Link href={`/episode/${item.episodeId}`}>
      <Card
        className="overflow-hidden hover:shadow-md transition-all cursor-pointer group"
        data-testid={`music-card-${item.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            {/* Album art */}
            <div className="relative flex-shrink-0">
              <img
                src={item.artworkUrl || poddnaLogoFallback}
                alt={`${item.title} album art`}
                className="w-14 h-14 rounded-lg object-cover shadow-sm"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (target.src !== poddnaLogoFallback) {
                    target.src = poddnaLogoFallback;
                  }
                }}
              />
              {(item.spotifyUrl || item.appleMusicUrl) && (
                <button
                  onClick={(e) => onPlayClick(e, item)}
                  className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  data-testid={`play-button-small-${item.id}`}
                >
                  <Play className="w-5 h-5 text-white" fill="currentColor" />
                </button>
              )}
            </div>

            {/* Track info */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate" data-testid={`music-title-${item.id}`}>
                {item.title}
              </p>
              <p className="text-sm text-gray-500 truncate">{item.artist}</p>
              <div className="flex items-center gap-2 mt-1">
                {item.spotifyUrl && (
                  <SiSpotify className="w-3.5 h-3.5 text-[#1DB954]" />
                )}
                {item.appleMusicUrl && (
                  <SiApplemusic className="w-3.5 h-3.5 text-gray-400" />
                )}
                <span className="text-xs text-gray-400 truncate flex items-center gap-1">
                  <Headphones className="w-3 h-3" />
                  {item.podcastTitle}
                </span>
              </div>
            </div>

            {/* Timestamp */}
            <div className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
              <Clock className="w-3 h-3" />
              {formatTime(item.startTime)}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
