import { useRef, useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, VolumeX, Maximize2, ExternalLink } from "lucide-react";
import { SiYoutube, SiSpotify, SiApplepodcasts } from "react-icons/si";
import PodcastArtwork from "@/components/podcast-artwork";
import type { Episode, Podcast } from "@shared/schema";

declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        config: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: { target: YouTubePlayer }) => void;
            onStateChange?: (event: { data: number; target: YouTubePlayer }) => void;
          };
        }
      ) => YouTubePlayer;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YouTubePlayer {
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
}

interface EpisodePlayerProps {
  episode: Episode;
  podcast?: Podcast;
  onTimeUpdate: (time: number) => void;
  currentTime: number;
  seekTo?: number;
}

function getYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\s?]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

let youtubeAPILoaded = false;
let youtubeAPICallbacks: (() => void)[] = [];

function loadYouTubeAPI(callback: () => void) {
  if (youtubeAPILoaded && window.YT) {
    callback();
    return;
  }
  
  youtubeAPICallbacks.push(callback);
  
  if (document.getElementById("youtube-iframe-api")) {
    return;
  }
  
  const tag = document.createElement("script");
  tag.id = "youtube-iframe-api";
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScriptTag = document.getElementsByTagName("script")[0];
  firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
  
  window.onYouTubeIframeAPIReady = () => {
    youtubeAPILoaded = true;
    youtubeAPICallbacks.forEach((cb) => cb());
    youtubeAPICallbacks = [];
  };
}

