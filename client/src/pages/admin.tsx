import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import type { Podcast, Episode, User } from "@shared/schema";
import { PlusCircle, Upload, Loader2, Users, Edit2, Check, X, LogIn, Shield, Trash2, Music, Image as ImageIcon, Ban, CheckCircle, Award, Crown, Star, Square, CheckSquare, Search, Download, Podcast as PodcastIcon, List, Copy, FileText, Brain } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import ImageUploader from "@/components/image-uploader";
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

interface TranscriptionProgress {
  stage: "downloading" | "chunking" | "transcribing" | "processing" | "complete" | "error";
  currentChunk?: number;
  totalChunks?: number;
  percentage: number;
  message: string;
}

interface Speaker {
  name: string;
  segmentCount: number;
}

interface SemanticStatus {
  hasSemanticSegments: boolean;
  semanticSegmentCount: number;
  jobStatus: "none" | "pending" | "running";
  hasTranscript: boolean;
}

function AdminEpisodeSemanticPanel({ episodeId }: { episodeId: string }) {
  const { toast } = useToast();
  const [isEnqueued, setIsEnqueued] = useState(false);

  const { data: status, isLoading } = useQuery<SemanticStatus>({
    queryKey: ["/api/admin/episodes", episodeId, "semantic-status"],
    refetchInterval: isEnqueued ? 5000 : false,
  });

  useEffect(() => {
    if (isEnqueued && status?.jobStatus === "none") {
      setIsEnqueued(false);
    }
  }, [isEnqueued, status?.jobStatus]);

  const runSemanticMutation = useMutation({
    mutationFn: async ({ force }: { force: boolean }) => {
      const url = force 
        ? `/api/admin/episodes/${episodeId}/semantic-analyze?force=true`
        : `/api/admin/episodes/${episodeId}/semantic-analyze`;
      const res = await apiRequest("POST", url, {});
      return await res.json();
    },
    onSuccess: () => {
      setIsEnqueued(true);
      toast({
        title: "Semantic analysis enqueued",
        description: "The analysis job has been queued and will run shortly.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/episodes", episodeId, "semantic-status"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to enqueue semantic analysis",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const isJobActive = status.jobStatus === "pending" || status.jobStatus === "running";
  const isDisabled = isJobActive || isEnqueued || runSemanticMutation.isPending;

  return (
    <div className="flex items-center gap-2 mt-1">
      <Brain className="w-3 h-3 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">
        Semantic: {status.hasSemanticSegments ? status.semanticSegmentCount : "none"}
      </span>
      {status.hasTranscript && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          disabled={isDisabled}
          onClick={() => runSemanticMutation.mutate({ force: status.hasSemanticSegments })}
          data-testid={`button-semantic-analyze-${episodeId}`}
        >
          {runSemanticMutation.isPending || isEnqueued ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
              Enqueued...
            </>
          ) : isJobActive ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
              {status.jobStatus === "running" ? "Running..." : "Pending..."}
            </>
          ) : status.hasSemanticSegments ? (
            "Re-run"
          ) : (
            "Run"
          )}
        </Button>
      )}
      {!status.hasTranscript && (
        <span className="text-xs text-muted-foreground italic">No transcript</span>
      )}
    </div>
  );
}

const podcastFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  host: z.string().min(1, "Host is required"),
  description: z.string().optional(),
  artworkUrl: z.string().refine(
    (val) => !val || val.startsWith("/objects/") || val.startsWith("http://") || val.startsWith("https://"),
    "Must be a valid URL or uploaded image path"
  ).optional().or(z.literal("")),
});

const episodeFormSchema = z.object({
  podcastId: z.string().min(1, "Podcast is required"),
  title: z.string().min(1, "Title is required"),
  episodeNumber: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? undefined : Number(val)),
    z.number().int().positive().optional()
  ),
  description: z.string().optional(),
  publishedAt: z.string().min(1, "Published date is required"),
  duration: z.coerce.number().int().positive("Duration must be positive"),
  type: z.enum(["audio", "video"]),
  mediaUrl: z.string().url("Must be a valid URL"),
  videoUrl: z.string().url("Must be a valid YouTube URL").optional().or(z.literal("")),
  spotifyUrl: z.string().url("Must be a valid Spotify URL").optional().or(z.literal("")),
  applePodcastsUrl: z.string().url("Must be a valid Apple Podcasts URL").optional().or(z.literal("")),
});

const transcriptSchema = z.object({
  segments: z.string().min(1, "Transcript is required"),
});

const youtubeTranscriptSchema = z.object({
  youtubeVideoId: z.string().min(1, "YouTube Video ID is required"),
});

const audioUrlTranscriptSchema = z.object({
  audioUrl: z.string().url("Must be a valid URL"),
});

const subrRipImportSchema = z.object({
  subrRipText: z.string().min(1, "SubRip transcript is required"),
});

const subrRipUrlSchema = z.object({
  subrRipUrl: z.string().url("Must be a valid URL"),
});

function parseSubRipToSegments(srtContent: string): Array<{
  startTime: number;
  endTime: number;
  text: string;
  speaker: string | null;
  type: string;
}> {
  const segments: Array<{
    startTime: number;
    endTime: number;
    text: string;
    speaker: string | null;
    type: string;
  }> = [];

  const blocks = srtContent.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    const timeLine = lines.find(line => line.includes('-->'));
    if (!timeLine) continue;

    const timeMatch = timeLine.match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!timeMatch) continue;

    const startTime = 
      parseInt(timeMatch[1]) * 3600 +
      parseInt(timeMatch[2]) * 60 +
      parseInt(timeMatch[3]) +
      parseInt(timeMatch[4]) / 1000;

    const endTime = 
      parseInt(timeMatch[5]) * 3600 +
      parseInt(timeMatch[6]) * 60 +
      parseInt(timeMatch[7]) +
      parseInt(timeMatch[8]) / 1000;

    const timeLineIndex = lines.indexOf(timeLine);
    const textLines = lines.slice(timeLineIndex + 1);
    let fullText = textLines.join(' ').trim();

    let speaker: string | null = null;
    const speakerMatch = fullText.match(/^(Speaker\s*\d+|Guest\s*\d+|Host):\s*/i);
    if (speakerMatch) {
      speaker = speakerMatch[1];
      fullText = fullText.substring(speakerMatch[0].length).trim();
    }

    if (fullText) {
      segments.push({
        startTime: Math.floor(startTime),
        endTime: Math.ceil(endTime),
        text: fullText,
        speaker,
        type: 'speech',
      });
    }
  }

  return segments;
}

