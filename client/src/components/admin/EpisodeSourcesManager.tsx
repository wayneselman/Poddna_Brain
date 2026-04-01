import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { EpisodeSource } from "@shared/schema";
import {
  Plus,
  Trash2,
  Edit2,
  Star,
  Video,
  Music,
  Upload,
  ExternalLink,
  Loader2,
  Check,
  X,
  Wand2,
  SlidersHorizontal,
  Sparkles,
  Captions,
  Lock,
  Unlock,
} from "lucide-react";
import OffsetCalibrator from "./OffsetCalibrator";

interface EpisodeSourcesManagerProps {
  episodeId: string;
  episodeTitle: string;
}

const SOURCE_KINDS: { value: string; label: string; icon: typeof Music }[] = [
  { value: "audio", label: "Audio", icon: Music },
  { value: "video", label: "Video", icon: Video },
  { value: "upload", label: "User Upload", icon: Upload },
];

const SOURCE_PLATFORMS: { value: string; label: string }[] = [
  { value: "podcast_host", label: "Podcast Host" },
  { value: "youtube", label: "YouTube" },
  { value: "spotify", label: "Spotify" },
  { value: "apple_podcasts", label: "Apple Podcasts" },
  { value: "replit_storage", label: "Replit Storage" },
  { value: "other", label: "Other" },
];

