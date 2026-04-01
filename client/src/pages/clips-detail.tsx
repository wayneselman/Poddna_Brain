import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Loader2, 
  ArrowLeft,
  Play,
  Clock,
  Zap,
  Copy,
  ExternalLink,
  Sparkles,
  TrendingUp,
  Video,
  CheckCircle,
  ShoppingCart,
  Mail
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ViralMoment {
  id: string;
  suggestedTitle: string;
  viralityScore: number;
  startTime: number;
  endTime: number;
  text: string;
  pullQuote: string | null;
  hookType: string | null;
  hookReason: string | null;
  contentType: string | null;
  topics: string[] | null;
  clipStatus: string;
  videoPath: string | null;
  captionedPath: string | null;
}

interface ClipRequestWithMoments {
  request: {
    id: string;
    youtubeVideoId: string;
    youtubeUrl: string;
    videoTitle: string | null;
    status: string;
    statusMessage: string | null;
    createdAt: string;
    completedAt: string | null;
  };
  moments: ViralMoment[];
  episode: {
    id: string;
    title: string;
    podcastId: string;
  } | null;
  youtubeVideoId: string;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getScoreBadgeColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-blue-500";
}

function MomentCard({ 
  moment, 
  youtubeVideoId,
  onPlay 
}: { 
  moment: ViralMoment; 
  youtubeVideoId: string;
  onPlay: (startTime: number) => void;
}) {
  const { toast } = useToast();
  const duration = moment.endTime - moment.startTime;
  
  const copyTimestampLink = () => {
    const url = `https://youtube.com/watch?v=${youtubeVideoId}&t=${moment.startTime}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied!",
      description: "YouTube timestamp link copied to clipboard",
    });
  };
  
  const openOnYouTube = () => {
    window.open(`https://youtube.com/watch?v=${youtubeVideoId}&t=${moment.startTime}`, '_blank');
  };

  return (
    <Card className="overflow-hidden hover-elevate" data-testid={`card-moment-${moment.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg line-clamp-2">
              {moment.suggestedTitle}
            </CardTitle>
            <CardDescription className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(moment.startTime)} - {formatTime(moment.endTime)}
              </span>
              <span className="text-muted-foreground">
                ({Math.round(duration)}s)
              </span>
            </CardDescription>
          </div>
          <Badge className={`${getScoreBadgeColor(moment.viralityScore)} flex-shrink-0`}>
            <TrendingUp className="w-3 h-3 mr-1" />
            {moment.viralityScore}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {moment.pullQuote && (
          <blockquote className="border-l-2 border-primary pl-4 italic text-muted-foreground text-sm">
            "{moment.pullQuote}"
          </blockquote>
        )}
        
        {moment.hookReason && (
          <div className="text-sm">
            <span className="font-medium">Why it's viral:</span>{" "}
            <span className="text-muted-foreground">{moment.hookReason}</span>
          </div>
        )}
        
        {moment.topics && moment.topics.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {moment.topics.slice(0, 5).map((topic, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {topic}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Button 
            size="sm" 
            onClick={() => onPlay(moment.startTime)}
            data-testid={`button-play-${moment.id}`}
          >
            <Play className="w-4 h-4 mr-1" />
            Preview
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={copyTimestampLink}
            data-testid={`button-copy-${moment.id}`}
          >
            <Copy className="w-4 h-4 mr-1" />
            Copy Link
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={openOnYouTube}
            data-testid={`button-youtube-${moment.id}`}
          >
            <ExternalLink className="w-4 h-4 mr-1" />
            YouTube
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function YouTubePlayer({ videoId, startTime }: { videoId: string; startTime: number }) {
  return (
    <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?start=${startTime}&autoplay=1`}
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full"
      />
    </div>
  );
}

interface ClipOrder {
  id: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  clipUrls: string[];
}