export default function AdminPage() {
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [selectedEpisodeForTranscript, setSelectedEpisodeForTranscript] = useState<string>("");
  const [transcriptMode, setTranscriptMode] = useState<"manual" | "youtube" | "audio-url" | "import">("audio-url");
  const [transcriptionProgress, setTranscriptionProgress] = useState<TranscriptionProgress | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [newSpeakerName, setNewSpeakerName] = useState("");
  const [annotationCount, setAnnotationCount] = useState(5);
  const [isGeneratingAnnotations, setIsGeneratingAnnotations] = useState(false);
  const [isDetectingMusic, setIsDetectingMusic] = useState(false);
  const [isBulkSemanticRunning, setIsBulkSemanticRunning] = useState(false);
  const [editingPodcast, setEditingPodcast] = useState<Podcast | null>(null);
  const [editingEpisode, setEditingEpisode] = useState<Episode | null>(null);
  const [selectedUserForAction, setSelectedUserForAction] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");
  const [selectedUsersForBulk, setSelectedUsersForBulk] = useState<Set<string>>(new Set());
  
  // Podcast Index state
  const [podcastIndexSearch, setPodcastIndexSearch] = useState("");
  const [podcastIndexResults, setPodcastIndexResults] = useState<any[]>([]);
  const [isSearchingPodcastIndex, setIsSearchingPodcastIndex] = useState(false);
  const [selectedPodcastForImport, setSelectedPodcastForImport] = useState<any | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isImportingPodcast, setIsImportingPodcast] = useState(false);
  const [maxEpisodesToImport, setMaxEpisodesToImport] = useState(20);
  
  // Podcast Index episode browsing state
  const [selectedPodcastForBrowsing, setSelectedPodcastForBrowsing] = useState<any | null>(null);
  const [podcastIndexEpisodes, setPodcastIndexEpisodes] = useState<any[]>([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [importingEpisodeId, setImportingEpisodeId] = useState<string | null>(null);

  const { data: podcasts = [] } = useQuery<Podcast[]>({
    queryKey: ["/api/podcasts"],
  });

  const { data: adminUsers = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: allEpisodes = [] } = useQuery<Episode[]>({
    queryKey: ["/api/episodes"],
  });

  const { data: speakers = [] } = useQuery<Speaker[]>({
    queryKey: ["/api/episodes", selectedEpisodeForTranscript, "speakers"],
    enabled: !!selectedEpisodeForTranscript,
  });

  const podcastForm = useForm<z.infer<typeof podcastFormSchema>>({
    resolver: zodResolver(podcastFormSchema),
    defaultValues: {
      title: "",
      host: "",
      description: "",
      artworkUrl: "",
    },
  });

  const episodeForm = useForm<z.infer<typeof episodeFormSchema>>({
    resolver: zodResolver(episodeFormSchema),
    defaultValues: {
      podcastId: "",
      title: "",
      episodeNumber: "" as any,
      description: "",
      publishedAt: new Date().toISOString().split('T')[0],
      duration: 3600,
      type: "audio",
      mediaUrl: "",
      videoUrl: "",
      spotifyUrl: "",
      applePodcastsUrl: "",
    },
  });

  const transcriptForm = useForm<z.infer<typeof transcriptSchema>>({
    resolver: zodResolver(transcriptSchema),
    defaultValues: {
      segments: "",
    },
  });

  const youtubeTranscriptForm = useForm<z.infer<typeof youtubeTranscriptSchema>>({
    resolver: zodResolver(youtubeTranscriptSchema),
    defaultValues: {
      youtubeVideoId: "",
    },
  });

  const audioUrlTranscriptForm = useForm<z.infer<typeof audioUrlTranscriptSchema>>({
    resolver: zodResolver(audioUrlTranscriptSchema),
    defaultValues: {
      audioUrl: "",
    },
  });

  const subripImportForm = useForm<z.infer<typeof subrRipImportSchema>>({
    resolver: zodResolver(subrRipImportSchema),
    defaultValues: {
      subrRipText: "",
    },
  });

  const subripUrlForm = useForm<z.infer<typeof subrRipUrlSchema>>({
    resolver: zodResolver(subrRipUrlSchema),
    defaultValues: {
      subrRipUrl: "",
    },
  });

  const [subripImportMode, setSubripImportMode] = useState<"paste" | "url">("url");

  const createPodcastMutation = useMutation({
    mutationFn: async (data: z.infer<typeof podcastFormSchema>) => {
      const res = await apiRequest("POST", "/api/podcasts", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts"] });
      podcastForm.reset();
      toast({
        title: "Success",
        description: "Podcast created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create podcast",
        variant: "destructive",
      });
    },
  });

  const createEpisodeMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/episodes", data);
      return await res.json();
    },
    onSuccess: (data: Episode) => {
      queryClient.setQueryData(["/api/episodes"], (old: Episode[] = []) => [...old, data]);
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts"] });
      episodeForm.reset();
      setSelectedEpisodeForTranscript(data.id);
      toast({
        title: "Success",
        description: "Episode created successfully. Add transcript next!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create episode",
        variant: "destructive",
      });
    },
  });

  const uploadTranscriptMutation = useMutation({
    mutationFn: async ({ episodeId, segments }: { episodeId: string; segments: string }) => {
      const res = await apiRequest("POST", `/api/episodes/${episodeId}/transcript`, { transcript: segments });
      return await res.json();
    },
    onSuccess: () => {
      transcriptForm.reset();
      setSelectedEpisodeForTranscript("");
      toast({
        title: "Success",
        description: "Transcript uploaded successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload transcript",
        variant: "destructive",
      });
    },
  });

  const uploadYoutubeTranscriptMutation = useMutation({
    mutationFn: async ({ episodeId, youtubeVideoId }: { episodeId: string; youtubeVideoId: string }) => {
      const res = await apiRequest("POST", `/api/episodes/${episodeId}/transcript/youtube`, { youtubeVideoId });
      return await res.json();
    },
    onSuccess: (data: any) => {
      youtubeTranscriptForm.reset();
      setSelectedEpisodeForTranscript("");
      toast({
        title: "Success",
        description: `YouTube transcript fetched! ${data.segmentCount || 0} segments imported.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch YouTube transcript",
        variant: "destructive",
      });
    },
  });

  const transcribeAudioUrlMutation = useMutation({
    mutationFn: async ({ episodeId, audioUrl }: { episodeId: string; audioUrl: string }) => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      
      setTranscriptionProgress({
        stage: "downloading",
        percentage: 0,
        message: "Starting transcription..."
      });
      
      const eventSource = new EventSource(`/api/episodes/${episodeId}/transcript/progress`);
      eventSourceRef.current = eventSource;
      
      eventSource.onmessage = (event) => {
        try {
          const progress = JSON.parse(event.data) as TranscriptionProgress;
          setTranscriptionProgress(progress);
        } catch (e) {
          console.error("Failed to parse progress:", e);
        }
      };
      
      eventSource.onerror = () => {
        eventSource.close();
      };
      
      const res = await apiRequest("POST", `/api/episodes/${episodeId}/transcript/custom-url`, { audioUrl });
      
      eventSource.close();
      eventSourceRef.current = null;
      
      return await res.json();
    },
    onSuccess: (data: any) => {
      audioUrlTranscriptForm.reset();
      setSelectedEpisodeForTranscript("");
      setTranscriptionProgress(null);
      toast({
        title: "Success",
        description: `Audio transcribed! ${data.segmentCount || 0} segments with speaker identification.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
    },
    onError: (error: Error) => {
      setTranscriptionProgress(null);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to transcribe audio",
        variant: "destructive",
      });
    },
  });

  const deleteTranscriptMutation = useMutation({
    mutationFn: async (episodeId: string) => {
      const res = await apiRequest("DELETE", `/api/episodes/${episodeId}/transcript`, undefined);
      return await res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Success",
        description: `Transcript deleted! ${data.deletedCount || 0} segments removed.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete transcript",
        variant: "destructive",
      });
    },
  });

  const renameSpeakerMutation = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) => {
      const res = await apiRequest("PATCH", `/api/episodes/${selectedEpisodeForTranscript}/speakers/rename`, {
        oldName,
        newName,
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Success",
        description: data.message || "Speaker renamed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", selectedEpisodeForTranscript, "speakers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", selectedEpisodeForTranscript, "segments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      setEditingSpeaker(null);
      setNewSpeakerName("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to rename speaker",
        variant: "destructive",
      });
    },
  });

  const generateAnnotationsMutation = useMutation({
    mutationFn: async ({ episodeId, count }: { episodeId: string; count: number }) => {
      setIsGeneratingAnnotations(true);
      const res = await apiRequest("POST", `/api/episodes/${episodeId}/generate-annotations`, {
        count,
        podcastContext: "The Joe Budden Podcast - featuring Joe Budden, Ice, Ish, and Parks. Known for passionate debates, cultural commentary, music industry insights, and candid discussions."
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      setIsGeneratingAnnotations(false);
      toast({
        title: "AI Annotations Generated",
        description: `Successfully created ${data.count} expert annotations for this episode.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", selectedEpisodeForTranscript, "annotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/annotations/trending"] });
    },
    onError: (error: Error) => {
      setIsGeneratingAnnotations(false);
      toast({
        title: "Error",
        description: error.message || "Failed to generate annotations",
        variant: "destructive",
      });
    },
  });

  const detectMusicMutation = useMutation({
    mutationFn: async (episodeId: string) => {
      setIsDetectingMusic(true);
      const res = await apiRequest("POST", `/api/episodes/${episodeId}/detect-music`, {});
      return await res.json();
    },
    onSuccess: (data: any) => {
      setIsDetectingMusic(false);
      toast({
        title: "Music Detection Complete",
        description: `Found ${data.count} songs in this episode.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", selectedEpisodeForTranscript, "music"] });
    },
    onError: (error: Error) => {
      setIsDetectingMusic(false);
      toast({
        title: "Error",
        description: error.message || "Failed to detect music",
        variant: "destructive",
      });
    },
  });

  const bulkSemanticMutation = useMutation({
    mutationFn: async ({ episodeIds, force }: { episodeIds: string[]; force: boolean }) => {
      setIsBulkSemanticRunning(true);
      const res = await apiRequest("POST", "/api/admin/episodes/semantic-analyze-bulk", { episodeIds, force });
      return await res.json();
    },
    onSuccess: (data: any) => {
      setIsBulkSemanticRunning(false);
      toast({
        title: "Bulk Semantic Analysis",
        description: `Queued ${data.successCount}/${data.totalRequested} episodes for analysis.`,
      });
      // Invalidate all semantic status queries
      queryClient.invalidateQueries({ queryKey: ["/api/admin/episodes"] });
    },
    onError: (error: Error) => {
      setIsBulkSemanticRunning(false);
      toast({
        title: "Error",
        description: error.message || "Failed to queue bulk semantic analysis",
        variant: "destructive",
      });
    },
  });

  const deletePodcastMutation = useMutation({
    mutationFn: async (podcastId: string) => {
      const res = await apiRequest("DELETE", `/api/podcasts/${podcastId}`, undefined);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Podcast and all its episodes deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete podcast",
        variant: "destructive",
      });
    },
  });

  const deleteEpisodeMutation = useMutation({
    mutationFn: async (episodeId: string) => {
      const res = await apiRequest("DELETE", `/api/episodes/${episodeId}`, undefined);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Episode deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete episode",
        variant: "destructive",
      });
    },
  });

  const updatePodcastMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Podcast> }) => {
      const res = await apiRequest("PATCH", `/api/podcasts/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Podcast updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts"] });
      setEditingPodcast(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update podcast",
        variant: "destructive",
      });
    },
  });

  const updateEpisodeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Episode> }) => {
      const res = await apiRequest("PATCH", `/api/episodes/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Episode updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      setEditingEpisode(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update episode",
        variant: "destructive",
      });
    },
  });

  // User management mutations
  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User role updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user role",
        variant: "destructive",
      });
    },
  });

  const updateUserCertificationsMutation = useMutation({
    mutationFn: async ({ userId, certifications }: { userId: string; certifications: string[] }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/certifications`, { certifications });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User certifications updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update certifications",
        variant: "destructive",
      });
    },
  });

  const banUserMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/ban`, { reason });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "User Banned",
        description: "User has been banned successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setSelectedUserForAction(null);
      setBanReason("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to ban user",
        variant: "destructive",
      });
    },
  });

  const unbanUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/unban`, {});
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "User Unbanned",
        description: "User has been unbanned successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to unban user",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteUsersMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      const res = await apiRequest("POST", `/api/admin/users/bulk-delete`, { userIds });
      return await res.json();
    },
    onSuccess: (data: { deleted: number }) => {
      toast({
        title: "Users Deleted",
        description: `Successfully deleted ${data.deleted} user(s)`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setSelectedUsersForBulk(new Set());
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete users",
        variant: "destructive",
      });
    },
  });

  const onSubmitPodcast = (data: z.infer<typeof podcastFormSchema>) => {
    createPodcastMutation.mutate(data);
  };

  const onSubmitEpisode = (data: z.infer<typeof episodeFormSchema>) => {
    const payload = {
      ...data,
      episodeNumber: data.episodeNumber || undefined,
      description: data.description || undefined,
      videoUrl: data.videoUrl || undefined,
      spotifyUrl: data.spotifyUrl || undefined,
      applePodcastsUrl: data.applePodcastsUrl || undefined,
      publishedAt: new Date(data.publishedAt),
    };
    createEpisodeMutation.mutate(payload);
  };

  const onSubmitTranscript = (data: z.infer<typeof transcriptSchema>) => {
    if (!selectedEpisodeForTranscript) {
      toast({
        title: "Error",
        description: "Please select an episode first",
        variant: "destructive",
      });
      return;
    }
    uploadTranscriptMutation.mutate({
      episodeId: selectedEpisodeForTranscript,
      segments: data.segments,
    });
  };

  const onSubmitYoutubeTranscript = (data: z.infer<typeof youtubeTranscriptSchema>) => {
    if (!selectedEpisodeForTranscript) {
      toast({
        title: "Error",
        description: "Please select an episode first",
        variant: "destructive",
      });
      return;
    }
    uploadYoutubeTranscriptMutation.mutate({
      episodeId: selectedEpisodeForTranscript,
      youtubeVideoId: data.youtubeVideoId,
    });
  };

  const onSubmitAudioUrlTranscript = (data: z.infer<typeof audioUrlTranscriptSchema>) => {
    if (!selectedEpisodeForTranscript) {
      toast({
        title: "Error",
        description: "Please select an episode first",
        variant: "destructive",
      });
      return;
    }
    transcribeAudioUrlMutation.mutate({
      episodeId: selectedEpisodeForTranscript,
      audioUrl: data.audioUrl,
    });
  };

  const [isImporting, setIsImporting] = useState(false);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);

  const onSubmitSubripUrl = async (data: z.infer<typeof subrRipUrlSchema>) => {
    if (!selectedEpisodeForTranscript) {
      toast({
        title: "Error",
        description: "Please select an episode first",
        variant: "destructive",
      });
      return;
    }

    setIsFetchingUrl(true);
    try {
      const fetchRes = await apiRequest("POST", "/api/fetch-subrip", { url: data.subrRipUrl });
      if (!fetchRes.ok) {
        const error = await fetchRes.json();
        throw new Error(error.error || "Failed to fetch transcript");
      }
      
      const { content } = await fetchRes.json();
      const segments = parseSubRipToSegments(content);
      
      if (segments.length === 0) {
        toast({
          title: "Error",
          description: "No valid segments found in SubRip content. Check the URL.",
          variant: "destructive",
        });
        setIsFetchingUrl(false);
        return;
      }

      const res = await apiRequest("POST", `/api/episodes/${selectedEpisodeForTranscript}/transcript`, { 
        transcript: JSON.stringify(segments) 
      });
      
      if (!res.ok) {
        throw new Error("Failed to upload transcript");
      }

      subripUrlForm.reset();
      setSelectedEpisodeForTranscript("");
      toast({
        title: "Success",
        description: `Imported ${segments.length} segments from Omny.fm transcript`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to import transcript",
        variant: "destructive",
      });
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const onSubmitSubripImport = async (data: z.infer<typeof subrRipImportSchema>) => {
    if (!selectedEpisodeForTranscript) {
      toast({
        title: "Error",
        description: "Please select an episode first",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);
    try {
      const segments = parseSubRipToSegments(data.subrRipText);
      
      if (segments.length === 0) {
        toast({
          title: "Error",
          description: "No valid segments found in SubRip text. Check the format.",
          variant: "destructive",
        });
        setIsImporting(false);
        return;
      }

      const res = await apiRequest("POST", `/api/episodes/${selectedEpisodeForTranscript}/transcript`, { 
        transcript: JSON.stringify(segments) 
      });
      
      if (!res.ok) {
        throw new Error("Failed to upload transcript");
      }

      subripImportForm.reset();
      setSelectedEpisodeForTranscript("");
      toast({
        title: "Success",
        description: `Imported ${segments.length} segments from SubRip transcript`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to import transcript",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Debounced typeahead search for Podcast Index
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Don't search if query is too short
    if (podcastIndexSearch.trim().length < 2) {
      setPodcastIndexResults([]);
      return;
    }
    
    // Debounce search by 300ms
    searchTimeoutRef.current = setTimeout(() => {
      searchPodcastIndexDebounced(podcastIndexSearch);
    }, 300);
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [podcastIndexSearch]);
  
  // Internal search function (called by debounce)
  const searchPodcastIndexDebounced = async (query: string) => {
    if (!query.trim()) return;
    
    setIsSearchingPodcastIndex(true);
    try {
      const res = await apiRequest("GET", `/api/admin/podcast-index/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Search failed");
      }
      
      const data = await res.json();
      setPodcastIndexResults(data.podcasts || []);
      
      if (data.podcasts?.length === 0) {
        console.log("No podcasts found for query:", query);
      }
    } catch (error: any) {
      console.error("Podcast Index search error:", error);
      toast({
        title: "Search failed",
        description: error.message || "Failed to search Podcast Index",
        variant: "destructive",
      });
    } finally {
      setIsSearchingPodcastIndex(false);
    }
  };

  // Manual search function (for button click)
  const searchPodcastIndex = async () => {
    if (!podcastIndexSearch.trim()) {
      toast({
        title: "Error",
        description: "Please enter a search term",
        variant: "destructive",
      });
      return;
    }

    setIsSearchingPodcastIndex(true);
    try {
      const res = await apiRequest("GET", `/api/admin/podcast-index/search?q=${encodeURIComponent(podcastIndexSearch)}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Search failed");
      }
      const data = await res.json();
      setPodcastIndexResults(data.podcasts || []);
      if (data.podcasts?.length === 0) {
        toast({
          title: "No results",
          description: "No podcasts found for that search term",
        });
      }
    } catch (error: any) {
      toast({
        title: "Search failed",
        description: error.message || "Failed to search Podcast Index",
        variant: "destructive",
      });
    } finally {
      setIsSearchingPodcastIndex(false);
    }
  };

  // Import podcast from Podcast Index
  const importFromPodcastIndex = async (podcast: any) => {
    setIsImportingPodcast(true);
    try {
      const res = await apiRequest("POST", "/api/admin/podcast-index/import", {
        feedId: podcast.id,
        importEpisodes: true,
        maxEpisodes: maxEpisodesToImport,
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Import failed");
      }
      
      const data = await res.json();
      
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      
      const statusParts = [];
      if (data.isNewPodcast) {
        statusParts.push("Created new podcast");
      } else {
        statusParts.push("Found existing podcast");
      }
      statusParts.push(`${data.episodesImported} episodes imported`);
      if (data.episodesSkipped > 0) {
        statusParts.push(`${data.episodesSkipped} skipped (duplicates)`);
      }
      
      toast({
        title: "Import successful!",
        description: `${data.podcast.title}: ${statusParts.join(", ")}`,
      });
      
      // Only remove the podcast from results if all episodes were imported (no skips)
      if (data.episodesSkipped === 0 || data.episodesImported > 0) {
        setPodcastIndexResults(prev => prev.filter(p => p.id !== podcast.id));
        setPodcastIndexSearch("");
      }
      setSelectedPodcastForImport(null);
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import podcast",
        variant: "destructive",
      });
    } finally {
      setIsImportingPodcast(false);
    }
  };

  // Browse episodes from a Podcast Index podcast
  const browseEpisodesFromPodcastIndex = async (podcast: any) => {
    console.log("[BROWSE] Starting browse for podcast:", podcast.id, podcast.title);
    setSelectedPodcastForBrowsing(podcast);
    setIsLoadingEpisodes(true);
    setPodcastIndexEpisodes([]);
    
    try {
      const res = await apiRequest("GET", `/api/admin/podcast-index/episodes/${podcast.id}?max=50`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to load episodes");
      }
      
      const data = await res.json();
      console.log("[BROWSE] Received episodes:", data.episodes?.length || 0);
      setPodcastIndexEpisodes(data.episodes || []);
    } catch (error: any) {
      toast({
        title: "Failed to load episodes",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingEpisodes(false);
    }
  };

  // Import a single episode from Podcast Index and optionally start transcription
  const importSingleEpisode = async (episode: any, generateTranscript: boolean = false) => {
    if (!selectedPodcastForBrowsing) return;
    
    setImportingEpisodeId(episode.id.toString());
    
    try {
      // First, ensure the podcast exists in our system
      const importRes = await apiRequest("POST", "/api/admin/podcast-index/import", {
        feedId: selectedPodcastForBrowsing.id,
        importEpisodes: false, // Don't import all episodes
        maxEpisodes: 0,
      });
      
      if (!importRes.ok) {
        const error = await importRes.json();
        throw new Error(error.error || "Failed to import podcast");
      }
      
      const podcastData = await importRes.json();
      const podcastId = podcastData.podcast.id;
      
      // Create the episode
      const episodeRes = await apiRequest("POST", "/api/admin/episodes", {
        podcastId,
        title: episode.title,
        episodeNumber: 0,
        description: episode.description || "",
        publishedAt: episode.datePublished 
          ? new Date(episode.datePublished * 1000).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        duration: episode.duration || 0,
        type: episode.enclosureType?.includes("video") ? "video" : "audio",
        mediaUrl: episode.enclosureUrl || "",
      });
      
      if (!episodeRes.ok) {
        const error = await episodeRes.json();
        throw new Error(error.error || "Failed to create episode");
      }
      
      const newEpisode = await episodeRes.json();
      
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      
      toast({
        title: "Episode imported!",
        description: `"${episode.title}" has been added${generateTranscript ? ". Now select it in Transcripts tab to generate transcript." : ""}`,
      });
      
      if (generateTranscript && episode.enclosureUrl) {
        // Switch to transcripts tab and pre-select the episode
        setSelectedEpisodeForTranscript(newEpisode.id);
        audioUrlTranscriptForm.setValue("audioUrl", episode.enclosureUrl);
        setTranscriptMode("audio-url");
        
        toast({
          title: "Ready for transcription",
          description: "Episode selected. Click 'Start Transcription' in the Transcripts tab.",
        });
      }
      
      // Remove from the browse list
      setPodcastIndexEpisodes(prev => prev.filter(e => e.id !== episode.id));
      
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setImportingEpisodeId(null);
    }
  };

  // Copy audio URL to clipboard
  const copyAudioUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({
      title: "Copied!",
      description: "Audio URL copied to clipboard",
    });
  };

  if (authLoading) {
    return (
      <div className="container mx-auto py-8 px-4 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Shield className="h-12 w-12 text-muted-foreground" />
            </div>
            <CardTitle>Admin Access Required</CardTitle>
            <CardDescription>
              You need to be logged in to access the admin dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild data-testid="button-admin-login">
              <a href="/login">
                <LogIn className="h-4 w-4 mr-2" />
                Sign In
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-6xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2" data-testid="text-admin-title">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Manage podcasts, episodes, and transcripts
          </p>
        </div>

        <Tabs defaultValue="manage" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="manage" data-testid="tab-manage">
              <Users className="w-4 h-4 mr-2" />
              Content
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              <Shield className="w-4 h-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="podcast-index" data-testid="tab-podcast-index">
              <Search className="w-4 h-4 mr-2" />
              Discover
            </TabsTrigger>
            <TabsTrigger value="podcasts" data-testid="tab-podcasts">
              <PlusCircle className="w-4 h-4 mr-2" />
              Add Podcast
            </TabsTrigger>
            <TabsTrigger value="episodes" data-testid="tab-episodes">
              <Upload className="w-4 h-4 mr-2" />
              Add Episode
            </TabsTrigger>
            <TabsTrigger value="transcripts" data-testid="tab-transcripts">
              <Upload className="w-4 h-4 mr-2" />
              Transcripts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manage">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Existing Podcasts</CardTitle>
                  <CardDescription>
                    Manage your podcasts - edit or delete them
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {podcasts.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">No podcasts yet. Add one in the "Add Podcast" tab.</p>
                  ) : (
                    <div className="space-y-3">
                      {podcasts.map((podcast) => (
                        <div
                          key={podcast.id}
                          className="flex items-center justify-between p-4 border rounded-lg"
                          data-testid={`podcast-item-${podcast.id}`}
                        >
                          {editingPodcast?.id === podcast.id ? (
                            <div className="flex-1 space-y-3 mr-4">
                              <div className="flex items-start gap-4">
                                <div className="flex-shrink-0">
                                  <ImageUploader
                                    currentImageUrl={editingPodcast.artworkUrl || undefined}
                                    onUploadComplete={(url) => setEditingPodcast({ ...editingPodcast, artworkUrl: url })}
                                    buttonText="Change"
                                  />
                                </div>
                                <div className="flex-1 space-y-2">
                                  <Input
                                    value={editingPodcast.title}
                                    onChange={(e) => setEditingPodcast({ ...editingPodcast, title: e.target.value })}
                                    placeholder="Podcast title"
                                    data-testid="input-edit-podcast-title"
                                  />
                                  <Input
                                    value={editingPodcast.host}
                                    onChange={(e) => setEditingPodcast({ ...editingPodcast, host: e.target.value })}
                                    placeholder="Host name"
                                    data-testid="input-edit-podcast-host"
                                  />
                                  <Input
                                    value={editingPodcast.artworkUrl || ""}
                                    onChange={(e) => setEditingPodcast({ ...editingPodcast, artworkUrl: e.target.value })}
                                    placeholder="Or paste artwork URL"
                                    data-testid="input-edit-podcast-artwork"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    updatePodcastMutation.mutate({ 
                                      id: podcast.id, 
                                      data: {
                                        title: editingPodcast.title,
                                        host: editingPodcast.host,
                                        artworkUrl: editingPodcast.artworkUrl,
                                      }
                                    });
                                  }}
                                  disabled={updatePodcastMutation.isPending}
                                  data-testid="button-save-podcast"
                                >
                                  {updatePodcastMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingPodcast(null)}
                                  data-testid="button-cancel-edit-podcast"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-3">
                                {podcast.artworkUrl && (
                                  <img
                                    src={podcast.artworkUrl}
                                    alt={podcast.title}
                                    className="w-12 h-12 rounded object-cover"
                                  />
                                )}
                                <div>
                                  <h4 className="font-semibold">{podcast.title}</h4>
                                  <p className="text-sm text-muted-foreground">Host: {podcast.host}</p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingPodcast(podcast)}
                                  data-testid={`button-edit-podcast-${podcast.id}`}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      data-testid={`button-delete-podcast-${podcast.id}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Podcast?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently delete "{podcast.title}" and ALL its episodes, transcripts, and annotations. This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deletePodcastMutation.mutate(podcast.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>Existing Episodes</CardTitle>
                    <CardDescription>
                      Manage your episodes - edit or delete them
                    </CardDescription>
                  </div>
                  {allEpisodes.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isBulkSemanticRunning}
                      onClick={() => {
                        const episodeIds = allEpisodes.slice(0, 100).map(e => e.id);
                        bulkSemanticMutation.mutate({ episodeIds, force: false });
                      }}
                      data-testid="button-bulk-semantic-analyze"
                    >
                      {isBulkSemanticRunning ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Queueing...
                        </>
                      ) : (
                        <>
                          <Brain className="w-4 h-4 mr-2" />
                          Run Semantic (All)
                        </>
                      )}
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {allEpisodes.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">No episodes yet. Add one in the "Add Episode" tab.</p>
                  ) : (
                    <div className="space-y-3">
                      {allEpisodes.map((episode) => {
                        const podcast = podcasts.find(p => p.id === episode.podcastId);
                        return (
                          <div
                            key={episode.id}
                            className="flex items-center justify-between p-4 border rounded-lg"
                            data-testid={`episode-item-${episode.id}`}
                          >
                            {editingEpisode?.id === episode.id ? (
                              <div className="flex-1 space-y-2 mr-4">
                                <Input
                                  value={editingEpisode.title}
                                  onChange={(e) => setEditingEpisode({ ...editingEpisode, title: e.target.value })}
                                  placeholder="Episode title"
                                  data-testid="input-edit-episode-title"
                                />
                                <Input
                                  value={editingEpisode.mediaUrl}
                                  onChange={(e) => setEditingEpisode({ ...editingEpisode, mediaUrl: e.target.value })}
                                  placeholder="Media URL"
                                  data-testid="input-edit-episode-media-url"
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      updateEpisodeMutation.mutate({ 
                                        id: episode.id, 
                                        data: {
                                          title: editingEpisode.title,
                                          mediaUrl: editingEpisode.mediaUrl,
                                        }
                                      });
                                    }}
                                    disabled={updateEpisodeMutation.isPending}
                                    data-testid="button-save-episode"
                                  >
                                    {updateEpisodeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditingEpisode(null)}
                                    data-testid="button-cancel-edit-episode"
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div>
                                  <h4 className="font-semibold">{episode.title}</h4>
                                  <p className="text-sm text-muted-foreground">
                                    {podcast?.title || 'Unknown Podcast'} • {episode.type} • {Math.floor(episode.duration / 60)} min
                                  </p>
                                  <AdminEpisodeSemanticPanel episodeId={episode.id} />
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditingEpisode(episode)}
                                    data-testid={`button-edit-episode-${episode.id}`}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        data-testid={`button-delete-episode-${episode.id}`}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Episode?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This will permanently delete "{episode.title}" including its transcript and all annotations. This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => deleteEpisodeMutation.mutate(episode.id)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>
                  Manage user roles, certifications, and access
                </CardDescription>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : adminUsers.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No users found.</p>
                ) : (
                  <div className="space-y-4">
                    {/* Bulk actions bar */}
                    <div className="flex items-center justify-between gap-4 p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="select-all-users"
                          checked={selectedUsersForBulk.size === adminUsers.filter(u => u.id !== user?.id && u.role !== "admin").length && selectedUsersForBulk.size > 0}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              const selectableUsers = adminUsers.filter(u => u.id !== user?.id && u.role !== "admin").map(u => u.id);
                              setSelectedUsersForBulk(new Set(selectableUsers));
                            } else {
                              setSelectedUsersForBulk(new Set());
                            }
                          }}
                          data-testid="checkbox-select-all"
                        />
                        <label htmlFor="select-all-users" className="text-sm font-medium cursor-pointer">
                          Select All ({adminUsers.filter(u => u.id !== user?.id && u.role !== "admin").length} eligible)
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedUsersForBulk.size > 0 && (
                          <span className="text-sm text-muted-foreground">
                            {selectedUsersForBulk.size} selected
                          </span>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={selectedUsersForBulk.size === 0 || bulkDeleteUsersMutation.isPending}
                              data-testid="button-bulk-delete"
                            >
                              {bulkDeleteUsersMutation.isPending ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4 mr-2" />
                              )}
                              Delete Selected
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {selectedUsersForBulk.size} User(s)?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the selected users and all their data including annotations. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => bulkDeleteUsersMutation.mutate(Array.from(selectedUsersForBulk))}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete Users
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    {adminUsers.map((adminUser) => {
                      const isSelectable = adminUser.id !== user?.id && adminUser.role !== "admin";
                      const isSelected = selectedUsersForBulk.has(adminUser.id);
                      return (
                      <div
                        key={adminUser.id}
                        className={`p-4 border rounded-lg ${adminUser.isBanned ? 'border-destructive/50 bg-destructive/5' : ''} ${isSelected ? 'border-primary bg-primary/5' : ''}`}
                        data-testid={`user-item-${adminUser.id}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            {isSelectable ? (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => {
                                  const newSelected = new Set(selectedUsersForBulk);
                                  if (checked) {
                                    newSelected.add(adminUser.id);
                                  } else {
                                    newSelected.delete(adminUser.id);
                                  }
                                  setSelectedUsersForBulk(newSelected);
                                }}
                                data-testid={`checkbox-user-${adminUser.id}`}
                              />
                            ) : (
                              <div className="w-4 h-4" />
                            )}
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={adminUser.profileImageUrl || undefined} alt={adminUser.firstName || 'User'} />
                              <AvatarFallback>
                                {(adminUser.firstName?.[0] || adminUser.email?.[0] || 'U').toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">
                                  {adminUser.firstName && adminUser.lastName 
                                    ? `${adminUser.firstName} ${adminUser.lastName}` 
                                    : adminUser.email || 'Unknown User'}
                                </span>
                                {adminUser.isBanned && (
                                  <Badge variant="destructive" className="text-xs">
                                    <Ban className="w-3 h-3 mr-1" />
                                    Banned
                                  </Badge>
                                )}
                                {adminUser.role === "admin" && (
                                  <Badge variant="default" className="text-xs">
                                    <Crown className="w-3 h-3 mr-1" />
                                    Admin
                                  </Badge>
                                )}
                                {adminUser.role === "moderator" && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Shield className="w-3 h-3 mr-1" />
                                    Moderator
                                  </Badge>
                                )}
                                {adminUser.role === "contributor" && (
                                  <Badge variant="outline" className="text-xs">
                                    <Star className="w-3 h-3 mr-1" />
                                    Contributor
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">{adminUser.email}</p>
                              <p className="text-xs text-muted-foreground">
                                ID: {adminUser.id.slice(0, 8)}... | Joined: {adminUser.createdAt ? new Date(adminUser.createdAt).toLocaleDateString() : 'Unknown'}
                              </p>
                              {adminUser.certifications && adminUser.certifications.length > 0 && (
                                <div className="flex gap-1 mt-1">
                                  {adminUser.certifications.map((cert) => (
                                    <Badge key={cert} variant="outline" className="text-xs">
                                      <Award className="w-3 h-3 mr-1" />
                                      {cert.replace('_', ' ')}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {adminUser.isBanned && adminUser.banReason && (
                                <p className="text-xs text-destructive mt-1">
                                  Ban reason: {adminUser.banReason}
                                </p>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-2">
                            {/* Role selector */}
                            <Select
                              value={adminUser.role || "user"}
                              onValueChange={(role) => updateUserRoleMutation.mutate({ userId: adminUser.id, role })}
                              disabled={adminUser.id === user?.id || updateUserRoleMutation.isPending}
                            >
                              <SelectTrigger className="w-[140px]" data-testid={`select-role-${adminUser.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">User</SelectItem>
                                <SelectItem value="contributor">Contributor</SelectItem>
                                <SelectItem value="moderator">Moderator</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>

                            {/* Certifications */}
                            <div className="flex flex-wrap gap-1">
                              {["verified", "expert", "founding_member", "top_contributor"].map((cert) => {
                                const hasCert = adminUser.certifications?.includes(cert);
                                return (
                                  <Button
                                    key={cert}
                                    size="sm"
                                    variant={hasCert ? "default" : "outline"}
                                    className="text-xs h-7 px-2"
                                    onClick={() => {
                                      const newCerts = hasCert
                                        ? adminUser.certifications?.filter(c => c !== cert) || []
                                        : [...(adminUser.certifications || []), cert];
                                      updateUserCertificationsMutation.mutate({ userId: adminUser.id, certifications: newCerts });
                                    }}
                                    disabled={updateUserCertificationsMutation.isPending}
                                    data-testid={`cert-${cert}-${adminUser.id}`}
                                  >
                                    {cert.replace('_', ' ')}
                                  </Button>
                                );
                              })}
                            </div>

                            {/* Ban/Unban actions */}
                            {adminUser.id !== user?.id && (
                              adminUser.isBanned ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => unbanUserMutation.mutate(adminUser.id)}
                                  disabled={unbanUserMutation.isPending}
                                  data-testid={`button-unban-${adminUser.id}`}
                                >
                                  {unbanUserMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <>
                                      <CheckCircle className="w-4 h-4 mr-1" />
                                      Unban
                                    </>
                                  )}
                                </Button>
                              ) : (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      data-testid={`button-ban-${adminUser.id}`}
                                    >
                                      <Ban className="w-4 h-4 mr-1" />
                                      Ban User
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Ban User</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to ban {adminUser.firstName || adminUser.email}? 
                                        They will no longer be able to create or edit content.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <div className="py-4">
                                      <label className="text-sm font-medium">Ban Reason</label>
                                      <Input
                                        placeholder="Enter reason for ban..."
                                        value={selectedUserForAction === adminUser.id ? banReason : ""}
                                        onChange={(e) => {
                                          setSelectedUserForAction(adminUser.id);
                                          setBanReason(e.target.value);
                                        }}
                                        data-testid={`input-ban-reason-${adminUser.id}`}
                                      />
                                    </div>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel onClick={() => {
                                        setSelectedUserForAction(null);
                                        setBanReason("");
                                      }}>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => {
                                          if (selectedUserForAction === adminUser.id && banReason.trim()) {
                                            banUserMutation.mutate({ userId: adminUser.id, reason: banReason });
                                          }
                                        }}
                                        disabled={selectedUserForAction !== adminUser.id || !banReason.trim()}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Ban User
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="podcast-index">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PodcastIcon className="w-5 h-5" />
                  Discover Podcasts
                </CardTitle>
                <CardDescription>
                  Search and import podcasts from the Podcast Index database
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search for podcasts (e.g., 'Joe Rogan', 'Tech News')..."
                    value={podcastIndexSearch}
                    onChange={(e) => setPodcastIndexSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchPodcastIndex()}
                    className="flex-1"
                    data-testid="input-podcast-search"
                  />
                  <Button
                    onClick={searchPodcastIndex}
                    disabled={isSearchingPodcastIndex}
                    data-testid="button-search-podcasts"
                  >
                    {isSearchingPodcastIndex ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                {/* Episode browsing panel - shows when a podcast is selected */}
                {selectedPodcastForBrowsing && (
                  <Card className="border-primary/50 bg-primary/5">
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {selectedPodcastForBrowsing.artworkUrl && (
                            <img
                              src={selectedPodcastForBrowsing.artworkUrl}
                              alt={selectedPodcastForBrowsing.title}
                              className="w-12 h-12 rounded-lg object-cover"
                            />
                          )}
                          <div>
                            <h3 className="font-semibold">{selectedPodcastForBrowsing.title}</h3>
                            <p className="text-sm text-muted-foreground">
                              {isLoadingEpisodes ? "Loading episodes..." : `${podcastIndexEpisodes.length} episodes available`}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedPodcastForBrowsing(null);
                            setPodcastIndexEpisodes([]);
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {isLoadingEpisodes ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                          <span className="ml-2 text-muted-foreground">Loading episodes...</span>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                          {podcastIndexEpisodes.map((episode) => (
                            <div key={episode.id} className="p-3 bg-background rounded-lg border" data-testid={`episode-result-${episode.id}`}>
                              <div className="flex gap-4">
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-medium text-sm line-clamp-2">{episode.title}</h4>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                                    <span>{episode.datePublishedFormatted}</span>
                                    <span>{episode.durationFormatted}</span>
                                    {episode.hasTranscript && (
                                      <Badge variant="secondary" className="text-xs">
                                        <FileText className="w-3 h-3 mr-1" />
                                        Transcript Available
                                      </Badge>
                                    )}
                                  </div>
                                  
                                  {/* Audio URL info */}
                                  {episode.enclosureUrl && (
                                    <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
                                      <div className="flex items-center gap-2">
                                        <Music className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                        <span className="text-muted-foreground flex-shrink-0">Audio:</span>
                                        <code className="flex-1 truncate text-foreground">{episode.enclosureUrl}</code>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 flex-shrink-0"
                                          onClick={() => copyAudioUrl(episode.enclosureUrl)}
                                          data-testid={`button-copy-url-${episode.id}`}
                                        >
                                          <Copy className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Transcript URL info */}
                                  {episode.hasTranscript && episode.transcriptUrl && (
                                    <div className="mt-2 p-2 bg-primary/10 rounded text-xs">
                                      <div className="flex items-center gap-2">
                                        <FileText className="w-3 h-3 text-primary flex-shrink-0" />
                                        <span className="text-muted-foreground flex-shrink-0">Transcript:</span>
                                        <code className="flex-1 truncate text-foreground">{episode.transcriptUrl}</code>
                                        <Badge variant="outline" className="text-xs flex-shrink-0">
                                          {episode.transcriptType}
                                        </Badge>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                
                                <div className="flex flex-col gap-2 flex-shrink-0">
                                  <Button
                                    size="sm"
                                    onClick={() => importSingleEpisode(episode, true)}
                                    disabled={importingEpisodeId === episode.id.toString()}
                                    data-testid={`button-import-episode-${episode.id}`}
                                  >
                                    {importingEpisodeId === episode.id.toString() ? (
                                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                    ) : (
                                      <Download className="w-3 h-3 mr-1" />
                                    )}
                                    Import & Transcribe
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => importSingleEpisode(episode, false)}
                                    disabled={importingEpisodeId === episode.id.toString()}
                                  >
                                    <Download className="w-3 h-3 mr-1" />
                                    Import Only
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {podcastIndexResults.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">Search Results ({podcastIndexResults.length})</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Episodes to import:</span>
                        <Select
                          value={maxEpisodesToImport.toString()}
                          onValueChange={(v) => setMaxEpisodesToImport(parseInt(v))}
                        >
                          <SelectTrigger className="w-20" data-testid="select-max-episodes">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="5">5</SelectItem>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="20">20</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="grid gap-4">
                      {podcastIndexResults.map((podcast) => (
                        <Card key={podcast.id} className="overflow-hidden" data-testid={`podcast-result-${podcast.id}`}>
                          <div className="flex gap-4 p-4">
                            {podcast.artworkUrl && (
                              <img
                                src={podcast.artworkUrl}
                                alt={podcast.title}
                                className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold truncate">{podcast.title}</h4>
                              <p className="text-sm text-muted-foreground truncate">{podcast.author}</p>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {podcast.description?.slice(0, 150)}...
                              </p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                <span>{podcast.episodeCount || 0} episodes</span>
                              </div>
                            </div>
                            <div className="flex-shrink-0 flex flex-col gap-2">
                              <Button
                                onClick={() => browseEpisodesFromPodcastIndex(podcast)}
                                variant="outline"
                                disabled={isLoadingEpisodes}
                                data-testid={`button-browse-${podcast.id}`}
                              >
                                {isLoadingEpisodes && selectedPodcastForBrowsing?.id === podcast.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                  <List className="w-4 h-4 mr-2" />
                                )}
                                Browse Episodes
                              </Button>
                              <Button
                                onClick={() => importFromPodcastIndex(podcast)}
                                disabled={isImportingPodcast}
                                size="sm"
                                variant="ghost"
                                data-testid={`button-import-${podcast.id}`}
                              >
                                {isImportingPodcast ? (
                                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                  <Download className="w-4 h-4 mr-2" />
                                )}
                                Import All
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {podcastIndexResults.length === 0 && !isSearchingPodcastIndex && !selectedPodcastForBrowsing && (
                  <div className="text-center py-8 text-muted-foreground">
                    <PodcastIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Search for podcasts to discover and import them</p>
                    <p className="text-sm mt-2">
                      Powered by <a href="https://podcastindex.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Podcast Index</a>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="podcasts">
            <Card>
              <CardHeader>
                <CardTitle>Create New Podcast</CardTitle>
                <CardDescription>
                  Add a new podcast to the platform
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...podcastForm}>
                  <form onSubmit={podcastForm.handleSubmit(onSubmitPodcast)} className="space-y-4">
                    <FormField
                      control={podcastForm.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Podcast Title</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="The Joe Rogan Experience" 
                              {...field} 
                              data-testid="input-podcast-title"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={podcastForm.control}
                      name="host"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Host</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Joe Rogan" 
                              {...field} 
                              data-testid="input-podcast-host"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={podcastForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="A description of the podcast..." 
                              {...field} 
                              data-testid="input-podcast-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={podcastForm.control}
                      name="artworkUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Artwork</FormLabel>
                          <div className="space-y-3">
                            <ImageUploader
                              currentImageUrl={field.value}
                              onUploadComplete={(url) => field.onChange(url)}
                              buttonText="Upload Artwork"
                            />
                            <div className="relative">
                              <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                              </div>
                              <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-background px-2 text-muted-foreground">
                                  Or use URL
                                </span>
                              </div>
                            </div>
                            <FormControl>
                              <Input 
                                placeholder="https://example.com/artwork.jpg" 
                                {...field} 
                                data-testid="input-podcast-artwork"
                              />
                            </FormControl>
                          </div>
                          <FormDescription>
                            Upload an image or provide a URL to the podcast artwork
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button 
                      type="submit" 
                      disabled={createPodcastMutation.isPending}
                      data-testid="button-create-podcast"
                    >
                      {createPodcastMutation.isPending && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      Create Podcast
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="episodes">
            <Card>
              <CardHeader>
                <CardTitle>Create New Episode</CardTitle>
                <CardDescription>
                  Add a new episode to an existing podcast
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...episodeForm}>
                  <form onSubmit={episodeForm.handleSubmit(onSubmitEpisode)} className="space-y-4">
                    <FormField
                      control={episodeForm.control}
                      name="podcastId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Podcast</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-podcast">
                                <SelectValue placeholder="Select a podcast" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {podcasts.map((podcast) => (
                                <SelectItem key={podcast.id} value={podcast.id}>
                                  {podcast.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={episodeForm.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Episode Title</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="#123 - Guest Name" 
                              {...field} 
                              data-testid="input-episode-title"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={episodeForm.control}
                        name="episodeNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Episode Number (Optional)</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                placeholder="123" 
                                {...field} 
                                data-testid="input-episode-number"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={episodeForm.control}
                        name="duration"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Duration (seconds)</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                placeholder="3600" 
                                {...field} 
                                data-testid="input-episode-duration"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={episodeForm.control}
                        name="type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-episode-type">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="audio">Audio</SelectItem>
                                <SelectItem value="video">Video</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={episodeForm.control}
                        name="publishedAt"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Published Date</FormLabel>
                            <FormControl>
                              <Input 
                                type="date" 
                                {...field} 
                                data-testid="input-episode-date"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={episodeForm.control}
                      name="mediaUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Media URL (for transcription)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="https://example.com/episode.mp3" 
                              {...field} 
                              data-testid="input-episode-media"
                            />
                          </FormControl>
                          <FormDescription>
                            Direct link to audio file for AI transcription (.mp3, .m4a, etc.)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={episodeForm.control}
                      name="videoUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>YouTube URL (optional)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="https://www.youtube.com/watch?v=..." 
                              {...field} 
                              data-testid="input-episode-video-url"
                            />
                          </FormControl>
                          <FormDescription>
                            Optional YouTube video URL for video playback (transcript will still use Media URL above)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={episodeForm.control}
                      name="spotifyUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Spotify URL (optional)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="https://open.spotify.com/episode/..." 
                              {...field} 
                              data-testid="input-episode-spotify-url"
                            />
                          </FormControl>
                          <FormDescription>
                            Link to this episode on Spotify
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={episodeForm.control}
                      name="applePodcastsUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Apple Podcasts URL (optional)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="https://podcasts.apple.com/podcast/..." 
                              {...field} 
                              data-testid="input-episode-apple-podcasts-url"
                            />
                          </FormControl>
                          <FormDescription>
                            Link to this episode on Apple Podcasts
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={episodeForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Episode description..." 
                              {...field} 
                              data-testid="input-episode-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button 
                      type="submit" 
                      disabled={createEpisodeMutation.isPending}
                      data-testid="button-create-episode"
                    >
                      {createEpisodeMutation.isPending && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      Create Episode
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transcripts">
            <Card>
              <CardHeader>
                <CardTitle>Upload Transcript</CardTitle>
                <CardDescription>
                  AI-powered transcription with speaker identification, or manual JSON upload
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Select Episode</label>
                    {selectedEpisodeForTranscript && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteTranscriptMutation.mutate(selectedEpisodeForTranscript)}
                        disabled={deleteTranscriptMutation.isPending}
                        data-testid="button-delete-transcript"
                      >
                        {deleteTranscriptMutation.isPending && (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        )}
                        Delete Transcript
                      </Button>
                    )}
                  </div>
                  <Select 
                    value={selectedEpisodeForTranscript} 
                    onValueChange={setSelectedEpisodeForTranscript}
                  >
                    <SelectTrigger data-testid="select-episode-transcript">
                      <SelectValue placeholder="Select an episode" />
                    </SelectTrigger>
                    <SelectContent>
                      {allEpisodes.map((episode) => {
                        const podcast = podcasts.find(p => p.id === episode.podcastId);
                        return (
                          <SelectItem 
                            key={episode.id} 
                            value={episode.id}
                            data-testid={`option-episode-${episode.id}`}
                          >
                            {podcast?.title || 'Unknown'} - {episode.title}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <Tabs value={transcriptMode} onValueChange={(v) => setTranscriptMode(v as "manual" | "youtube" | "audio-url" | "import")} className="space-y-4">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="audio-url" data-testid="tab-audio-url">
                      From Audio URL
                    </TabsTrigger>
                    <TabsTrigger value="import" data-testid="tab-import">
                      Import SubRip
                    </TabsTrigger>
                    <TabsTrigger value="youtube" data-testid="tab-youtube">
                      From YouTube
                    </TabsTrigger>
                    <TabsTrigger value="manual" data-testid="tab-manual">
                      Manual JSON
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="audio-url">
                    <Form {...audioUrlTranscriptForm}>
                      <form onSubmit={audioUrlTranscriptForm.handleSubmit(onSubmitAudioUrlTranscript)} className="space-y-4">
                        <FormField
                          control={audioUrlTranscriptForm.control}
                          name="audioUrl"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Audio/Video URL</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="https://example.com/podcast-episode.mp3" 
                                  {...field} 
                                  data-testid="input-audio-url"
                                  disabled={transcribeAudioUrlMutation.isPending}
                                />
                              </FormControl>
                              <FormDescription>
                                Paste the direct link to the audio or video file (MP3, MP4, etc.)
                                <br />
                                <span className="text-muted-foreground/70">Gemini AI will transcribe it with speaker identification.</span>
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {transcriptionProgress && transcribeAudioUrlMutation.isPending && (
                          <div className="space-y-2 p-4 bg-muted/50 rounded-lg" data-testid="transcription-progress">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">{transcriptionProgress.message}</span>
                              <span className="text-muted-foreground">{transcriptionProgress.percentage}%</span>
                            </div>
                            <Progress value={transcriptionProgress.percentage} className="h-2" />
                            {transcriptionProgress.totalChunks && (
                              <p className="text-xs text-muted-foreground">
                                Chunk {transcriptionProgress.currentChunk || 0} of {transcriptionProgress.totalChunks}
                              </p>
                            )}
                          </div>
                        )}

                        <Button 
                          type="submit" 
                          disabled={transcribeAudioUrlMutation.isPending || !selectedEpisodeForTranscript}
                          data-testid="button-transcribe-audio-url"
                        >
                          {transcribeAudioUrlMutation.isPending && (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          )}
                          {transcribeAudioUrlMutation.isPending ? "Transcribing..." : "Transcribe with AI"}
                        </Button>
                      </form>
                    </Form>
                  </TabsContent>

                  <TabsContent value="import">
                    <div className="space-y-4">
                      <div className="flex gap-2 mb-4">
                        <Button
                          type="button"
                          variant={subripImportMode === "url" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSubripImportMode("url")}
                          data-testid="button-subrip-mode-url"
                        >
                          From URL
                        </Button>
                        <Button
                          type="button"
                          variant={subripImportMode === "paste" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSubripImportMode("paste")}
                          data-testid="button-subrip-mode-paste"
                        >
                          Paste Content
                        </Button>
                      </div>

                      {subripImportMode === "url" ? (
                        <Form {...subripUrlForm}>
                          <form onSubmit={subripUrlForm.handleSubmit(onSubmitSubripUrl)} className="space-y-4">
                            <FormField
                              control={subripUrlForm.control}
                              name="subrRipUrl"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Omny.fm Transcript URL</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="https://api.omny.fm/.../transcript?format=SubRip" 
                                      {...field} 
                                      data-testid="input-subrip-url"
                                      disabled={isFetchingUrl}
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    Paste the Omny.fm transcript URL (SubRip format).
                                    <br />
                                    <span className="text-muted-foreground/70">The URL should end with ?format=SubRip</span>
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <Button 
                              type="submit" 
                              disabled={isFetchingUrl || !selectedEpisodeForTranscript}
                              data-testid="button-fetch-subrip"
                            >
                              {isFetchingUrl && (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              )}
                              {isFetchingUrl ? "Fetching..." : "Fetch & Import"}
                            </Button>
                          </form>
                        </Form>
                      ) : (
                        <Form {...subripImportForm}>
                          <form onSubmit={subripImportForm.handleSubmit(onSubmitSubripImport)} className="space-y-4">
                            <FormField
                              control={subripImportForm.control}
                              name="subrRipText"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>SubRip Transcript (SRT Format)</FormLabel>
                                  <FormControl>
                                    <Textarea 
                                      placeholder={`1\n00:00:01,240 --> 00:00:10,200\nSpeaker 1: Hello everyone, welcome to the show.\n\n2\n00:00:10,280 --> 00:00:14,520\nSpeaker 2: Thanks for having me!`}
                                      className="font-mono text-sm min-h-[300px]"
                                      {...field} 
                                      data-testid="input-subrip-transcript"
                                      disabled={isImporting}
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    Paste SubRip (.srt) transcript from Omny.fm or other sources.
                                    <br />
                                    <span className="text-muted-foreground/70">Speaker labels like "Speaker 1:" will be automatically detected.</span>
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <Button 
                              type="submit" 
                              disabled={isImporting || !selectedEpisodeForTranscript}
                              data-testid="button-import-subrip"
                            >
                              {isImporting && (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              )}
                              {isImporting ? "Importing..." : "Import Transcript"}
                            </Button>
                          </form>
                        </Form>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="youtube">
                    <Form {...youtubeTranscriptForm}>
                      <form onSubmit={youtubeTranscriptForm.handleSubmit(onSubmitYoutubeTranscript)} className="space-y-4">
                        <FormField
                          control={youtubeTranscriptForm.control}
                          name="youtubeVideoId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>YouTube Video ID</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="jNQXAC9IVRw" 
                                  {...field} 
                                  data-testid="input-youtube-video-id"
                                />
                              </FormControl>
                              <FormDescription>
                                Enter the YouTube video ID. AI will download the audio and transcribe it.
                                <br />
                                <span className="text-destructive text-xs">Note: YouTube may block automated downloads. Use "From Audio URL" if this fails.</span>
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Button 
                          type="submit" 
                          disabled={uploadYoutubeTranscriptMutation.isPending || !selectedEpisodeForTranscript}
                          data-testid="button-fetch-youtube-transcript"
                        >
                          {uploadYoutubeTranscriptMutation.isPending && (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          )}
                          Transcribe from YouTube
                        </Button>
                      </form>
                    </Form>
                  </TabsContent>

                  <TabsContent value="manual">
                    <Form {...transcriptForm}>
                      <form onSubmit={transcriptForm.handleSubmit(onSubmitTranscript)} className="space-y-4">
                        <FormField
                          control={transcriptForm.control}
                          name="segments"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Transcript JSON</FormLabel>
                              <FormControl>
                                <Textarea 
                                  placeholder='[{"startTime": 0, "endTime": 10, "text": "Hello world", "speaker": "Host", "type": "speech"}]'
                                  className="font-mono text-sm min-h-[300px]"
                                  {...field} 
                                  data-testid="input-transcript-json"
                                />
                              </FormControl>
                              <FormDescription>
                                Paste transcript segments as JSON array. Each segment needs: startTime, endTime, text, speaker, type
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Button 
                          type="submit" 
                          disabled={uploadTranscriptMutation.isPending || !selectedEpisodeForTranscript}
                          data-testid="button-upload-transcript"
                        >
                          {uploadTranscriptMutation.isPending && (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          )}
                          Upload Transcript
                        </Button>
                      </form>
                    </Form>
                  </TabsContent>
                </Tabs>

                {selectedEpisodeForTranscript && speakers.length > 0 && (
                  <div className="mt-6 pt-6 border-t">
                    <div className="flex items-center gap-2 mb-4">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <h3 className="font-medium">Manage Speakers</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Rename generic speaker labels (e.g., "Guest 1") to actual names
                    </p>
                    <div className="space-y-2">
                      {speakers.map((speaker) => (
                        <div 
                          key={speaker.name}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-md"
                        >
                          {editingSpeaker === speaker.name ? (
                            <div className="flex items-center gap-2 flex-1">
                              <Input
                                value={newSpeakerName}
                                onChange={(e) => setNewSpeakerName(e.target.value)}
                                placeholder="Enter new name"
                                className="max-w-xs"
                                data-testid={`input-rename-speaker-${speaker.name}`}
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  if (newSpeakerName.trim()) {
                                    renameSpeakerMutation.mutate({
                                      oldName: speaker.name,
                                      newName: newSpeakerName.trim(),
                                    });
                                  }
                                }}
                                disabled={!newSpeakerName.trim() || renameSpeakerMutation.isPending}
                                data-testid={`button-confirm-rename-${speaker.name}`}
                              >
                                {renameSpeakerMutation.isPending ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Check className="w-4 h-4 text-green-600" />
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setEditingSpeaker(null);
                                  setNewSpeakerName("");
                                }}
                                data-testid={`button-cancel-rename-${speaker.name}`}
                              >
                                <X className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-3">
                                <span className="font-medium">{speaker.name}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {speaker.segmentCount} segments
                                </Badge>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setEditingSpeaker(speaker.name);
                                  setNewSpeakerName(speaker.name);
                                }}
                                data-testid={`button-edit-speaker-${speaker.name}`}
                              >
                                <Edit2 className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedEpisodeForTranscript && (
                  <div className="mt-6 pt-6 border-t">
                    <div className="flex items-center gap-2 mb-4">
                      <PlusCircle className="w-4 h-4 text-primary" />
                      <h3 className="font-medium">Generate AI Annotations</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Auto-generate expert annotations optimized for JBP content: Joe's rants, Ice's reactions, Ish's logic, Parks' fact-checks, viral moments, callbacks, and more.
                    </p>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Count:</span>
                        <Select 
                          value={annotationCount.toString()} 
                          onValueChange={(v) => setAnnotationCount(parseInt(v))}
                        >
                          <SelectTrigger className="w-20" data-testid="select-annotation-count">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3">3</SelectItem>
                            <SelectItem value="5">5</SelectItem>
                            <SelectItem value="7">7</SelectItem>
                            <SelectItem value="10">10</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        onClick={() => {
                          generateAnnotationsMutation.mutate({
                            episodeId: selectedEpisodeForTranscript,
                            count: annotationCount,
                          });
                        }}
                        disabled={isGeneratingAnnotations || !speakers.length}
                        data-testid="button-generate-annotations"
                      >
                        {isGeneratingAnnotations ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <PlusCircle className="w-4 h-4 mr-2" />
                            Generate Annotations
                          </>
                        )}
                      </Button>
                    </div>
                    {!speakers.length && (
                      <p className="text-sm text-amber-600 mt-2">
                        Generate a transcript first to enable AI annotations.
                      </p>
                    )}
                  </div>
                )}

                {selectedEpisodeForTranscript && (
                  <div className="mt-6 pt-6 border-t">
                    <div className="flex items-center gap-2 mb-4">
                      <Music className="w-4 h-4 text-primary" />
                      <h3 className="font-medium">Detect Music</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Scan the episode audio to identify songs playing. Detected music will appear in the transcript with Spotify and Apple Music links.
                    </p>
                    <Button
                      onClick={() => {
                        detectMusicMutation.mutate(selectedEpisodeForTranscript);
                      }}
                      disabled={isDetectingMusic}
                      data-testid="button-detect-music"
                    >
                      {isDetectingMusic ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Scanning Audio...
                        </>
                      ) : (
                        <>
                          <Music className="w-4 h-4 mr-2" />
                          Detect Music in Episode
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      Uses AudD API to identify songs. May take a few minutes for long episodes.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