export default function EpisodeSourcesManager({ episodeId, episodeTitle }: EpisodeSourcesManagerProps) {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<EpisodeSource | null>(null);
  
  const [newSource, setNewSource] = useState({
    kind: "audio",
    platform: "podcast_host",
    sourceUrl: "",
    alignmentOffsetSeconds: 0,
    isCanonical: false,
  });

  const { data: sources = [], isLoading } = useQuery<EpisodeSource[]>({
    queryKey: ["/api/episodes", episodeId, "sources"],
  });

  // Fetch feature flags to control experimental features
  const { data: featureFlags = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/feature-flags"],
  });
  
  // Check if video analysis is enabled (disabled by default for MVP)
  const isVideoAnalysisEnabled = featureFlags["VIDEO_ANALYSIS_ENABLED"] === "true";

  const createSourceMutation = useMutation({
    mutationFn: async (data: typeof newSource) => {
      return await apiRequest("POST", `/api/admin/episodes/${episodeId}/sources`, data);
    },
    onSuccess: () => {
      toast({ title: "Source added", description: "The new source has been added successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId, "sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId] });
      setIsAddDialogOpen(false);
      resetNewSource();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to add source",
        variant: "destructive"
      });
    },
  });

  const updateSourceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof newSource & { manuallyEdited?: boolean }> }) => {
      return await apiRequest("PATCH", `/api/admin/episode-sources/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Source updated", description: "The source has been updated successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId, "sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId] });
      setEditingSource(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update source",
        variant: "destructive"
      });
    },
  });

  const deleteSourceMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      return await apiRequest("DELETE", `/api/admin/episode-sources/${sourceId}`);
    },
    onSuccess: () => {
      toast({ title: "Source deleted", description: "The source has been deleted successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId, "sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete source. Note: You cannot delete the last source.",
        variant: "destructive"
      });
    },
  });

  const setCanonicalMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      return await apiRequest("POST", `/api/admin/episodes/${episodeId}/sources/${sourceId}/set-canonical`);
    },
    onSuccess: () => {
      toast({ title: "Canonical source set", description: "The canonical source has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId, "sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to set canonical source",
        variant: "destructive"
      });
    },
  });

  const [transcribingSourceId, setTranscribingSourceId] = useState<string | null>(null);
  const [analyzingSourceId, setAnalyzingSourceId] = useState<string | null>(null);
  const [fetchingYoutubeTranscriptSourceId, setFetchingYoutubeTranscriptSourceId] = useState<string | null>(null);
  const [analyzingYoutubeVideoSourceId, setAnalyzingYoutubeVideoSourceId] = useState<string | null>(null);
  const [calibratingSource, setCalibratingSource] = useState<EpisodeSource | null>(null);
  
  // Determine if we have both audio and video sources for calibration
  const audioSources = sources.filter(s => s.kind === "audio" || s.kind === "upload");
  const videoSources = sources.filter(s => s.kind === "video");
  const hasAudioAndVideo = audioSources.length > 0 && videoSources.length > 0;
  const canonicalAudioSource = audioSources.find(s => s.isCanonical) || audioSources[0] || null;
  
  const updateOffsetMutation = useMutation({
    mutationFn: async ({ id, offset }: { id: string; offset: number }) => {
      return await apiRequest("PATCH", `/api/admin/episode-sources/${id}`, {
        alignmentOffsetSeconds: offset,
      });
    },
    onSuccess: () => {
      toast({ title: "Offset saved", description: "The alignment offset has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId, "sources"] });
      setCalibratingSource(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to save offset",
        variant: "destructive"
      });
    },
  });

  const transcribeSourceMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      return await apiRequest("POST", `/api/episodes/${episodeId}/transcript/assembly`, {
        sourceId,
      });
    },
    onSuccess: () => {
      toast({ 
        title: "Transcription started", 
        description: "AssemblyAI is processing this source. Check the Transcripts page for status."
      });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId] });
      setTranscribingSourceId(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to start transcription",
        variant: "destructive"
      });
      setTranscribingSourceId(null);
    },
  });

  const analyzeVideoMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      return await apiRequest("POST", `/api/admin/episode-sources/${sourceId}/analyze-video`);
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "Video analysis started", 
        description: "Gemini AI is analyzing the video frames. Check the Jobs Monitor for progress."
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId, "video-events"] });
      setAnalyzingSourceId(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to start video analysis",
        variant: "destructive"
      });
      setAnalyzingSourceId(null);
    },
  });

  const fetchYoutubeTranscriptMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      return await apiRequest("POST", `/api/admin/episode-sources/${sourceId}/fetch-youtube-transcript`);
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "YouTube captions fetch started", 
        description: "Fetching captions from YouTube. Check the Jobs Monitor for progress."
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episode-sources", "source-transcripts"] });
      setFetchingYoutubeTranscriptSourceId(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to fetch YouTube captions",
        variant: "destructive"
      });
      setFetchingYoutubeTranscriptSourceId(null);
    },
  });

  const analyzeYoutubeVideoMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      return await apiRequest("POST", `/api/admin/episode-sources/${sourceId}/analyze-youtube-video`);
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "YouTube video analysis started", 
        description: "Gemini AI is analyzing the YouTube video. Check the Jobs Monitor for progress."
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId, "video-events"] });
      setAnalyzingYoutubeVideoSourceId(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to start YouTube video analysis",
        variant: "destructive"
      });
      setAnalyzingYoutubeVideoSourceId(null);
    },
  });

  const resetNewSource = () => {
    setNewSource({
      kind: "audio",
      platform: "podcast_host",
      sourceUrl: "",
      alignmentOffsetSeconds: 0,
      isCanonical: sources.length === 0,
    });
  };

  const getKindIcon = (kind: string) => {
    const kindInfo = SOURCE_KINDS.find(k => k.value === kind);
    const Icon = kindInfo?.icon || Music;
    return <Icon className="w-4 h-4" />;
  };

  const getPlatformLabel = (platform: string) => {
    return SOURCE_PLATFORMS.find(p => p.value === platform)?.label || platform;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="episode-sources-manager">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="text-sm">Media Sources</CardTitle>
            <CardDescription className="text-xs">
              Manage audio and video sources for this episode
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" data-testid="button-add-source">
                <Plus className="w-4 h-4 mr-1" />
                Add Source
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Media Source</DialogTitle>
                <DialogDescription>
                  Add a new audio or video source for {episodeTitle}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="kind">Type</Label>
                    <Select
                      value={newSource.kind}
                      onValueChange={(value) => setNewSource({ ...newSource, kind: value })}
                    >
                      <SelectTrigger data-testid="select-source-kind">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SOURCE_KINDS.map(kind => (
                          <SelectItem key={kind.value} value={kind.value}>
                            <div className="flex items-center gap-2">
                              <kind.icon className="w-4 h-4" />
                              {kind.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="platform">Platform</Label>
                    <Select
                      value={newSource.platform}
                      onValueChange={(value) => setNewSource({ ...newSource, platform: value })}
                    >
                      <SelectTrigger data-testid="select-source-platform">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SOURCE_PLATFORMS.map(platform => (
                          <SelectItem key={platform.value} value={platform.value}>
                            {platform.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sourceUrl">URL</Label>
                  <Input
                    id="sourceUrl"
                    value={newSource.sourceUrl}
                    onChange={(e) => setNewSource({ ...newSource, sourceUrl: e.target.value })}
                    placeholder="https://example.com/audio.mp3"
                    data-testid="input-source-url"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="offset">Alignment Offset (seconds)</Label>
                  <Input
                    id="offset"
                    type="number"
                    step="0.1"
                    value={newSource.alignmentOffsetSeconds}
                    onChange={(e) => setNewSource({ ...newSource, alignmentOffsetSeconds: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    data-testid="input-source-offset"
                  />
                  <p className="text-xs text-muted-foreground">
                    Positive = source starts after canonical audio. Negative = source starts before.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                  data-testid="button-cancel-add"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => createSourceMutation.mutate(newSource)}
                  disabled={!newSource.sourceUrl || createSourceMutation.isPending}
                  data-testid="button-confirm-add"
                >
                  {createSourceMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Add Source
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sources.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Music className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No sources configured</p>
            <p className="text-xs">Add a source to enable playback</p>
          </div>
        ) : (
          sources.map((source) => (
            <div
              key={source.id}
              className={`p-3 rounded-lg border ${
                source.isCanonical
                  ? "border-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/10"
                  : "hover:bg-muted/50"
              }`}
              data-testid={`source-item-${source.id}`}
            >
              {editingSource?.id === source.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={editingSource.kind}
                        onValueChange={(value) => setEditingSource({ ...editingSource, kind: value })}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SOURCE_KINDS.map(kind => (
                            <SelectItem key={kind.value} value={kind.value}>
                              {kind.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Platform</Label>
                      <Select
                        value={editingSource.platform}
                        onValueChange={(value) => setEditingSource({ ...editingSource, platform: value })}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SOURCE_PLATFORMS.map(platform => (
                            <SelectItem key={platform.value} value={platform.value}>
                              {platform.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">URL</Label>
                    <Input
                      value={editingSource.sourceUrl || ""}
                      onChange={(e) => setEditingSource({ ...editingSource, sourceUrl: e.target.value })}
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Alignment Offset (seconds)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={editingSource.alignmentOffsetSeconds}
                      onChange={(e) => setEditingSource({ 
                        ...editingSource, 
                        alignmentOffsetSeconds: parseFloat(e.target.value) || 0 
                      })}
                      className="h-8"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingSource(null)}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => updateSourceMutation.mutate({
                        id: editingSource.id,
                        data: {
                          kind: editingSource.kind,
                          platform: editingSource.platform,
                          sourceUrl: editingSource.sourceUrl ?? undefined,
                          alignmentOffsetSeconds: editingSource.alignmentOffsetSeconds,
                        }
                      })}
                      disabled={updateSourceMutation.isPending}
                    >
                      {updateSourceMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 mr-1" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getKindIcon(source.kind)}
                      <Badge variant={source.isCanonical ? "default" : "secondary"} className="text-xs">
                        {source.kind === "audio" ? "Audio" : source.kind === "video" ? "Video" : "Upload"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {getPlatformLabel(source.platform)}
                      </Badge>
                      {source.isCanonical && (
                        <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-700 dark:text-yellow-400">
                          <Star className="w-3 h-3 mr-1" />
                          Canonical
                        </Badge>
                      )}
                      {source.alignmentOffsetSeconds !== 0 && (
                        <Badge variant="outline" className="text-xs">
                          Offset: {source.alignmentOffsetSeconds > 0 ? "+" : ""}{source.alignmentOffsetSeconds}s
                        </Badge>
                      )}
                      {source.manuallyEdited && (
                        <Badge variant="outline" className="text-xs border-blue-500 text-blue-700 dark:text-blue-400">
                          <Lock className="w-3 h-3 mr-1" />
                          Protected
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <p className="text-xs text-muted-foreground truncate flex-1">
                        {source.sourceUrl || source.storageUrl || "No URL"}
                      </p>
                      {(source.sourceUrl || source.storageUrl) && (
                        <a
                          href={source.sourceUrl || source.storageUrl || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Calibrate button for video sources when we have both audio and video */}
                    {hasAudioAndVideo && source.kind === "video" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                        onClick={() => setCalibratingSource(source)}
                        title="Calibrate offset"
                        data-testid={`button-calibrate-source-${source.id}`}
                      >
                        <SlidersHorizontal className="w-4 h-4" />
                      </Button>
                    )}
                    {/* Analyze Video button for video sources with storageUrl (uploaded videos) - hidden when VIDEO_ANALYSIS_ENABLED is false */}
                    {isVideoAnalysisEnabled && source.kind === "video" && source.storageUrl && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        onClick={() => {
                          setAnalyzingSourceId(source.id);
                          analyzeVideoMutation.mutate(source.id);
                        }}
                        disabled={analyzingSourceId === source.id || analyzeVideoMutation.isPending}
                        title="Analyze video with AI (detect scenes)"
                        data-testid={`button-analyze-video-${source.id}`}
                      >
                        {analyzingSourceId === source.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    {/* Fetch YouTube Captions button for YouTube sources */}
                    {source.platform === "youtube" && source.sourceUrl && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => {
                          setFetchingYoutubeTranscriptSourceId(source.id);
                          fetchYoutubeTranscriptMutation.mutate(source.id);
                        }}
                        disabled={fetchingYoutubeTranscriptSourceId === source.id || fetchYoutubeTranscriptMutation.isPending}
                        title="Fetch YouTube captions (free, instant)"
                        data-testid={`button-fetch-youtube-transcript-${source.id}`}
                      >
                        {fetchingYoutubeTranscriptSourceId === source.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Captions className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    {/* Analyze YouTube Video button for YouTube sources (uses Gemini's native YouTube understanding) - hidden when VIDEO_ANALYSIS_ENABLED is false */}
                    {isVideoAnalysisEnabled && source.platform === "youtube" && source.sourceUrl && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        onClick={() => {
                          setAnalyzingYoutubeVideoSourceId(source.id);
                          analyzeYoutubeVideoMutation.mutate(source.id);
                        }}
                        disabled={analyzingYoutubeVideoSourceId === source.id || analyzeYoutubeVideoMutation.isPending}
                        title="Analyze YouTube video with AI (detect scenes - no download required)"
                        data-testid={`button-analyze-youtube-video-${source.id}`}
                      >
                        {analyzingYoutubeVideoSourceId === source.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    {(source.sourceUrl || source.storageUrl) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        onClick={() => {
                          setTranscribingSourceId(source.id);
                          transcribeSourceMutation.mutate(source.id);
                        }}
                        disabled={transcribingSourceId === source.id || transcribeSourceMutation.isPending}
                        title="Transcribe from this source"
                        data-testid={`button-transcribe-source-${source.id}`}
                      >
                        {transcribingSourceId === source.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Wand2 className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    {!source.isCanonical && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setCanonicalMutation.mutate(source.id)}
                        disabled={setCanonicalMutation.isPending}
                        title="Set as canonical"
                        data-testid={`button-set-canonical-${source.id}`}
                      >
                        <Star className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className={`h-8 w-8 ${source.manuallyEdited ? "text-blue-600 hover:text-blue-700 hover:bg-blue-50" : ""}`}
                      onClick={() => updateSourceMutation.mutate({
                        id: source.id,
                        data: { manuallyEdited: !source.manuallyEdited }
                      })}
                      disabled={updateSourceMutation.isPending}
                      title={source.manuallyEdited ? "Unprotect from auto-sync" : "Protect from auto-sync"}
                      data-testid={`button-toggle-protected-${source.id}`}
                    >
                      {source.manuallyEdited ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setEditingSource(source)}
                      title="Edit source"
                      data-testid={`button-edit-source-${source.id}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Delete source"
                          data-testid={`button-delete-source-${source.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Source?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete this media source. 
                            {source.isCanonical && " Since this is the canonical source, another source will be automatically selected."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteSourceMutation.mutate(source.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>

      {/* Offset Calibrator Dialog */}
      {calibratingSource && (
        <OffsetCalibrator
          open={!!calibratingSource}
          onOpenChange={(open) => !open && setCalibratingSource(null)}
          source={calibratingSource}
          audioSource={canonicalAudioSource}
          episodeId={episodeId}
          onSave={(offset) => updateOffsetMutation.mutate({ id: calibratingSource.id, offset })}
          isSaving={updateOffsetMutation.isPending}
        />
      )}
    </Card>
  );
}
