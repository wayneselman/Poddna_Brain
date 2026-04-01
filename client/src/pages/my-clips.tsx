import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Loader2, 
  Sparkles,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Video,
  Zap,
  RefreshCw
} from "lucide-react";

interface UserClipRequest {
  id: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  videoTitle: string | null;
  videoThumbnail: string | null;
  videoDuration: number | null;
  status: string;
  statusMessage: string | null;
  momentsFound: number | null;
  clipsReady: number | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> Queued</Badge>;
    case "analyzing":
      return <Badge className="bg-blue-500"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Analyzing</Badge>;
    case "extracting":
      return <Badge className="bg-purple-500"><Video className="w-3 h-3 mr-1" /> Extracting</Badge>;
    case "captioning":
      return <Badge className="bg-amber-500"><Zap className="w-3 h-3 mr-1" /> Adding Captions</Badge>;
    case "complete":
      return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Complete</Badge>;
    case "failed":
      return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function ClipRequestCard({ request }: { request: UserClipRequest }) {
  const thumbnailUrl = request.videoThumbnail || `https://img.youtube.com/vi/${request.youtubeVideoId}/mqdefault.jpg`;
  
  return (
    <Card className="overflow-hidden">
      <div className="flex">
        <div className="relative w-48 flex-shrink-0">
          <img 
            src={thumbnailUrl} 
            alt={request.videoTitle || "Video thumbnail"}
            className="w-full h-full object-cover aspect-video"
          />
        </div>
        <CardContent className="flex-1 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium truncate mb-1" title={request.videoTitle || request.youtubeVideoId}>
                {request.videoTitle || `Video: ${request.youtubeVideoId}`}
              </h3>
              <p className="text-sm text-muted-foreground mb-2">
                Submitted {formatDate(request.createdAt)}
              </p>
              <div className="flex items-center gap-3">
                {getStatusBadge(request.status)}
                {request.momentsFound !== null && request.momentsFound > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {request.momentsFound} moments found
                  </span>
                )}
                {request.clipsReady !== null && request.clipsReady > 0 && (
                  <span className="text-sm text-green-600 font-medium">
                    {request.clipsReady} clips ready
                  </span>
                )}
              </div>
              {request.statusMessage && request.status !== "complete" && request.status !== "failed" && (
                <p className="text-sm text-muted-foreground mt-2" data-testid={`text-status-message-${request.id}`}>{request.statusMessage}</p>
              )}
              {request.status === "failed" && (
                <div className="mt-2 rounded-md bg-destructive/10 p-2" data-testid={`text-error-detail-${request.id}`}>
                  <p className="text-sm text-destructive font-medium">
                    {request.statusMessage || "An unknown error occurred."}
                  </p>
                  {request.error && request.error !== request.statusMessage && (
                    <p className="text-xs text-destructive/80 mt-1">
                      Details: {request.error}
                    </p>
                  )}
                </div>
              )}
            </div>
            {request.status === "complete" && (
              <Link href={`/clips/${request.id}`}>
                <Button size="sm" data-testid={`button-view-clips-${request.id}`}>
                  View Clips
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
      <Card className="max-w-lg w-full text-center">
        <CardHeader>
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">No Clips Yet</CardTitle>
          <CardDescription className="text-base mt-2">
            Start generating viral clips from your favorite YouTube videos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/app">
            <Button size="lg" data-testid="button-generate-first-clip">
              <Sparkles className="w-5 h-5 mr-2" />
              Generate Your First Clips
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MyClipsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const { data: requests, isLoading, refetch } = useQuery<UserClipRequest[]>({
    queryKey: ['/api/clips/my-requests'],
    enabled: !!user,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation('/login');
    }
  }, [authLoading, user, setLocation]);

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">My Clips</h1>
          <p className="text-muted-foreground">
            Track your clip generation requests and view completed clips.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Link href="/app">
            <Button data-testid="button-new-request">
              <Sparkles className="w-4 h-4 mr-2" />
              New Request
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <div className="flex">
                <Skeleton className="w-48 aspect-video" />
                <CardContent className="flex-1 p-4">
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-3" />
                  <Skeleton className="h-6 w-24" />
                </CardContent>
              </div>
            </Card>
          ))}
        </div>
      ) : requests && requests.length > 0 ? (
        <div className="space-y-4">
          {requests.map((request) => (
            <ClipRequestCard key={request.id} request={request} />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
