import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Episode, Podcast } from "@shared/schema";
import { 
  Loader2, 
  Search, 
  Play,
  Clock,
  Video,
  Flame,
  TrendingUp,
  Upload,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Download,
  Captions,
  Send
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ViralMoment {
  id: string;
  episodeId: string;
  startTime: number;
  endTime: number;
  transcript: string;
  viralityScore: number;
  contentType: string;
  hook: string | null;
  suggestedTitle: string | null;
  clipStatus: string;
  clipError: string | null;
  videoPath: string | null;
  captionedPath: string | null;
  postingStatus: string | null;
  createdAt: string;
  episodeTitle?: string;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "ready": return "bg-green-500";
    case "pending": return "bg-yellow-500";
    case "extracting": return "bg-blue-500";
    case "failed": return "bg-red-500";
    default: return "bg-gray-500";
  }
}

export default function ClipStudioPage() {
  const { toast } = useToast();
  const [selectedEpisode, setSelectedEpisode] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("detect");
  const [uploadingMomentId, setUploadingMomentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: episodes = [], isLoading: episodesLoading } = useQuery<Episode[]>({
    queryKey: ["/api/episodes"],
  });

  const { data: podcasts = [] } = useQuery<Podcast[]>({
    queryKey: ["/api/podcasts"],
  });

  const { data: pendingMoments = [], isLoading: pendingLoading } = useQuery<ViralMoment[]>({
    queryKey: ["/api/admin/viral-moments/pending-clips"],
  });

  const { data: captionPendingMoments = [], isLoading: captionPendingLoading } = useQuery<ViralMoment[]>({
    queryKey: ["/api/admin/viral-moments/pending-captions"],
  });

  const { data: readyMoments = [], isLoading: readyLoading } = useQuery<ViralMoment[]>({
    queryKey: ["/api/admin/viral-moments/ready-for-posting"],
  });

  const { data: episodeMoments = [], isLoading: momentsLoading, refetch: refetchMoments } = useQuery<ViralMoment[]>({
    queryKey: ["/api/episodes", selectedEpisode, "viral-moments"],
    enabled: !!selectedEpisode,
  });

  const detectMutation = useMutation({
    mutationFn: async (episodeId: string) => {
      return apiRequest("POST", `/api/admin/episodes/${episodeId}/detect-viral-moments?force=true`);
    },
    onSuccess: () => {
      toast({ title: "Viral moment detection started" });
      refetchMoments();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/viral-moments/pending-clips"] });
    },
    onError: (error: Error) => {
      toast({ title: "Detection failed", description: error.message, variant: "destructive" });
    },
  });

  const burnCaptionsMutation = useMutation({
    mutationFn: async (momentId: string) => {
      return apiRequest("POST", `/api/viral-moments/${momentId}/burn-captions`);
    },
    onSuccess: () => {
      toast({ title: "Caption burning started" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/viral-moments/pending-clips"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/viral-moments/pending-captions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/viral-moments/ready-for-posting"] });
    },
    onError: (error: Error) => {
      toast({ title: "Caption burning failed", description: error.message, variant: "destructive" });
    },
  });

  const uploadClipMutation = useMutation({
    mutationFn: async ({ momentId, file }: { momentId: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      
      const res = await fetch(`/api/admin/viral-moments/${momentId}/upload-clip`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Upload failed");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/viral-moments/pending-clips"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/viral-moments/pending-captions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/viral-moments/ready-for-posting"] });
      toast({ title: "Clip uploaded successfully" });
      setUploadingMomentId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploadingMomentId(null);
    },
  });

  const handleFileUpload = (momentId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadingMomentId(momentId);
      uploadClipMutation.mutate({ momentId, file });
    }
  };

  const episodesWithTranscripts = episodes.filter(e => 
    e.transcriptStatus === "ready" &&
    e.title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedEpisodeData = episodes.find(e => e.id === selectedEpisode);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Clip Studio
          </h1>
          <p className="text-muted-foreground">
            Detect viral moments, upload clips, burn captions, and post
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="detect" className="gap-2" data-testid="tab-detect">
            <Sparkles className="w-4 h-4" />
            Detect
          </TabsTrigger>
          <TabsTrigger value="upload" className="gap-2" data-testid="tab-upload">
            <Upload className="w-4 h-4" />
            Upload ({pendingMoments.length})
          </TabsTrigger>
          <TabsTrigger value="caption" className="gap-2" data-testid="tab-caption">
            <Captions className="w-4 h-4" />
            Caption ({captionPendingMoments.length})
          </TabsTrigger>
          <TabsTrigger value="post" className="gap-2" data-testid="tab-post">
            <Send className="w-4 h-4" />
            Post ({readyMoments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="detect" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1. Select Episode</CardTitle>
              <CardDescription>Choose an episode with a transcript to detect viral moments</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search episodes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-episodes"
                  />
                </div>
              </div>

              <Select value={selectedEpisode} onValueChange={setSelectedEpisode}>
                <SelectTrigger data-testid="select-episode">
                  <SelectValue placeholder="Select an episode" />
                </SelectTrigger>
                <SelectContent>
                  {episodesLoading ? (
                    <div className="p-4 text-center text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
                      Loading episodes...
                    </div>
                  ) : episodesWithTranscripts.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No episodes with ready transcripts found.
                      <br />
                      Import or transcribe episodes first.
                    </div>
                  ) : (
                    episodesWithTranscripts.map((episode) => (
                      <SelectItem key={episode.id} value={episode.id}>
                        <span className="truncate">{episode.title}</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {selectedEpisodeData && (
                <div className="p-4 rounded-lg border bg-muted/50">
                  <div className="font-medium">{selectedEpisodeData.title}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {selectedEpisodeData.duration && `${Math.floor(selectedEpisodeData.duration / 60)} min`}
                    {selectedEpisodeData.videoUrl && " • Has video"}
                  </div>
                </div>
              )}

              <Button
                onClick={() => selectedEpisode && detectMutation.mutate(selectedEpisode)}
                disabled={!selectedEpisode || detectMutation.isPending}
                className="w-full"
                data-testid="button-detect-moments"
              >
                {detectMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Detect Viral Moments
              </Button>
            </CardContent>
          </Card>

          {selectedEpisode && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-500" />
                  Detected Moments
                </CardTitle>
              </CardHeader>
              <CardContent>
                {momentsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : episodeMoments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No viral moments detected yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {episodeMoments.map((moment) => (
                      <div key={moment.id} className="p-3 rounded-lg border bg-card">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline">{moment.contentType}</Badge>
                              <div className="flex items-center gap-1">
                                <TrendingUp className="w-3 h-3 text-orange-500" />
                                <span className="text-sm font-bold text-orange-500">{moment.viralityScore}</span>
                              </div>
                              <Badge className={getStatusColor(moment.clipStatus)}>
                                {moment.clipStatus}
                              </Badge>
                            </div>
                            <p className="text-sm font-medium">{moment.suggestedTitle || moment.hook}</p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {formatDuration(moment.startTime)} - {formatDuration(moment.endTime)}
                              ({moment.endTime - moment.startTime}s)
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. Upload Clips</CardTitle>
              <CardDescription>
                Download clips locally with yt-dlp, then upload here
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : pendingMoments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                  All clips uploaded
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingMoments.map((moment) => (
                    <div key={moment.id} className="p-4 rounded-lg border bg-card">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline">{moment.contentType}</Badge>
                            <Badge className={getStatusColor(moment.clipStatus)}>
                              {moment.clipStatus}
                            </Badge>
                          </div>
                          <p className="font-medium truncate">{moment.suggestedTitle || moment.hook}</p>
                          <p className="text-sm text-muted-foreground truncate">{moment.episodeTitle}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {formatDuration(moment.startTime)} - {formatDuration(moment.endTime)}
                          </div>
                          {moment.clipError && (
                            <div className="flex items-center gap-1 mt-2 text-xs text-destructive">
                              <AlertCircle className="w-3 h-3" />
                              {moment.clipError}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <input
                            type="file"
                            accept="video/*"
                            className="hidden"
                            id={`upload-${moment.id}`}
                            onChange={(e) => handleFileUpload(moment.id, e)}
                          />
                          <Button
                            size="sm"
                            onClick={() => document.getElementById(`upload-${moment.id}`)?.click()}
                            disabled={uploadingMomentId === moment.id}
                            data-testid={`button-upload-${moment.id}`}
                          >
                            {uploadingMomentId === moment.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Upload className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="caption" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">3. Burn Captions</CardTitle>
              <CardDescription>Add TikTok-style captions to uploaded clips ({captionPendingMoments.length} ready)</CardDescription>
            </CardHeader>
            <CardContent>
              {captionPendingLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : captionPendingMoments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No clips ready for captioning
                </div>
              ) : (
                <div className="space-y-3">
                  {captionPendingMoments.map((moment) => (
                    <div key={moment.id} className="p-4 rounded-lg border bg-card">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{moment.suggestedTitle || moment.hook}</p>
                          <p className="text-sm text-muted-foreground">{moment.episodeTitle}</p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => burnCaptionsMutation.mutate(moment.id)}
                          disabled={burnCaptionsMutation.isPending}
                          data-testid={`button-caption-${moment.id}`}
                        >
                          {burnCaptionsMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Captions className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="post" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">4. Ready to Post</CardTitle>
              <CardDescription>Captioned clips ready for TikTok, Reels, and Shorts</CardDescription>
            </CardHeader>
            <CardContent>
              {readyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : readyMoments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Video className="w-12 h-12 mx-auto mb-2" />
                  No clips ready for posting yet
                </div>
              ) : (
                <div className="space-y-3">
                  {readyMoments.map((moment) => (
                    <div key={moment.id} className="p-4 rounded-lg border bg-card">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline">{moment.contentType}</Badge>
                            <div className="flex items-center gap-1">
                              <TrendingUp className="w-3 h-3 text-orange-500" />
                              <span className="text-sm font-bold text-orange-500">{moment.viralityScore}</span>
                            </div>
                          </div>
                          <p className="font-medium">{moment.suggestedTitle || moment.hook}</p>
                          <p className="text-sm text-muted-foreground truncate mt-1">
                            {moment.transcript?.slice(0, 100)}...
                          </p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {moment.endTime - moment.startTime}s clip
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <a href={moment.captionedPath || "#"} download target="_blank" rel="noopener noreferrer">
                              <Download className="w-4 h-4" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
