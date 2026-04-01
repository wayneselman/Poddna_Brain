import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { 
  Youtube, 
  Video, 
  Clock, 
  Eye, 
  Loader2, 
  PlayCircle,
  Sparkles,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Unlink,
  Link2,
  ArrowRight
} from "lucide-react";

interface YouTubeChannel {
  id: string;
  title: string;
  thumbnailUrl: string;
}

interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  duration: string;
  durationSeconds: number;
  viewCount: number;
}

interface VideosResponse {
  videos: YouTubeVideo[];
  nextPageToken?: string;
  channel: YouTubeChannel;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatViewCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M views`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K views`;
  }
  return `${count} views`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

function ConnectYouTubeCard() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
      <Card className="max-w-lg w-full text-center">
        <CardHeader>
          <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4">
            <Youtube className="w-8 h-8 text-red-600" />
          </div>
          <CardTitle className="text-2xl">Connect Your YouTube</CardTitle>
          <CardDescription className="text-base mt-2">
            Sign in with your YouTube account to access your video library and start generating viral clips.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>With PodDNA, you can:</p>
            <ul className="text-left space-y-1 ml-4">
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Select any episode from your channel
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Get 8+ viral clips with AI-powered detection
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Professional TikTok-style captions included
              </li>
            </ul>
          </div>
          <Button 
            size="lg" 
            className="w-full bg-red-600 hover:bg-red-700"
            onClick={() => window.location.href = '/api/auth/google'}
            data-testid="button-connect-youtube"
          >
            <Youtube className="w-5 h-5 mr-2" />
            Connect YouTube Account
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function VideoCard({ video, onProcess }: { video: YouTubeVideo; onProcess: (videoId: string) => void }) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleProcess = () => {
    setIsProcessing(true);
    onProcess(video.id);
  };

  return (
    <Card className="overflow-hidden hover-elevate cursor-pointer group">
      <div className="relative aspect-video">
        <img 
          src={video.thumbnailUrl} 
          alt={video.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
          {formatDuration(video.durationSeconds)}
        </div>
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Button 
            onClick={handleProcess}
            disabled={isProcessing}
            className="bg-primary hover:bg-primary/90"
            data-testid={`button-process-${video.id}`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Clips
              </>
            )}
          </Button>
        </div>
      </div>
      <CardContent className="p-3">
        <h3 className="font-medium text-sm line-clamp-2 mb-2" title={video.title}>
          {video.title}
        </h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            {formatViewCount(video.viewCount)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(video.publishedAt)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function VideoLibrary({ channel, videos, isLoading, onLoadMore, hasMore, onProcess }: {
  channel: YouTubeChannel;
  videos: YouTubeVideo[];
  isLoading: boolean;
  onLoadMore: () => void;
  hasMore: boolean;
  onProcess: (videoId: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {channel.thumbnailUrl && (
            <img 
              src={channel.thumbnailUrl} 
              alt={channel.title}
              className="w-10 h-10 rounded-full"
            />
          )}
          <div>
            <h2 className="font-semibold">{channel.title}</h2>
            <p className="text-sm text-muted-foreground">{videos.length} videos loaded</p>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => window.location.href = '/api/auth/google/disconnect'}
          data-testid="button-disconnect-youtube"
        >
          <Unlink className="w-4 h-4 mr-2" />
          Disconnect
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {videos.map((video) => (
          <VideoCard 
            key={video.id} 
            video={video} 
            onProcess={onProcess}
          />
        ))}
        
        {isLoading && (
          <>
            {[...Array(4)].map((_, i) => (
              <Card key={`skeleton-${i}`} className="overflow-hidden">
                <Skeleton className="aspect-video" />
                <CardContent className="p-3 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>

      {hasMore && !isLoading && (
        <div className="flex justify-center">
          <Button 
            variant="outline" 
            onClick={onLoadMore}
            data-testid="button-load-more"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Load More Videos
          </Button>
        </div>
      )}
    </div>
  );
}

function NotConfiguredCard() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
      <Card className="max-w-lg w-full text-center">
        <CardHeader>
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-amber-600" />
          </div>
          <CardTitle className="text-2xl">YouTube Integration Not Configured</CardTitle>
          <CardDescription className="text-base mt-2">
            The YouTube API integration needs to be configured by the administrator.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Please contact support to enable YouTube integration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

interface VideoValidation {
  valid: boolean;
  error?: string;
  title?: string;
  durationSeconds?: number;
  thumbnail?: string;
  hasCaptions?: boolean;
  estimatedProcessingMinutes?: number;
  captionWarning?: string | null;
}

function PasteURLCard({ onProcess, isProcessing }: { onProcess: (videoId: string, url: string) => void; isProcessing: boolean }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [validation, setValidation] = useState<VideoValidation | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setValidation(null);
    
    const videoId = extractYouTubeVideoId(url.trim());
    if (!videoId) {
      setError("Please enter a valid YouTube URL");
      return;
    }
    
    setIsValidating(true);
    try {
      const response = await apiRequest('POST', '/api/clips/validate', { youtubeVideoId: videoId });
      const result: VideoValidation = await response.json();
      
      if (!result.valid) {
        setError(result.error || "This video cannot be processed");
        setIsValidating(false);
        return;
      }
      
      setValidation(result);
      setIsValidating(false);
      onProcess(videoId, url.trim());
    } catch (err: any) {
      setError("Could not validate this video. Please try again.");
      setIsValidating(false);
    }
  };

  const isDisabled = isProcessing || isValidating || !url.trim();

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
          <Link2 className="w-7 h-7 text-primary" />
        </div>
        <CardTitle className="text-xl">Process Any YouTube Video</CardTitle>
        <CardDescription>
          Paste a YouTube URL to generate viral clips with AI-powered moment detection
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError("");
                setValidation(null);
              }}
              className="flex-1"
              data-testid="input-youtube-url"
            />
            <Button 
              type="submit" 
              disabled={isDisabled}
              data-testid="button-process-url"
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Checking
                </>
              ) : isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Clips
                </>
              )}
            </Button>
          </div>
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20" data-testid="text-validation-error">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </form>
        
        <div className="mt-6 pt-4 border-t">
          <p className="text-sm text-muted-foreground text-center mb-3">What happens next:</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center text-sm">
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="font-medium mb-1">1. Transcript</div>
              <p className="text-muted-foreground text-xs">Extract video transcript</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="font-medium mb-1">2. AI Detection</div>
              <p className="text-muted-foreground text-xs">Find viral-worthy moments</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="font-medium mb-1">3. Results</div>
              <p className="text-muted-foreground text-xs">Review clips with scores</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Typically takes 2-5 minutes depending on video length
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AppPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [allVideos, setAllVideos] = useState<YouTubeVideo[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [isProcessingUrl, setIsProcessingUrl] = useState(false);

  const { data: configData } = useQuery<{ configured: boolean }>({
    queryKey: ['/api/auth/google/configured'],
  });

  const { data: videosData, isLoading: videosLoading, error: videosError } = useQuery<VideosResponse>({
    queryKey: ['/api/youtube/videos'],
    enabled: !!user && configData?.configured === true,
    retry: false,
  });

  const loadMoreMutation = useMutation({
    mutationFn: async (pageToken: string) => {
      const response = await fetch(`/api/youtube/videos?pageToken=${pageToken}`);
      if (!response.ok) throw new Error('Failed to load more videos');
      return response.json() as Promise<VideosResponse>;
    },
    onSuccess: (data) => {
      setAllVideos(prev => [...prev, ...data.videos]);
      setNextPageToken(data.nextPageToken);
    },
  });

  const processVideoMutation = useMutation({
    mutationFn: async ({ videoId, url }: { videoId: string; url: string }) => {
      const response = await fetch('/api/clips/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ youtubeVideoId: videoId, youtubeUrl: url }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409 && data.error === "duplicate") {
          return { duplicate: true, ...data };
        }
        throw new Error(data.message || data.error || "Failed to start processing");
      }
      return data;
    },
    onSuccess: (data: any) => {
      if (data.duplicate) {
        if (data.existingStatus === "complete") {
          toast({
            title: "Already Processed",
            description: "You've already generated clips for this video. Redirecting to your results.",
          });
          setLocation(`/clips/${data.existingRequestId}`);
        } else {
          toast({
            title: "Already In Progress",
            description: "This video is already being processed. Redirecting to My Clips.",
          });
          setLocation('/my-clips');
        }
      } else {
        toast({
          title: "Processing Started",
          description: "Your video is being analyzed for viral moments. Check My Clips for progress.",
        });
        setLocation('/my-clips');
      }
      setIsProcessingUrl(false);
    },
    onError: (error: any) => {
      toast({
        title: "Processing Failed",
        description: error.message || "Failed to start processing. Please try again.",
        variant: "destructive",
      });
      setIsProcessingUrl(false);
    },
  });

  useEffect(() => {
    if (videosData?.videos) {
      setAllVideos(videosData.videos);
      setNextPageToken(videosData.nextPageToken);
    }
  }, [videosData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('youtube') === 'connected') {
      toast({
        title: "YouTube Connected",
        description: "Your YouTube account has been successfully connected.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/youtube/videos'] });
      window.history.replaceState({}, '', '/app');
    }
    if (params.get('error')) {
      toast({
        title: "Connection Failed",
        description: params.get('error') === 'token_exchange_failed' 
          ? "Failed to exchange tokens. Please try again."
          : "Failed to connect YouTube. Please try again.",
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/app');
    }
  }, [toast]);

  const handleProcess = async (videoId: string) => {
    processVideoMutation.mutate({ videoId, url: `https://youtube.com/watch?v=${videoId}` });
  };

  const handleProcessUrl = async (videoId: string, url: string) => {
    setIsProcessingUrl(true);
    processVideoMutation.mutate({ videoId, url });
  };

  if (authLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!user) {
    setLocation('/login');
    return null;
  }

  if (configData && !configData.configured) {
    return (
      <div className="container mx-auto p-6">
        <NotConfiguredCard />
      </div>
    );
  }

  const needsConnect = videosError && (videosError as any)?.needsConnect;
  const displayVideos = allVideos.length > 0 ? allVideos : (videosData?.videos || []);
  const hasVideos = displayVideos.length > 0;

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Generate Clips</h1>
        <p className="text-muted-foreground">
          Paste any YouTube URL to generate viral clips with AI-powered moment detection.
        </p>
      </div>

      <div className="space-y-8">
        <PasteURLCard 
          onProcess={handleProcessUrl} 
          isProcessing={isProcessingUrl || processVideoMutation.isPending} 
        />

        {videosData && hasVideos && (
          <div className="mt-12">
            <h2 className="text-xl font-semibold mb-4">Or select from your library</h2>
            <VideoLibrary
              channel={videosData.channel}
              videos={displayVideos}
              isLoading={videosLoading || loadMoreMutation.isPending}
              hasMore={!!nextPageToken}
              onLoadMore={() => nextPageToken && loadMoreMutation.mutate(nextPageToken)}
              onProcess={handleProcess}
            />
          </div>
        )}

        {videosData && !hasVideos && (
          <div className="text-center text-muted-foreground mt-8">
            <p className="flex items-center justify-center gap-2">
              <Youtube className="w-5 h-5" />
              Connected as {videosData.channel.title}
              <Button 
                variant="ghost" 
                size="sm" 
                className="p-0 h-auto text-primary"
                onClick={() => window.location.href = '/api/auth/google/disconnect'}
              >
                (Disconnect)
              </Button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
