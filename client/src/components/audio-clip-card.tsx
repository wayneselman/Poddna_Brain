import { useRef, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Share2, Link2, MessageCircle } from "lucide-react";
import type { ClipWithAuthor, Podcast } from "@shared/schema";

interface AudioClipCardProps {
  clip: ClipWithAuthor;
  podcast?: Podcast;
  mediaUrl: string;
  episodeTitle?: string;
  onShare?: () => void;
  compact?: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AudioClipCard({ 
  clip, 
  podcast, 
  mediaUrl, 
  episodeTitle,
  onShare,
  compact = false 
}: AudioClipCardProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const progressIntervalRef = useRef<number | null>(null);
  
  const clipDuration = clip.endTime - clip.startTime;

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const startPlayback = (audio: HTMLAudioElement) => {
    setIsPlaying(true);
    
    progressIntervalRef.current = window.setInterval(() => {
      if (audio) {
        const elapsed = audio.currentTime - clip.startTime;
        const prog = Math.min(Math.max(elapsed / clipDuration, 0), 1);
        setProgress(prog);
        setCurrentTime(Math.max(0, elapsed));
        
        if (audio.currentTime >= clip.endTime) {
          audio.pause();
          setIsPlaying(false);
          setProgress(0);
          setCurrentTime(0);
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
        }
      }
    }, 100);
  };

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setIsPlaying(false);
    } else {
      const seekAndPlay = () => {
        audio.currentTime = clip.startTime;
        audio.play().then(() => startPlayback(audio)).catch(console.error);
      };

      if (audio.readyState >= 1) {
        seekAndPlay();
      } else {
        const handleCanPlay = () => {
          audio.removeEventListener("canplay", handleCanPlay);
          seekAndPlay();
        };
        audio.addEventListener("canplay", handleCanPlay);
        audio.load();
      }
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const waveformBars = 30;
  const barHeights = Array.from({ length: waveformBars }, (_, i) => {
    const baseHeight = 0.3 + Math.sin(i * 0.5) * 0.3 + Math.random() * 0.4;
    return Math.min(1, Math.max(0.2, baseHeight));
  });

  if (compact) {
    return (
      <Card 
        className="bg-zinc-900 border-zinc-800 p-4 cursor-pointer hover-elevate"
        onClick={handlePlayPause}
        data-testid={`clip-card-${clip.id}`}
      >
        <audio ref={audioRef} src={mediaUrl} onEnded={handleAudioEnded} preload="metadata" />
        
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            className="text-white h-10 w-10 rounded-full bg-zinc-800"
            onClick={(e) => { e.stopPropagation(); handlePlayPause(); }}
            data-testid={`button-play-clip-${clip.id}`}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </Button>
          
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium line-clamp-1">{clip.title}</p>
            <p className="text-zinc-400 text-xs">{formatTime(clip.startTime)} - {formatTime(clipDuration)} clip</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card 
      className="bg-zinc-950 border-zinc-800 overflow-hidden"
      data-testid={`clip-card-${clip.id}`}
    >
      <audio ref={audioRef} src={mediaUrl} onEnded={handleAudioEnded} preload="metadata" />
      
      <div 
        className="relative min-h-[400px] flex flex-col justify-between p-6"
        style={{
          backgroundImage: podcast?.artworkUrl 
            ? `linear-gradient(to bottom, rgba(0,0,0,0.85), rgba(0,0,0,0.95)), url(${podcast.artworkUrl})`
            : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white text-2xl md:text-3xl font-bold text-center leading-relaxed max-w-md">
            "{clip.transcriptText || clip.title}"
          </p>
        </div>

        <div className="space-y-4">
          <div 
            className="flex items-center justify-center gap-0.5 h-12 cursor-pointer"
            onClick={handlePlayPause}
          >
            {barHeights.map((height, i) => {
              const isBeforeProgress = i / waveformBars <= progress;
              return (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-100 ${
                    isBeforeProgress ? 'bg-white' : 'bg-zinc-600'
                  }`}
                  style={{ 
                    height: `${height * 100}%`,
                    opacity: isPlaying ? 0.8 + Math.random() * 0.2 : 0.6
                  }}
                />
              );
            })}
            
            <div 
              className="absolute w-3 h-3 bg-white rounded-full shadow-lg"
              style={{ left: `calc(${progress * 100}% - 6px)` }}
            />
          </div>

          <div className="flex items-center justify-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="text-white h-12 w-12 rounded-full bg-zinc-800/80 hover:bg-zinc-700"
              onClick={handlePlayPause}
              data-testid={`button-play-clip-${clip.id}`}
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
            </Button>
          </div>

          {clip.annotationId && (
            <div className="flex justify-center">
              <Badge 
                variant="secondary" 
                className="bg-zinc-100 text-zinc-900 px-4 py-2 text-sm font-medium rounded-full"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                {clip.title}
              </Badge>
            </div>
          )}

          <div className="text-center space-y-2">
            <p className="text-zinc-400 text-sm">
              {formatTime(clip.startTime)} 
              {episodeTitle && (
                <span> &middot; {episodeTitle}</span>
              )}
            </p>
            
            {podcast && (
              <p className="text-zinc-500 text-xs">{podcast.title}</p>
            )}
          </div>

          <div className="flex justify-center gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              className="bg-zinc-800/50 border-zinc-700 text-white hover:bg-zinc-700"
              onClick={onShare}
              data-testid={`button-share-clip-${clip.id}`}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="bg-zinc-800/50 border-zinc-700 text-white hover:bg-zinc-700"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/clip/${clip.id}`);
              }}
              data-testid={`button-copy-link-clip-${clip.id}`}
            >
              <Link2 className="w-4 h-4 mr-2" />
              Copy Link
            </Button>
          </div>

          <div className="text-center pt-4 border-t border-zinc-800">
            <p className="text-zinc-600 text-xs uppercase tracking-wider">Created on</p>
            <p className="text-primary font-bold text-lg">PODDNA</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
