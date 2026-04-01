import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Brain, CheckCircle2, Loader2, Clock, Zap, Play, Pause, ArrowLeft, ExternalLink, Volume2, Mail, Download, Lock, Crown, User, Map, Users, BookOpen, X, LayoutDashboard, Scissors, RotateCcw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { trackEvent } from "@/lib/analytics";
import { PlatformSelectModal } from "@/components/creator/PlatformSelectModal";
import { ClipProcessingModal } from "@/components/creator/ClipProcessingModal";

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-[#f5c542]";
  if (score >= 40) return "text-orange-400";
  return "text-white/40";
}

function getScoreBadgeClass(score: number): string {
  if (score >= 80) return "bg-green-500/10 text-green-400 border-green-500/20";
  if (score >= 60) return "bg-[#f5c542]/10 text-[#f5c542] border-[#f5c542]/20";
  if (score >= 40) return "bg-orange-500/10 text-orange-400 border-orange-500/20";
  return "bg-white/5 text-white/40 border-white/10";
}

interface ProcessingStep {
  step: string;
  status: string;
  completedAt?: string;
  count?: number;
}

interface StatusResponse {
  id: string;
  status: string;
  episodeId?: string;
  episodeTitle?: string;
  processingSteps: ProcessingStep[];
  progress?: {
    transcriptReady: boolean;
    transcriptSegments: number;
    viralMomentsReady: boolean;
    viralMomentsCount: number;
  };
}

interface ViralMoment {
  id: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  text: string;
  viralityScore: number;
  hookReason: string;
  suggestedTitle: string;
  pullQuote: string;
  hookType: string;
  shareabilityFactors: string[] | null;
  contentType: string;
  topics: string[] | null;
  platform: string;
  displayOrder: number;
}

interface ResultsResponse {
  episodeId: string;
  episodeTitle: string;
  duration: number;
  youtubeVideoId: string | null;
  mediaUrl: string | null;
  count: number;
  moments: ViralMoment[];
}

interface CreatorUser {
  authenticated: boolean;
  id?: string;
  email?: string;
  firstName?: string;
  subscriptionTier?: string;
  clipsDownloaded?: number;
  clipsRemaining?: number | null;
  stripeCustomerId?: string;
}

function StepIndicator({ label, status }: { label: string; status: "pending" | "processing" | "complete" }) {
  return (
    <div className="flex items-center gap-3">
      <div className="shrink-0">
        {status === "complete" && <CheckCircle2 className="h-5 w-5 text-green-400" />}
        {status === "processing" && <Loader2 className="h-5 w-5 text-[#f5c542] animate-spin" />}
        {status === "pending" && <div className="h-5 w-5 rounded-full border border-white/20" />}
      </div>
      <span className={status === "complete" ? "text-white/60" : status === "processing" ? "text-white" : "text-white/30"}>
        {label}
      </span>
    </div>
  );
}

