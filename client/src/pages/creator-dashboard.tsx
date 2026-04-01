import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Zap, ArrowRight, CreditCard, Download, ExternalLink, Loader2, CheckCircle2, Image as ImageIcon, LayoutDashboard, Sparkles, AlertCircle, RefreshCw, Clock, TrendingUp, TrendingDown, Minus, Star, BarChart3, MessageSquare, Repeat, ArrowLeftRight, X, Trash2, Tag, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlatformSelectModal } from "@/components/creator/PlatformSelectModal";
import { ClipProcessingModal } from "@/components/creator/ClipProcessingModal";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface AuthUser {
  authenticated: boolean;
  id?: string;
  email?: string;
  firstName?: string;
  subscriptionTier?: string;
  clipsDownloaded?: number;
  clipsRemaining?: number | null;
  stripeCustomerId?: string;
}

interface ProcessedEpisode {
  id: string;
  userId: string;
  episodeId: string;
  youtubeVideoId: string | null;
  title: string | null;
  thumbnail: string | null;
  viralMomentCount: number;
  tags: string[] | null;
  createdAt: string;
}

interface ClipJobEntry {
  id: string;
  momentId: string;
  episodeId: string;
  platform: string;
  captionStyle: string;
  status: string;
  downloadUrl: string | null;
  downloadUrlExpiresAt: string | null;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
  episodeTitle: string | null;
  momentTitle: string | null;
}

interface ShowProfileTheme {
  topicId: string;
  topicName: string;
  statementCount: number;
  episodeCount: number;
  representativeText: string;
  trend?: "up" | "down" | "stable" | "new";
}

interface ShowProfileRecurrence {
  text: string;
  occurrenceCount: number;
  episodeCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  frequencyLabel: string;
}

interface ShowProfileContradiction {
  textA: string;
  textB: string;
  episodeATitle: string;
  episodeBTitle: string;
  confidence: number;
  explanation: string;
}

interface ShowProfile {
  id: string;
  podcastId: string;
  episodeCount: number;
  totalStatements: number;
  totalClaims: number;
  topThemes: ShowProfileTheme[];
  topRecurrences: ShowProfileRecurrence[];
  topContradictions: ShowProfileContradiction[];
  polarityBreakdown: { supportive: number; skeptical: number; neutral: number };
  dominantClaimType: string | null;
  avgCertainty: number | null;
  avgSentiment: number | null;
  status: string;
  tagFilter: string | null;
  podcastTitle: string;
  podcastArtworkUrl: string | null;
}

interface DashboardData {
  user: {
    id: string;
    email: string | null;
    firstName: string | null;
    subscriptionTier: string;
    clipsDownloaded: number;
    clipsRemaining: number | null;
  };
  episodes: ProcessedEpisode[];
  availableTags?: string[];
  recentClips?: ClipJobEntry[];
  showIntelligenceAvailable?: boolean;
  episodeCountsByPodcast?: Record<string, number>;
  showProfiles?: ShowProfile[];
}

function TrendIcon({ trend }: { trend?: string }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
  if (trend === "new") return <Star className="h-3.5 w-3.5 text-[#f5c542]" />;
  return <Minus className="h-3.5 w-3.5 text-white/20" />;
}

