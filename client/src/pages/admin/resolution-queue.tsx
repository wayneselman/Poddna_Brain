import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Loader2, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Youtube,
  ExternalLink,
  DollarSign
} from "lucide-react";

interface MatchSignals {
  titleMatch: number;
  durationDelta: number;
  channelMatch: number;
  dateMatch: number;
  fromChannel: boolean;
}

interface Candidate {
  id: string;
  episodeId: string;
  youtubeVideoId: string;
  youtubeVideoUrl: string;
  youtubeChannelId: string | null;
  youtubeChannelName: string | null;
  videoTitle: string;
  videoDurationSeconds: number | null;
  videoPublishedAt: string | null;
  confidenceScore: number;
  signals: MatchSignals;
  status: string;
}

interface EpisodeInfo {
  id: string;
  title: string;
  duration: number;
  publishedAt: string | null;
  resolutionStatus: string | null;
  resolutionFallbackAt: string | null;
}

interface PodcastInfo {
  id: string;
  title: string;
  youtubeChannelId: string | null;
}

interface QueueItem {
  episode: EpisodeInfo;
  podcast: PodcastInfo | null;
  candidates: Candidate[];
}

interface QueueResponse {
  items: QueueItem[];
  total: number;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getScoreColor(score: number): string {
  if (score >= 0.85) return "text-green-600 bg-green-50";
  if (score >= 0.6) return "text-yellow-600 bg-yellow-50";
  return "text-red-600 bg-red-50";
}

function SignalBreakdown({ signals }: { signals: MatchSignals | null | undefined }) {
  if (!signals) {
    return <Badge variant="outline" className="text-xs">No signal data</Badge>;
  }
  
  const safePercent = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(val)) return 0;
    return Math.round(val * 100);
  };
  
  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant="outline" className="text-xs">
        Title: {safePercent(signals.titleMatch)}%
      </Badge>
      <Badge variant="outline" className="text-xs">
        Duration: {safePercent(signals.durationDelta)}%
      </Badge>
      <Badge variant="outline" className="text-xs">
        Channel: {safePercent(signals.channelMatch)}%
      </Badge>
      <Badge variant="outline" className="text-xs">
        Date: {safePercent(signals.dateMatch)}%
      </Badge>
      {signals.fromChannel && (
        <Badge className="text-xs bg-blue-100 text-blue-700">From Channel</Badge>
      )}
    </div>
  );
}

function CandidateCard({ 
  candidate, 
  episodeDuration,
  onAccept, 
  onReject,
  isAccepting,
  isRejecting,
}: { 
  candidate: Candidate;
  episodeDuration: number;
  onAccept: () => void;
  onReject: () => void;
  isAccepting: boolean;
  isRejecting: boolean;
}) {
  const scorePercent = Math.round(candidate.confidenceScore * 100);
  
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Youtube className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span className="font-medium text-sm truncate" title={candidate.videoTitle}>
              {candidate.videoTitle}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            {candidate.youtubeChannelName && (
              <span>{candidate.youtubeChannelName}</span>
            )}
            {candidate.videoDurationSeconds && (
              <span>
                {formatDuration(candidate.videoDurationSeconds)}
                {episodeDuration > 0 && (
                  <span className="ml-1 text-muted-foreground/70">
                    (ep: {formatDuration(episodeDuration)})
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        
        <div className={`px-2 py-1 rounded text-sm font-semibold ${getScoreColor(candidate.confidenceScore)}`}>
          {scorePercent}%
        </div>
      </div>
      
      <SignalBreakdown signals={candidate.signals} />
      
      <div className="flex items-center justify-between pt-2">
        <a 
          href={candidate.youtubeVideoUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          data-testid={`link-youtube-${candidate.id}`}
        >
          View on YouTube <ExternalLink className="w-3 h-3" />
        </a>
        
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onReject}
            disabled={isAccepting || isRejecting}
            data-testid={`button-reject-${candidate.id}`}
          >
            {isRejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            <span className="ml-1">Reject</span>
          </Button>
          <Button
            size="sm"
            onClick={onAccept}
            disabled={isAccepting || isRejecting}
            data-testid={`button-accept-${candidate.id}`}
          >
            {isAccepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            <span className="ml-1">Accept</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function QueueItemCard({ item }: { item: QueueItem }) {
  const { toast } = useToast();
  
  const acceptMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const res = await apiRequest("POST", `/api/admin/candidates/${candidateId}/accept`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to accept");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resolution-queue"] });
      toast({ title: "Candidate accepted", description: "Video source created and transcript job queued" });
    },
    onError: (error: Error) => {
      toast({ title: "Accept failed", description: error.message, variant: "destructive" });
    },
  });
  
  const rejectMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const res = await apiRequest("POST", `/api/admin/candidates/${candidateId}/reject`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reject");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resolution-queue"] });
      toast({ title: "Candidate rejected" });
    },
    onError: (error: Error) => {
      toast({ title: "Reject failed", description: error.message, variant: "destructive" });
    },
  });
  
  const paidTranscriptionMutation = useMutation({
    mutationFn: async (episodeId: string) => {
      const res = await apiRequest("POST", `/api/admin/episodes/${episodeId}/request-paid-transcription`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to request paid transcription");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resolution-queue"] });
      toast({ title: "Paid transcription requested", description: "AssemblyAI job queued for this episode" });
    },
    onError: (error: Error) => {
      toast({ title: "Request failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card data-testid={`card-queue-item-${item.episode.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-medium truncate" title={item.episode.title}>
              {item.episode.title}
            </CardTitle>
            <CardDescription>
              {item.podcast?.title || "Unknown Podcast"}
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => paidTranscriptionMutation.mutate(item.episode.id)}
              disabled={paidTranscriptionMutation.isPending}
              data-testid={`button-paid-transcription-${item.episode.id}`}
            >
              {paidTranscriptionMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <DollarSign className="w-4 h-4" />
              )}
              <span className="ml-1">Request paid transcription</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {item.candidates.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">No pending candidates found</p>
            <p className="text-xs">Request paid transcription to use AssemblyAI</p>
          </div>
        ) : (
          item.candidates.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              episodeDuration={item.episode.duration}
              onAccept={() => acceptMutation.mutate(candidate.id)}
              onReject={() => rejectMutation.mutate(candidate.id)}
              isAccepting={acceptMutation.isPending && acceptMutation.variables === candidate.id}
              isRejecting={rejectMutation.isPending && rejectMutation.variables === candidate.id}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminResolutionQueuePage() {
  const { data, isLoading, error } = useQuery<QueueResponse>({
    queryKey: ["/api/admin/resolution-queue"],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-2 text-destructive" />
          <p className="text-destructive">Failed to load resolution queue</p>
        </div>
      </div>
    );
  }

  const items = data?.items || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Episode Resolution Queue</h1>
        <p className="text-muted-foreground">
          Review YouTube video candidates for episodes that couldn't be auto-matched
        </p>
      </div>
      
      <div className="flex items-center gap-4">
        <Badge variant="secondary" className="text-sm">
          {items.length} episode{items.length !== 1 ? "s" : ""} awaiting review
        </Badge>
      </div>
      
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-medium">All caught up!</h3>
            <p className="text-muted-foreground">No episodes awaiting review</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <QueueItemCard key={item.episode.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
