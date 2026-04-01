import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Music, Play } from "lucide-react";
import { SiSpotify, SiApplemusic } from "react-icons/si";
import type { MusicDetection } from "@shared/schema";
import poddnaLogoFallback from "@assets/poddna-logo-fallback.png";
import InlineMusicPlayer from "./inline-music-player";

interface MusicWidgetProps {
  musicDetections: MusicDetection[];
  onSeek?: (time: number) => void;
}

export default function MusicWidget({ musicDetections, onSeek }: MusicWidgetProps) {
  const [activeMusic, setActiveMusic] = useState<MusicDetection | null>(null);

  if (musicDetections.length === 0) {
    return null;
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handlePlayClick = (e: React.MouseEvent, music: MusicDetection) => {
    e.stopPropagation();
    setActiveMusic(music);
  };

  return (
    <>
      <Card data-testid="widget-music">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Music className="w-5 h-5 text-primary" />
            Music in This Episode
            <Badge variant="secondary" className="ml-auto">
              {musicDetections.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {musicDetections.map((music) => (
            <div
              key={music.id}
              className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover-elevate cursor-pointer group"
              onClick={() => onSeek?.(music.startTime)}
              data-testid={`music-widget-item-${music.id}`}
            >
              <div className="relative">
                <img
                  src={music.artworkUrl || poddnaLogoFallback}
                  alt={`${music.title} artwork`}
                  className="w-12 h-12 rounded-md object-cover shadow-sm bg-muted"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (target.src !== poddnaLogoFallback) {
                      target.src = poddnaLogoFallback;
                    }
                  }}
                />
                {(music.spotifyUrl || music.appleMusicUrl) && (
                  <button
                    onClick={(e) => handlePlayClick(e, music)}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-md"
                    data-testid={`play-music-${music.id}`}
                  >
                    <Play className="w-5 h-5 text-white fill-white" />
                  </button>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                  {music.title}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {music.artist}
                </p>
                {music.album && (
                  <p className="text-xs text-muted-foreground/70 truncate">
                    {music.album}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge variant="outline" className="text-xs font-mono">
                  {formatTime(music.startTime)}
                </Badge>
                <div className="flex gap-1">
                  {music.spotifyUrl && (
                    <a
                      href={music.spotifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 hover:bg-background rounded transition-colors"
                      data-testid={`spotify-widget-link-${music.id}`}
                    >
                      <SiSpotify className="w-4 h-4 text-[#1DB954]" />
                    </a>
                  )}
                  {music.appleMusicUrl && (
                    <a
                      href={music.appleMusicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 hover:bg-background rounded transition-colors"
                      data-testid={`apple-music-widget-link-${music.id}`}
                    >
                      <SiApplemusic className="w-4 h-4 text-[#FC3C44]" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {activeMusic && (
        <InlineMusicPlayer
          music={activeMusic}
          onClose={() => setActiveMusic(null)}
        />
      )}
    </>
  );
}
