import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Minus, Plus, Save, Volume2, Video } from "lucide-react";
import type { EpisodeSource, TranscriptSegment } from "@shared/schema";

interface OffsetCalibratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: EpisodeSource;
  audioSource: EpisodeSource | null;
  episodeId: string;
  onSave: (offset: number) => void;
  isSaving: boolean;
}

let youtubeAPILoaded = false;
let youtubeAPICallbacks: (() => void)[] = [];

interface YouTubePlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
}

function loadYouTubeAPI(callback: () => void) {
  if (youtubeAPILoaded && window.YT) {
    callback();
    return;
  }
  youtubeAPICallbacks.push(callback);
  if (document.getElementById("youtube-iframe-api")) return;

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

function extractYouTubeVideoId(url: string | null): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
    /youtube\.com\/v\/([^&\s?]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function OffsetCalibrator({
  open,
  onOpenChange,
  source,
  audioSource,
  episodeId,
  onSave,
  isSaving,
}: OffsetCalibratorProps) {
  const [offset, setOffset] = useState(source.alignmentOffsetSeconds);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>("");
  const [youtubeReady, setYoutubeReady] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const youtubePlayerRef = useRef<YouTubePlayerInstance | null>(null);
  
  const { data: segments = [] } = useQuery<TranscriptSegment[]>({
    queryKey: ["/api/episodes", episodeId, "segments"],
    enabled: open,
  });

  const videoUrl = source.sourceUrl || source.storageUrl;
  const audioUrl = audioSource?.sourceUrl || audioSource?.storageUrl;
  const youtubeVideoId = extractYouTubeVideoId(videoUrl || null);
  const isYouTube = !!youtubeVideoId;
  const youtubeContainerId = `calibrator-youtube-${source.id}`;

  // Reset offset when source changes
  useEffect(() => {
    setOffset(source.alignmentOffsetSeconds);
  }, [source.alignmentOffsetSeconds, open]);

  // Initialize YouTube player
  useEffect(() => {
    if (!open || !isYouTube || !youtubeVideoId) return;

    loadYouTubeAPI(() => {
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.destroy();
        youtubePlayerRef.current = null;
      }
      setYoutubeReady(false);

      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const container = document.getElementById(youtubeContainerId);
        if (!container) return;

        new window.YT.Player(youtubeContainerId, {
          videoId: youtubeVideoId,
          playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            fs: 0,
            origin: typeof window !== "undefined" ? window.location.origin : "",
          },
          events: {
            onReady: (event: { target: YouTubePlayerInstance }) => {
              youtubePlayerRef.current = event.target;
              setYoutubeReady(true);
              event.target.setVolume(50);
            },
          },
        });
      }, 100);
    });

    return () => {
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.destroy();
        youtubePlayerRef.current = null;
      }
    };
  }, [open, isYouTube, youtubeVideoId, youtubeContainerId]);

  const selectedSegment = segments.find((s) => s.id === selectedSegmentId);

  const playAudioAtSegment = useCallback(() => {
    if (!selectedSegment || !audioRef.current) return;
    const startTime = selectedSegment.startTime;
    audioRef.current.currentTime = startTime;
    audioRef.current.play();
  }, [selectedSegment]);

  const playVideoAtSegment = useCallback(() => {
    if (!selectedSegment) return;
    // Apply offset: video time = audio time - offset
    const videoTime = selectedSegment.startTime - offset;
    const seekTime = Math.max(0, videoTime);

    if (isYouTube && youtubePlayerRef.current && youtubeReady) {
      youtubePlayerRef.current.seekTo(seekTime, true);
      youtubePlayerRef.current.playVideo();
    } else if (videoRef.current) {
      videoRef.current.currentTime = seekTime;
      videoRef.current.play();
    }
  }, [selectedSegment, offset, isYouTube, youtubeReady]);

  const nudgeOffset = (delta: number) => {
    setOffset((prev) => Math.round((prev + delta) * 10) / 10);
  };

  const handleSave = () => {
    onSave(offset);
  };

  // Filter to meaningful segments (longer text, speaker labels)
  const calibrationSegments = segments
    .filter((s) => s.text.length > 20)
    .slice(0, 50);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Calibrate Offset</DialogTitle>
          <DialogDescription>
            Align this video source with the canonical audio by comparing playback at the same transcript moment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current offset display */}
          <div className="flex items-center justify-center gap-4 p-4 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">Current Offset:</span>
            <Badge variant="outline" className="text-lg px-4 py-1">
              {offset > 0 ? "+" : ""}{offset}s
            </Badge>
            <span className="text-xs text-muted-foreground">
              {offset > 0
                ? "(Video starts after audio)"
                : offset < 0
                ? "(Video starts before audio)"
                : "(No offset)"}
            </span>
          </div>

          {/* Segment picker */}
          <div className="space-y-2">
            <Label>Select a transcript moment to compare</Label>
            <Select value={selectedSegmentId} onValueChange={setSelectedSegmentId}>
              <SelectTrigger data-testid="select-calibration-segment">
                <SelectValue placeholder="Choose a memorable line..." />
              </SelectTrigger>
              <SelectContent>
                {calibrationSegments.map((segment) => (
                  <SelectItem key={segment.id} value={segment.id}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatTime(segment.startTime)}
                      </span>
                      <span className="truncate max-w-[400px]">
                        {segment.speaker && (
                          <span className="font-medium">{segment.speaker}: </span>
                        )}
                        {segment.text.slice(0, 80)}...
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selected segment preview */}
          {selectedSegment && (
            <div className="p-3 bg-muted/50 rounded-lg border">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary" className="text-xs">
                  {formatTime(selectedSegment.startTime)}
                </Badge>
                {selectedSegment.speaker && (
                  <span className="text-sm font-medium">{selectedSegment.speaker}</span>
                )}
              </div>
              <p className="text-sm">{selectedSegment.text}</p>
            </div>
          )}

          {/* Players side by side */}
          <div className="grid grid-cols-2 gap-4">
            {/* Audio player */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4" />
                <Label>Reference Audio</Label>
              </div>
              <div className="bg-black rounded-lg p-4 aspect-video flex items-center justify-center">
                {audioUrl ? (
                  <audio
                    ref={audioRef}
                    src={audioUrl}
                    controls
                    className="w-full"
                    data-testid="calibrator-audio"
                  />
                ) : (
                  <p className="text-white/50 text-sm">No audio source available</p>
                )}
              </div>
              <Button
                onClick={playAudioAtSegment}
                disabled={!selectedSegment || !audioUrl}
                className="w-full"
                variant="outline"
                data-testid="button-play-audio-segment"
              >
                <Play className="w-4 h-4 mr-2" />
                Play Audio at {selectedSegment ? formatTime(selectedSegment.startTime) : "--:--"}
              </Button>
            </div>

            {/* Video player */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4" />
                <Label>Video Source</Label>
                {isYouTube && <Badge variant="outline" className="text-xs">YouTube</Badge>}
              </div>
              <div className="bg-black rounded-lg aspect-video overflow-hidden">
                {isYouTube ? (
                  <div id={youtubeContainerId} className="w-full h-full" data-testid="calibrator-youtube" />
                ) : videoUrl ? (
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="w-full h-full"
                    controls
                    playsInline
                    data-testid="calibrator-video"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <p className="text-white/50 text-sm">No video source available</p>
                  </div>
                )}
              </div>
              <Button
                onClick={playVideoAtSegment}
                disabled={!selectedSegment || (!isYouTube && !videoUrl) || (isYouTube && !youtubeReady)}
                className="w-full"
                variant="outline"
                data-testid="button-play-video-segment"
              >
                <Play className="w-4 h-4 mr-2" />
                Play Video at {selectedSegment ? formatTime(Math.max(0, selectedSegment.startTime - offset)) : "--:--"}
              </Button>
            </div>
          </div>

          {/* Offset nudge controls */}
          <div className="space-y-3">
            <Label>Adjust Offset</Label>
            <p className="text-xs text-muted-foreground">
              If video plays the same moment earlier than audio, decrease offset. If video plays later, increase offset.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => nudgeOffset(-5)}
                data-testid="button-nudge-minus-5"
              >
                <Minus className="w-3 h-3 mr-1" />
                5s
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => nudgeOffset(-1)}
                data-testid="button-nudge-minus-1"
              >
                <Minus className="w-3 h-3 mr-1" />
                1s
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => nudgeOffset(-0.5)}
                data-testid="button-nudge-minus-half"
              >
                <Minus className="w-3 h-3 mr-1" />
                0.5s
              </Button>
              <div className="px-4 py-2 bg-muted rounded font-mono min-w-[80px] text-center">
                {offset > 0 ? "+" : ""}{offset}s
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => nudgeOffset(0.5)}
                data-testid="button-nudge-plus-half"
              >
                <Plus className="w-3 h-3 mr-1" />
                0.5s
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => nudgeOffset(1)}
                data-testid="button-nudge-plus-1"
              >
                <Plus className="w-3 h-3 mr-1" />
                1s
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => nudgeOffset(5)}
                data-testid="button-nudge-plus-5"
              >
                <Plus className="w-3 h-3 mr-1" />
                5s
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || offset === source.alignmentOffsetSeconds}
            data-testid="button-save-offset"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Offset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
