import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { trackEvent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRight, Zap, Brain, Target, TrendingUp, Layers, Search, CheckCircle2, LayoutDashboard, LogIn } from "lucide-react";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  youtubeVideoId?: string;
  title?: string;
  durationSeconds?: number;
  durationFormatted?: string;
  thumbnail?: string;
  hasCaptions?: boolean;
  alreadyProcessed?: boolean;
  existingEpisodeId?: string;
  estimatedProcessingMinutes?: number;
}

export default function CreatorLandingPage() {
  const [, navigate] = useLocation();
  const [url, setUrl] = useState("");
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  const authQuery = useQuery<{ authenticated: boolean; email?: string; subscriptionTier?: string }>({
    queryKey: ["/api/creator/auth/user"],
    queryFn: async () => {
      const res = await fetch("/api/creator/auth/user");
      return res.json();
    },
    staleTime: 60000,
  });

  const validateMutation = useMutation({
    mutationFn: async (youtubeUrl: string) => {
      const res = await fetch("/api/creator/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl }),
      });
      return res.json() as Promise<ValidationResult>;
    },
    onSuccess: (data) => {
      setValidation(data);
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async (youtubeUrl: string) => {
      const res = await fetch("/api/creator/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl, title: validation?.title }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Analysis failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.alreadyProcessed && data.episodeId) {
        navigate(`/creator/analyze/existing?episodeId=${data.episodeId}`);
      } else {
        navigate(`/creator/analyze/${data.id}`);
      }
    },
  });

  const handleValidate = () => {
    if (!url.trim()) return;
    setValidation(null);
    validateMutation.mutate(url.trim());
  };

  const handleAnalyze = () => {
    trackEvent("analyze_start", { url: url.trim() });
    if (validation?.alreadyProcessed && validation.existingEpisodeId) {
      navigate(`/creator/analyze/existing?episodeId=${validation.existingEpisodeId}`);
      return;
    }
    analyzeMutation.mutate(url.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (validation?.valid) {
        handleAnalyze();
      } else {
        handleValidate();
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-md bg-[#f5c542] flex items-center justify-center">
                <Brain className="h-5 w-5 text-[#0a0a0f]" />
              </div>
              <span className="text-lg font-bold tracking-tight">PODDNA</span>
            </div>
            <Badge className="bg-[#f5c542]/10 text-[#f5c542] border-[#f5c542]/20 no-default-hover-elevate no-default-active-elevate">
              Free Beta
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {authQuery.data?.authenticated ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/creator/dashboard")}
                  className="text-white/60"
                  data-testid="link-dashboard"
                >
                  <LayoutDashboard className="h-4 w-4 mr-1.5" />
                  Dashboard
                </Button>
                <span className="text-xs text-white/30" data-testid="text-user-email">{authQuery.data.email}</span>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/login?redirect=/creator")}
                className="text-white/60"
                data-testid="link-login"
              >
                <LogIn className="h-4 w-4 mr-1.5" />
                Log In
              </Button>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="pt-32 pb-24 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <Badge className="mb-6 bg-white/5 text-white/60 border-white/10 no-default-hover-elevate no-default-active-elevate">
              Podcast Intelligence Platform
            </Badge>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
              Your Podcast Has{" "}
              <span className="text-[#f5c542]">Patterns</span>.
              <br />
              We Surface Them.
            </h1>

            <p className="text-lg sm:text-xl text-white/50 max-w-2xl mx-auto mb-12 leading-relaxed">
              PODDNA analyzes your episode structure, speaker dynamics, and narrative arcs — then delivers the moments that actually move.
            </p>

            <div className="max-w-xl mx-auto">
              <div className="flex gap-2">
                <Input
                  data-testid="input-youtube-url"
                  placeholder="Paste a YouTube URL..."
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (validation) setValidation(null);
                  }}
                  onKeyDown={handleKeyDown}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#f5c542]/50"
                />
                {!validation?.valid ? (
                  <Button
                    data-testid="button-validate"
                    onClick={handleValidate}
                    disabled={!url.trim() || validateMutation.isPending}
                    className="bg-[#f5c542] text-[#0a0a0f] border-[#f5c542] shrink-0 font-semibold"
                  >
                    {validateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Search className="h-4 w-4 mr-1" />
                        Check
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    data-testid="button-analyze"
                    onClick={handleAnalyze}
                    disabled={analyzeMutation.isPending}
                    className="bg-[#f5c542] text-[#0a0a0f] border-[#f5c542] shrink-0 font-semibold"
                  >
                    {analyzeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Analyze
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </>
                    )}
                  </Button>
                )}
              </div>

              {validateMutation.isError && (
                <p data-testid="text-validation-error" className="mt-3 text-sm text-red-400">
                  Something went wrong. Please try again.
                </p>
              )}

              {analyzeMutation.isError && (
                <p data-testid="text-analyze-error" className="mt-3 text-sm text-red-400">
                  {analyzeMutation.error?.message || "Analysis failed. Please try again."}
                </p>
              )}

              {validation && !validation.valid && (
                <Card className="mt-4 bg-red-500/10 border-red-500/20 p-4">
                  <p data-testid="text-validation-rejection" className="text-sm text-red-400">
                    {validation.error}
                  </p>
                </Card>
              )}

              {validation?.valid && (
                <Card className="mt-4 bg-white/5 border-white/10 p-4">
                  <div className="flex gap-4">
                    {validation.thumbnail && (
                      <img
                        src={validation.thumbnail}
                        alt={validation.title || "Video thumbnail"}
                        className="w-32 h-20 object-cover rounded-md shrink-0"
                        data-testid="img-video-thumbnail"
                      />
                    )}
                    <div className="min-w-0 flex-1 text-left">
                      <p data-testid="text-video-title" className="text-sm font-medium text-white truncate">
                        {validation.title}
                      </p>
                      <p className="text-xs text-white/40 mt-1">
                        {validation.durationFormatted}
                        {validation.hasCaptions && " · Captions available"}
                      </p>
                      {validation.alreadyProcessed && (
                        <div className="flex items-center gap-1 mt-2">
                          <CheckCircle2 className="h-3 w-3 text-green-400" />
                          <span className="text-xs text-green-400">Already analyzed — view results instantly</span>
                        </div>
                      )}
                      {!validation.alreadyProcessed && (
                        <p className="text-xs text-white/30 mt-2">
                          Est. {validation.estimatedProcessingMinutes} min to process
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              )}
            </div>

            <p className="text-xs text-white/20 mt-6">
              3 free analyses per day. No account required.
            </p>
          </div>
        </section>

        <section className="py-20 px-6 border-t border-white/5">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">Not Just Clips. <span className="text-[#f5c542]">Intelligence.</span></h2>
              <p className="text-white/40 max-w-2xl mx-auto">
                Every podcast episode contains patterns — recurring themes, emotional peaks, contradictions, and moments that resonate. We find them all.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-white/[0.03] border-white/5 p-6">
                <div className="h-10 w-10 rounded-md bg-[#f5c542]/10 flex items-center justify-center mb-4">
                  <Zap className="h-5 w-5 text-[#f5c542]" />
                </div>
                <h3 className="font-semibold text-white mb-2">Viral Moment Detection</h3>
                <p className="text-sm text-white/40 leading-relaxed">
                  AI identifies the 25-60 second clips most likely to resonate on TikTok, Reels, and Shorts — with virality scores and hook analysis.
                </p>
              </Card>

              <Card className="bg-white/[0.03] border-white/5 p-6">
                <div className="h-10 w-10 rounded-md bg-[#f5c542]/10 flex items-center justify-center mb-4">
                  <Target className="h-5 w-5 text-[#f5c542]" />
                </div>
                <h3 className="font-semibold text-white mb-2">Claim Tracking</h3>
                <p className="text-sm text-white/40 leading-relaxed">
                  Automatically classifies every statement as a claim, opinion, or anecdote. Track how stances shift across episodes.
                </p>
              </Card>

              <Card className="bg-white/[0.03] border-white/5 p-6">
                <div className="h-10 w-10 rounded-md bg-[#f5c542]/10 flex items-center justify-center mb-4">
                  <Layers className="h-5 w-5 text-[#f5c542]" />
                </div>
                <h3 className="font-semibold text-white mb-2">Narrative Structure</h3>
                <p className="text-sm text-white/40 leading-relaxed">
                  Maps your episode into narrative arcs with chapter detection, topic segmentation, and speaker dynamics.
                </p>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-20 px-6 border-t border-white/5">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">
                Catch the Parts <span className="text-[#f5c542]">Other Tools Miss.</span>
              </h2>
              <p className="text-white/40 max-w-2xl mx-auto">
                Generic clipping tools cut by silence. PODDNA understands content.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex gap-4 items-start">
                <div className="h-8 w-8 rounded-md bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
                  <TrendingUp className="h-4 w-4 text-[#f5c542]" />
                </div>
                <div>
                  <h4 className="font-medium text-white mb-1">Virality Scoring</h4>
                  <p className="text-sm text-white/40">Each moment gets a 0-100 score based on hook strength, emotional arc, and shareability factors.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="h-8 w-8 rounded-md bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
                  <Brain className="h-4 w-4 text-[#f5c542]" />
                </div>
                <div>
                  <h4 className="font-medium text-white mb-1">Hook Analysis</h4>
                  <p className="text-sm text-white/40">Understand why each moment works — controversy, surprise, emotional peak, or hot take.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="h-8 w-8 rounded-md bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
                  <Search className="h-4 w-4 text-[#f5c542]" />
                </div>
                <div>
                  <h4 className="font-medium text-white mb-1">Entity Detection</h4>
                  <p className="text-sm text-white/40">Automatically tags people, companies, and products mentioned — with cross-episode tracking.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="h-8 w-8 rounded-md bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
                  <Zap className="h-4 w-4 text-[#f5c542]" />
                </div>
                <div>
                  <h4 className="font-medium text-white mb-1">Pattern Recognition</h4>
                  <p className="text-sm text-white/40">Detects recurring themes, contradictions, and topic drift across your full catalog.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 px-6 border-t border-white/5">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to find your best moments?</h2>
            <p className="text-white/40 mb-8">
              Paste a YouTube URL above and see what PODDNA discovers in your content.
            </p>
            <Button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="bg-[#f5c542] text-[#0a0a0f] border-[#f5c542] font-semibold"
              data-testid="button-scroll-top"
            >
              Try It Free
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-[#f5c542] flex items-center justify-center">
              <Brain className="h-3.5 w-3.5 text-[#0a0a0f]" />
            </div>
            <span className="text-sm font-semibold">PODDNA</span>
          </div>
          <p className="text-xs text-white/20">Podcast Intelligence Platform</p>
        </div>
      </footer>
    </div>
  );
}
