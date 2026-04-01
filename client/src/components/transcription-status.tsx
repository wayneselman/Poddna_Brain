import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, CheckCircle2, XCircle, FileText, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface TranscriptionProgress {
  stage: "downloading" | "chunking" | "transcribing" | "processing" | "complete" | "error";
  currentChunk?: number;
  totalChunks?: number;
  percentage: number;
  message: string;
}

interface TranscriptionJob {
  id: string;
  episodeId: string;
  episodeTitle: string;
  podcastTitle: string;
  audioUrl: string;
  status: "queued" | "processing" | "complete" | "error";
  progress: TranscriptionProgress;
  startedAt: string;
  completedAt?: string;
  error?: string;
  segmentCount?: number;
}

export function TranscriptionStatus() {
  const [isOpen, setIsOpen] = useState(false);
  const [jobs, setJobs] = useState<TranscriptionJob[]>([]);

  const { data: initialJobs = [] } = useQuery<TranscriptionJob[]>({
    queryKey: ["/api/transcription-jobs"],
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (JSON.stringify(jobs) !== JSON.stringify(initialJobs)) {
      setJobs(initialJobs);
    }
  }, [initialJobs]);

  useEffect(() => {
    const eventSource = new EventSource("/api/transcription-jobs/stream");
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.jobs) {
          setJobs(prevJobs => {
            if (JSON.stringify(prevJobs) !== JSON.stringify(data.jobs)) {
              if (data.jobs.some((j: TranscriptionJob) => j.status === "complete")) {
                queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
              }
              return data.jobs;
            }
            return prevJobs;
          });
        }
      } catch (e) {
        console.error("Failed to parse job update:", e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const activeJobs = jobs.filter(j => j.status === "processing" || j.status === "queued");
  const completedJobs = jobs.filter(j => j.status === "complete");
  const errorJobs = jobs.filter(j => j.status === "error");

  const clearCompleted = async () => {
    try {
      await apiRequest("DELETE", "/api/transcription-jobs/completed");
      queryClient.invalidateQueries({ queryKey: ["/api/transcription-jobs"] });
    } catch (e) {
      console.error("Failed to clear completed jobs:", e);
    }
  };

  if (jobs.length === 0) {
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative gap-2"
          data-testid="button-transcription-status"
        >
          {activeJobs.length > 0 ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="hidden sm:inline">Transcribing</span>
              <Badge variant="secondary" className="ml-1">
                {activeJobs.length}
              </Badge>
            </>
          ) : completedJobs.length > 0 && errorJobs.length === 0 ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="hidden sm:inline">Complete</span>
            </>
          ) : errorJobs.length > 0 ? (
            <>
              <XCircle className="w-4 h-4 text-red-600" />
              <span className="hidden sm:inline">Error</span>
            </>
          ) : (
            <>
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Jobs</span>
            </>
          )}
          {isOpen ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Transcription Jobs</h4>
            {(completedJobs.length > 0 || errorJobs.length > 0) && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 text-xs"
                onClick={clearCompleted}
                data-testid="button-clear-completed"
              >
                Clear finished
              </Button>
            )}
          </div>
          {activeJobs.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {activeJobs.length} job{activeJobs.length !== 1 ? "s" : ""} in progress
            </p>
          )}
        </div>
        <ScrollArea className="max-h-80">
          <div className="p-2 space-y-2">
            {jobs.map((job) => (
              <div
                key={job.id}
                className={`p-2 rounded-lg border text-sm ${
                  job.status === "processing" ? "border-primary bg-primary/5" :
                  job.status === "complete" ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20" :
                  job.status === "error" ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20" :
                  "border-muted bg-muted/50"
                }`}
                data-testid={`job-${job.episodeId}`}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    {job.status === "queued" && <FileText className="w-4 h-4 text-muted-foreground" />}
                    {job.status === "processing" && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                    {job.status === "complete" && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                    {job.status === "error" && <XCircle className="w-4 h-4 text-red-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate" title={job.episodeTitle}>
                      {job.episodeTitle}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {job.podcastTitle}
                    </p>
                    
                    {job.status === "processing" && job.progress && (
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{job.progress.message}</span>
                          <span>{job.progress.percentage}%</span>
                        </div>
                        <Progress value={job.progress.percentage} className="h-1" />
                      </div>
                    )}
                    
                    {job.status === "complete" && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        {job.segmentCount} segments created
                      </p>
                    )}
                    
                    {job.status === "error" && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {job.error || "Transcription failed"}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="p-2 border-t">
          <Link href="/admin/transcripts">
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full text-xs"
              onClick={() => setIsOpen(false)}
              data-testid="link-transcript-lab"
            >
              Open Transcript Lab
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
