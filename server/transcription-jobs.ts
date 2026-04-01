export interface TranscriptionProgress {
  stage: "downloading" | "chunking" | "transcribing" | "processing" | "complete" | "error";
  currentChunk?: number;
  totalChunks?: number;
  percentage: number;
  message: string;
}

export interface TranscriptionJob {
  id: string;
  episodeId: string;
  episodeTitle: string;
  podcastTitle: string;
  audioUrl: string;
  status: "queued" | "processing" | "complete" | "error";
  progress: TranscriptionProgress;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  segmentCount?: number;
}

class TranscriptionJobManager {
  private jobs: Map<string, TranscriptionJob> = new Map();
  private listeners: Map<string, Set<(job: TranscriptionJob) => void>> = new Map();

  createJob(episodeId: string, episodeTitle: string, podcastTitle: string, audioUrl: string): TranscriptionJob {
    const job: TranscriptionJob = {
      id: `job-${episodeId}-${Date.now()}`,
      episodeId,
      episodeTitle,
      podcastTitle,
      audioUrl,
      status: "processing",
      progress: {
        stage: "downloading",
        percentage: 0,
        message: "Starting transcription..."
      },
      startedAt: new Date()
    };
    
    this.jobs.set(episodeId, job);
    this.notifyListeners(episodeId);
    return job;
  }

  updateProgress(episodeId: string, progress: TranscriptionProgress): void {
    const job = this.jobs.get(episodeId);
    if (job) {
      job.progress = progress;
      if (progress.stage === "complete") {
        job.status = "complete";
        job.completedAt = new Date();
      } else if (progress.stage === "error") {
        job.status = "error";
        job.error = progress.message;
        job.completedAt = new Date();
      }
      this.notifyListeners(episodeId);
    }
  }

  completeJob(episodeId: string, segmentCount: number): void {
    const job = this.jobs.get(episodeId);
    if (job) {
      job.status = "complete";
      job.segmentCount = segmentCount;
      job.completedAt = new Date();
      job.progress = {
        stage: "complete",
        percentage: 100,
        message: `Transcription complete! ${segmentCount} segments created.`
      };
      this.notifyListeners(episodeId);
    }
  }

  failJob(episodeId: string, error: string): void {
    const job = this.jobs.get(episodeId);
    if (job) {
      job.status = "error";
      job.error = error;
      job.completedAt = new Date();
      job.progress = {
        stage: "error",
        percentage: 0,
        message: error
      };
      this.notifyListeners(episodeId);
    }
  }

  getJob(episodeId: string): TranscriptionJob | undefined {
    return this.jobs.get(episodeId);
  }

  getActiveJobs(): TranscriptionJob[] {
    return Array.from(this.jobs.values())
      .filter(job => job.status === "processing" || job.status === "queued");
  }

  getAllJobs(): TranscriptionJob[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  clearCompletedJobs(): void {
    const entries = Array.from(this.jobs.entries());
    for (const [episodeId, job] of entries) {
      if (job.status === "complete" || job.status === "error") {
        this.jobs.delete(episodeId);
      }
    }
  }

  removeJob(episodeId: string): void {
    this.jobs.delete(episodeId);
    this.listeners.delete(episodeId);
  }

  subscribe(episodeId: string, callback: (job: TranscriptionJob) => void): () => void {
    if (!this.listeners.has(episodeId)) {
      this.listeners.set(episodeId, new Set());
    }
    this.listeners.get(episodeId)!.add(callback);
    
    return () => {
      const listeners = this.listeners.get(episodeId);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.listeners.delete(episodeId);
        }
      }
    };
  }

  subscribeToAll(callback: (jobs: TranscriptionJob[]) => void): () => void {
    const wrappedCallback = () => callback(this.getAllJobs());
    
    const keys = Array.from(this.jobs.keys());
    for (const episodeId of keys) {
      if (!this.listeners.has(episodeId)) {
        this.listeners.set(episodeId, new Set());
      }
      this.listeners.get(episodeId)!.add(wrappedCallback as any);
    }
    
    return () => {
      const listenerSets = Array.from(this.listeners.values());
      for (const listeners of listenerSets) {
        listeners.delete(wrappedCallback as any);
      }
    };
  }

  private notifyListeners(episodeId: string): void {
    const job = this.jobs.get(episodeId);
    const listeners = this.listeners.get(episodeId);
    if (job && listeners) {
      const callbackArray = Array.from(listeners);
      for (const callback of callbackArray) {
        try {
          callback(job);
        } catch (e) {
          console.error("Error in job listener:", e);
        }
      }
    }
  }
}

export const transcriptionJobManager = new TranscriptionJobManager();