function EpisodeTagEditor({ episode, availableTags }: { episode: ProcessedEpisode; availableTags: string[] }) {
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const currentTags = episode.tags || [];

  const tagMutation = useMutation({
    mutationFn: async (tags: string[]) => {
      const res = await apiRequest("PATCH", `/api/creator/episodes/${episode.id}/tags`, { tags });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creator/dashboard-data"] });
    },
  });

  const addTag = (tag: string) => {
    const normalized = tag.toLowerCase().trim();
    if (!normalized || normalized.length > 30 || currentTags.includes(normalized) || currentTags.length >= 10) return;
    tagMutation.mutate([...currentTags, normalized]);
    setInputValue("");
  };

  const removeTag = (tag: string) => {
    tagMutation.mutate(currentTags.filter((t) => t !== tag));
  };

  const suggestions = availableTags.filter(
    (t) => !currentTags.includes(t) && t.includes(inputValue.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-2 right-10 z-10 text-white/20 hover:text-white/60 bg-black/40 backdrop-blur-sm invisible group-hover:visible"
          onClick={(e) => { e.stopPropagation(); }}
          data-testid={`button-edit-tags-${episode.id}`}
        >
          <Tag className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-3 bg-[#16161f] border-white/10"
        onClick={(e) => e.stopPropagation()}
        align="end"
      >
        <p className="text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">Tags</p>
        {currentTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {currentTags.map((tag) => (
              <Badge
                key={tag}
                className="bg-white/5 text-white/50 border-white/10 text-[10px] gap-1 no-default-hover-elevate no-default-active-elevate cursor-pointer"
                onClick={() => removeTag(tag)}
                data-testid={`badge-tag-removable-${tag}`}
              >
                {tag}
                <X className="h-2.5 w-2.5" />
              </Badge>
            ))}
          </div>
        )}
        {currentTags.length < 10 && (
          <div className="relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addTag(inputValue); }
              }}
              placeholder="Add tag..."
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
              maxLength={30}
              data-testid={`input-tag-${episode.id}`}
            />
            {inputValue && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a25] border border-white/10 rounded-md max-h-28 overflow-y-auto z-20">
                {suggestions.slice(0, 5).map((s) => (
                  <button
                    key={s}
                    className="w-full text-left px-3 py-1.5 text-xs text-white/50 hover-elevate"
                    onClick={() => addTag(s)}
                    data-testid={`button-suggest-tag-${s}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ShowIntelligenceTab({
  profile,
  allProfiles,
  maxEpisodeCount,
  showIntelligenceAvailable,
  availableTags,
  selectedTag,
  onTagChange,
  onComputeForTag,
  isComputingTag,
  onAnalyzeMore,
}: {
  profile: ShowProfile | null;
  allProfiles: ShowProfile[];
  maxEpisodeCount: number;
  showIntelligenceAvailable: boolean;
  availableTags: string[];
  selectedTag: string | null;
  onTagChange: (tag: string | null) => void;
  onComputeForTag: (tag: string) => void;
  isComputingTag: boolean;
  onAnalyzeMore: () => void;
}) {
  if (maxEpisodeCount < 5) {
    const remaining = 5 - maxEpisodeCount;
    const progressPct = Math.round((maxEpisodeCount / 5) * 100);
    return (
      <Card className="bg-white/[0.03] border-white/5 p-8 text-center" data-testid="section-intelligence-locked">
        <div className="h-14 w-14 rounded-2xl bg-[#f5c542]/10 flex items-center justify-center mx-auto mb-4">
          <Brain className="h-7 w-7 text-[#f5c542]/40" />
        </div>
        <p className="text-white/60 font-medium mb-2">Analyze {remaining} more episode{remaining !== 1 ? "s" : ""} to unlock Show Intelligence</p>
        <p className="text-sm text-white/30 mb-5">Cross-episode patterns emerge after 5 analyzed episodes.</p>
        <div className="max-w-xs mx-auto mb-6">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs text-white/30">{maxEpisodeCount} of 5 episodes</span>
            <span className="text-xs text-white/30">{progressPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-[#f5c542]/60 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
        <Button onClick={onAnalyzeMore} className="bg-[#f5c542] text-[#0a0a0f] border-[#f5c542] font-semibold" data-testid="button-analyze-more">
          Analyze More Episodes<ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </Card>
    );
  }

  const tagFilterUI = availableTags.length > 0 ? (
    <div className="mb-4">
      <Select
        value={selectedTag || "__all__"}
        onValueChange={(v) => onTagChange(v === "__all__" ? null : v)}
      >
        <SelectTrigger className="w-48 bg-white/5 border-white/10 text-white text-xs" data-testid="select-tag-filter">
          <Tag className="h-3 w-3 mr-1.5 text-white/30" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-[#16161f] border-white/10">
          <SelectItem value="__all__" className="text-xs text-white/60">All Episodes</SelectItem>
          {availableTags.map((tag) => (
            <SelectItem key={tag} value={tag} className="text-xs text-white/60">{tag}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ) : null;

  if (selectedTag && !profile) {
    return (
      <div className="space-y-6" data-testid="section-show-intelligence">
        {tagFilterUI}
        <Card className="bg-white/[0.03] border-white/5 p-8 text-center" data-testid="section-intelligence-no-tag-profile">
          <div className="h-14 w-14 rounded-2xl bg-[#f5c542]/10 flex items-center justify-center mx-auto mb-4">
            <Tag className="h-7 w-7 text-[#f5c542]/40" />
          </div>
          <p className="text-white/60 font-medium mb-2">No intelligence computed for "{selectedTag}" yet</p>
          <p className="text-sm text-white/30 mb-5">Compute a scoped profile for episodes tagged with "{selectedTag}".</p>
          <Button
            onClick={() => onComputeForTag(selectedTag)}
            disabled={isComputingTag}
            className="bg-[#f5c542] text-[#0a0a0f] border-[#f5c542] font-semibold"
            data-testid="button-compute-tag-profile"
          >
            {isComputingTag ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Brain className="h-4 w-4 mr-1" />}
            Compute for "{selectedTag}"
          </Button>
        </Card>
      </div>
    );
  }

  if (!profile || profile.status === "computing" || profile.status === "pending") {
    return (
      <div className="space-y-6">
        {tagFilterUI}
        <Card className="bg-white/[0.03] border-white/5 p-8 text-center" data-testid="section-intelligence-computing">
          <Loader2 className="h-8 w-8 animate-spin text-[#f5c542]/40 mx-auto mb-4" />
          <p className="text-white/60 font-medium mb-1">Analyzing patterns across your episodes{selectedTag ? ` tagged "${selectedTag}"` : ""}</p>
          <p className="text-sm text-white/30">This usually takes a minute or two. Check back shortly.</p>
        </Card>
      </div>
    );
  }

  if (profile.status === "error") {
    return (
      <div className="space-y-6">
        {tagFilterUI}
        <Card className="bg-white/[0.03] border-white/5 p-8 text-center" data-testid="section-intelligence-error">
          <AlertCircle className="h-8 w-8 text-red-400/60 mx-auto mb-4" />
          <p className="text-white/60 font-medium mb-1">Something went wrong computing your profile</p>
          <p className="text-sm text-white/30">Please try again later or analyze additional episodes.</p>
        </Card>
      </div>
    );
  }

  const isBeta = profile.episodeCount < 20;
  const progressTo20 = Math.min(100, Math.round((profile.episodeCount / 20) * 100));
  const polarity = profile.polarityBreakdown || { supportive: 0, skeptical: 0, neutral: 0 };
  const totalPolarity = polarity.supportive + polarity.skeptical + polarity.neutral;
  const pctS = totalPolarity > 0 ? Math.round((polarity.supportive / totalPolarity) * 100) : 0;
  const pctSk = totalPolarity > 0 ? Math.round((polarity.skeptical / totalPolarity) * 100) : 0;
  const pctN = totalPolarity > 0 ? Math.round((polarity.neutral / totalPolarity) * 100) : 0;

  return (
    <div className="space-y-6" data-testid="section-show-intelligence">
      {tagFilterUI}
      <div className="mb-2">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <h2 className="text-xl font-bold text-white" data-testid="text-intelligence-title">
            {isBeta ? "Show Intelligence" : "Show DNA"}
          </h2>
          {isBeta && (
            <Badge className="no-default-hover-elevate no-default-active-elevate bg-[#f5c542]/10 text-[#f5c542] border-[#f5c542]/20 text-xs">Beta</Badge>
          )}
          {selectedTag && (
            <Badge className="no-default-hover-elevate no-default-active-elevate bg-white/5 text-white/40 border-white/10 text-xs">
              <Tag className="h-2.5 w-2.5 mr-1" />{selectedTag}
            </Badge>
          )}
        </div>
        <p className="text-sm text-white/40" data-testid="text-episode-anchor">
          Based on {profile.episodeCount} episodes analyzed{selectedTag ? ` (tagged "${selectedTag}")` : ""}
        </p>
        {isBeta && (
          <div className="mt-3 max-w-sm">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] text-white/25">{profile.episodeCount} of 20 episodes</span>
              <span className="text-[10px] text-white/25">{progressTo20}%</span>
            </div>
            <div className="h-1 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full bg-[#f5c542]/40 transition-all" style={{ width: `${progressTo20}%` }} />
            </div>
            <p className="text-[10px] text-white/20 mt-1">Process your full back catalogue to unlock your complete Show DNA.</p>
          </div>
        )}
      </div>

      <Card className="bg-white/[0.03] border-white/5 p-5" data-testid="section-recurring-themes">
        <div className="flex items-center gap-2 mb-4">
          <Repeat className="h-4 w-4 text-[#f5c542]/60" />
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Recurring Themes</h3>
        </div>
        {profile.topThemes.length === 0 ? (
          <p className="text-sm text-white/30">Not enough data to identify themes yet. Keep analyzing episodes.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {profile.topThemes.slice(0, 8).map((theme, i) => (
              <div key={theme.topicId || i} className="bg-white/[0.02] rounded-md p-3 border border-white/5" data-testid={`card-theme-${i}`}>
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{theme.topicName}</span>
                    <TrendIcon trend={theme.trend} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="no-default-hover-elevate no-default-active-elevate bg-white/5 text-white/40 border-white/10 text-[10px]">{theme.statementCount} mentions</Badge>
                    <Badge className="no-default-hover-elevate no-default-active-elevate bg-white/5 text-white/40 border-white/10 text-[10px]">{theme.episodeCount} ep{theme.episodeCount !== 1 ? "s" : ""}</Badge>
                  </div>
                </div>
                {theme.representativeText && (
                  <p className="text-xs text-white/30 line-clamp-2 italic">"{theme.representativeText}"</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="bg-white/[0.03] border-white/5 p-5" data-testid="section-belief-patterns">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="h-4 w-4 text-[#f5c542]/60" />
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Belief Patterns</h3>
        </div>
        {profile.topRecurrences.length === 0 ? (
          <p className="text-sm text-white/30">No recurring beliefs detected yet. Patterns emerge with more episodes.</p>
        ) : (
          <div className="space-y-3">
            {profile.topRecurrences.slice(0, 10).map((rec, i) => (
              <div key={i} className="bg-white/[0.02] rounded-md p-3 border border-white/5" data-testid={`card-recurrence-${i}`}>
                <p className="text-sm text-white/80 mb-2">"{rec.text}"</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="no-default-hover-elevate no-default-active-elevate bg-[#f5c542]/10 text-[#f5c542] border-[#f5c542]/20 text-[10px]">{rec.frequencyLabel}</Badge>
                  <span className="text-[10px] text-white/25">{rec.occurrenceCount}x across {rec.episodeCount} episode{rec.episodeCount !== 1 ? "s" : ""}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="bg-white/[0.03] border-white/5 p-5" data-testid="section-evolution">
        <div className="flex items-center gap-2 mb-4">
          <ArrowLeftRight className="h-4 w-4 text-[#f5c542]/60" />
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Your Show's Evolution</h3>
        </div>
        {profile.topContradictions.length === 0 ? (
          <div className="bg-white/[0.02] rounded-md p-4 border border-white/5 text-center">
            <p className="text-sm text-white/40">No stance shifts detected — your messaging has been consistent.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {profile.topContradictions.slice(0, 5).map((c, i) => (
              <div key={i} className="bg-white/[0.02] rounded-md p-4 border border-white/5" data-testid={`card-contradiction-${i}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-white/[0.02] rounded-md p-3 border border-white/5">
                    <p className="text-[10px] text-white/20 uppercase tracking-wider mb-1">{c.episodeATitle || "Earlier"}</p>
                    <p className="text-sm text-white/70">"{c.textA}"</p>
                  </div>
                  <div className="bg-white/[0.02] rounded-md p-3 border border-white/5">
                    <p className="text-[10px] text-white/20 uppercase tracking-wider mb-1">{c.episodeBTitle || "Later"}</p>
                    <p className="text-sm text-white/70">"{c.textB}"</p>
                  </div>
                </div>
                {c.explanation && (
                  <p className="text-xs text-white/25 mt-2 italic">{c.explanation}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="bg-white/[0.03] border-white/5 p-5" data-testid="section-dominant-tone">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-[#f5c542]/60" />
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Dominant Tone</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-white/30 mb-3 uppercase tracking-wider">Polarity Signature</p>
            <div className="space-y-2">
              {[
                { label: "Supportive", pct: pctS, color: "bg-emerald-500" },
                { label: "Skeptical", pct: pctSk, color: "bg-red-400" },
                { label: "Neutral", pct: pctN, color: "bg-white/30" },
              ].map((p) => (
                <div key={p.label}>
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs text-white/50">{p.label}</span>
                    <span className="text-xs text-white/30">{p.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className={`h-full rounded-full ${p.color} transition-all`} style={{ width: `${p.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-white/30 mb-3 uppercase tracking-wider">Claim Types</p>
            {profile.dominantClaimType && (
              <p className="text-sm text-white/60 mb-2">Primary: <span className="text-white font-medium capitalize">{profile.dominantClaimType}</span></p>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="section-quick-stats">
        {[
          { label: "Statements", value: profile.totalStatements.toLocaleString() },
          { label: "Claims", value: profile.totalClaims.toLocaleString() },
          { label: "Avg Certainty", value: profile.avgCertainty != null ? `${Math.round(profile.avgCertainty * 100)}%` : "—" },
          { label: "Avg Sentiment", value: profile.avgSentiment != null ? (profile.avgSentiment > 0 ? `+${profile.avgSentiment.toFixed(2)}` : profile.avgSentiment.toFixed(2)) : "—" },
        ].map((stat) => (
          <Card key={stat.label} className="bg-white/[0.03] border-white/5 p-4 text-center">
            <p className="text-lg font-bold text-white" data-testid={`text-stat-${stat.label.toLowerCase().replace(/\s/g, "-")}`}>{stat.value}</p>
            <p className="text-[10px] text-white/30 uppercase tracking-wider mt-1">{stat.label}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function CreatorDashboardPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const checkoutSuccess = searchParams.get("checkout") === "success";
  const [showSuccessBanner, setShowSuccessBanner] = useState(checkoutSuccess);
  const [showPlatformModal, setShowPlatformModal] = useState(false);
  const [showProcessingModal, setShowProcessingModal] = useState(false);
  const [reprocessMomentId, setReprocessMomentId] = useState<string | null>(null);
  const [reprocessMomentTitle, setReprocessMomentTitle] = useState<string | undefined>(undefined);
  const [activeClipJobId, setActiveClipJobId] = useState<string | null>(null);
  const [activeClipPlatform, setActiveClipPlatform] = useState<string>("tiktok");
  const [isStartingReprocess, setIsStartingReprocess] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "intelligence">("overview");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try { return localStorage.getItem("poddna_si_banner_dismissed") === "true"; } catch { return false; }
  });

  const authQuery = useQuery<AuthUser>({
    queryKey: ["/api/creator/auth/user"],
    queryFn: async () => {
      const res = await fetch("/api/creator/auth/user");
      if (!res.ok) throw new Error("Auth check failed");
      return res.json();
    },
  });

  const dashboardQuery = useQuery<DashboardData>({
    queryKey: ["/api/creator/dashboard-data"],
    queryFn: async () => {
      const res = await fetch("/api/creator/dashboard-data");
      if (!res.ok) throw new Error("Failed to load dashboard");
      return res.json();
    },
    enabled: authQuery.data?.authenticated === true,
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/creator/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Checkout failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/creator/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Portal failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });

  const deleteClipMutation = useMutation({
    mutationFn: async (clipId: string) => {
      const res = await apiRequest("DELETE", `/api/creator/clips/${clipId}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Delete failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creator/dashboard-data"] });
    },
  });

  const deleteEpisodeMutation = useMutation({
    mutationFn: async (episodeId: string) => {
      const res = await apiRequest("DELETE", `/api/creator/episodes/${episodeId}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Delete failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creator/dashboard-data"] });
    },
  });

  const computeTagProfileMutation = useMutation({
    mutationFn: async ({ podcastId, tag }: { podcastId: string; tag: string }) => {
      const res = await apiRequest("POST", "/api/creator/compute-show-profile", { podcastId, tag });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start computation");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creator/dashboard-data"] });
    },
  });

  useEffect(() => {
    if (authQuery.data && !authQuery.data.authenticated) {
      navigate("/login?redirect=/creator/dashboard");
    }
  }, [authQuery.data, navigate]);

  useEffect(() => {
    if (showSuccessBanner) {
      const timer = setTimeout(() => setShowSuccessBanner(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessBanner]);

  if (authQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#f5c542]" />
      </div>
    );
  }

  if (!authQuery.data?.authenticated) {
    return null;
  }

  const user = dashboardQuery.data?.user;
  const episodes = dashboardQuery.data?.episodes || [];
  const recentClips = dashboardQuery.data?.recentClips || [];
  const isPaid = user?.subscriptionTier === "creator" || user?.subscriptionTier === "pro";
  const showIntelligenceAvailable = dashboardQuery.data?.showIntelligenceAvailable || false;
  const showProfiles = dashboardQuery.data?.showProfiles || [];
  const episodeCountsByPodcast = dashboardQuery.data?.episodeCountsByPodcast || {};
  const availableTags = dashboardQuery.data?.availableTags || [];
  const maxEpisodeCount = Math.max(0, ...Object.values(episodeCountsByPodcast));
  const unscopedProfiles = showProfiles.filter(p => !p.tagFilter);
  const primaryProfile = unscopedProfiles.length > 0 ? unscopedProfiles[0] : null;
  const activeProfile = selectedTag
    ? showProfiles.find(p => p.tagFilter === selectedTag) || null
    : primaryProfile;

  const dismissBanner = () => {
    setBannerDismissed(true);
    try { localStorage.setItem("poddna_si_banner_dismissed", "true"); } catch {}
  };

  const handleTabChange = (tab: "overview" | "intelligence") => {
    setActiveTab(tab);
    if (tab === "intelligence") {
      try {
        (window as any).gtag?.("event", "show_intelligence_viewed", {
          episode_count: primaryProfile?.episodeCount || maxEpisodeCount,
          has_profile: !!primaryProfile,
        });
      } catch {}
    }
  };

  const handleReprocess = (clip: ClipJobEntry) => {
    setReprocessMomentId(clip.momentId);
    setReprocessMomentTitle(clip.momentTitle || undefined);
    setShowPlatformModal(true);
  };

  const handlePlatformConfirm = async (selection: { platform: string; captionStyle: string }) => {
    if (!reprocessMomentId) return;
    setIsStartingReprocess(true);
    try {
      const res = await fetch("/api/creator/process-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          momentId: reprocessMomentId,
          platform: selection.platform,
          captionStyle: selection.captionStyle,
          userEmail: user?.email || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to start clip processing");
      const data = await res.json();
      setShowPlatformModal(false);
      setActiveClipJobId(data.jobId);
      setActiveClipPlatform(selection.platform);
      setShowProcessingModal(true);
    } catch (err) {
      console.error("Reprocess error:", err);
    } finally {
      setIsStartingReprocess(false);
    }
  };

  const getPlatformLabel = (p: string) => p === "tiktok" ? "TikTok" : p === "reels" ? "Reels" : p === "shorts" ? "Shorts" : p;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "complete":
        return <Badge className="bg-green-500/10 text-green-400 border-green-500/20 no-default-hover-elevate no-default-active-elevate text-xs" data-testid="badge-status-complete">Ready</Badge>;
      case "expired":
        return <Badge className="bg-white/5 text-white/40 border-white/10 no-default-hover-elevate no-default-active-elevate text-xs" data-testid="badge-status-expired">Expired</Badge>;
      case "failed":
        return <Badge className="bg-red-500/10 text-red-400 border-red-500/20 no-default-hover-elevate no-default-active-elevate text-xs" data-testid="badge-status-failed">Failed</Badge>;
      default:
        return <Badge className="bg-[#f5c542]/10 text-[#f5c542] border-[#f5c542]/20 no-default-hover-elevate no-default-active-elevate text-xs" data-testid="badge-status-processing">Processing</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={() => navigate("/creator")}
              className="flex items-center gap-2"
              data-testid="button-logo-home"
            >
              <div className="h-8 w-8 rounded-md bg-[#f5c542] flex items-center justify-center">
                <Brain className="h-5 w-5 text-[#0a0a0f]" />
              </div>
              <span className="text-lg font-bold tracking-tight">PODDNA</span>
            </button>
            <nav className="flex items-center gap-1 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/creator")}
                className="text-white/50"
                data-testid="link-analyze"
              >
                <Sparkles className="h-4 w-4 mr-1" />
                Analyze
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white bg-white/5"
                data-testid="link-dashboard-active"
              >
                <LayoutDashboard className="h-4 w-4 mr-1" />
                Dashboard
              </Button>
            </nav>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {user && (
              <span className="text-xs text-white/40" data-testid="text-user-email">
                {user.email}
              </span>
            )}
            <Badge
              className={`no-default-hover-elevate no-default-active-elevate ${
                isPaid
                  ? "bg-[#f5c542]/10 text-[#f5c542] border-[#f5c542]/20"
                  : "bg-white/5 text-white/50 border-white/10"
              }`}
              data-testid="badge-subscription"
            >
              {isPaid ? "Creator" : "Free Beta"}
            </Badge>
          </div>
        </div>
      </header>

      <main className="pt-24 pb-16 px-6">
        <div className="max-w-5xl mx-auto">
          {showSuccessBanner && (
            <Card className="bg-green-500/10 border-green-500/20 p-5 mb-6" data-testid="banner-checkout-success">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
                <div>
                  <p className="font-semibold text-green-400">Welcome to the Creator plan!</p>
                  <p className="text-sm text-green-400/70">You now have unlimited clip downloads and full episode intelligence.</p>
                </div>
              </div>
            </Card>
          )}

          {showIntelligenceAvailable && !bannerDismissed && activeTab !== "intelligence" && (
            <Card className="bg-gradient-to-r from-[#f5c542]/5 to-[#f5c542]/15 border-[#f5c542]/20 p-4 mb-6" data-testid="banner-show-intelligence">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-md bg-[#f5c542]/20 flex items-center justify-center shrink-0">
                    <Brain className="h-5 w-5 text-[#f5c542]" />
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">Your Show Intelligence is ready.</p>
                    <p className="text-xs text-white/40">Cross-episode patterns have been detected in your content.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => { handleTabChange("intelligence"); dismissBanner(); }}
                    className="bg-[#f5c542] text-[#0a0a0f] border-[#f5c542] font-semibold"
                    data-testid="button-view-intelligence"
                  >
                    View Insights
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={dismissBanner}
                    className="text-white/30"
                    data-testid="button-dismiss-banner"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {dashboardQuery.isLoading ? (
            <div className="space-y-6">
              <Skeleton className="h-32 w-full bg-white/5" />
              <Skeleton className="h-48 w-full bg-white/5" />
            </div>
          ) : (
            <>
              <div className="mb-8">
                <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                  <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">
                    {user?.firstName ? `Welcome back, ${user.firstName}` : "Dashboard"}
                  </h1>
                </div>

                {(showIntelligenceAvailable || maxEpisodeCount >= 1) && (
                  <div className="flex items-center gap-1 mb-6 border-b border-white/5" data-testid="tab-navigation">
                    <button
                      onClick={() => handleTabChange("overview")}
                      className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                        activeTab === "overview"
                          ? "text-white"
                          : "text-white/40 hover:text-white/60"
                      }`}
                      data-testid="tab-overview"
                    >
                      Overview
                      {activeTab === "overview" && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f5c542]" />
                      )}
                    </button>
                    <button
                      onClick={() => handleTabChange("intelligence")}
                      className={`px-4 py-2.5 text-sm font-medium transition-colors relative flex items-center gap-2 ${
                        activeTab === "intelligence"
                          ? "text-white"
                          : "text-white/40 hover:text-white/60"
                      }`}
                      data-testid="tab-show-intelligence"
                    >
                      Show Intelligence
                      <Badge className="no-default-hover-elevate no-default-active-elevate bg-[#f5c542]/10 text-[#f5c542] border-[#f5c542]/20 text-[10px] px-1.5 py-0">
                        {maxEpisodeCount >= 20 ? "DNA" : "Beta"}
                      </Badge>
                      {activeTab === "intelligence" && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f5c542]" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {activeTab === "overview" && (
                <>
                  <Card className="bg-white/[0.03] border-white/5 p-5 mb-6" data-testid="section-account">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">Account</h2>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-white/40">Email:</span>
                            <span className="text-sm text-white" data-testid="text-account-email">{user?.email || "—"}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-white/40">Plan:</span>
                            <Badge
                              className={`no-default-hover-elevate no-default-active-elevate ${isPaid ? "bg-[#f5c542]/10 text-[#f5c542] border-[#f5c542]/20" : "bg-white/5 text-white/50 border-white/10"}`}
                              data-testid="badge-plan"
                            >
                              {isPaid ? "Creator" : "Free Beta"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Download className="h-3.5 w-3.5 text-white/40" />
                            <span className="text-sm text-white/40">Clips:</span>
                            <span className="text-sm text-white" data-testid="text-clip-counter">
                              {isPaid ? "Unlimited" : `${user?.clipsDownloaded || 0} of 3 used`}
                            </span>
                          </div>
                        </div>
                      </div>
                      {isPaid && (
                        <Button variant="outline" size="sm" onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending} className="border-white/10 text-white/60" data-testid="button-manage-billing">
                          {portalMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CreditCard className="h-3.5 w-3.5 mr-1.5" />Manage Billing</>}
                        </Button>
                      )}
                    </div>
                  </Card>

                  {!isPaid && (
                    <Card className="bg-gradient-to-r from-[#f5c542]/5 to-[#f5c542]/10 border-[#f5c542]/20 p-5 mb-8" data-testid="section-upgrade-cta">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Zap className="h-4 w-4 text-[#f5c542]" />
                            <h3 className="font-semibold text-white">Upgrade to Creator</h3>
                          </div>
                          <p className="text-sm text-white/40">Get unlimited clip downloads, full episode intelligence, and priority processing.</p>
                        </div>
                        <Button onClick={() => checkoutMutation.mutate()} disabled={checkoutMutation.isPending} className="bg-[#f5c542] text-[#0a0a0f] border-[#f5c542] font-semibold shrink-0" data-testid="button-upgrade">
                          {checkoutMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Get unlimited clips for $29/mo<ArrowRight className="h-4 w-4 ml-1" /></>}
                        </Button>
                      </div>
                      {checkoutMutation.isError && (
                        <p className="text-xs text-red-400 mt-2" data-testid="text-checkout-error">{checkoutMutation.error?.message || "Checkout failed. Please try again."}</p>
                      )}
                    </Card>
                  )}

                  {recentClips.length > 0 && (
                    <div className="mb-8">
                      <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Recent Downloads</h2>
                      <div className="space-y-2">
                        {recentClips.map((clip) => (
                          <Card key={clip.id} className="bg-white/[0.03] border-white/5 overflow-visible" data-testid={`card-clip-${clip.id}`}>
                            <div className="flex items-center justify-between gap-4 p-4 flex-wrap">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-white truncate" data-testid={`text-clip-episode-${clip.id}`}>{clip.episodeTitle || "Untitled Episode"}</p>
                                <p className="text-xs text-white/40 truncate" data-testid={`text-clip-moment-${clip.id}`}>{clip.momentTitle || "Viral moment"}</p>
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  <Badge className="bg-white/5 text-white/50 border-white/10 no-default-hover-elevate no-default-active-elevate text-xs" data-testid={`badge-platform-${clip.id}`}>{getPlatformLabel(clip.platform)}</Badge>
                                  {getStatusBadge(clip.status)}
                                  <span className="text-[10px] text-white/20">{new Date(clip.createdAt).toLocaleDateString()}</span>
                                </div>
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                {clip.status === "complete" && clip.downloadUrl && (
                                  <a href={clip.downloadUrl} download>
                                    <Button size="sm" className="bg-[#f5c542] text-[#0a0a0f] border-[#f5c542] font-semibold" data-testid={`button-download-clip-${clip.id}`}><Download className="h-3.5 w-3.5 mr-1.5" />Download</Button>
                                  </a>
                                )}
                                {(clip.status === "expired" || clip.status === "failed") && (
                                  <Button size="sm" variant="outline" onClick={() => handleReprocess(clip)} className="border-white/10 text-white/60" data-testid={`button-reprocess-clip-${clip.id}`}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Re-process</Button>
                                )}
                                {!["complete", "expired", "failed"].includes(clip.status) && (
                                  <div className="flex items-center gap-1.5 text-xs text-[#f5c542]"><Loader2 className="h-3.5 w-3.5 animate-spin" />Processing</div>
                                )}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={(e) => { e.stopPropagation(); deleteClipMutation.mutate(clip.id); }}
                                  disabled={deleteClipMutation.isPending}
                                  className="text-white/20 hover:text-red-400"
                                  data-testid={`button-delete-clip-${clip.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Episode History</h2>
                    {episodes.length === 0 ? (
                      <Card className="bg-white/[0.03] border-white/5 p-8 text-center" data-testid="section-empty-state">
                        <div className="h-14 w-14 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4"><Sparkles className="h-7 w-7 text-white/20" /></div>
                        <p className="text-white/50 mb-2 font-medium">No episodes analyzed yet</p>
                        <p className="text-sm text-white/30 mb-6">Paste your first YouTube URL to get started.</p>
                        <Button onClick={() => navigate("/creator")} className="bg-[#f5c542] text-[#0a0a0f] border-[#f5c542] font-semibold" data-testid="button-analyze-first">Analyze Your First Episode<ArrowRight className="h-4 w-4 ml-1" /></Button>
                      </Card>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {episodes.map((ep) => (
                          <Card key={ep.id} className="bg-white/[0.03] border-white/5 overflow-visible hover-elevate cursor-pointer relative group" onClick={() => navigate(`/creator/analyze/existing?episodeId=${ep.episodeId}`)} data-testid={`card-episode-${ep.id}`}>
                            <EpisodeTagEditor episode={ep} availableTags={availableTags} />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="absolute top-2 right-2 z-10 text-white/20 hover:text-red-400 bg-black/40 backdrop-blur-sm invisible group-hover:visible"
                              onClick={(e) => { e.stopPropagation(); deleteEpisodeMutation.mutate(ep.id); }}
                              disabled={deleteEpisodeMutation.isPending}
                              data-testid={`button-delete-episode-${ep.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <div className="aspect-video relative bg-white/5 rounded-t-md overflow-hidden">
                              {ep.thumbnail ? (
                                <img src={ep.thumbnail} alt={ep.title || "Episode thumbnail"} className="w-full h-full object-cover" data-testid={`img-episode-thumbnail-${ep.id}`} />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center"><ImageIcon className="h-8 w-8 text-white/10" /></div>
                              )}
                              {ep.viralMomentCount > 0 && (
                                <Badge className="absolute bottom-2 right-2 bg-[#f5c542]/90 text-[#0a0a0f] border-[#f5c542] no-default-hover-elevate no-default-active-elevate"><Zap className="h-3 w-3 mr-1" />{ep.viralMomentCount} moments</Badge>
                              )}
                            </div>
                            <div className="p-4">
                              <h3 className="text-sm font-medium text-white line-clamp-2 mb-1" data-testid={`text-episode-title-${ep.id}`}>{ep.title || "Untitled Episode"}</h3>
                              {ep.tags && ep.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-2" data-testid={`tags-display-${ep.id}`}>
                                  {ep.tags.map((tag) => (
                                    <span key={tag} className="inline-block bg-white/5 text-white/40 text-[10px] px-1.5 py-0.5 rounded" data-testid={`badge-tag-${tag}`}>{tag}</span>
                                  ))}
                                </div>
                              )}
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-xs text-white/30">{new Date(ep.createdAt).toLocaleDateString()}</span>
                                <span className="text-xs text-[#f5c542] flex items-center gap-1">View Results<ExternalLink className="h-3 w-3" /></span>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeTab === "intelligence" && (
                <ShowIntelligenceTab
                  profile={activeProfile}
                  allProfiles={showProfiles}
                  maxEpisodeCount={maxEpisodeCount}
                  showIntelligenceAvailable={showIntelligenceAvailable}
                  availableTags={availableTags}
                  selectedTag={selectedTag}
                  onTagChange={setSelectedTag}
                  onComputeForTag={(tag) => {
                    const podcastId = Object.keys(episodeCountsByPodcast)[0];
                    if (podcastId) computeTagProfileMutation.mutate({ podcastId, tag });
                  }}
                  isComputingTag={computeTagProfileMutation.isPending}
                  onAnalyzeMore={() => navigate("/creator")}
                />
              )}
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-white/5 py-8 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-[#f5c542] flex items-center justify-center">
              <Brain className="h-3.5 w-3.5 text-[#0a0a0f]" />
            </div>
            <span className="text-sm font-semibold">PODDNA</span>
          </div>
          <p className="text-xs text-white/20">Podcast Intelligence Platform</p>
        </div>
      </footer>

      <PlatformSelectModal
        open={showPlatformModal}
        onClose={() => { setShowPlatformModal(false); setReprocessMomentId(null); }}
        onProcess={handlePlatformConfirm}
        isProcessing={isStartingReprocess}
        momentTitle={reprocessMomentTitle}
      />
      {activeClipJobId && (
        <ClipProcessingModal
          open={showProcessingModal}
          onClose={() => {
            setShowProcessingModal(false);
            setActiveClipJobId(null);
            setReprocessMomentId(null);
            queryClient.invalidateQueries({ queryKey: ["/api/creator/dashboard-data"] });
          }}
          jobId={activeClipJobId}
          platform={activeClipPlatform}
          userEmail={user?.email || undefined}
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