export default function EpisodePlayer({ episode, podcast, onTimeUpdate, currentTime, seekTo }: EpisodePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const youtubeContainerId = `youtube-player-${episode.id}`;
  const timeUpdateIntervalRef = useRef<number | null>(null);
  const lastSeekRef = useRef<number | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(episode.duration);
  const [localTime, setLocalTime] = useState(0);
  const [youtubeReady, setYoutubeReady] = useState(false);

  const youtubeVideoId = getYouTubeVideoId(episode.videoUrl || "") || getYouTubeVideoId(episode.mediaUrl);
  const isYouTubeVideo = youtubeVideoId !== null;
  const isDirectVideo = episode.type === "video" && !youtubeVideoId;
  const isAudio = episode.type !== "video" && !youtubeVideoId;

  const mediaRef = episode.type === "video" ? videoRef : audioRef;

  const startTimeTracking = useCallback(() => {
    if (timeUpdateIntervalRef.current) return;
    
    timeUpdateIntervalRef.current = window.setInterval(() => {
      if (youtubePlayerRef.current) {
        const time = youtubePlayerRef.current.getCurrentTime();
        setLocalTime(time);
        onTimeUpdate(time);
      }
    }, 250);
  }, [onTimeUpdate]);

  const stopTimeTracking = useCallback(() => {
    if (timeUpdateIntervalRef.current) {
      clearInterval(timeUpdateIntervalRef.current);
      timeUpdateIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isYouTubeVideo || !youtubeVideoId) return;

    loadYouTubeAPI(() => {
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.destroy();
        youtubePlayerRef.current = null;
      }
      setYoutubeReady(false);

      new window.YT.Player(youtubeContainerId, {
        videoId: youtubeVideoId,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          fs: 1,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
        },
        events: {
          onReady: (event) => {
            youtubePlayerRef.current = event.target;
            setYoutubeReady(true);
            setDuration(event.target.getDuration());
          },
          onStateChange: (event) => {
            const state = event.data;
            if (state === window.YT.PlayerState.PLAYING || state === window.YT.PlayerState.BUFFERING) {
              setIsPlaying(true);
              startTimeTracking();
            } else {
              setIsPlaying(false);
              stopTimeTracking();
            }
          },
        },
      });
    });

    return () => {
      stopTimeTracking();
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.destroy();
        youtubePlayerRef.current = null;
      }
    };
  }, [youtubeVideoId, isYouTubeVideo, youtubeContainerId, startTimeTracking, stopTimeTracking]);

  useEffect(() => {
    if (seekTo === undefined) return;
    if (seekTo === lastSeekRef.current) return;
    
    if (isYouTubeVideo) {
      const player = youtubePlayerRef.current;
      if (player && youtubeReady && typeof player.seekTo === "function") {
        player.seekTo(seekTo, true);
        setLocalTime(seekTo);
        onTimeUpdate(seekTo);
        lastSeekRef.current = seekTo;
      }
    } else if (mediaRef.current) {
      mediaRef.current.currentTime = seekTo;
      setLocalTime(seekTo);
      onTimeUpdate(seekTo);
      lastSeekRef.current = seekTo;
    }
  }, [seekTo, isYouTubeVideo, youtubeReady, mediaRef, onTimeUpdate]);

  useEffect(() => {
    if (!isYouTubeVideo && mediaRef.current && Math.abs(mediaRef.current.currentTime - currentTime) > 1) {
      mediaRef.current.currentTime = currentTime;
    }
  }, [currentTime, isYouTubeVideo, mediaRef]);

  const handlePlayPause = () => {
    if (isYouTubeVideo && youtubePlayerRef.current && youtubeReady && typeof youtubePlayerRef.current.playVideo === "function") {
      if (isPlaying) {
        youtubePlayerRef.current.pauseVideo();
      } else {
        youtubePlayerRef.current.playVideo();
      }
    } else if (!isYouTubeVideo && mediaRef.current) {
      if (isPlaying) {
        mediaRef.current.pause();
      } else {
        mediaRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (mediaRef.current) {
      const time = mediaRef.current.currentTime;
      setLocalTime(time);
      onTimeUpdate(time);
    }
  };

  const handleSeek = (value: number[]) => {
    const time = value[0];
    if (isYouTubeVideo && youtubePlayerRef.current && youtubeReady && typeof youtubePlayerRef.current.seekTo === "function") {
      youtubePlayerRef.current.seekTo(time, true);
      setLocalTime(time);
      onTimeUpdate(time);
    } else if (!isYouTubeVideo && mediaRef.current) {
      mediaRef.current.currentTime = time;
      setLocalTime(time);
      onTimeUpdate(time);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const vol = value[0];
    setVolume(vol);
    setIsMuted(vol === 0);
    
    if (isYouTubeVideo && youtubePlayerRef.current && youtubeReady && typeof youtubePlayerRef.current.setVolume === "function") {
      youtubePlayerRef.current.setVolume(vol * 100);
      if (vol === 0) {
        youtubePlayerRef.current.mute();
      } else {
        youtubePlayerRef.current.unMute();
      }
    } else if (!isYouTubeVideo && mediaRef.current) {
      mediaRef.current.volume = vol;
    }
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    
    if (isYouTubeVideo && youtubePlayerRef.current && youtubeReady && typeof youtubePlayerRef.current.mute === "function") {
      if (newMuted) {
        youtubePlayerRef.current.mute();
      } else {
        youtubePlayerRef.current.unMute();
      }
    } else if (!isYouTubeVideo && mediaRef.current) {
      mediaRef.current.muted = newMuted;
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0 
      ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      : `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <Card data-testid="card-player">
      <CardHeader className="pb-4">
        <div className="flex items-start gap-4 flex-wrap">
          {podcast?.artworkUrl && (
            <PodcastArtwork
              src={podcast.artworkUrl}
              alt={podcast.title}
              size="xl"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-2xl mb-1" data-testid="text-episode-title">
                  {episode.title}
                </CardTitle>
                {podcast && (
                  <p className="text-sm font-medium text-primary mb-2">
                    {podcast.title}
                  </p>
                )}
              </div>
              {episode.episodeNumber && (
                <span className="text-sm font-mono text-muted-foreground px-3 py-1 bg-muted rounded-md">
                  Episode #{episode.episodeNumber}
                </span>
              )}
            </div>
            {episode.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {episode.description}
              </p>
            )}
            
            {/* Multi-source listening options */}
            {(youtubeVideoId || episode.spotifyUrl || episode.applePodcastsUrl) && (
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="text-xs text-muted-foreground self-center mr-1">Listen on:</span>
                {youtubeVideoId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => window.open(`https://youtube.com/watch?v=${youtubeVideoId}`, "_blank")}
                    data-testid="button-youtube-link"
                  >
                    <SiYoutube className="w-4 h-4 text-red-600" />
                    YouTube
                  </Button>
                )}
                {episode.spotifyUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => window.open(episode.spotifyUrl!, "_blank")}
                    data-testid="button-spotify-link"
                  >
                    <SiSpotify className="w-4 h-4 text-green-500" />
                    Spotify
                  </Button>
                )}
                {episode.applePodcastsUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => window.open(episode.applePodcastsUrl!, "_blank")}
                    data-testid="button-apple-podcasts-link"
                  >
                    <SiApplepodcasts className="w-4 h-4 text-purple-600" />
                    Apple Podcasts
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-6">
        {isYouTubeVideo ? (
          <div className="aspect-video bg-black rounded-md mb-4 overflow-hidden">
            <div id={youtubeContainerId} className="w-full h-full" data-testid="youtube-player" />
          </div>
        ) : isDirectVideo ? (
          <div className="aspect-video bg-black rounded-md mb-4 overflow-hidden">
            <video
              ref={videoRef}
              src={episode.mediaUrl}
              className="w-full h-full"
              crossOrigin="anonymous"
              playsInline
              preload="metadata"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onError={(e) => console.error("Video error:", e.currentTarget.error)}
              data-testid="video-player"
            >
              <source src={episode.mediaUrl} type="video/mp4" />
            </video>
          </div>
        ) : (
          <div className="h-24 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 rounded-md mb-4 flex items-center justify-center relative overflow-hidden">
            <audio
              ref={audioRef}
              src={episode.mediaUrl}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              data-testid="audio-player"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex gap-1 items-end h-12">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-primary/30 rounded-full transition-all duration-100"
                    style={{
                      height: `${Math.random() * 100}%`,
                      opacity: isPlaying ? 0.6 + Math.random() * 0.4 : 0.3,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono text-muted-foreground w-16 text-right">
              {formatTime(localTime)}
            </span>
            <Slider
              value={[localTime]}
              min={0}
              max={duration}
              step={0.1}
              onValueChange={handleSeek}
              className="flex-1"
              data-testid="slider-seek"
            />
            <span className="text-sm font-mono text-muted-foreground w-16">
              {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="default"
                onClick={handlePlayPause}
                data-testid="button-play-pause"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={toggleMute}
                  data-testid="button-mute"
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={handleVolumeChange}
                  className="w-24"
                  data-testid="slider-volume"
                />
              </div>
            </div>

            {isDirectVideo && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => videoRef.current?.requestFullscreen()}
                data-testid="button-fullscreen"
              >
                <Maximize2 className="w-4 h-4 mr-2" />
                Fullscreen
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
