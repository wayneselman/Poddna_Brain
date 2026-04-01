import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Episode as BaseEpisode, Podcast } from "@shared/schema";
import { 
  Loader2, 
  Save, 
  ArrowLeft,
  FileText,
  Music,
  ExternalLink,
  Trash2,
  BookOpen,
  RefreshCw,
  Sparkles,
  Download,
  FileSearch,
  Brain,
  CheckCircle2,
  Tag,
  Filter,
  Link2,
  Shield,
  GitBranch,
  Video,
  Flame,
  Play,
  Clock,
  TrendingUp
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Episode extends BaseEpisode {
  hasTranscript?: boolean;
}

interface EpisodeSegment {
  id: string;
  episodeId: string;
  startTime: number;
  endTime: number | null;
  label: string;
  summary: string | null;
  segmentType: string;
}

interface StatementData {
  id: string;
  startTime: number;
  endTime: number;
  speaker: string | null;
  text: string;
  confidence: number;
  hasEmbedding: boolean;
}

interface StatementsResponse {
  statements: StatementData[];
  count: number;
}

interface ClassificationData {
  claimFlag: boolean;
  claimType: string;
  certainty: number;
  polarity: string;
  modality: string;
  sentiment: number;
  emotionalTone: string;
}

interface ClaimData {
  id: string;
  startTime: number;
  endTime: number;
  speaker: string | null;
  text: string;
  confidence: number;
  classification: ClassificationData | null;
}

interface ClaimsResponse {
  claims: ClaimData[];
  count: number;
  totalStatements: number;
}

interface CanonicalEntityMention {
  mentionId: string;
  mentionText: string | null;
  timestamp: number | null;
  method: string;
  confidence: number;
}

interface CanonicalEntityWithMentions {
  id: string;
  name: string;
  type: string;
  mentions: CanonicalEntityMention[];
}

interface CanonicalEntitiesResponse {
  entities: CanonicalEntityWithMentions[];
}

interface IntegrityScoreResponse {
  hasScore: boolean;
  score?: number;
  band?: "low" | "medium" | "high";
  version?: number;
  components?: {
    metrics: {
      claimDensity: number;
      avgCertainty: number;
      skepticalRatio: number;
      avgSentiment: number;
      emotionVariety: number;
      coverage: number;
    };
    components: {
      claimDensityScore: number;
      certaintyScore: number;
      skepticScore: number;
      sentimentScore: number;
      emotionScore: number;
      coverageScore: number;
    };
  };
  summary?: string;
  updatedAt?: string;
  message?: string;
}

interface RelationData {
  id: string;
  relation: string;
  confidence: number;
  statementAId: string;
  statementBId: string;
  statementAText: string;
  statementBText: string;
  statementAStartTime: number;
  statementBStartTime: number;
}

interface RelationsResponse {
  episodeId: string;
  total: number;
  byType: {
    supports: number;
    contradicts: number;
    extends: number;
  };
  relations: RelationData[];
}

interface ViralMoment {
  id: string;
  episodeId: string;
  startTime: number;
  endTime: number;
  transcript: string;
  viralityScore: number;
  contentType: string;
  hook: string | null;
  clipStatus: string;
  videoPath: string | null;
  captionedPath: string | null;
  optimizedPath: string | null;
  postingStatus: string | null;
  createdAt: string;
}

export default function AdminEpisodeDetailPage() {
  const { toast } = useToast();
  const [, params] = useRoute("/admin/episodes/:id");
  const episodeId = params?.id;

  const { data: episode, isLoading: episodeLoading } = useQuery<Episode>({
    queryKey: ["/api/episodes", episodeId],
    enabled: !!episodeId,
  });

  const { data: podcasts = [] } = useQuery<Podcast[]>({
    queryKey: ["/api/podcasts"],
  });

  const { data: chapters = [] } = useQuery<EpisodeSegment[]>({
    queryKey: ["/api/episodes", episodeId, "episode-segments"],
    enabled: !!episodeId,
  });

  const { data: statementsData, isLoading: statementsLoading } = useQuery<StatementsResponse>({
    queryKey: ["/api/admin/episodes", episodeId, "statements"],
    enabled: !!episodeId,
  });

  const [showClaimsOnly, setShowClaimsOnly] = useState(false);
  
  const { data: claimsData, isLoading: claimsLoading } = useQuery<ClaimsResponse>({
    queryKey: ["/api/admin/episodes", episodeId, "claims"],
    enabled: !!episodeId && !!statementsData && statementsData.count > 0,
  });

  const { data: canonicalEntitiesData, isLoading: canonicalEntitiesLoading } = useQuery<CanonicalEntitiesResponse>({
    queryKey: ["/api/admin/episodes", episodeId, "canonical-entities"],
    enabled: !!episodeId,
  });

  const { data: integrityData, isLoading: integrityLoading } = useQuery<IntegrityScoreResponse>({
    queryKey: ["/api/admin/episodes", episodeId, "integrity"],
    enabled: !!episodeId,
  });

  const { data: relationsData, isLoading: relationsLoading } = useQuery<RelationsResponse>({
    queryKey: ["/api/admin/episodes", episodeId, "relations"],
    enabled: !!episodeId,
  });

  const { data: viralMoments = [], isLoading: viralMomentsLoading } = useQuery<ViralMoment[]>({
    queryKey: ["/api/episodes", episodeId, "viral-moments"],
    enabled: !!episodeId,
  });

  const [formData, setFormData] = useState<Partial<Episode> | null>(null);
  const [pipelineMaxClips, setPipelineMaxClips] = useState(10);
  const [pipelinePlatform, setPipelinePlatform] = useState("tiktok");

  // Initialize form data when episode loads
  if (episode && !formData) {
    setFormData({
      title: episode.title,
      description: episode.description,
      type: episode.type,
      duration: episode.duration,
      mediaUrl: episode.mediaUrl,
      videoUrl: episode.videoUrl,
      spotifyUrl: episode.spotifyUrl,
      applePodcastsUrl: episode.applePodcastsUrl,
      podcastId: episode.podcastId,
    });
  }

  const updateEpisodeMutation = useMutation({
    mutationFn: async (data: Partial<Episode>) => {
      const res = await apiRequest("PATCH", `/api/episodes/${episodeId}`, data);
      if (!res.ok) throw new Error("Failed to update episode");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId] });
      toast({ title: "Episode updated successfully" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to update episode", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const deleteEpisodeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/episodes/${episodeId}`);
      if (!res.ok) throw new Error("Failed to delete episode");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      toast({ title: "Episode deleted successfully" });
      window.location.href = "/admin/episodes";
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to delete episode", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const generateChaptersMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/episodes/${episodeId}/generate-chapters`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate chapters");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId, "episode-segments"] });
      toast({ 
        title: "Chapters generated successfully",
        description: `Created ${data.count} chapters for this episode`
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to generate chapters", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const importChaptersMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/episodes/${episodeId}/import-chapters`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to import chapters");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId, "episode-segments"] });
      toast({ 
        title: "Chapters imported successfully",
        description: `Imported ${data.count} chapters from Podcast 2.0 feed`
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to import chapters", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const parseDescriptionChaptersMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/episodes/${episodeId}/import-description-chapters`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to parse chapters from description");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId, "episode-segments"] });
      toast({ 
        title: "Chapters parsed successfully",
        description: `Found ${data.count} chapters in the description`
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to parse chapters", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const refreshDescriptionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/episodes/${episodeId}/refresh-description`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to refresh description");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId] });
      setFormData(null);
      toast({ 
        title: "Description refreshed",
        description: `Updated description with ${data.descriptionLength} characters (full text)`
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to refresh description", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const extractStatementsMutation = useMutation({
    mutationFn: async (force: boolean = false) => {
      const url = `/api/admin/episodes/${episodeId}/extract-statements${force ? "?force=true" : ""}`;
      const res = await apiRequest("POST", url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to extract statements");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/episodes", episodeId, "statements"] });
      toast({ 
        title: "Statement extraction started",
        description: data.message
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to extract statements", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const classifyClaimsMutation = useMutation({
    mutationFn: async (force: boolean = false) => {
      const url = `/api/admin/episodes/${episodeId}/statements/classify${force ? "?force=true" : ""}`;
      const res = await apiRequest("POST", url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to classify statements");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/episodes", episodeId, "claims"] });
      toast({ 
        title: "Statement classification started",
        description: data.message
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to classify statements", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const linkEntitiesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/episodes/${episodeId}/entities/link`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to link entities");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/episodes", episodeId, "canonical-entities"] });
      toast({ 
        title: "Entity linking started",
        description: data.message
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to link entities", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const recalculateIntegrityMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/episodes/${episodeId}/integrity/recalculate`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to calculate integrity score");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/episodes", episodeId, "integrity"] });
      toast({ 
        title: "Integrity calculation started",
        description: data.message
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to calculate integrity score", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const discoverRelationsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/episodes/${episodeId}/relations/discover`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to discover relations");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/episodes", episodeId, "relations"] });
      toast({ 
        title: "Relation discovery started",
        description: data.message
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to discover relations", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const detectViralMomentsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/episodes/${episodeId}/detect-viral-moments?force=true`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to detect viral moments");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId, "viral-moments"] });
      toast({ 
        title: "Viral moment detection started",
        description: data.message || "Job queued for processing"
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to detect viral moments", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const runClipPipelineMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/episodes/${episodeId}/run-clip-pipeline`, {
        maxClips: pipelineMaxClips,
        platform: pipelinePlatform,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to run clip pipeline");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId, "viral-moments"] });
      toast({ 
        title: "Clip pipeline started",
        description: `Job ${data.jobId} created. Pipeline will detect moments, extract clips, add captions, and optimize for ${pipelinePlatform}.`
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to run clip pipeline", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const extractClipMutation = useMutation({
    mutationFn: async (momentId: string) => {
      const res = await apiRequest("POST", `/api/viral-moments/${momentId}/extract-clip`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to extract clip");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId, "viral-moments"] });
      toast({ title: "Clip extraction started" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to extract clip", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const burnCaptionsMutation = useMutation({
    mutationFn: async (momentId: string) => {
      const res = await apiRequest("POST", `/api/viral-moments/${momentId}/burn-captions`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to burn captions");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId, "viral-moments"] });
      toast({ title: "Caption burning started" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to burn captions", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const handleSave = () => {
    if (formData) {
      updateEpisodeMutation.mutate(formData);
    }
  };

  const handleFieldChange = (field: keyof Episode, value: any) => {
    setFormData(prev => prev ? { ...prev, [field]: value } : null);
  };

  const getPodcastTitle = (podcastId: string) => {
    return podcasts.find(p => p.id === podcastId)?.title || "Unknown Podcast";
  };

  if (episodeLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="p-6">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <CardTitle>Episode Not Found</CardTitle>
            <CardDescription>The episode you're looking for doesn't exist.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Link href="/admin/episodes">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Episodes
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/episodes">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-episode-detail-title">
              Edit Episode
            </h1>
            <p className="text-muted-foreground">
              {getPodcastTitle(episode.podcastId)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Episode?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{episode.title}" including its transcript and all annotations.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteEpisodeMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button 
            onClick={handleSave} 
            disabled={updateEpisodeMutation.isPending}
            data-testid="button-save-episode"
          >
            {updateEpisodeMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={formData?.title || ""}
                  onChange={(e) => handleFieldChange("title", e.target.value)}
                  className="mt-1"
                  data-testid="input-episode-title"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={formData?.description || ""}
                  onChange={(e) => handleFieldChange("description", e.target.value)}
                  className="mt-1 min-h-[120px]"
                  data-testid="input-episode-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Type</label>
                  <Select 
                    value={formData?.type || "audio"} 
                    onValueChange={(v) => handleFieldChange("type", v)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="audio">Audio</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Duration (seconds)</label>
                  <Input
                    type="number"
                    value={formData?.duration || 0}
                    onChange={(e) => handleFieldChange("duration", parseInt(e.target.value) || 0)}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Podcast</label>
                <Select 
                  value={formData?.podcastId || ""} 
                  onValueChange={(v) => handleFieldChange("podcastId", v)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {podcasts.map(podcast => (
                      <SelectItem key={podcast.id} value={podcast.id}>
                        {podcast.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Media URLs</CardTitle>
              <CardDescription>Links to audio, video, and streaming platforms</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium flex items-center gap-2">
                  <Music className="w-4 h-4" />
                  Audio URL
                </label>
                <Input
                  value={formData?.mediaUrl || ""}
                  onChange={(e) => handleFieldChange("mediaUrl", e.target.value)}
                  placeholder="https://example.com/episode.mp3"
                  className="mt-1"
                  data-testid="input-episode-media-url"
                />
              </div>
              <div>
                <label className="text-sm font-medium">YouTube Video URL</label>
                <Input
                  value={formData?.videoUrl || ""}
                  onChange={(e) => handleFieldChange("videoUrl", e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Spotify URL</label>
                <Input
                  value={formData?.spotifyUrl || ""}
                  onChange={(e) => handleFieldChange("spotifyUrl", e.target.value)}
                  placeholder="https://open.spotify.com/episode/..."
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Apple Podcasts URL</label>
                <Input
                  value={formData?.applePodcastsUrl || ""}
                  onChange={(e) => handleFieldChange("applePodcastsUrl", e.target.value)}
                  placeholder="https://podcasts.apple.com/..."
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Transcript</span>
                {episode.hasTranscript ? (
                  <Badge className="bg-green-500">Available</Badge>
                ) : (
                  <Badge variant="outline">Not available</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Chapters</span>
                {chapters.length > 0 ? (
                  <Badge className="bg-blue-500">{chapters.length} chapters</Badge>
                ) : (
                  <Badge variant="outline">None</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Type</span>
                <Badge variant="secondary">{episode.type}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Duration</span>
                <span className="text-sm">{Math.floor(episode.duration / 60)}m</span>
              </div>
              {episode.publishedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Published</span>
                  <span className="text-sm">
                    {new Date(episode.publishedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href={`/episode/${episode.id}`}>
                <Button variant="outline" className="w-full justify-start">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Episode Page
                </Button>
              </Link>
              
              {!episode.hasTranscript ? (
                <Link href={`/admin/transcripts?episode=${episode.id}`}>
                  <Button variant="outline" className="w-full justify-start">
                    <FileText className="w-4 h-4 mr-2" />
                    Generate Transcript
                  </Button>
                </Link>
              ) : (
                <Link href={`/admin/transcripts?episode=${episode.id}`}>
                  <Button variant="outline" className="w-full justify-start">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Re-generate Transcript
                  </Button>
                </Link>
              )}
              
              {episode.hasTranscript && (
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => generateChaptersMutation.mutate()}
                  disabled={generateChaptersMutation.isPending}
                  data-testid="button-generate-chapters"
                >
                  {generateChaptersMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  {chapters.length > 0 ? "Re-generate Chapters" : "Generate Chapters"}
                </Button>
              )}
              
              {episode.chaptersUrl && (
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => importChaptersMutation.mutate()}
                  disabled={importChaptersMutation.isPending}
                  data-testid="button-import-chapters"
                >
                  {importChaptersMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Import Podcast 2.0 Chapters
                </Button>
              )}
              
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => refreshDescriptionMutation.mutate()}
                disabled={refreshDescriptionMutation.isPending}
                data-testid="button-refresh-description"
              >
                {refreshDescriptionMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Refresh Description (Full Text)
              </Button>
              
              {episode.description && (
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => parseDescriptionChaptersMutation.mutate()}
                  disabled={parseDescriptionChaptersMutation.isPending}
                  data-testid="button-parse-description-chapters"
                >
                  {parseDescriptionChaptersMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileSearch className="w-4 h-4 mr-2" />
                  )}
                  Parse Chapters from Description
                </Button>
              )}

              <div className="border-t pt-2 mt-2">
                <p className="text-xs text-muted-foreground mb-2">Clip Generation</p>
                
                {episode.hasTranscript && (
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => detectViralMomentsMutation.mutate()}
                    disabled={detectViralMomentsMutation.isPending}
                    data-testid="button-detect-viral-moments"
                  >
                    {detectViralMomentsMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Flame className="w-4 h-4 mr-2" />
                    )}
                    Detect Viral Moments
                  </Button>
                )}

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="default" 
                      className="w-full justify-start mt-2"
                      disabled={!episode.hasTranscript}
                      data-testid="button-run-clip-pipeline"
                    >
                      <Video className="w-4 h-4 mr-2" />
                      Run Clip Pipeline
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Run Clip Pipeline</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will automatically detect viral moments, extract video clips, burn captions, and optimize for your target platform.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label htmlFor="max-clips">Max Clips</Label>
                        <Input
                          id="max-clips"
                          type="number"
                          min={1}
                          max={20}
                          value={pipelineMaxClips}
                          onChange={(e) => setPipelineMaxClips(parseInt(e.target.value) || 10)}
                          className="mt-1"
                          data-testid="input-pipeline-max-clips"
                        />
                      </div>
                      <div>
                        <Label htmlFor="platform">Target Platform</Label>
                        <Select value={pipelinePlatform} onValueChange={setPipelinePlatform}>
                          <SelectTrigger className="mt-1" data-testid="select-pipeline-platform">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tiktok">TikTok</SelectItem>
                            <SelectItem value="reels">Instagram Reels</SelectItem>
                            <SelectItem value="shorts">YouTube Shorts</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => runClipPipelineMutation.mutate()}
                        disabled={runClipPipelineMutation.isPending}
                        data-testid="button-confirm-run-pipeline"
                      >
                        {runClipPipelineMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4 mr-2" />
                        )}
                        Start Pipeline
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>

          {/* Viral Clips Section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Flame className="w-4 h-4" />
                Viral Clips
              </CardTitle>
              {viralMoments.length > 0 && (
                <Badge variant="secondary">{viralMoments.length}</Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {viralMomentsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : viralMoments.length > 0 ? (
                <div className="max-h-[400px] overflow-y-auto space-y-2">
                  {viralMoments.slice(0, 10).map((moment) => (
                    <div key={moment.id} className="p-3 rounded border bg-muted/30 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground font-mono">
                            {Math.floor(moment.startTime / 60)}:{(moment.startTime % 60).toString().padStart(2, '0')}
                          </span>
                          <Badge variant="outline" className="text-xs">{moment.contentType}</Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3 text-orange-500" />
                          <span className="text-sm font-bold text-orange-500">{moment.viralityScore}</span>
                        </div>
                      </div>
                      
                      {moment.hook && (
                        <p className="text-sm font-medium line-clamp-1">{moment.hook}</p>
                      )}
                      
                      <p className="text-xs text-muted-foreground line-clamp-2">{moment.transcript}</p>
                      
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge 
                            variant={moment.clipStatus === "ready" ? "default" : moment.clipStatus === "failed" ? "destructive" : "secondary"}
                            className="text-xs"
                          >
                            {moment.clipStatus}
                          </Badge>
                          {moment.captionedPath && (
                            <Badge variant="outline" className="text-xs">captioned</Badge>
                          )}
                          {moment.optimizedPath && (
                            <Badge variant="outline" className="text-xs">optimized</Badge>
                          )}
                          {moment.postingStatus && (
                            <Badge 
                              variant={moment.postingStatus === "posted" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {moment.postingStatus}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex gap-1">
                          {moment.clipStatus === "pending" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => extractClipMutation.mutate(moment.id)}
                              disabled={extractClipMutation.isPending}
                              data-testid={`button-extract-clip-${moment.id}`}
                            >
                              <Video className="w-3 h-3" />
                            </Button>
                          )}
                          {moment.clipStatus === "ready" && !moment.captionedPath && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => burnCaptionsMutation.mutate(moment.id)}
                              disabled={burnCaptionsMutation.isPending}
                              data-testid={`button-burn-captions-${moment.id}`}
                            >
                              <FileText className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {viralMoments.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center">
                      + {viralMoments.length - 10} more moments
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">
                    {episode.hasTranscript 
                      ? "No viral moments detected yet" 
                      : "Transcript required to detect viral moments"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {chapters.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  Chapters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {chapters.map((chapter, index) => (
                  <div key={chapter.id} className="flex items-start gap-2 p-2 rounded border bg-muted/30">
                    <span className="text-xs text-muted-foreground font-mono min-w-[50px]">
                      {Math.floor(chapter.startTime / 60)}:{(chapter.startTime % 60).toString().padStart(2, '0')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{chapter.label}</p>
                      <Badge variant="outline" className="text-xs mt-1">{chapter.segmentType}</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                Statements
              </CardTitle>
              {statementsData && statementsData.count > 0 && (
                <Badge variant="secondary">{statementsData.count}</Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {statementsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : statementsData && statementsData.statements.length > 0 ? (
                <>
                  <div className="max-h-[300px] overflow-y-auto space-y-2">
                    {statementsData.statements.slice(0, 10).map((statement) => (
                      <div key={statement.id} className="flex items-start gap-2 p-2 rounded border bg-muted/30">
                        <span className="text-xs text-muted-foreground font-mono min-w-[50px]">
                          {Math.floor(statement.startTime / 60)}:{(statement.startTime % 60).toString().padStart(2, '0')}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm line-clamp-2">{statement.text}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {statement.speaker && (
                              <Badge variant="outline" className="text-xs">{statement.speaker}</Badge>
                            )}
                            {statement.hasEmbedding && (
                              <CheckCircle2 className="w-3 h-3 text-green-500" />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {statementsData.count > 10 && (
                      <p className="text-xs text-muted-foreground text-center">
                        + {statementsData.count - 10} more statements
                      </p>
                    )}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="w-full"
                    onClick={() => extractStatementsMutation.mutate(true)}
                    disabled={extractStatementsMutation.isPending}
                    data-testid="button-reextract-statements"
                  >
                    {extractStatementsMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Re-extract Statements
                  </Button>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    {episode.hasTranscript 
                      ? "No statements extracted yet" 
                      : "Transcript required to extract statements"}
                  </p>
                  {episode.hasTranscript && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => extractStatementsMutation.mutate(false)}
                      disabled={extractStatementsMutation.isPending}
                      data-testid="button-extract-statements"
                    >
                      {extractStatementsMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Brain className="w-4 h-4 mr-2" />
                      )}
                      Extract Statements
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {statementsData && statementsData.count > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Claims
                </CardTitle>
                {claimsData && claimsData.count > 0 && (
                  <Badge variant="secondary">
                    {showClaimsOnly ? claimsData.count : `${claimsData.claims.filter(c => c.classification?.claimFlag).length}/${claimsData.totalStatements}`}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {claimsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : claimsData && claimsData.claims.some(c => c.classification) ? (
                  <>
                    <div className="flex items-center justify-between gap-2 pb-2 border-b">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="claims-filter"
                          checked={showClaimsOnly}
                          onCheckedChange={setShowClaimsOnly}
                          data-testid="switch-claims-only"
                        />
                        <Label htmlFor="claims-filter" className="text-sm cursor-pointer">
                          <Filter className="w-3 h-3 inline mr-1" />
                          Claims only
                        </Label>
                      </div>
                    </div>
                    <div className="max-h-[350px] overflow-y-auto space-y-2">
                      {claimsData.claims
                        .filter(claim => showClaimsOnly ? claim.classification?.claimFlag : true)
                        .slice(0, 15)
                        .map((claim) => (
                        <div key={claim.id} className="flex items-start gap-2 p-2 rounded border bg-muted/30">
                          <span className="text-xs text-muted-foreground font-mono min-w-[50px]">
                            {Math.floor(claim.startTime / 60)}:{(claim.startTime % 60).toString().padStart(2, '0')}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm line-clamp-2">{claim.text}</p>
                            {claim.classification && (
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                <Badge 
                                  variant={claim.classification.claimFlag ? "default" : "outline"} 
                                  className="text-xs"
                                >
                                  {claim.classification.claimType}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {claim.classification.polarity}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {claim.classification.emotionalTone}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {Math.round(claim.classification.certainty * 100)}% certain
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {claimsData.claims.filter(c => showClaimsOnly ? c.classification?.claimFlag : true).length > 15 && (
                        <p className="text-xs text-muted-foreground text-center">
                          + {claimsData.claims.filter(c => showClaimsOnly ? c.classification?.claimFlag : true).length - 15} more
                        </p>
                      )}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="w-full"
                      onClick={() => classifyClaimsMutation.mutate(true)}
                      disabled={classifyClaimsMutation.isPending}
                      data-testid="button-reclassify-claims"
                    >
                      {classifyClaimsMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Re-classify Claims
                    </Button>
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-3">
                      Statements not classified yet
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => classifyClaimsMutation.mutate(false)}
                      disabled={classifyClaimsMutation.isPending}
                      data-testid="button-classify-claims"
                    >
                      {classifyClaimsMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Tag className="w-4 h-4 mr-2" />
                      )}
                      Classify Statements
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Canonical Entities Section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                Canonical Entities
              </CardTitle>
              {canonicalEntitiesData && canonicalEntitiesData.entities.length > 0 && (
                <Badge variant="secondary">{canonicalEntitiesData.entities.length}</Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {canonicalEntitiesLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : canonicalEntitiesData && canonicalEntitiesData.entities.length > 0 ? (
                <>
                  <div className="max-h-[350px] overflow-y-auto space-y-2">
                    {canonicalEntitiesData.entities.slice(0, 15).map((entity) => (
                      <div key={entity.id} className="p-2 rounded border bg-muted/30">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{entity.name}</span>
                          <Badge variant="outline" className="text-xs">{entity.type}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {entity.mentions.length} mention{entity.mentions.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {entity.mentions.slice(0, 3).map((m) => (
                            <Badge key={m.mentionId} variant="secondary" className="text-xs">
                              {m.method === 'exact-match' ? '=' : 'AI'} {Math.round(m.confidence * 100)}%
                            </Badge>
                          ))}
                          {entity.mentions.length > 3 && (
                            <span className="text-xs text-muted-foreground">+{entity.mentions.length - 3} more</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {canonicalEntitiesData.entities.length > 15 && (
                      <p className="text-xs text-muted-foreground text-center">
                        + {canonicalEntitiesData.entities.length - 15} more entities
                      </p>
                    )}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="w-full"
                    onClick={() => linkEntitiesMutation.mutate()}
                    disabled={linkEntitiesMutation.isPending}
                    data-testid="button-relink-entities"
                  >
                    {linkEntitiesMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Re-link Entities
                  </Button>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    No canonical entities linked yet
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => linkEntitiesMutation.mutate()}
                    disabled={linkEntitiesMutation.isPending}
                    data-testid="button-link-entities"
                  >
                    {linkEntitiesMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Link2 className="w-4 h-4 mr-2" />
                    )}
                    Link Entities
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Integrity Score Section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Integrity Score
              </CardTitle>
              {integrityData?.hasScore && integrityData.score !== undefined && (
                <Badge 
                  variant={integrityData.band === "high" ? "default" : integrityData.band === "medium" ? "secondary" : "outline"}
                  data-testid="badge-integrity-band"
                >
                  {integrityData.band?.toUpperCase()} ({integrityData.score}/100)
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {integrityLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : integrityData?.hasScore && integrityData.components ? (
                <>
                  <p className="text-sm text-muted-foreground" data-testid="text-integrity-summary">
                    {integrityData.summary}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded border bg-muted/30">
                      <span className="text-muted-foreground">Claim Density:</span>
                      <span className="ml-1 font-medium">{integrityData.components.components.claimDensityScore.toFixed(1)}/20</span>
                    </div>
                    <div className="p-2 rounded border bg-muted/30">
                      <span className="text-muted-foreground">Certainty:</span>
                      <span className="ml-1 font-medium">{integrityData.components.components.certaintyScore.toFixed(1)}/20</span>
                    </div>
                    <div className="p-2 rounded border bg-muted/30">
                      <span className="text-muted-foreground">Skepticism:</span>
                      <span className="ml-1 font-medium">{integrityData.components.components.skepticScore.toFixed(1)}/15</span>
                    </div>
                    <div className="p-2 rounded border bg-muted/30">
                      <span className="text-muted-foreground">Sentiment:</span>
                      <span className="ml-1 font-medium">{integrityData.components.components.sentimentScore.toFixed(1)}/10</span>
                    </div>
                    <div className="p-2 rounded border bg-muted/30">
                      <span className="text-muted-foreground">Emotion:</span>
                      <span className="ml-1 font-medium">{integrityData.components.components.emotionScore.toFixed(1)}/10</span>
                    </div>
                    <div className="p-2 rounded border bg-muted/30">
                      <span className="text-muted-foreground">Coverage:</span>
                      <span className="ml-1 font-medium">{integrityData.components.components.coverageScore.toFixed(1)}/25</span>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="w-full"
                    onClick={() => recalculateIntegrityMutation.mutate()}
                    disabled={recalculateIntegrityMutation.isPending}
                    data-testid="button-recalculate-integrity"
                  >
                    {recalculateIntegrityMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Recalculate Score
                  </Button>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    {statementsData && statementsData.count > 0 
                      ? "No integrity score calculated yet" 
                      : "Statements required to calculate integrity score"}
                  </p>
                  {statementsData && statementsData.count > 0 && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => recalculateIntegrityMutation.mutate()}
                      disabled={recalculateIntegrityMutation.isPending}
                      data-testid="button-calculate-integrity"
                    >
                      {recalculateIntegrityMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Shield className="w-4 h-4 mr-2" />
                      )}
                      Calculate Integrity Score
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Statement Relations Section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="w-4 h-4" />
                Statement Relations
              </CardTitle>
              {relationsData && relationsData.total > 0 && (
                <Badge variant="secondary" data-testid="badge-relations-total">
                  {relationsData.total} relations
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {relationsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : relationsData && relationsData.total > 0 ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2 rounded border bg-green-50 dark:bg-green-950/30 text-center">
                      <span className="text-muted-foreground">Supports:</span>
                      <span className="ml-1 font-medium text-green-600 dark:text-green-400">{relationsData.byType.supports}</span>
                    </div>
                    <div className="p-2 rounded border bg-red-50 dark:bg-red-950/30 text-center">
                      <span className="text-muted-foreground">Contradicts:</span>
                      <span className="ml-1 font-medium text-red-600 dark:text-red-400">{relationsData.byType.contradicts}</span>
                    </div>
                    <div className="p-2 rounded border bg-blue-50 dark:bg-blue-950/30 text-center">
                      <span className="text-muted-foreground">Extends:</span>
                      <span className="ml-1 font-medium text-blue-600 dark:text-blue-400">{relationsData.byType.extends}</span>
                    </div>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto space-y-2">
                    {relationsData.relations.slice(0, 10).map((rel) => (
                      <div 
                        key={rel.id} 
                        className="p-2 rounded border text-xs space-y-1"
                        data-testid={`relation-item-${rel.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={rel.relation === "supports" ? "default" : rel.relation === "contradicts" ? "destructive" : "secondary"}
                            className="text-[10px]"
                          >
                            {rel.relation}
                          </Badge>
                          <span className="text-muted-foreground">({Math.round(rel.confidence * 100)}%)</span>
                        </div>
                        <p className="text-muted-foreground truncate" title={rel.statementAText}>
                          A: {rel.statementAText}
                        </p>
                        <p className="text-muted-foreground truncate" title={rel.statementBText}>
                          B: {rel.statementBText}
                        </p>
                      </div>
                    ))}
                    {relationsData.relations.length > 10 && (
                      <p className="text-xs text-muted-foreground text-center py-1">
                        ...and {relationsData.relations.length - 10} more
                      </p>
                    )}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="w-full"
                    onClick={() => discoverRelationsMutation.mutate()}
                    disabled={discoverRelationsMutation.isPending}
                    data-testid="button-rediscover-relations"
                  >
                    {discoverRelationsMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Rediscover Relations
                  </Button>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    {claimsData && claimsData.count > 0 
                      ? "No statement relations discovered yet" 
                      : "Claims required to discover relations"}
                  </p>
                  {claimsData && claimsData.count > 0 && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => discoverRelationsMutation.mutate()}
                      disabled={discoverRelationsMutation.isPending}
                      data-testid="button-discover-relations"
                    >
                      {discoverRelationsMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <GitBranch className="w-4 h-4 mr-2" />
                      )}
                      Discover Relations
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