function YouTubePlayer({ videoId, startTime, endTime, isPlaying, onToggle }: {
  videoId: string;
  startTime: number;
  endTime: number;
  isPlaying: boolean;
  onToggle: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  return (
    <div className="relative rounded-md overflow-hidden bg-black aspect-video">
      <iframe
        ref={iframeRef}
        src={`https://www.youtube.com/embed/${videoId}?start=${Math.floor(startTime)}&end=${Math.floor(endTime)}&autoplay=0&modestbranding=1&rel=0`}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="Clip preview"
      />
    </div>
  );
}

function AuthModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [error, setError] = useState("");

  const loginMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Login failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creator/auth/user"] });
      onSuccess();
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, firstName }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Registration failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creator/auth/user"] });
      onSuccess();
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "login") {
      loginMutation.mutate();
    } else {
      registerMutation.mutate();
    }
  };

  const isPending = loginMutation.isPending || registerMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-[#14141f] border-white/10 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white" data-testid="text-auth-modal-title">
            {mode === "login" ? "Log in to continue" : "Create your account"}
          </DialogTitle>
          <DialogDescription className="text-white/40">
            {mode === "login" ? "Log in to download clips" : "Sign up to start downloading clips"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {mode === "register" && (
            <Input
              data-testid="input-auth-firstname"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
            />
          )}
          <Input
            data-testid="input-auth-email"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
          />
          <Input
            data-testid="input-auth-password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
          />
          {error && <p className="text-xs text-red-400" data-testid="text-auth-error">{error}</p>}
          <Button
            type="submit"
            disabled={isPending}
            className="w-full bg-[#f5c542] text-[#0a0a0f] border-[#f5c542] font-semibold"
            data-testid="button-auth-submit"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "login" ? "Log In" : "Create Account"}
          </Button>
        </form>
        <div className="text-center mt-2">
          <button
            type="button"
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            className="text-xs text-[#f5c542]/80"
            data-testid="button-auth-toggle"
          >
            {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Log in"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UpgradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/creator/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Checkout failed");
      }
      return res.json();
    },
    onSuccess: (data: { url: string }) => {
      if (data.url) window.location.href = data.url;
    },
  });

  const features = [
    "Unlimited clip downloads",
    "Full episode intelligence reports",
    "Narrative maps & entity analysis",
    "Chapter timestamps",
    "Priority processing",
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-[#14141f] border-white/10 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2" data-testid="text-upgrade-modal-title">
            <Crown className="h-5 w-5 text-[#f5c542]" />
            Upgrade to Creator Plan
          </DialogTitle>
          <DialogDescription className="text-white/40">
            Unlock unlimited access to all creator tools
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2.5 my-4">
          {features.map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-white/70">
              <CheckCircle2 className="h-4 w-4 text-[#f5c542] shrink-0" />
              {f}
            </li>
          ))}
        </ul>
        <Button
          onClick={() => { trackEvent("upgrade_click", { source: "upgrade_modal" }); checkoutMutation.mutate(); }}
          disabled={checkoutMutation.isPending}
          className="w-full bg-[#f5c542] text-[#0a0a0f] border-[#f5c542] font-semibold"
          data-testid="button-upgrade-checkout"
        >
          {checkoutMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Subscribe for $29/mo"}
        </Button>
        {checkoutMutation.isError && (
          <p className="text-xs text-red-400 text-center mt-1">{checkoutMutation.error?.message}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function IntelligenceTeaser({ onUpgrade }: { onUpgrade: () => void }) {
  const teaserCards = [
    { icon: Map, title: "Narrative Map", description: "Visual timeline of key story arcs and topic transitions", preview: "12 narrative segments detected" },
    { icon: Users, title: "Entity Mentions", description: "People, brands, and organizations discussed in this episode", preview: "23 entities identified" },
    { icon: BookOpen, title: "Chapter Timestamps", description: "AI-generated chapters for easy episode navigation", preview: "8 chapters generated" },
  ];

  return (
    <div className="mt-12" data-testid="section-intelligence-teaser">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-white mb-1">Full Episode Intelligence</h2>
        <p className="text-sm text-white/40">Unlock deeper insights from this episode</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {teaserCards.map((card, i) => (
          <Card key={i} className="bg-white/[0.03] border-white/5 overflow-visible relative" data-testid={`card-teaser-${i}`}>
            <div className="p-5 relative">
              <div className="absolute inset-0 bg-[#0a0a0f]/60 backdrop-blur-[2px] rounded-md z-10 flex flex-col items-center justify-center gap-2">
                <Lock className="h-5 w-5 text-white/30" />
                <span className="text-xs text-white/30 font-medium">Locked</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <card.icon className="h-4 w-4 text-[#f5c542]" />
                <span className="text-sm font-medium text-white">{card.title}</span>
              </div>
              <p className="text-xs text-white/30 mb-3">{card.description}</p>
              <Badge className="bg-white/5 text-white/30 border-white/10 no-default-hover-elevate no-default-active-elevate text-xs">
                {card.preview}
              </Badge>
            </div>
          </Card>
        ))}
      </div>
      <div className="text-center mt-6">
        <Button
          onClick={onUpgrade}
          className="bg-[#f5c542] text-[#0a0a0f] border-[#f5c542] font-semibold"
          data-testid="button-unlock-intelligence"
        >
          <Crown className="h-4 w-4 mr-2" />
          Unlock full intelligence — $29/mo
        </Button>
      </div>
    </div>
  );
}

function parseTimeInput(val: string): number | null {
  const parts = val.split(":").map((p) => parseInt(p, 10));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 1 && !isNaN(parts[0])) {
    return parts[0];
  }
  return null;
}

function MomentCard({ moment, youtubeVideoId, index, onDownload, clipsRemaining, isPaid, isAuthenticated, isDownloading }: {
  moment: ViralMoment;
  youtubeVideoId: string | null;
  index: number;
  onDownload: (moment: ViralMoment, adjustedStart?: number, adjustedEnd?: number) => void;
  clipsRemaining?: number | null;
  isPaid: boolean;
  isAuthenticated: boolean;
  isDownloading: boolean;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [adjStart, setAdjStart] = useState(moment.startTime);
  const [adjEnd, setAdjEnd] = useState(moment.endTime);
  const [startInput, setStartInput] = useState(formatTime(moment.startTime));
  const [endInput, setEndInput] = useState(formatTime(moment.endTime));
  const [previewKey, setPreviewKey] = useState(0);

  const BUFFER = 30;
  const sliderMin = Math.max(0, moment.startTime - BUFFER);
  const sliderMax = moment.endTime + BUFFER;
  const adjDuration = Math.max(0, adjEnd - adjStart);
  const isEdited = adjStart !== moment.startTime || adjEnd !== moment.endTime;

  const isExhausted = isAuthenticated && !isPaid && clipsRemaining !== null && clipsRemaining !== undefined && clipsRemaining <= 0;
  const isLastClip = isAuthenticated && !isPaid && clipsRemaining === 1;

  const handleStartChange = (val: number) => {
    const clamped = Math.min(val, adjEnd - 5);
    setAdjStart(clamped);
    setStartInput(formatTime(clamped));
  };

  const handleEndChange = (val: number) => {
    const clamped = Math.max(val, adjStart + 5);
    setAdjEnd(clamped);
    setEndInput(formatTime(clamped));
  };

  const handleStartInputBlur = () => {
    const parsed = parseTimeInput(startInput);
    if (parsed !== null && parsed >= sliderMin && parsed < adjEnd - 4) {
      setAdjStart(parsed);
      setStartInput(formatTime(parsed));
      setPreviewKey((k) => k + 1);
    } else {
      setStartInput(formatTime(adjStart));
    }
  };

  const handleEndInputBlur = () => {
    const parsed = parseTimeInput(endInput);
    if (parsed !== null && parsed <= sliderMax && parsed > adjStart + 4) {
      setAdjEnd(parsed);
      setEndInput(formatTime(parsed));
      setPreviewKey((k) => k + 1);
    } else {
      setEndInput(formatTime(adjEnd));
    }
  };

  const handleReset = () => {
    setAdjStart(moment.startTime);
    setAdjEnd(moment.endTime);
    setStartInput(formatTime(moment.startTime));
    setEndInput(formatTime(moment.endTime));
    setPreviewKey((k) => k + 1);
  };

  return (
    <Card className="bg-white/[0.03] border-white/5 overflow-visible" data-testid={`card-moment-${moment.id}`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`${getScoreBadgeClass(moment.viralityScore)} no-default-hover-elevate no-default-active-elevate`}>
              {moment.viralityScore}/100
            </Badge>
            {moment.hookType && (
              <Badge className="bg-white/5 text-white/50 border-white/10 no-default-hover-elevate no-default-active-elevate">
                {moment.hookType}
              </Badge>
            )}
            <span className="text-xs text-white/30">
              {formatTime(adjStart)} — {formatTime(adjEnd)} ({adjDuration}s)
              {isEdited && <span className="text-[#f5c542] ml-1">(edited)</span>}
            </span>
          </div>
          <span className="text-xs text-white/20 font-mono">#{index + 1}</span>
        </div>

        {moment.suggestedTitle && (
          <h3 className="text-base font-semibold text-white mt-3" data-testid={`text-moment-title-${moment.id}`}>
            {moment.suggestedTitle}
          </h3>
        )}

        {moment.pullQuote && (
          <blockquote className="text-sm text-white/50 mt-2 pl-3 border-l-2 border-[#f5c542]/30 italic">
            "{moment.pullQuote}"
          </blockquote>
        )}

        {moment.hookReason && (
          <p className="text-sm text-white/40 mt-3">
            <span className="text-white/60 font-medium">Why it works:</span> {moment.hookReason}
          </p>
        )}

        {moment.shareabilityFactors && moment.shareabilityFactors.length > 0 && (
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {moment.shareabilityFactors.map((f, i) => (
              <Badge key={i} variant="secondary" className="bg-white/5 text-white/40 border-white/10 text-xs no-default-hover-elevate no-default-active-elevate">
                {f}
              </Badge>
            ))}
          </div>
        )}

        {showEditor && (
          <div className="mt-4 p-4 rounded-md bg-white/[0.03] border border-white/5" data-testid={`section-timeline-editor-${moment.id}`}>
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <span className="text-xs font-medium text-white/60">Adjust clip timing</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/30">{adjDuration}s</span>
                {isEdited && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleReset}
                    className="text-white/40 text-xs px-2"
                    data-testid={`button-reset-timing-${moment.id}`}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-white/30 w-8">Start</span>
                <Input
                  value={startInput}
                  onChange={(e) => setStartInput(e.target.value)}
                  onBlur={handleStartInputBlur}
                  onKeyDown={(e) => { if (e.key === "Enter") handleStartInputBlur(); }}
                  className="w-20 bg-white/5 border-white/10 text-white text-xs text-center font-mono"
                  data-testid={`input-start-time-${moment.id}`}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-white/30 w-8">End</span>
                <Input
                  value={endInput}
                  onChange={(e) => setEndInput(e.target.value)}
                  onBlur={handleEndInputBlur}
                  onKeyDown={(e) => { if (e.key === "Enter") handleEndInputBlur(); }}
                  className="w-20 bg-white/5 border-white/10 text-white text-xs text-center font-mono"
                  data-testid={`input-end-time-${moment.id}`}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/20 w-10 text-right font-mono">{formatTime(sliderMin)}</span>
                <div className="flex-1 relative">
                  <input
                    type="range"
                    min={sliderMin}
                    max={sliderMax}
                    value={adjStart}
                    onChange={(e) => handleStartChange(Number(e.target.value))}
                    onMouseUp={() => setPreviewKey((k) => k + 1)}
                    onTouchEnd={() => setPreviewKey((k) => k + 1)}
                    className="w-full accent-[#f5c542] h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#f5c542]"
                    data-testid={`slider-start-${moment.id}`}
                  />
                  <div className="text-[10px] text-[#f5c542]/60 mt-0.5">Start: {formatTime(adjStart)}</div>
                </div>
                <span className="text-[10px] text-white/20 w-10 font-mono">{formatTime(sliderMax)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/20 w-10 text-right font-mono">{formatTime(sliderMin)}</span>
                <div className="flex-1 relative">
                  <input
                    type="range"
                    min={sliderMin}
                    max={sliderMax}
                    value={adjEnd}
                    onChange={(e) => handleEndChange(Number(e.target.value))}
                    onMouseUp={() => setPreviewKey((k) => k + 1)}
                    onTouchEnd={() => setPreviewKey((k) => k + 1)}
                    className="w-full accent-[#f5c542] h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#f5c542]"
                    data-testid={`slider-end-${moment.id}`}
                  />
                  <div className="text-[10px] text-[#f5c542]/60 mt-0.5">End: {formatTime(adjEnd)}</div>
                </div>
                <span className="text-[10px] text-white/20 w-10 font-mono">{formatTime(sliderMax)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowEditor(!showEditor)}
            className={`border-white/10 ${showEditor ? "text-[#f5c542] border-[#f5c542]/30" : "text-white/60"}`}
            data-testid={`button-edit-timing-${moment.id}`}
          >
            <Scissors className="h-3.5 w-3.5 mr-1.5" />
            {showEditor ? "Done Editing" : "Edit Timing"}
          </Button>
          {youtubeVideoId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setShowPreview(!showPreview); setPreviewKey((k) => k + 1); }}
              className="border-white/10 text-white/60"
              data-testid={`button-preview-${moment.id}`}
            >
              {showPreview ? <Pause className="h-3.5 w-3.5 mr-1.5" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
              {showPreview ? "Hide Preview" : "Preview Clip"}
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => onDownload(moment, adjStart, adjEnd)}
            disabled={isDownloading}
            className={isExhausted
              ? "bg-white/10 text-white/60 border-white/10 font-semibold"
              : "bg-[#f5c542] text-[#0a0a0f] border-[#f5c542] font-semibold"}
            data-testid={`button-download-${moment.id}`}
          >
            {isDownloading ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Preparing...</>
            ) : isExhausted ? (
              <><Crown className="h-3.5 w-3.5 mr-1.5" />Upgrade to download more</>
            ) : (
              <><Download className="h-3.5 w-3.5 mr-1.5" />Download Clip</>
            )}
          </Button>
          {isLastClip && !isExhausted && (
            <span className="text-xs text-[#f5c542]/70" data-testid="text-last-clip-warning">Last free clip</span>
          )}
        </div>
      </div>

      {showPreview && youtubeVideoId && (
        <div className="px-5 pb-5">
          <YouTubePlayer
            key={previewKey}
            videoId={youtubeVideoId}
            startTime={adjStart}
            endTime={adjEnd}
            isPlaying={showPreview}
            onToggle={() => setShowPreview(!showPreview)}
          />
        </div>
      )}
    </Card>
  );
}

export default function CreatorAnalyzePage() {
  const [, params] = useRoute("/creator/analyze/:id");
  const search = useSearch();
  const [, navigate] = useLocation();
  const ingestionId = params?.id;
  const isExisting = ingestionId === "existing";
  const searchParams = new URLSearchParams(search);
  const directEpisodeId = searchParams.get("episodeId");

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [pendingDownloadMoment, setPendingDownloadMoment] = useState<ViralMoment | null>(null);
  const [pendingAdjustedTimes, setPendingAdjustedTimes] = useState<{ start: number; end: number } | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [downloadSuccessUrl, setDownloadSuccessUrl] = useState<string | null>(null);
  const trackedRef = useRef(false);

  const [showPlatformModal, setShowPlatformModal] = useState(false);
  const [showProcessingModal, setShowProcessingModal] = useState(false);
  const [activeClipJobId, setActiveClipJobId] = useState<string | null>(null);
  const [activeClipPlatform, setActiveClipPlatform] = useState<string>("tiktok");
  const [isStartingClipJob, setIsStartingClipJob] = useState(false);

  const userQuery = useQuery<CreatorUser>({
    queryKey: ["/api/creator/auth/user"],
    queryFn: async () => {
      const res = await fetch("/api/creator/auth/user", { credentials: "include" });
      if (!res.ok) return { authenticated: false };
      return res.json();
    },
  });

  const creatorUser = userQuery.data;
  const isAuthenticated = creatorUser?.authenticated === true;
  const isPaid = creatorUser?.subscriptionTier === "creator" || creatorUser?.subscriptionTier === "pro";

  const statusQuery = useQuery<StatusResponse>({
    queryKey: ["/api/creator/status", ingestionId],
    queryFn: async () => {
      const res = await fetch(`/api/creator/status/${ingestionId}`);
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
    enabled: !!ingestionId && !isExisting,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === "complete" || data?.status === "failed") return false;
      return 3000;
    },
  });

  const episodeId = isExisting ? directEpisodeId : statusQuery.data?.episodeId;
  const isComplete = isExisting || statusQuery.data?.status === "complete";

  const resultsQuery = useQuery<ResultsResponse>({
    queryKey: ["/api/creator/results", episodeId],
    queryFn: async () => {
      const res = await fetch(`/api/creator/results/${episodeId}`);
      if (!res.ok) throw new Error("Failed to fetch results");
      return res.json();
    },
    enabled: !!episodeId && isComplete,
  });

  const status = statusQuery.data;
  const results = resultsQuery.data;
  const [captureEmail, setCaptureEmail] = useState("");
  const [emailCaptured, setEmailCaptured] = useState(false);

  const emailMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/creator/capture-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, episodeId: episodeId || null, ingestionId: ingestionId || null }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save email");
      }
      return res.json();
    },
    onSuccess: () => {
      setEmailCaptured(true);
    },
  });

  const trackDownloadMutation = useMutation({
    mutationFn: async ({ moment, adjustedStart, adjustedEnd }: { moment: ViralMoment; adjustedStart?: number; adjustedEnd?: number }) => {
      const videoId = results?.youtubeVideoId;
      const res = await fetch("/api/creator/track-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          youtubeVideoId: videoId,
          startTime: adjustedStart ?? moment.startTime,
          endTime: adjustedEnd ?? moment.endTime,
          momentId: moment.id,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        if (err.requiresUpgrade) {
          throw Object.assign(new Error(err.error), { requiresUpgrade: true });
        }
        throw new Error(err.error || "Download tracking failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/creator/auth/user"] });
      if (data.downloadUrl) {
        navigator.clipboard.writeText(data.downloadUrl).catch(() => {});
      }
      trackEvent("download_clip", { type: data.type, clips_remaining: data.clipsRemaining });
      if (pendingDownloadMoment) {
        setDownloadSuccess(pendingDownloadMoment.id);
        setDownloadSuccessUrl(data.downloadUrl || null);
        setTimeout(() => { setDownloadSuccess(null); setDownloadSuccessUrl(null); }, 5000);
        setPendingDownloadMoment(null);
      }
    },
    onError: (err: any) => {
      if (err.requiresUpgrade) {
        setShowUpgradeModal(true);
      }
      setPendingDownloadMoment(null);
    },
  });

  useEffect(() => {
    if (results && isAuthenticated && !trackedRef.current && episodeId) {
      trackedRef.current = true;
      fetch("/api/creator/track-episode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          episodeId,
          youtubeVideoId: results.youtubeVideoId,
          title: results.episodeTitle,
          thumbnail: results.youtubeVideoId ? `https://img.youtube.com/vi/${results.youtubeVideoId}/mqdefault.jpg` : null,
          viralMomentCount: results.count,
        }),
      }).catch(() => {});
    }
  }, [results, isAuthenticated, episodeId]);

  const isAdmin = creatorUser?.subscriptionTier === "admin" || (creatorUser as any)?.role === "admin";
  const isPaidOrAdmin = isPaid || isAdmin;

  const handleDownload = useCallback((moment: ViralMoment, adjustedStart?: number, adjustedEnd?: number) => {
    if (!isAuthenticated) {
      setPendingDownloadMoment(moment);
      if (adjustedStart !== undefined && adjustedEnd !== undefined) {
        setPendingAdjustedTimes({ start: adjustedStart, end: adjustedEnd });
      }
      setShowAuthModal(true);
      return;
    }
    if (!isPaidOrAdmin && creatorUser?.clipsRemaining !== null && creatorUser?.clipsRemaining !== undefined && creatorUser.clipsRemaining <= 0) {
      setShowUpgradeModal(true);
      return;
    }

    if (isPaidOrAdmin) {
      setPendingDownloadMoment(moment);
      if (adjustedStart !== undefined && adjustedEnd !== undefined) {
        setPendingAdjustedTimes({ start: adjustedStart, end: adjustedEnd });
      }
      setShowPlatformModal(true);
      return;
    }

    setPendingDownloadMoment(moment);
    trackDownloadMutation.mutate({ moment, adjustedStart, adjustedEnd });
  }, [isAuthenticated, isPaidOrAdmin, creatorUser, trackDownloadMutation]);

  const handlePlatformConfirm = useCallback(async (selection: { platform: string; captionStyle: string; hookText: string | null; hookEnabled: boolean }) => {
    if (!pendingDownloadMoment) return;
    setIsStartingClipJob(true);

    try {
      const res = await fetch("/api/creator/process-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          momentId: pendingDownloadMoment.id,
          platform: selection.platform,
          captionStyle: selection.captionStyle,
          userEmail: creatorUser?.email || undefined,
          adjustedStart: pendingAdjustedTimes?.start,
          adjustedEnd: pendingAdjustedTimes?.end,
          hookText: selection.hookText,
          hookEnabled: selection.hookEnabled,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start clip processing");
      }

      const data = await res.json();
      trackEvent("process_clip_started", { platform: selection.platform, captionStyle: selection.captionStyle });

      setShowPlatformModal(false);
      setActiveClipJobId(data.jobId);
      setActiveClipPlatform(selection.platform);
      setShowProcessingModal(true);
    } catch (err: any) {
      console.error("Process clip error:", err);
    } finally {
      setIsStartingClipJob(false);
    }
  }, [pendingDownloadMoment, pendingAdjustedTimes, creatorUser]);

  const handleProcessingClose = useCallback(() => {
    setShowProcessingModal(false);
    setActiveClipJobId(null);
    setPendingDownloadMoment(null);
    setPendingAdjustedTimes(null);
  }, []);

  const handleAuthSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/creator/auth/user"] });
    if (pendingDownloadMoment) {
      const momentToDownload = pendingDownloadMoment;
      const times = pendingAdjustedTimes;
      setTimeout(async () => {
        const res = await fetch("/api/creator/auth/user", { credentials: "include" });
        if (!res.ok) return;
        const freshUser = await res.json();
        const freshIsPaid = freshUser.subscriptionTier === "creator" || freshUser.subscriptionTier === "pro" || freshUser.role === "admin";

        if (freshIsPaid) {
          setShowPlatformModal(true);
        } else {
          trackDownloadMutation.mutate({
            moment: momentToDownload,
            adjustedStart: times?.start,
            adjustedEnd: times?.end,
          });
          setPendingAdjustedTimes(null);
        }
      }, 500);
    }
  }, [pendingDownloadMoment, pendingAdjustedTimes, trackDownloadMutation]);

  const getStepStatus = (stepName: string): "pending" | "processing" | "complete" => {
    if (isComplete && stepName !== "viral_moments") return "complete";
    const steps = status?.processingSteps || [];
    const step = steps.find((s) => s.step === stepName);
    if (!step) {
      if (status?.progress?.transcriptReady && stepName === "transcript") return "complete";
      if (status?.progress?.viralMomentsReady && stepName === "viral_moments") return "complete";
      return "pending";
    }
    return step.status as any;
  };

  const sortedMoments = results?.moments
    ? [...results.moments].sort((a, b) => (b.viralityScore || 0) - (a.viralityScore || 0))
    : [];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4 px-6 py-4">
          <button
            onClick={() => navigate("/creator")}
            className="flex items-center gap-2 text-white/60"
            data-testid="button-back-landing"
          >
            <ArrowLeft className="h-4 w-4" />
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-[#f5c542] flex items-center justify-center">
                <Brain className="h-4 w-4 text-[#0a0a0f]" />
              </div>
              <span className="text-sm font-bold">PODDNA</span>
            </div>
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            {isAuthenticated && (
              <button
                onClick={() => navigate("/creator/dashboard")}
                className="text-xs text-white/50 flex items-center gap-1"
                data-testid="link-dashboard"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                Dashboard
              </button>
            )}
            {isAuthenticated && creatorUser && (
              <Badge
                className={`no-default-hover-elevate no-default-active-elevate text-xs ${
                  isPaidOrAdmin
                    ? "bg-[#f5c542]/10 text-[#f5c542] border-[#f5c542]/20"
                    : "bg-white/5 text-white/50 border-white/10"
                }`}
                data-testid="badge-clip-counter"
              >
                <Download className="h-3 w-3 mr-1" />
                {isPaidOrAdmin ? "Unlimited" : `${creatorUser.clipsRemaining ?? 0} of 3 clips left`}
              </Badge>
            )}
            {results?.youtubeVideoId && (
              <a
                href={`https://www.youtube.com/watch?v=${results.youtubeVideoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-white/30 flex items-center gap-1"
                data-testid="link-youtube-source"
              >
                Source <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="pt-24 pb-16 px-6">
        <div className="max-w-4xl mx-auto">
          {!isComplete && (
            <div className="max-w-md mx-auto text-center" data-testid="section-processing">
              <div className="h-16 w-16 rounded-2xl bg-[#f5c542]/10 flex items-center justify-center mx-auto mb-6">
                <Zap className="h-8 w-8 text-[#f5c542]" />
              </div>

              <h1 className="text-2xl font-bold mb-2">Analyzing Your Episode</h1>
              {status?.episodeTitle && status.episodeTitle !== "Processing..." && (
                <p className="text-sm text-white/40 mb-8 truncate">{status.episodeTitle}</p>
              )}

              <div className="space-y-4 text-left mb-8">
                <StepIndicator label="Finding episode" status={status?.episodeId ? "complete" : "processing"} />
                <StepIndicator label="Transcribing audio" status={getStepStatus("transcript")} />
                <StepIndicator label="Detecting viral moments" status={getStepStatus("viral_moments")} />
              </div>

              <div className="flex items-center justify-center gap-2 text-xs text-white/20 mb-8">
                <Clock className="h-3 w-3" />
                <span>This usually takes 2-5 minutes</span>
              </div>

              {!emailCaptured ? (
                <Card className="bg-white/[0.03] border-white/5 p-5" data-testid="section-email-capture">
                  <div className="flex items-center gap-2 mb-3">
                    <Mail className="h-4 w-4 text-[#f5c542]" />
                    <span className="text-sm font-medium text-white">Get notified when it's ready</span>
                  </div>
                  <p className="text-xs text-white/40 mb-3">
                    We'll email you the results and early access to the Creator tier.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      data-testid="input-capture-email"
                      type="email"
                      placeholder="you@example.com"
                      value={captureEmail}
                      onChange={(e) => setCaptureEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && captureEmail.trim()) {
                          emailMutation.mutate(captureEmail.trim());
                        }
                      }}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#f5c542]/50"
                    />
                    <Button
                      data-testid="button-capture-email"
                      onClick={() => emailMutation.mutate(captureEmail.trim())}
                      disabled={!captureEmail.trim() || emailMutation.isPending}
                      className="bg-[#f5c542] text-[#0a0a0f] border-[#f5c542] shrink-0 font-semibold"
                    >
                      {emailMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Notify Me"}
                    </Button>
                  </div>
                  {emailMutation.isError && (
                    <p className="text-xs text-red-400 mt-2">{emailMutation.error?.message}</p>
                  )}
                </Card>
              ) : (
                <Card className="bg-white/[0.03] border-white/5 p-5" data-testid="section-email-captured">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <span className="text-sm text-white/60">We'll notify you at <span className="text-white">{captureEmail}</span></span>
                  </div>
                </Card>
              )}
            </div>
          )}

          {isComplete && resultsQuery.isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#f5c542]" />
            </div>
          )}

          {isComplete && results && (
            <div data-testid="section-results">
              <div className="mb-8">
                <h1 className="text-2xl font-bold mb-1" data-testid="text-results-title">
                  {results.episodeTitle}
                </h1>
                <div className="flex items-center gap-3 text-sm text-white/40 flex-wrap">
                  {results.duration && <span>{formatTime(results.duration)}</span>}
                  <span>{results.count} viral moment{results.count !== 1 ? "s" : ""} detected</span>
                </div>
              </div>

              {downloadSuccess && (
                <div className="mb-4 p-3 rounded-md bg-green-500/10 border border-green-500/20 flex items-center gap-2 flex-wrap" data-testid="text-download-success">
                  <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                  <span className="text-sm text-green-400">
                    {downloadSuccessUrl
                      ? "YouTube link copied to clipboard — share this exact moment!"
                      : "Clip download tracked successfully!"}
                  </span>
                  {downloadSuccessUrl && (
                    <a
                      href={downloadSuccessUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#f5c542] underline underline-offset-2 ml-auto"
                      data-testid="link-download-url"
                    >
                      {downloadSuccessUrl}
                    </a>
                  )}
                </div>
              )}

              {sortedMoments.length === 0 && (
                <Card className="bg-white/[0.03] border-white/5 p-8 text-center">
                  <Volume2 className="h-8 w-8 text-white/20 mx-auto mb-3" />
                  <p className="text-white/40">No viral moments detected in this episode.</p>
                  <p className="text-sm text-white/20 mt-1">This can happen with shorter clips or low-energy content.</p>
                </Card>
              )}

              <div className="space-y-4">
                {sortedMoments.map((moment, i) => (
                  <MomentCard
                    key={moment.id}
                    moment={moment}
                    youtubeVideoId={results.youtubeVideoId}
                    index={i}
                    onDownload={handleDownload}
                    clipsRemaining={creatorUser?.clipsRemaining}
                    isPaid={isPaidOrAdmin}
                    isAuthenticated={isAuthenticated}
                    isDownloading={(trackDownloadMutation.isPending && pendingDownloadMoment?.id === moment.id) || (isStartingClipJob && pendingDownloadMoment?.id === moment.id)}
                  />
                ))}
              </div>

              {!isPaidOrAdmin && sortedMoments.length > 0 && (
                <IntelligenceTeaser onUpgrade={() => {
                  if (!isAuthenticated) {
                    setShowAuthModal(true);
                  } else {
                    setShowUpgradeModal(true);
                  }
                }} />
              )}

              <div className="mt-12 text-center">
                <Button
                  onClick={() => navigate("/creator")}
                  variant="outline"
                  className="border-white/10 text-white/60"
                  data-testid="button-analyze-another"
                >
                  Analyze Another Episode
                </Button>
              </div>
            </div>
          )}

          {statusQuery.data?.status === "failed" && (
            <div className="max-w-md mx-auto text-center" data-testid="section-error">
              <div className="h-16 w-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-6">
                <Zap className="h-8 w-8 text-red-400" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Analysis Failed</h1>
              <p className="text-white/40 mb-6">
                Something went wrong while processing this episode. Please try again.
              </p>
              <Button
                onClick={() => navigate("/creator")}
                className="bg-[#f5c542] text-[#0a0a0f] border-[#f5c542] font-semibold"
                data-testid="button-retry"
              >
                Try Again
              </Button>
            </div>
          )}
        </div>
      </main>

      <AuthModal
        open={showAuthModal}
        onClose={() => { setShowAuthModal(false); setPendingDownloadMoment(null); }}
        onSuccess={handleAuthSuccess}
      />
      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />
      <PlatformSelectModal
        open={showPlatformModal}
        onClose={() => { setShowPlatformModal(false); setPendingDownloadMoment(null); setPendingAdjustedTimes(null); }}
        onProcess={handlePlatformConfirm}
        isProcessing={isStartingClipJob}
        momentTitle={pendingDownloadMoment?.suggestedTitle}
      />
      {activeClipJobId && (
        <ClipProcessingModal
          open={showProcessingModal}
          onClose={handleProcessingClose}
          jobId={activeClipJobId}
          platform={activeClipPlatform}
          userEmail={creatorUser?.email || undefined}
          onRetry={() => {
            setShowProcessingModal(false);
            setActiveClipJobId(null);
            setShowPlatformModal(true);
          }}
        />
      )}
    </div>
  );
}
