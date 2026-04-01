import { useState } from "react";
import { X, Play, ExternalLink } from "lucide-react";
import { SiSpotify, SiApplemusic } from "react-icons/si";
import { Button } from "@/components/ui/button";
import type { MusicDetection } from "@shared/schema";
import poddnaLogoFallback from "@assets/poddna-logo-fallback.png";

interface InlineMusicPlayerProps {
  music: MusicDetection;
  onClose: () => void;
}

function extractSpotifyTrackId(url: string): string | null {
  const match = url.match(/track\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function extractAppleMusicId(url: string): { storefront: string; id: string } | null {
  const match = url.match(/\/([a-z]{2})\/album\/[^/]+\/(\d+)\?i=(\d+)/);
  if (match) {
    return { storefront: match[1], id: match[3] };
  }
  const albumMatch = url.match(/\/([a-z]{2})\/album\/[^/]+\/(\d+)/);
  if (albumMatch) {
    return { storefront: albumMatch[1], id: albumMatch[2] };
  }
  return null;
}

export default function InlineMusicPlayer({ music, onClose }: InlineMusicPlayerProps) {
  const [embedType, setEmbedType] = useState<"spotify" | "apple" | null>(null);
  
  const spotifyTrackId = music.spotifyUrl ? extractSpotifyTrackId(music.spotifyUrl) : null;
  const appleMusicInfo = music.appleMusicUrl ? extractAppleMusicId(music.appleMusicUrl) : null;
  
  const hasSpotifyEmbed = !!spotifyTrackId;
  const hasAppleMusicEmbed = !!appleMusicInfo;

  return (
    <div 
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-card border rounded-xl shadow-2xl overflow-hidden z-50 animate-in slide-in-from-bottom-4 duration-300"
      data-testid="inline-music-player"
    >
      <div className="flex items-center gap-3 p-3 bg-muted/30">
        <img
          src={music.artworkUrl || poddnaLogoFallback}
          alt={`${music.title} artwork`}
          className="w-14 h-14 rounded-lg object-cover shadow-md bg-muted"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (target.src !== poddnaLogoFallback) {
              target.src = poddnaLogoFallback;
            }
          }}
        />
        
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{music.title}</p>
          <p className="text-xs text-muted-foreground truncate">{music.artist}</p>
          {music.album && (
            <p className="text-xs text-muted-foreground/70 truncate">{music.album}</p>
          )}
        </div>

        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          className="shrink-0"
          data-testid="close-inline-player"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {embedType === null && (
        <div className="p-3 flex items-center justify-center gap-3 border-t bg-background/50">
          <p className="text-xs text-muted-foreground">Listen on:</p>
          
          {hasSpotifyEmbed && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEmbedType("spotify")}
              className="gap-2"
              data-testid="play-spotify-embed"
            >
              <SiSpotify className="w-4 h-4 text-[#1DB954]" />
              Spotify
            </Button>
          )}
          
          {hasAppleMusicEmbed && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEmbedType("apple")}
              className="gap-2"
              data-testid="play-apple-embed"
            >
              <SiApplemusic className="w-4 h-4 text-[#FC3C44]" />
              Apple Music
            </Button>
          )}
          
          {!hasSpotifyEmbed && !hasAppleMusicEmbed && (
            <div className="flex gap-2">
              {music.spotifyUrl && (
                <a
                  href={music.spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-[#1DB954] hover:underline"
                >
                  <SiSpotify className="w-4 h-4" />
                  Spotify
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {music.appleMusicUrl && (
                <a
                  href={music.appleMusicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-[#FC3C44] hover:underline"
                >
                  <SiApplemusic className="w-4 h-4" />
                  Apple
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {embedType === "spotify" && spotifyTrackId && (
        <div className="border-t">
          <iframe
            src={`https://open.spotify.com/embed/track/${spotifyTrackId}?utm_source=generator&theme=0`}
            width="100%"
            height="152"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            className="rounded-b-xl"
            title={`Spotify player for ${music.title}`}
          />
        </div>
      )}

      {embedType === "apple" && appleMusicInfo && (
        <div className="border-t">
          <iframe
            allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"
            frameBorder="0"
            height="175"
            width="100%"
            sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
            src={`https://embed.music.apple.com/${appleMusicInfo.storefront}/song/${appleMusicInfo.id}`}
            className="rounded-b-xl bg-black/5"
            title={`Apple Music player for ${music.title}`}
          />
        </div>
      )}
    </div>
  );
}
