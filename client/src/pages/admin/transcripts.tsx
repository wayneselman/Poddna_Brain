import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Episode as BaseEpisode, Podcast, Job } from "@shared/schema";
import EpisodeSourcesManager from "@/components/admin/EpisodeSourcesManager";

interface Episode extends BaseEpisode {
  hasTranscript?: boolean;
}
import { 
  Loader2, 
  FileText, 
  Music,
  Wand2,
  Trash2,
  Edit2,
  Check,
  X,
  Play,
  Link as LinkIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ListPlus,
  Clock,
  CheckCircle2,
  XCircle,
  Pause,
  Headphones,
  Copy,
  ExternalLink,
  RotateCcw,
  Briefcase,
  Users,
  Sparkles,
  Scissors,
  Brain
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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

interface QueueJob {
  episodeId: string;
  episodeTitle: string;
  podcastTitle: string;
  audioUrl: string;
  status: "queued" | "processing" | "complete" | "error";
  progress: TranscriptionProgress | null;
  error?: string;
}

interface SpeakerSample {
  startTime: number;
  endTime: number;
  text: string;
}

interface SemanticStatus {
  hasSemanticSegments: boolean;
  semanticSegmentCount: number;
  jobStatus: "none" | "pending" | "running";
  hasTranscript: boolean;
}

interface Speaker {
  name: string;
  segmentCount: number;
  samples: SpeakerSample[];
}

const MAX_CONCURRENT_JOBS = 2;

export default function AdminTranscriptsPage() {
  const { toast } = useToast();
  
  // Collapsible section states
  const [speakersOpen, setSpeakersOpen] = useState(false);
  const [aiToolsOpen, setAiToolsOpen] = useState(false);
  const [clipToolOpen, setClipToolOpen] = useState(true);
  
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>("");
  const [transcriptMode, setTranscriptMode] = useState<"audio-url" | "youtube" | "manual">("audio-url");
  const [transcriptionProgress, setTranscriptionProgress] = useState<TranscriptionProgress | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [youtubeVideoId, setYoutubeVideoId] = useState("");
  const [manualTranscript, setManualTranscript] = useState("");
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [newSpeakerName, setNewSpeakerName] = useState("");
  const [annotationCount, setAnnotationCount] = useState(5);
  const [playingSpeaker, setPlayingSpeaker] = useState<string | null>(null);
  const [playingSampleIndex, setPlayingSampleIndex] = useState(0);
  const speakerAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isGeneratingAnnotations, setIsGeneratingAnnotations] = useState(false);
  const [isDetectingMusic, setIsDetectingMusic] = useState(false);
  const [isFetchingEmbeddedTranscript, setIsFetchingEmbeddedTranscript] = useState(false);
  const [isStartingAssemblyAI, setIsStartingAssemblyAI] = useState(false);
  const [speakersExpected, setSpeakersExpected] = useState<string>("auto");
  const [assemblyJobStatus, setAssemblyJobStatus] = useState<{
    jobId?: string;
    status: "none" | "pending" | "processing" | "completed" | "error";
    hasJob: boolean;
    error?: string;
  } | null>(null);
  const assemblyPollRef = useRef<NodeJS.Timeout | null>(null);
  const [transcribedPage, setTranscribedPage] = useState(1);
  const TRANSCRIBED_PAGE_SIZE = 9;
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // Clip creation state
  const [clipTitle, setClipTitle] = useState("");
  const [clipStartTime, setClipStartTime] = useState(0);
  const [clipEndTime, setClipEndTime] = useState(30);
  const [clipTranscriptText, setClipTranscriptText] = useState("");
  const [showClipPreview, setShowClipPreview] = useState(false);
  const [createdClipId, setCreatedClipId] = useState<string | null>(null);
  const clipAudioRef = useRef<HTMLAudioElement | null>(null);
  
  // Queue state for batch transcriptions
  const [transcriptionQueue, setTranscriptionQueue] = useState<QueueJob[]>([]);
  const [selectedForQueue, setSelectedForQueue] = useState<Set<string>>(new Set());
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());

  const { data: episodes = [], isLoading: episodesLoading } = useQuery<Episode[]>({
    queryKey: ["/api/episodes"],
  });

  const { data: podcasts = [] } = useQuery<Podcast[]>({
    queryKey: ["/api/podcasts"],
  });

  const { data: speakers = [] } = useQuery<Speaker[]>({
    queryKey: ["/api/episodes", selectedEpisodeId, "speakers"],
    enabled: !!selectedEpisodeId,
  });

  // Semantic analysis state
  const [isSemanticEnqueued, setIsSemanticEnqueued] = useState(false);
  
  const { data: semanticStatus } = useQuery<SemanticStatus>({
    queryKey: ["/api/admin/episodes", selectedEpisodeId, "semantic-status"],
    enabled: !!selectedEpisodeId,
    refetchInterval: isSemanticEnqueued ? 5000 : false,
  });

  // Reset enqueued state when job completes
  useEffect(() => {
    if (isSemanticEnqueued && semanticStatus?.jobStatus === "none") {
      setIsSemanticEnqueued(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/episodes", selectedEpisodeId, "semantic-status"] });
    }
  }, [isSemanticEnqueued, semanticStatus?.jobStatus, selectedEpisodeId]);

  const runSemanticMutation = useMutation({
    mutationFn: async ({ force }: { force: boolean }) => {
      const url = force 
        ? `/api/admin/episodes/${selectedEpisodeId}/semantic-analyze?force=true`
        : `/api/admin/episodes/${selectedEpisodeId}/semantic-analyze`;
      const res = await apiRequest("POST", url, {});
      return await res.json();
    },
    onSuccess: () => {
      setIsSemanticEnqueued(true);
      toast({
        title: "Semantic analysis enqueued",
        description: "The analysis job has been queued and will run shortly.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/episodes", selectedEpisodeId, "semantic-status"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to enqueue semantic analysis",
        variant: "destructive",
      });
    },
  });

  // Sync with background transcription jobs on mount
  const { data: backgroundJobs = [] } = useQuery<QueueJob[]>({
    queryKey: ["/api/transcription-jobs"],
    refetchInterval: 3000,
  });

  // Query persistent jobs from the database
  const [showJobsMonitor, setShowJobsMonitor] = useState(false);
  const { data: persistentJobs = [], isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/admin/jobs"],
    refetchInterval: showJobsMonitor ? 5000 : false,
  });

  // Retry job mutation
  const retryJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("POST", `/api/admin/jobs/${jobId}/retry`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Job retry scheduled" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to retry job", description: error.message, variant: "destructive" });
    },
  });

  // Cancel job mutation (for pending/running jobs)
  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("POST", `/api/admin/jobs/${jobId}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Job cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to cancel job", description: error.message, variant: "destructive" });
    },
  });

  // Delete job mutation (for done/error jobs)
  const deleteJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/jobs/${jobId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Job deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete job", description: error.message, variant: "destructive" });
    },
  });

  // Merge background jobs into local queue state
  useEffect(() => {
    if (backgroundJobs.length > 0) {
      setTranscriptionQueue(prev => {
        const existingIds = new Set(prev.map(j => j.episodeId));
        const newJobs = backgroundJobs
          .filter(job => !existingIds.has(job.episodeId) && (job.status === "processing" || job.status === "queued"))
          .map(job => ({
            episodeId: job.episodeId,
            episodeTitle: job.episodeTitle,
            podcastTitle: job.podcastTitle,
            audioUrl: job.audioUrl,
            status: job.status,
            progress: job.progress,
            error: job.error,
          }));
        
        if (newJobs.length > 0) {
          return [...prev, ...newJobs];
        }
        
        // Update existing job statuses from background
        return prev.map(localJob => {
          const bgJob = backgroundJobs.find(j => j.episodeId === localJob.episodeId);
          if (bgJob) {
            return {
              ...localJob,
              status: bgJob.status,
              progress: bgJob.progress,
              error: bgJob.error,
            };
          }
          return localJob;
        });
      });
    }
  }, [backgroundJobs]);

  // Check AssemblyAI job status for selected episode
  const checkAssemblyStatus = useCallback(async (episodeId: string) => {
    try {
      const res = await fetch(`/api/episodes/${episodeId}/transcript/assembly/status`);
      const data = await res.json();
      setAssemblyJobStatus(data);
      return data;
    } catch (error) {
      console.error("Failed to check AssemblyAI status:", error);
      return null;
    }
  }, []);

  // Poll AssemblyAI job status when selected episode changes
  useEffect(() => {
    if (assemblyPollRef.current) {
      clearInterval(assemblyPollRef.current);
      assemblyPollRef.current = null;
    }
    
    if (!selectedEpisodeId) {
      setAssemblyJobStatus(null);
      return;
    }

    // Initial check
    checkAssemblyStatus(selectedEpisodeId);

    // Poll every 5 seconds if job is in progress
    assemblyPollRef.current = setInterval(async () => {
      const status = await checkAssemblyStatus(selectedEpisodeId);
      if (status?.status === "completed") {
        // Auto-complete when job is done
        try {
          const completeRes = await apiRequest("POST", `/api/episodes/${selectedEpisodeId}/transcript/assembly/complete`, {});
          if (completeRes.ok) {
            const data = await completeRes.json();
            toast({
              title: "Transcription complete!",
              description: `Imported ${data.segmentCount} segments from AssemblyAI.`,
            });
            queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
            queryClient.invalidateQueries({ queryKey: ["/api/episodes", selectedEpisodeId, "speakers"] });
          }
        } catch (err) {
          console.error("Failed to complete AssemblyAI transcription:", err);
        }
        if (assemblyPollRef.current) {
          clearInterval(assemblyPollRef.current);
          assemblyPollRef.current = null;
        }
      } else if (status?.status === "error" || status?.status === "none") {
        if (assemblyPollRef.current) {
          clearInterval(assemblyPollRef.current);
          assemblyPollRef.current = null;
        }
      }
    }, 5000);

    return () => {
      if (assemblyPollRef.current) {
        clearInterval(assemblyPollRef.current);
      }
    };
  }, [selectedEpisodeId, checkAssemblyStatus, toast]);

  // Start AssemblyAI transcription
  const startAssemblyTranscription = async (episodeId: string) => {
    setIsStartingAssemblyAI(true);
    try {
      const body: { speakersExpected?: number } = {};
      if (speakersExpected !== "auto") {
        body.speakersExpected = parseInt(speakersExpected);
      }
      const res = await apiRequest("POST", `/api/episodes/${episodeId}/transcript/assembly`, body);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to start transcription");
      }
      const data = await res.json();
      setAssemblyJobStatus({
        jobId: data.jobId,
        status: "pending",
        hasJob: true,
      });
      toast({
        title: "Transcription started",
        description: "AssemblyAI is processing the audio. This may take a few minutes.",
      });
    } catch (error: any) {
      console.error("AssemblyAI start error:", error);
      toast({
        title: "Failed to start transcription",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsStartingAssemblyAI(false);
    }
  };

  const selectedEpisode = episodes.find(e => e.id === selectedEpisodeId);
  const getPodcastTitle = (podcastId: string) => podcasts.find(p => p.id === podcastId)?.title || "Unknown";

  const episodesWithoutTranscript = episodes.filter(e => !e.hasTranscript);
  const episodesWithTranscript = episodes.filter(e => e.hasTranscript);

  // Transcription mutations
  const transcribeAudioUrlMutation = useMutation({
    mutationFn: async ({ episodeId, audioUrl }: { episodeId: string; audioUrl: string }) => {
      setTranscriptionProgress({
        stage: "processing",
        percentage: 5,
        message: "Submitting to AssemblyAI..."
      });
      
      const res = await apiRequest("POST", `/api/episodes/${episodeId}/transcript/custom-url`, { audioUrl });
      return await res.json();
    },
    onSuccess: (data: any) => {
      setAudioUrl("");
      
      if (data.jobId) {
        // AssemblyAI async job - set status and polling will handle it
        setAssemblyJobStatus({
          jobId: data.jobId,
          status: "pending",
          hasJob: true,
        });
        setTranscriptionProgress({
          stage: "processing",
          percentage: 10,
          message: "AssemblyAI processing audio..."
        });
        toast({
          title: "Transcription job submitted",
          description: "AssemblyAI is processing the audio. This typically takes 2-5 minutes.",
        });
      } else {
        // Synchronous completion (shouldn't happen now but keeping for safety)
        setTranscriptionProgress(null);
        toast({
          title: "Transcription complete!",
          description: `${data.segmentCount || 0} segments with speaker identification.`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", selectedEpisodeId, "speakers"] });
    },
    onError: (error: Error) => {
      setTranscriptionProgress(null);
      toast({
        title: "Transcription failed",
        description: error.message || "Failed to transcribe audio",
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
      setYoutubeVideoId("");
      toast({
        title: "YouTube transcript imported!",
        description: `${data.segmentCount || 0} segments imported.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message || "Failed to fetch YouTube transcript",
        variant: "destructive",
      });
    },
  });

  const uploadManualTranscriptMutation = useMutation({
    mutationFn: async ({ episodeId, transcript }: { episodeId: string; transcript: string }) => {
      const res = await apiRequest("POST", `/api/episodes/${episodeId}/transcript`, { transcript });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to upload transcript");
      }
      return await res.json();
    },
    onSuccess: (data: any) => {
      setManualTranscript("");
      toast({
        title: "Transcript uploaded!",
        description: `Created ${data.segmentCount || 0} segments from manual transcript.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", selectedEpisodeId, "speakers"] });
    },
    onError: (error: Error) => {
      console.error("Manual transcript upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload transcript",
        variant: "destructive",
      });
    },
  });

  const deleteTranscriptMutation = useMutation({
    mutationFn: async (episodeId: string) => {
      const res = await apiRequest("DELETE", `/api/episodes/${episodeId}/transcript`);
      return await res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Transcript deleted",
        description: `${data.deletedCount || 0} segments removed.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete transcript",
        variant: "destructive",
      });
    },
  });

  const renameSpeakerMutation = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) => {
      const res = await apiRequest("PATCH", `/api/episodes/${selectedEpisodeId}/speakers/rename`, {
        oldName,
        newName,
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Speaker renamed",
        description: data.message || "Speaker renamed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", selectedEpisodeId, "speakers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", selectedEpisodeId, "segments"] });
      setEditingSpeaker(null);
      setNewSpeakerName("");
    },
    onError: (error: Error) => {
      toast({
        title: "Rename failed",
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
        podcastContext: "Podcast episode with insights and discussions."
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      setIsGeneratingAnnotations(false);
      toast({
        title: "AI Annotations Generated",
        description: `Successfully created ${data.count} expert annotations.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/annotations/trending"] });
    },
    onError: (error: Error) => {
      setIsGeneratingAnnotations(false);
      toast({
        title: "Generation failed",
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
    },
    onError: (error: Error) => {
      setIsDetectingMusic(false);
      toast({
        title: "Detection failed",
        description: error.message || "Failed to detect music",
        variant: "destructive",
      });
    },
  });

  // Clip creation mutation
  const createClipMutation = useMutation({
    mutationFn: async (data: { 
      episodeId: string; 
      title: string; 
      startTime: number; 
      endTime: number; 
      transcriptText?: string; 
    }) => {
      const res = await apiRequest("POST", `/api/episodes/${data.episodeId}/clips`, {
        title: data.title,
        startTime: data.startTime,
        endTime: data.endTime,
        transcriptText: data.transcriptText,
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      setCreatedClipId(data.id);
      setShowClipPreview(true);
      toast({
        title: "Clip Created!",
        description: "Your audio clip has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", selectedEpisodeId, "clips"] });
      // Reset form
      setClipTitle("");
      setClipStartTime(0);
      setClipEndTime(30);
      setClipTranscriptText("");
    },
    onError: (error: Error) => {
      toast({
        title: "Clip creation failed",
        description: error.message || "Failed to create clip",
        variant: "destructive",
      });
    },
  });

  const handleStartTranscription = () => {
    if (!selectedEpisodeId) return;
    
    if (transcriptMode === "audio-url" && audioUrl) {
      transcribeAudioUrlMutation.mutate({ episodeId: selectedEpisodeId, audioUrl });
    } else if (transcriptMode === "youtube" && youtubeVideoId) {
      uploadYoutubeTranscriptMutation.mutate({ episodeId: selectedEpisodeId, youtubeVideoId });
    } else if (transcriptMode === "manual" && manualTranscript) {
      uploadManualTranscriptMutation.mutate({ episodeId: selectedEpisodeId, transcript: manualTranscript });
    }
  };

  // Ref to track timeout for auto-stopping playback
  const playbackTimeoutRef = useRef<number | null>(null);
  
  // Play a speaker's audio sample to help identify them
  const playSpeakerSample = (speaker: Speaker, sampleIndex: number = 0) => {
    if (!selectedEpisode?.mediaUrl || !speaker.samples[sampleIndex]) return;
    
    const sample = speaker.samples[sampleIndex];
    
    // Clear any existing timeout
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }
    
    // If already playing this exact sample, stop
    if (playingSpeaker === speaker.name && playingSampleIndex === sampleIndex && speakerAudioRef.current) {
      speakerAudioRef.current.pause();
      setPlayingSpeaker(null);
      setPlayingSampleIndex(0);
      return;
    }
    
    // Stop any existing playback
    if (speakerAudioRef.current) {
      speakerAudioRef.current.pause();
    }
    
    // Create audio element if needed
    if (!speakerAudioRef.current) {
      speakerAudioRef.current = new Audio();
    }
    
    const audio = speakerAudioRef.current;
    
    // Remove old event listeners by replacing with fresh ones
    audio.onpause = null;
    audio.onended = null;
    audio.onerror = null;
    
    // Set up new playback
    audio.src = selectedEpisode.mediaUrl;
    audio.currentTime = sample.startTime;
    
    setPlayingSpeaker(speaker.name);
    setPlayingSampleIndex(sampleIndex);
    
    // Play for the duration of the sample (max 8 seconds, min 1 second)
    const rawDuration = sample.endTime - sample.startTime;
    const duration = Math.max(1, Math.min(rawDuration > 0 ? rawDuration : 5, 8));
    
    // Set up event handlers (single assignment, not additive)
    const cleanupPlayback = () => {
      if (playbackTimeoutRef.current) {
        clearTimeout(playbackTimeoutRef.current);
        playbackTimeoutRef.current = null;
      }
      setPlayingSpeaker(null);
      setPlayingSampleIndex(0);
    };
    
    audio.onpause = cleanupPlayback;
    audio.onended = cleanupPlayback;
    audio.onerror = cleanupPlayback;
    
    audio.play().catch(err => {
      console.error("Failed to play audio:", err);
      cleanupPlayback();
    });
    
    // Auto-stop after duration
    playbackTimeoutRef.current = window.setTimeout(() => {
      if (speakerAudioRef.current) {
        speakerAudioRef.current.pause();
      }
    }, duration * 1000);
  };

  // Cleanup speaker audio on unmount or episode change
  useEffect(() => {
    return () => {
      if (playbackTimeoutRef.current) {
        clearTimeout(playbackTimeoutRef.current);
        playbackTimeoutRef.current = null;
      }
      if (speakerAudioRef.current) {
        speakerAudioRef.current.pause();
        speakerAudioRef.current = null;
      }
      setPlayingSpeaker(null);
      setPlayingSampleIndex(0);
    };
  }, [selectedEpisodeId]);

  // Toggle episode selection for batch queue
  const toggleEpisodeSelection = (episodeId: string) => {
    setSelectedForQueue(prev => {
      const next = new Set(prev);
      if (next.has(episodeId)) {
        next.delete(episodeId);
      } else {
        next.add(episodeId);
      }
      return next;
    });
  };

  // Cleanup EventSources on unmount
  useEffect(() => {
    return () => {
      eventSourcesRef.current.forEach(es => es.close());
      eventSourcesRef.current.clear();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // Process a single transcription job
  const processJob = useCallback(async (job: QueueJob, onComplete: () => void) => {
    const eventSource = new EventSource(`/api/episodes/${job.episodeId}/transcript/progress`);
    eventSourcesRef.current.set(job.episodeId, eventSource);

    eventSource.onmessage = (event) => {
      try {
        const progress = JSON.parse(event.data) as TranscriptionProgress;
        setTranscriptionQueue(prev => 
          prev.map(j => j.episodeId === job.episodeId ? { ...j, progress } : j)
        );
      } catch (e) {
        console.error("Failed to parse progress:", e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      eventSourcesRef.current.delete(job.episodeId);
    };

    try {
      const res = await apiRequest("POST", `/api/episodes/${job.episodeId}/transcript/custom-url`, { 
        audioUrl: job.audioUrl 
      });
      const data = await res.json();
      
      eventSource.close();
      eventSourcesRef.current.delete(job.episodeId);
      
      setTranscriptionQueue(prev => 
        prev.map(j => j.episodeId === job.episodeId 
          ? { ...j, status: "complete" as const, progress: { stage: "complete" as const, percentage: 100, message: `${data.segmentCount} segments` } } 
          : j
        )
      );
      
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
    } catch (error) {
      eventSource.close();
      eventSourcesRef.current.delete(job.episodeId);
      
      setTranscriptionQueue(prev => 
        prev.map(j => j.episodeId === job.episodeId 
          ? { ...j, status: "error" as const, error: error instanceof Error ? error.message : "Failed" } 
          : j
        )
      );
    } finally {
      // Always call onComplete to process more queued jobs
      onComplete();
    }
  }, []);

  // Start processing the queue - use a ref to avoid stale closure issues
  const processNextJobs = useCallback(() => {
    setTranscriptionQueue(prev => {
      const queuedJobs = prev.filter(j => j.status === "queued");
      const processingJobs = prev.filter(j => j.status === "processing");
      const slotsAvailable = MAX_CONCURRENT_JOBS - processingJobs.length;
      
      if (slotsAvailable <= 0 || queuedJobs.length === 0) {
        return prev;
      }
      
      const jobsToStart = queuedJobs.slice(0, slotsAvailable);
      
      // Start processing each job
      jobsToStart.forEach(job => {
        processJob(job, () => {
          // Schedule next batch after a small delay
          setTimeout(processNextJobs, 100);
        });
      });
      
      // Update status to processing
      return prev.map(j => 
        jobsToStart.some(toStart => toStart.episodeId === j.episodeId) 
          ? { ...j, status: "processing" as const } 
          : j
      );
    });
  }, [processJob]);

  // Add selected episodes to the queue and start processing
  const addToQueueAndStart = () => {
    const newJobs: QueueJob[] = [];
    
    Array.from(selectedForQueue).forEach(episodeId => {
      const episode = episodes.find(e => e.id === episodeId);
      if (!episode || !episode.mediaUrl) return;
      if (transcriptionQueue.some(j => j.episodeId === episodeId)) return;
      
      newJobs.push({
        episodeId,
        episodeTitle: episode.title,
        podcastTitle: getPodcastTitle(episode.podcastId),
        audioUrl: episode.mediaUrl,
        status: "queued",
        progress: null,
      });
    });
    
    if (newJobs.length === 0) {
      toast({
        title: "No episodes to add",
        description: "Selected episodes either have no audio URL or are already in the queue.",
        variant: "destructive",
      });
      return;
    }
    
    setTranscriptionQueue(prev => [...prev, ...newJobs]);
    setSelectedForQueue(new Set());
    
    toast({
      title: "Episodes added to queue",
      description: `${newJobs.length} episode(s) queued for transcription.`,
    });
    
    // Start processing immediately
    setTimeout(processNextJobs, 100);
  };

  // Remove a job from the queue
  const removeFromQueue = (episodeId: string) => {
    const eventSource = eventSourcesRef.current.get(episodeId);
    if (eventSource) {
      eventSource.close();
      eventSourcesRef.current.delete(episodeId);
    }
    setTranscriptionQueue(prev => prev.filter(j => j.episodeId !== episodeId));
  };

  // Clear completed/errored jobs
  const clearFinishedJobs = () => {
    setTranscriptionQueue(prev => prev.filter(j => j.status === "queued" || j.status === "processing"));
  };

  const activeQueueJobs = transcriptionQueue.filter(j => j.status === "processing" || j.status === "queued");
  const finishedQueueJobs = transcriptionQueue.filter(j => j.status === "complete" || j.status === "error");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-transcripts-title">Transcript Lab</h1>
          <p className="text-muted-foreground mt-1">
            Generate, manage, and enhance episode transcripts
          </p>
        </div>
        <Button
          variant={showJobsMonitor ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowJobsMonitor(!showJobsMonitor)}
          data-testid="button-toggle-jobs-monitor"
        >
          <Briefcase className="w-4 h-4 mr-2" />
          Jobs Monitor
          {persistentJobs.filter(j => j.status === "running" || j.status === "pending").length > 0 && (
            <Badge variant="default" className="ml-2">
              {persistentJobs.filter(j => j.status === "running" || j.status === "pending").length}
            </Badge>
          )}
        </Button>
      </div>

      {/* Jobs Monitor Section */}
      {showJobsMonitor && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              Background Jobs
              {jobsLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            </CardTitle>
            <CardDescription>
              Persistent job tracking for transcription and video analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            {persistentJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs found</p>
            ) : (
              <div className="space-y-2">
                {persistentJobs.slice(0, 10).map((job) => (
                  <div 
                    key={job.id}
                    className={`p-3 rounded-lg border ${
                      job.status === "running" ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" :
                      job.status === "done" ? "border-green-500 bg-green-50 dark:bg-green-900/20" :
                      job.status === "error" ? "border-red-500 bg-red-50 dark:bg-red-900/20" :
                      "border-muted bg-muted/50"
                    }`}
                    data-testid={`job-row-${job.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {job.status === "pending" && <Clock className="w-4 h-4 text-muted-foreground shrink-0" />}
                        {job.status === "running" && <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />}
                        {job.status === "done" && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                        {job.status === "error" && <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {job.type === "transcribe" ? "Transcription" : 
                             job.type === "video_analysis" ? "Video Analysis" : 
                             job.type === "annotate" ? "Auto-Annotation" : job.type}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Source: {job.episodeSourceId?.slice(0, 8)}... | Attempts: {job.attempts}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge 
                          variant={
                            job.status === "done" ? "default" :
                            job.status === "error" ? "destructive" :
                            job.status === "running" ? "secondary" :
                            "outline"
                          }
                        >
                          {job.status}
                        </Badge>
                        {/* Cancel button for pending/running jobs */}
                        {(job.status === "pending" || job.status === "running") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                            onClick={() => cancelJobMutation.mutate(job.id)}
                            disabled={cancelJobMutation.isPending}
                            title="Cancel job"
                            data-testid={`button-cancel-job-${job.id}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {/* Retry button for error jobs */}
                        {job.status === "error" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => retryJobMutation.mutate(job.id)}
                            disabled={retryJobMutation.isPending}
                            title="Retry job"
                            data-testid={`button-retry-job-${job.id}`}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {/* Delete button for done/error jobs */}
                        {(job.status === "done" || job.status === "error") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => deleteJobMutation.mutate(job.id)}
                            disabled={deleteJobMutation.isPending}
                            title="Delete job"
                            data-testid={`button-delete-job-${job.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {job.status === "error" && job.lastError && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-2 truncate">
                        {job.lastError}
                      </p>
                    )}
                    {job.createdAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Created: {new Date(job.createdAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                ))}
                {persistentJobs.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    Showing 10 of {persistentJobs.length} jobs
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Active Transcription Queue */}
      {transcriptionQueue.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Loader2 className={`w-5 h-5 ${activeQueueJobs.length > 0 ? 'animate-spin' : ''}`} />
                Transcription Queue
                {activeQueueJobs.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {activeQueueJobs.filter(j => j.status === "processing").length} processing
                  </Badge>
                )}
              </CardTitle>
              {finishedQueueJobs.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFinishedJobs}>
                  Clear finished
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {transcriptionQueue.map((job) => (
              <div 
                key={job.episodeId}
                className={`p-3 rounded-lg border ${
                  job.status === "processing" ? "border-primary bg-background" :
                  job.status === "complete" ? "border-green-500 bg-green-50 dark:bg-green-900/20" :
                  job.status === "error" ? "border-red-500 bg-red-50 dark:bg-red-900/20" :
                  "border-muted bg-muted/50"
                }`}
                data-testid={`queue-job-${job.episodeId}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {job.status === "queued" && <Clock className="w-4 h-4 text-muted-foreground" />}
                      {job.status === "processing" && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                      {job.status === "complete" && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                      {job.status === "error" && <XCircle className="w-4 h-4 text-red-600" />}
                      <p className="font-medium text-sm truncate">{job.episodeTitle}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{job.podcastTitle}</p>
                    
                    {job.status === "processing" && job.progress && (
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span>{job.progress.message}</span>
                          <span>{job.progress.percentage}%</span>
                        </div>
                        <Progress value={job.progress.percentage} className="h-1.5" />
                        {job.progress.currentChunk && job.progress.totalChunks && (
                          <p className="text-xs text-muted-foreground">
                            Chunk {job.progress.currentChunk} of {job.progress.totalChunks}
                          </p>
                        )}
                      </div>
                    )}
                    
                    {job.status === "complete" && job.progress && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        {job.progress.message}
                      </p>
                    )}
                    
                    {job.status === "error" && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {job.error || "Transcription failed"}
                      </p>
                    )}
                  </div>
                  
                  {job.status !== "processing" && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 shrink-0"
                      onClick={() => removeFromQueue(job.episodeId)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Episode queue */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Episodes Queue
            </CardTitle>
            <CardDescription>
              {episodesWithoutTranscript.length} need transcripts
              {selectedForQueue.size > 0 && ` • ${selectedForQueue.size} selected`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Batch actions */}
            {selectedForQueue.size > 0 && (
              <Button 
                className="w-full" 
                onClick={addToQueueAndStart}
                data-testid="button-add-to-queue"
              >
                <ListPlus className="w-4 h-4 mr-2" />
                Add {selectedForQueue.size} to Transcription Queue
              </Button>
            )}
            
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {episodesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : episodesWithoutTranscript.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">All episodes transcribed!</p>
              ) : (
                episodesWithoutTranscript.map((episode) => (
                  <div
                    key={episode.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                      selectedEpisodeId === episode.id 
                        ? "border-primary bg-primary/5" 
                        : "hover:bg-muted/50"
                    }`}
                    data-testid={`episode-queue-item-${episode.id}`}
                  >
                    {episode.mediaUrl && (
                      <Checkbox
                        checked={selectedForQueue.has(episode.id)}
                        onCheckedChange={() => toggleEpisodeSelection(episode.id)}
                        className="mt-1"
                        data-testid={`checkbox-episode-${episode.id}`}
                      />
                    )}
                    <button
                      onClick={() => {
                        setSelectedEpisodeId(episode.id);
                        if (episode.mediaUrl) {
                          setAudioUrl(episode.mediaUrl);
                        }
                      }}
                      className="flex-1 text-left"
                    >
                      <p className="font-medium text-sm line-clamp-1">{episode.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {getPodcastTitle(episode.podcastId)}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {episode.transcriptUrl && (
                          <Badge variant="default" className="text-xs bg-green-600">
                            <FileText className="w-3 h-3 mr-1" />
                            Has transcript file
                          </Badge>
                        )}
                        {episode.mediaUrl && (
                          <Badge variant="outline" className="text-xs">
                            <Music className="w-3 h-3 mr-1" />
                            Has audio
                          </Badge>
                        )}
                        {!episode.mediaUrl && (
                          <Badge variant="secondary" className="text-xs">
                            No audio URL
                          </Badge>
                        )}
                      </div>
                    </button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Transcription panel */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              {selectedEpisode ? selectedEpisode.title : "Select an Episode"}
            </CardTitle>
            <CardDescription>
              {selectedEpisode 
                ? `${getPodcastTitle(selectedEpisode.podcastId)} • ${Math.floor(selectedEpisode.duration / 60)}m`
                : "Choose an episode from the queue to start transcription"
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedEpisode ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Select an episode to generate or manage its transcript</p>
              </div>
            ) : selectedEpisode.hasTranscript ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-green-600" />
                    <span className="font-medium text-green-700 dark:text-green-400">
                      Transcript Available
                    </span>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Transcript?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the transcript and all associated segments.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteTranscriptMutation.mutate(selectedEpisode.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* Media Sources management */}
                <EpisodeSourcesManager
                  episodeId={selectedEpisode.id}
                  episodeTitle={selectedEpisode.title}
                />

                {/* Speaker management with audio preview - Collapsible */}
                {speakers.length > 0 && (
                  <Collapsible open={speakersOpen} onOpenChange={setSpeakersOpen}>
                    <Card>
                      <CollapsibleTrigger asChild>
                        <CardHeader className="py-3 cursor-pointer hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              Speakers
                              <Badge variant="secondary" className="text-xs font-normal">
                                {speakers.length}
                              </Badge>
                            </CardTitle>
                            <div className="flex items-center gap-2">
                              {selectedEpisode.mediaUrl && (
                                <span className="text-xs text-muted-foreground">
                                  Click to manage
                                </span>
                              )}
                              {speakersOpen ? (
                                <ChevronUp className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="space-y-2 pt-0">
                          {speakers.map((speaker) => (
                            <div 
                              key={speaker.name}
                              className={`p-2 rounded-lg border transition-colors ${
                                playingSpeaker === speaker.name 
                                  ? "border-primary bg-primary/5" 
                                  : "hover:bg-muted/50"
                              }`}
                              data-testid={`speaker-item-${speaker.name}`}
                            >
                              {editingSpeaker === speaker.name ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={newSpeakerName}
                                    onChange={(e) => setNewSpeakerName(e.target.value)}
                                    placeholder="Enter speaker name"
                                    className="h-8 flex-1"
                                    data-testid="input-speaker-name"
                                  />
                                  <Button
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => renameSpeakerMutation.mutate({
                                      oldName: speaker.name,
                                      newName: newSpeakerName,
                                    })}
                                    disabled={!newSpeakerName || renameSpeakerMutation.isPending}
                                    data-testid="button-confirm-rename"
                                  >
                                    <Check className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    onClick={() => {
                                      setEditingSpeaker(null);
                                      setNewSpeakerName("");
                                    }}
                                    data-testid="button-cancel-rename"
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {selectedEpisode.mediaUrl && speaker.samples?.length > 0 && (
                                      <Button
                                        size="icon"
                                        variant={playingSpeaker === speaker.name ? "default" : "ghost"}
                                        className="h-7 w-7 shrink-0"
                                        onClick={() => playSpeakerSample(speaker, 0)}
                                        data-testid={`button-play-speaker-${speaker.name}`}
                                      >
                                        {playingSpeaker === speaker.name ? (
                                          <Pause className="w-3 h-3" />
                                        ) : (
                                          <Play className="w-3 h-3" />
                                        )}
                                      </Button>
                                    )}
                                    <span className="font-medium text-sm truncate">{speaker.name}</span>
                                    <Badge variant="outline" className="text-xs shrink-0">
                                      {speaker.segmentCount}
                                    </Badge>
                                  </div>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 shrink-0"
                                    onClick={() => {
                                      setEditingSpeaker(speaker.name);
                                      setNewSpeakerName(speaker.name);
                                    }}
                                    data-testid={`button-edit-speaker-${speaker.name}`}
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                )}

                {/* AI Enhancement tools - Collapsible */}
                <Collapsible open={aiToolsOpen} onOpenChange={setAiToolsOpen}>
                  <Card>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="py-3 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Sparkles className="w-4 h-4" />
                            AI Tools
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              Annotations & Music
                            </span>
                            {aiToolsOpen ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="p-3 rounded-lg border bg-muted/30">
                            <div className="flex items-center gap-2 mb-2">
                              <Wand2 className="w-4 h-4 text-primary" />
                              <span className="text-sm font-medium">AI Annotations</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={1}
                                max={20}
                                value={annotationCount}
                                onChange={(e) => setAnnotationCount(parseInt(e.target.value) || 5)}
                                className="w-16 h-8"
                              />
                              <Button
                                size="sm"
                                className="flex-1"
                                onClick={() => {
                                  if (!selectedEpisode?.id) return;
                                  generateAnnotationsMutation.mutate({
                                    episodeId: selectedEpisode.id,
                                    count: annotationCount,
                                  });
                                }}
                                disabled={isGeneratingAnnotations}
                                data-testid="button-generate-annotations"
                              >
                                {isGeneratingAnnotations ? (
                                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                ) : (
                                  <Wand2 className="w-3 h-3 mr-1" />
                                )}
                                Generate
                              </Button>
                            </div>
                          </div>

                          <div className="p-3 rounded-lg border bg-muted/30">
                            <div className="flex items-center gap-2 mb-2">
                              <Music className="w-4 h-4 text-primary" />
                              <span className="text-sm font-medium">Music Detection</span>
                            </div>
                            <Button
                              size="sm"
                              className="w-full"
                              onClick={() => detectMusicMutation.mutate(selectedEpisode.id)}
                              disabled={isDetectingMusic}
                            >
                              {isDetectingMusic ? (
                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                              ) : (
                                <Music className="w-3 h-3 mr-1" />
                              )}
                              Detect Songs
                            </Button>
                          </div>

                          <div className="p-3 rounded-lg border bg-muted/30">
                            <div className="flex items-center gap-2 mb-2">
                              <Brain className="w-4 h-4 text-primary" />
                              <span className="text-sm font-medium">Semantic Analysis</span>
                              {semanticStatus?.hasSemanticSegments && (
                                <Badge variant="outline" className="text-xs">
                                  {semanticStatus.semanticSegmentCount} segments
                                </Badge>
                              )}
                            </div>
                            {semanticStatus?.hasTranscript ? (
                              <Button
                                size="sm"
                                className="w-full"
                                onClick={() => runSemanticMutation.mutate({ 
                                  force: semanticStatus?.hasSemanticSegments || false 
                                })}
                                disabled={
                                  runSemanticMutation.isPending || 
                                  isSemanticEnqueued || 
                                  semanticStatus?.jobStatus === "pending" || 
                                  semanticStatus?.jobStatus === "running"
                                }
                                data-testid="button-semantic-analyze"
                              >
                                {runSemanticMutation.isPending || isSemanticEnqueued ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                    Enqueued...
                                  </>
                                ) : semanticStatus?.jobStatus === "running" ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                    Running...
                                  </>
                                ) : semanticStatus?.jobStatus === "pending" ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                    Pending...
                                  </>
                                ) : semanticStatus?.hasSemanticSegments ? (
                                  <>
                                    <Brain className="w-3 h-3 mr-1" />
                                    Re-run
                                  </>
                                ) : (
                                  <>
                                    <Brain className="w-3 h-3 mr-1" />
                                    Analyze
                                  </>
                                )}
                              </Button>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">
                                Transcript required
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>

                {/* Clip Creation Tool - Collapsible */}
                <Collapsible open={clipToolOpen} onOpenChange={setClipToolOpen}>
                  <Card>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="py-3 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Scissors className="w-4 h-4" />
                              Create Audio Clip
                            </CardTitle>
                            <CardDescription className="text-xs mt-1">
                              Create shareable TikTok-style audio clips
                            </CardDescription>
                          </div>
                          {clipToolOpen ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="space-y-4 pt-0">
                        <div>
                          <label className="text-sm font-medium">Clip Quote/Title</label>
                          <Textarea
                            value={clipTitle}
                            onChange={(e) => setClipTitle(e.target.value)}
                            placeholder="Enter the quote or title for this clip..."
                            className="mt-1 min-h-[60px]"
                            data-testid="input-clip-title"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            This will appear as the main text on the clip card
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium">Start Time (seconds)</label>
                            <Input
                              type="number"
                              min={0}
                              value={clipStartTime}
                              onChange={(e) => setClipStartTime(parseInt(e.target.value) || 0)}
                              className="mt-1"
                              data-testid="input-clip-start"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium">End Time (seconds)</label>
                            <Input
                              type="number"
                              min={clipStartTime + 1}
                              value={clipEndTime}
                              onChange={(e) => setClipEndTime(parseInt(e.target.value) || clipStartTime + 30)}
                              className="mt-1"
                              data-testid="input-clip-end"
                            />
                          </div>
                        </div>

                        <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded-md">
                          Duration: {clipEndTime - clipStartTime} seconds
                        </div>

                        <div>
                          <label className="text-sm font-medium">Transcript Text (optional)</label>
                          <Textarea
                            value={clipTranscriptText}
                            onChange={(e) => setClipTranscriptText(e.target.value)}
                            placeholder="Paste transcript text for this segment..."
                            className="mt-1 min-h-[80px]"
                            data-testid="input-clip-transcript"
                          />
                        </div>

                        {selectedEpisode.mediaUrl && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (!clipAudioRef.current) {
                                  clipAudioRef.current = new Audio(selectedEpisode.mediaUrl!);
                                }
                                const audio = clipAudioRef.current;
                                audio.currentTime = clipStartTime;
                                audio.play().catch(console.error);
                                setTimeout(() => {
                                  audio.pause();
                                }, (clipEndTime - clipStartTime) * 1000);
                              }}
                              data-testid="button-preview-clip-audio"
                            >
                              <Play className="w-4 h-4 mr-1" />
                              Preview Audio
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              {Math.floor(clipStartTime / 60)}:{String(clipStartTime % 60).padStart(2, "0")} - {Math.floor(clipEndTime / 60)}:{String(clipEndTime % 60).padStart(2, "0")}
                            </span>
                          </div>
                        )}

                        <Button
                          className="w-full"
                          onClick={() => createClipMutation.mutate({
                            episodeId: selectedEpisode.id,
                            title: clipTitle,
                            startTime: clipStartTime,
                            endTime: clipEndTime,
                            transcriptText: clipTranscriptText || undefined,
                          })}
                          disabled={!clipTitle || clipEndTime <= clipStartTime || createClipMutation.isPending}
                          data-testid="button-create-clip"
                        >
                          {createClipMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          ) : (
                            <Headphones className="w-4 h-4 mr-2" />
                          )}
                          Create Clip
                        </Button>

                        {createdClipId && (
                          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Check className="w-4 h-4 text-green-600" />
                                <span className="text-sm text-green-700 dark:text-green-400 font-medium">
                                  Clip created!
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const url = `${window.location.origin}/clip/${createdClipId}`;
                                    navigator.clipboard.writeText(url);
                                    toast({
                                      title: "Copied!",
                                      description: "Clip link copied to clipboard",
                                    });
                                  }}
                                  data-testid="button-copy-clip-link"
                                >
                                  <Copy className="w-4 h-4 mr-1" />
                                  Copy Link
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => window.open(`/clip/${createdClipId}`, "_blank")}
                                  data-testid="button-view-clip"
                                >
                                  <ExternalLink className="w-4 h-4 mr-1" />
                                  View
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Media Sources management */}
                <EpisodeSourcesManager
                  episodeId={selectedEpisode.id}
                  episodeTitle={selectedEpisode.title}
                />

                {/* Show recommended option when transcript file is available */}
                {selectedEpisode.transcriptUrl && (
                  <Card className="border-green-500 bg-green-50 dark:bg-green-900/20">
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-green-100 dark:bg-green-800 rounded-full">
                          <FileText className="w-5 h-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-green-700 dark:text-green-400">
                            Transcript File Available
                          </h4>
                          <p className="text-sm text-green-600 dark:text-green-500 mt-1">
                            This episode has an embedded transcript file ({selectedEpisode.transcriptType || 'text'}). 
                            Fetching this is faster and free compared to AI transcription.
                          </p>
                          <Button
                            className="mt-3 bg-green-600 hover:bg-green-700"
                            disabled={isFetchingEmbeddedTranscript}
                            onClick={async () => {
                              setIsFetchingEmbeddedTranscript(true);
                              try {
                                const res = await apiRequest("POST", `/api/episodes/${selectedEpisode.id}/transcript/fetch-embedded`, {
                                  transcriptUrl: selectedEpisode.transcriptUrl,
                                });
                                if (!res.ok) {
                                  const error = await res.json();
                                  throw new Error(error.error || "Failed to fetch transcript");
                                }
                                const data = await res.json();
                                toast({
                                  title: "Transcript imported!",
                                  description: `Successfully imported ${data.segmentCount} segments from the transcript file.`,
                                });
                                queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
                                queryClient.invalidateQueries({ queryKey: ["/api/episodes", selectedEpisode.id, "speakers"] });
                              } catch (error: any) {
                                console.error("Fetch embedded transcript error:", error);
                                toast({
                                  title: "Import failed",
                                  description: error.message,
                                  variant: "destructive",
                                });
                              } finally {
                                setIsFetchingEmbeddedTranscript(false);
                              }
                            }}
                          >
                            {isFetchingEmbeddedTranscript ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <FileText className="w-4 h-4 mr-2" />
                            )}
                            {isFetchingEmbeddedTranscript ? "Fetching..." : "Fetch Transcript File (Recommended)"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* AssemblyAI Transcription Option - shown when no transcript file or as alternative */}
                {selectedEpisode.mediaUrl && !selectedEpisode.hasTranscript && (
                  <Card className="border-blue-500 bg-blue-50 dark:bg-blue-900/20">
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-full">
                          <Wand2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-blue-700 dark:text-blue-400">
                            AI Transcription (AssemblyAI)
                          </h4>
                          <p className="text-sm text-blue-600 dark:text-blue-500 mt-1">
                            {selectedEpisode.transcriptUrl 
                              ? "Use this if the embedded transcript file fails or for better speaker detection."
                              : "No embedded transcript available. Use AssemblyAI for automatic transcription with speaker detection."
                            }
                          </p>
                          
                          {/* Show status if job is in progress */}
                          {assemblyJobStatus?.hasJob && assemblyJobStatus.status !== "completed" && (
                            <div className="mt-3 p-3 bg-blue-100 dark:bg-blue-800/50 rounded-lg">
                              <div className="flex items-center gap-2">
                                {assemblyJobStatus.status === "error" ? (
                                  <>
                                    <XCircle className="w-4 h-4 text-red-500" />
                                    <span className="text-sm text-red-600 dark:text-red-400">
                                      Error: {assemblyJobStatus.error}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                                    <span className="text-sm text-blue-700 dark:text-blue-300">
                                      {assemblyJobStatus.status === "pending" ? "Job queued..." : "Processing audio..."}
                                    </span>
                                  </>
                                )}
                              </div>
                              {assemblyJobStatus.jobId && (
                                <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                                  Job ID: {assemblyJobStatus.jobId}
                                </p>
                              )}
                            </div>
                          )}

                          <div className="mt-3 flex items-center gap-3">
                            <div className="flex-shrink-0">
                              <label className="text-xs text-blue-600 dark:text-blue-400 block mb-1">
                                Expected Speakers
                              </label>
                              <Select
                                value={speakersExpected}
                                onValueChange={setSpeakersExpected}
                                data-testid="select-speakers-expected"
                              >
                                <SelectTrigger className="w-24 h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="auto">Auto</SelectItem>
                                  <SelectItem value="2">2</SelectItem>
                                  <SelectItem value="3">3</SelectItem>
                                  <SelectItem value="4">4</SelectItem>
                                  <SelectItem value="5">5</SelectItem>
                                  <SelectItem value="6">6</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              className="bg-blue-600 hover:bg-blue-700 flex-shrink-0"
                              disabled={isStartingAssemblyAI || (assemblyJobStatus?.hasJob && assemblyJobStatus.status !== "error" && assemblyJobStatus.status !== "completed")}
                              onClick={() => startAssemblyTranscription(selectedEpisode.id)}
                              data-testid="button-start-assembly-transcription"
                            >
                              {isStartingAssemblyAI ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Wand2 className="w-4 h-4 mr-2" />
                              )}
                              {isStartingAssemblyAI 
                                ? "Starting..." 
                                : assemblyJobStatus?.status === "error"
                                  ? "Retry AssemblyAI"
                                  : "Start AssemblyAI Transcription"
                              }
                            </Button>
                          </div>
                          
                          <p className="text-xs text-blue-500 dark:text-blue-400 mt-2">
                            Typically takes 2-5 minutes. Set expected speakers for better accuracy.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Tabs value={transcriptMode} onValueChange={(v) => setTranscriptMode(v as any)}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="audio-url">
                      <Wand2 className="w-4 h-4 mr-2" />
                      AssemblyAI
                    </TabsTrigger>
                    <TabsTrigger value="youtube">
                      <Play className="w-4 h-4 mr-2" />
                      YouTube
                    </TabsTrigger>
                    <TabsTrigger value="manual">
                      <FileText className="w-4 h-4 mr-2" />
                      Manual
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="audio-url" className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Audio URL</label>
                      <Input
                        value={audioUrl}
                        onChange={(e) => setAudioUrl(e.target.value)}
                        placeholder="https://example.com/audio.mp3"
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        MP3 or audio file URL for AssemblyAI transcription with speaker detection, chapters, entities, and topics
                      </p>
                    </div>
                    <Button
                      className="w-full bg-blue-600 hover:bg-blue-700"
                      onClick={handleStartTranscription}
                      disabled={!audioUrl || transcribeAudioUrlMutation.isPending}
                    >
                      {transcribeAudioUrlMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Wand2 className="w-4 h-4 mr-2" />
                      )}
                      Start AssemblyAI Transcription
                    </Button>
                  </TabsContent>

                  <TabsContent value="youtube" className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">YouTube Video ID</label>
                      <Input
                        value={youtubeVideoId}
                        onChange={(e) => setYoutubeVideoId(e.target.value)}
                        placeholder="dQw4w9WgXcQ"
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Extract from YouTube URL (after v=)
                      </p>
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleStartTranscription}
                      disabled={!youtubeVideoId || uploadYoutubeTranscriptMutation.isPending}
                    >
                      {uploadYoutubeTranscriptMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Play className="w-4 h-4 mr-2" />
                      )}
                      Fetch YouTube Transcript
                    </Button>
                  </TabsContent>

                  <TabsContent value="manual" className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Transcript Text</label>
                      <Textarea
                        value={manualTranscript}
                        onChange={(e) => setManualTranscript(e.target.value)}
                        placeholder="Paste your transcript here..."
                        className="mt-1 min-h-[200px]"
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleStartTranscription}
                      disabled={!manualTranscript || uploadManualTranscriptMutation.isPending}
                    >
                      {uploadManualTranscriptMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <FileText className="w-4 h-4 mr-2" />
                      )}
                      Upload Transcript
                    </Button>
                  </TabsContent>
                </Tabs>

                {/* Progress display */}
                {transcriptionProgress && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="py-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{transcriptionProgress.message}</span>
                        <span className="text-sm text-muted-foreground">
                          {transcriptionProgress.percentage}%
                        </span>
                      </div>
                      <Progress value={transcriptionProgress.percentage} />
                      {transcriptionProgress.currentChunk && transcriptionProgress.totalChunks && (
                        <p className="text-xs text-muted-foreground">
                          Chunk {transcriptionProgress.currentChunk} of {transcriptionProgress.totalChunks}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transcribed episodes list */}
      {episodesWithTranscript.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Transcribed Episodes ({episodesWithTranscript.length})</CardTitle>
            <CardDescription>Episodes with transcripts ready for annotation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {episodesWithTranscript
                .slice((transcribedPage - 1) * TRANSCRIBED_PAGE_SIZE, transcribedPage * TRANSCRIBED_PAGE_SIZE)
                .map((episode) => (
                <button
                  key={episode.id}
                  onClick={() => setSelectedEpisodeId(episode.id)}
                  className={`text-left p-4 rounded-lg border transition-colors ${
                    selectedEpisodeId === episode.id 
                      ? "border-primary bg-primary/5" 
                      : "hover:bg-muted/50"
                  }`}
                  data-testid={`button-episode-${episode.id}`}
                >
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    <p className="font-medium text-sm line-clamp-1">{episode.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {getPodcastTitle(episode.podcastId)}
                  </p>
                </button>
              ))}
            </div>
            
            {/* Pagination for Transcribed Episodes */}
            {episodesWithTranscript.length > TRANSCRIBED_PAGE_SIZE && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <span className="text-sm text-muted-foreground">
                  Showing {(transcribedPage - 1) * TRANSCRIBED_PAGE_SIZE + 1}-{Math.min(transcribedPage * TRANSCRIBED_PAGE_SIZE, episodesWithTranscript.length)} of {episodesWithTranscript.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTranscribedPage(p => Math.max(1, p - 1))}
                    disabled={transcribedPage === 1}
                    data-testid="button-transcribed-prev"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm px-2">
                    Page {transcribedPage} of {Math.ceil(episodesWithTranscript.length / TRANSCRIBED_PAGE_SIZE)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTranscribedPage(p => Math.min(Math.ceil(episodesWithTranscript.length / TRANSCRIBED_PAGE_SIZE), p + 1))}
                    disabled={transcribedPage >= Math.ceil(episodesWithTranscript.length / TRANSCRIBED_PAGE_SIZE)}
                    data-testid="button-transcribed-next"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