function GenerateClipsCard({ 
  clipRequestId, 
  momentCount 
}: { 
  clipRequestId: string;
  momentCount: number;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Check for existing order
  const { data: orderData, isLoading: orderLoading } = useQuery<{ order: ClipOrder | null }>({
    queryKey: ['orders-by-request', clipRequestId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/by-request/${clipRequestId}`, { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 404) return { order: null };
        throw new Error('Failed to fetch order');
      }
      return res.json();
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/orders/create", { clipRequestId });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Order placed!",
        description: "Your clips will be delivered within 24 hours.",
      });
      queryClient.invalidateQueries({ queryKey: ['orders-by-request', clipRequestId] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/my-orders'] });
    },
    onError: (error: any) => {
      toast({
        title: "Order failed",
        description: error.message || "Failed to place order",
        variant: "destructive",
      });
    },
  });

  if (orderLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  const existingOrder = orderData?.order;

  if (existingOrder) {
    return (
      <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800" data-testid="card-order-status">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <CardTitle className="text-lg">Order Placed</CardTitle>
          </div>
          <CardDescription>
            {existingOrder.status === "completed" ? (
              "Your clips are ready! Check your email for download links."
            ) : existingOrder.status === "processing" ? (
              "We're generating your clips. You'll receive an email within 24 hours."
            ) : (
              "Your order is being processed. You'll receive an email within 24 hours."
            )}
          </CardDescription>
        </CardHeader>
        {existingOrder.clipUrls && existingOrder.clipUrls.length > 0 && (
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm font-medium">Download your clips:</p>
              {existingOrder.clipUrls.map((url, i) => (
                <a 
                  key={i} 
                  href={url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <Video className="w-4 h-4" />
                  Clip {i + 1}
                </a>
              ))}
            </div>
          </CardContent>
        )}
      </Card>
    );
  }

  return (
    <Card className="border-primary" data-testid="card-generate-clips">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <CardTitle className="text-lg">Generate Downloadable Clips</CardTitle>
        </div>
        <CardDescription>
          Get {momentCount} professional clips with captions burned in, 
          optimized for TikTok, Reels, and YouTube Shorts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            Professional captions burned in
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            Optimized for social platforms
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            Delivered within 24 hours
          </li>
          <li className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-muted-foreground" />
            Download links sent to your email
          </li>
        </ul>
        
        <div className="flex items-center justify-between pt-2 border-t">
          <div>
            <span className="text-2xl font-bold">$49</span>
            <span className="text-muted-foreground ml-1">one-time</span>
          </div>
          <Button 
            size="lg"
            onClick={() => createOrderMutation.mutate()}
            disabled={createOrderMutation.isPending}
            data-testid="button-place-order"
          >
            {createOrderMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ShoppingCart className="w-4 h-4 mr-2" />
            )}
            Place Order
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ClipsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [playerTime, setPlayerTime] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery<ClipRequestWithMoments>({
    queryKey: ['/api/clips', id, 'moments'],
    enabled: !!user && !!id,
  });

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation('/login');
    }
  }, [authLoading, user, setLocation]);

  if (authLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="max-w-lg mx-auto text-center p-8">
          <CardTitle className="text-destructive mb-2">Error Loading Clips</CardTitle>
          <CardDescription>
            {(error as Error).message || "Failed to load clip details"}
          </CardDescription>
          <Link href="/my-clips">
            <Button className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to My Clips
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Link href="/my-clips">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to My Clips
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="aspect-video w-full max-w-2xl" />
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      ) : data ? (
        <div className="space-y-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">
                {data.request.videoTitle || `Video: ${data.youtubeVideoId}`}
              </h1>
              <div className="flex items-center gap-3 text-muted-foreground">
                <Badge className="bg-green-500">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  {data.moments.length} Viral Moments
                </Badge>
                <span>{data.request.statusMessage}</span>
              </div>
            </div>
          </div>

          {playerTime !== null && (
            <div className="max-w-3xl">
              <YouTubePlayer videoId={data.youtubeVideoId} startTime={playerTime} />
            </div>
          )}

          {data.moments.length === 0 ? (
            <Card className="text-center p-8">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Video className="w-8 h-8 text-muted-foreground" />
              </div>
              <CardTitle className="mb-2">No Viral Moments Found</CardTitle>
              <CardDescription>
                Our AI couldn't detect any viral-worthy clips in this video.
                Try a different video with more engaging content.
              </CardDescription>
            </Card>
          ) : (
            <div className="space-y-8">
              <GenerateClipsCard 
                clipRequestId={data.request.id} 
                momentCount={data.moments.length} 
              />
              
              <div>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Detected Viral Moments
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {data.moments
                    .sort((a, b) => b.viralityScore - a.viralityScore)
                    .map(moment => (
                      <MomentCard 
                        key={moment.id} 
                        moment={moment} 
                        youtubeVideoId={data.youtubeVideoId}
                        onPlay={(time) => setPlayerTime(time)}
                      />
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
