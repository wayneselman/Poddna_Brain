import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Download, Mail } from "lucide-react";

function isBotDetectionError(error?: string): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return lower.includes("sign in to confirm") || lower.includes("not a bot") || lower.includes("bot detection");
}

function formatErrorMessage(error?: string): string {
  if (!error) return "Something went wrong during processing";
  if (isBotDetectionError(error)) {
    return "YouTube is blocking this download from our servers. Try connecting your YouTube account, or try again later.";
  }
  if (error.length > 200) {
    const short = error.substring(0, 200);
    const lastSpace = short.lastIndexOf(" ");
    return (lastSpace > 100 ? short.substring(0, lastSpace) : short) + "...";
  }
  return error;
}

interface ClipStatusResponse {
  status: "queued" | "extracting" | "captioning" | "optimizing" | "complete" | "failed";
  downloadUrl?: string;
  error?: string;
}

const STAGE_LABELS: Record<string, { label: string; progress: number }> = {
  queued: { label: "Preparing your clip...", progress: 10 },
  extracting: { label: "Downloading video segment...", progress: 30 },
  captioning: { label: "Burning captions...", progress: 60 },
  optimizing: { label: "Optimizing for platform...", progress: 85 },
  complete: { label: "Your clip is ready!", progress: 100 },
  failed: { label: "Processing failed", progress: 0 },
};

interface ClipProcessingModalProps {
  open: boolean;
  onClose: () => void;
  jobId: string;
  platform: string;
  userEmail?: string;
  onRetry?: () => void;
}

export function ClipProcessingModal({ open, onClose, jobId, platform, userEmail, onRetry }: ClipProcessingModalProps) {
  const [status, setStatus] = useState<ClipStatusResponse>({ status: "queued" });
  const clipCompleted = useRef(false);
  const notifyRegistered = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const platformLabel = platform === "tiktok" ? "TikTok" : platform === "reels" ? "Instagram Reels" : "YouTube Shorts";

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/creator/clip-status/${jobId}`, { credentials: "include" });
      if (!res.ok) return;
      const data: ClipStatusResponse = await res.json();
      setStatus(data);

      if (data.status === "complete") {
        clipCompleted.current = true;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (data.downloadUrl) {
          triggerDownload(data.downloadUrl);
        }
      } else if (data.status === "failed") {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    } catch {}
  }, [jobId]);

  useEffect(() => {
    if (!open || !jobId) return;
    clipCompleted.current = false;
    notifyRegistered.current = false;
    pollStatus();
    intervalRef.current = setInterval(pollStatus, 3000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [open, jobId, pollStatus]);

  useEffect(() => {
    if (!open || !jobId || !userEmail) return;

    const handleBeforeUnload = () => {
      if (clipCompleted.current || notifyRegistered.current) return;
      const data = new Blob([JSON.stringify({ jobId, email: userEmail })], { type: "application/json" });
      navigator.sendBeacon("/api/creator/clip-notify-email", data);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (!clipCompleted.current && !notifyRegistered.current && open) {
        fetch("/api/creator/clip-notify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ jobId, email: userEmail }),
        }).catch(() => {});
        notifyRegistered.current = true;
      }
    };
  }, [open, jobId, userEmail]);

  const triggerDownload = (url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleNotifyEmail = async () => {
    if (!userEmail) return;
    notifyRegistered.current = true;
    try {
      await fetch("/api/creator/clip-notify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ jobId, email: userEmail }),
      });
    } catch {}
    onClose();
  };

  const stageInfo = STAGE_LABELS[status.status] || STAGE_LABELS.queued;
  const isProcessing = ["queued", "extracting", "captioning", "optimizing"].includes(status.status);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-[#0a0a0f] border-white/10 text-white max-w-md" data-testid="modal-clip-processing">
        <DialogHeader>
          <DialogTitle className="text-white text-lg">
            {status.status === "complete" ? "Clip Ready" : status.status === "failed" ? "Processing Failed" : "Processing Clip"}
          </DialogTitle>
          <DialogDescription className="text-white/40 text-sm">
            Optimizing for {platformLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          <div className="flex flex-col items-center gap-4 py-4">
            {isProcessing && (
              <>
                <Loader2 className="h-10 w-10 text-[#f5c542] animate-spin" />
                <p className="text-sm text-white/70" data-testid="text-processing-status">{stageInfo.label}</p>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div
                    className="bg-[#f5c542] h-2 rounded-full transition-all duration-500"
                    style={{ width: `${stageInfo.progress}%` }}
                    data-testid="progress-bar"
                  />
                </div>
                <p className="text-xs text-white/30">This usually takes 1-3 minutes</p>
              </>
            )}

            {status.status === "complete" && (
              <>
                <CheckCircle2 className="h-10 w-10 text-green-400" />
                <p className="text-sm text-white/70" data-testid="text-processing-status">Your clip is ready!</p>
                {status.downloadUrl && (
                  <Button
                    onClick={() => triggerDownload(status.downloadUrl!)}
                    className="bg-[#f5c542] text-[#0a0a0f] border-[#f5c542] font-semibold"
                    data-testid="button-download-mp4"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download MP4
                  </Button>
                )}
              </>
            )}

            {status.status === "failed" && (
              <>
                <XCircle className="h-10 w-10 text-red-400" />
                <p className="text-sm text-red-300" data-testid="text-processing-status">
                  {formatErrorMessage(status.error)}
                </p>
                {isBotDetectionError(status.error) && (
                  <a
                    href="/api/auth/google"
                    className="text-xs text-[#f5c542] hover:text-[#f5c542]/80 underline"
                    data-testid="link-connect-youtube"
                  >
                    Connect your YouTube account to fix this
                  </a>
                )}
                {onRetry && (
                  <Button
                    onClick={onRetry}
                    variant="outline"
                    className="border-white/10 text-white/60"
                    data-testid="button-retry-clip"
                  >
                    Try again
                  </Button>
                )}
              </>
            )}
          </div>

          {isProcessing && userEmail && (
            <button
              onClick={handleNotifyEmail}
              className="flex items-center justify-center gap-2 w-full text-xs text-white/30 hover:text-white/50 transition-colors py-2 cursor-pointer"
              data-testid="button-notify-email"
            >
              <Mail className="h-3.5 w-3.5" />
              Notify me by email instead
            </button>
          )}

          {(status.status === "complete" || status.status === "failed") && (
            <Button
              variant="ghost"
              onClick={onClose}
              className="w-full text-white/40"
              data-testid="button-close-processing"
            >
              Close
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
