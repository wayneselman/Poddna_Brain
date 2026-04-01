import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  Play,
  Clock,
  Calendar,
  ArrowLeft,
  Zap,
  Quote,
  Map as MapIcon,
  Sparkles,
  ExternalLink,
  Lightbulb,
  Target,
  Layers,
  BookOpen,
  Copy,
  Check,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";

type TabKey = "moments" | "narrative" | "claims";

interface EpisodeSummary {
  headline: string;
  subheadline?: string;
  primaryInsight: {
    label: string;
    statement: string;
  };
  replayReason: string;
  evidence: {
    narrativeSegmentId?: string;
    keyMomentIds: string[];
    claimIds: string[];
  };
  stats: {
    narrativeCount: number;
    keyMomentsCount: number;
    claimsCount: number;
  };
  tags: string[];
  playbookType?: string;
  generatedAt: string;
}

interface Episode {
  episodeId: string;
  podcastId: string;
  podcastName: string;
  title: string;
  episodeNumber: number | null;
  publishedDate: string | null;
  durationSeconds: number | null;
  summaryOneLiner: string;
  shouldNoIndex: boolean;
  episodeSummary?: EpisodeSummary | null;
}

interface Moment {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  momentKind: "key" | "viral";
  momentType?: "insight" | "signal" | "framework" | "story" | null;
  viralityScore: number | null;
  transcriptSnippet: string;
  whyThisMatters: string;
  signals: string[];
  role: string;
  clipStatus: string;
  previewUrl: string | null;
}

// Determine moment type based on signals and content
function inferMomentType(moment: Moment): "Insight" | "Signal" | "Framework" | "Story" {
  if (moment.momentType) {
    return moment.momentType.charAt(0).toUpperCase() + moment.momentType.slice(1) as any;
  }
  
  const title = moment.title.toLowerCase();
  const signals = moment.signals?.map(s => s.toLowerCase()) || [];
  const allText = [title, ...signals].join(" ");
  
  // Framework indicators
  if (allText.includes("framework") || allText.includes("model") || allText.includes("system") || 
      allText.includes("process") || allText.includes("methodology") || allText.includes("principle")) {
    return "Framework";
  }
  
  // Story indicators
  if (allText.includes("story") || allText.includes("experience") || allText.includes("journey") ||
      allText.includes("learned") || allText.includes("mistake") || allText.includes("example")) {
    return "Story";
  }
  
  // Signal indicators (market/business signals)
  if (allText.includes("trend") || allText.includes("market") || allText.includes("opportunity") ||
      allText.includes("growth") || allText.includes("data") || allText.includes("metric")) {
    return "Signal";
  }
  
  // Default to Insight
  return "Insight";
}

function getMomentTypeStyle(type: string): { bg: string; text: string; icon: typeof Lightbulb } {
  switch (type) {
    case "Framework":
      return { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-300", icon: Layers };
    case "Story":
      return { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300", icon: BookOpen };
    case "Signal":
      return { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", icon: Target };
    case "Insight":
    default:
      return { bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300", icon: Lightbulb };
  }
}

interface Claim {
  id: string;
  claimText: string;
  startTime: number;
  endTime: number | null;
  claimType: string;
  confidence: number;
  contextText: string;
  whyItMatters: string;
  theme?: string;
  strength?: "single" | "repeated" | "emphasized";
}

// Infer theme from claim type and content
function inferClaimTheme(claim: Claim): string {
  if (claim.theme) return claim.theme;
  
  const text = (claim.claimText + " " + (claim.contextText || "")).toLowerCase();
  
  // Growth/Scaling
  if (text.includes("growth") || text.includes("scale") || text.includes("expand") || text.includes("revenue") || text.includes("arr")) {
    return "Growth";
  }
  // Product
  if (text.includes("product") || text.includes("feature") || text.includes("user experience") || text.includes("design")) {
    return "Product";
  }
  // Hiring/Team
  if (text.includes("hire") || text.includes("team") || text.includes("culture") || text.includes("talent") || text.includes("engineer")) {
    return "Hiring";
  }
  // Monetization
  if (text.includes("monetiz") || text.includes("pricing") || text.includes("subscription") || text.includes("payment") || text.includes("revenue model")) {
    return "Monetization";
  }
  // Strategy
  if (text.includes("strategy") || text.includes("compet") || text.includes("market") || text.includes("positioning")) {
    return "Strategy";
  }
  // Leadership
  if (text.includes("leader") || text.includes("ceo") || text.includes("founder") || text.includes("decision") || text.includes("management")) {
    return "Leadership";
  }
  // AI/Tech
  if (text.includes("ai") || text.includes("artificial intelligence") || text.includes("machine learning") || text.includes("technology")) {
    return "AI & Tech";
  }
  
  return "General";
}

// Group claims by theme
function groupClaimsByTheme(claims: Claim[]): Map<string, Claim[]> {
  const grouped = new Map<string, Claim[]>();
  
  for (const claim of claims) {
    const theme = inferClaimTheme(claim);
    if (!grouped.has(theme)) {
      grouped.set(theme, []);
    }
    grouped.get(theme)!.push(claim);
  }
  
  // Sort by theme size (largest first)
  const entries = Array.from(grouped.entries());
  const sortedEntries = entries.sort((a, b) => b[1].length - a[1].length);
  const sorted = new Map<string, Claim[]>(sortedEntries);
  return sorted;
}

const THEME_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Growth: { bg: "bg-green-50 dark:bg-green-950/40", text: "text-green-700 dark:text-green-400", border: "border-green-200 dark:border-green-800" },
  Product: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-400", border: "border-blue-200 dark:border-blue-800" },
  Hiring: { bg: "bg-purple-50 dark:bg-purple-950/40", text: "text-purple-700 dark:text-purple-400", border: "border-purple-200 dark:border-purple-800" },
  Monetization: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800" },
  Strategy: { bg: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-700 dark:text-indigo-400", border: "border-indigo-200 dark:border-indigo-800" },
  Leadership: { bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-400", border: "border-rose-200 dark:border-rose-800" },
  "AI & Tech": { bg: "bg-cyan-50 dark:bg-cyan-950/40", text: "text-cyan-700 dark:text-cyan-400", border: "border-cyan-200 dark:border-cyan-800" },
  General: { bg: "bg-slate-50 dark:bg-slate-800/40", text: "text-slate-700 dark:text-slate-400", border: "border-slate-200 dark:border-slate-700" },
};

interface NarrativeSegment {
  id: string;
  label: string;
  startTime: number;
  endTime: number | null;
  summary: string;
  evidenceQuotes?: Array<{
    quote: string;
    timestamp: number;
    speaker?: string;
  }>;
  topics?: string[];
}

interface RelatedMoment {
  id: string;
  podcastName: string;
  episodeTitle: string;
  title: string;
  startTime: number;
  endTime: number;
  whyThisMatters: string;
  linkToEpisode: string;
}

interface IntelligenceResponse {
  viewer: "public" | "auth";
  episode: Episode;
  moments: Moment[];
  claims: Claim[];
  narrativeSegments: NarrativeSegment[];
  relatedMoments: RelatedMoment[];
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}

const TAB_HELPER_TEXT: Record<TabKey, string> = {
  narrative: "How the conversation unfolds",
  claims: "What was explicitly stated",
  moments: "Worth replaying",
};

function StickyTabs({
  active,
  onChange,
  isPublic,
  hasNarrative,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  isPublic: boolean;
  hasNarrative: boolean;
}) {
  // Reorder tabs: Narrative Map first when it exists
  const tabs: { key: TabKey; label: string }[] = hasNarrative
    ? [
        { key: "narrative", label: "Narrative Map" },
        { key: "claims", label: "Claims & Insights" },
        { key: "moments", label: "Key Moments" },
      ]
    : [
        { key: "moments", label: "Key Moments" },
        { key: "narrative", label: "Narrative Map" },
        { key: "claims", label: "Claims & Insights" },
      ];

  return (
    <div className="sticky top-16 z-40 bg-white/95 dark:bg-background/95 backdrop-blur border-b border-slate-200 dark:border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3">
          <div className="flex gap-1 sm:gap-2" data-testid="episode-tabs">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => onChange(t.key)}
                data-testid={`tab-${t.key}`}
                className={
                  "flex flex-col items-start px-3 py-2 rounded-lg text-left transition " +
                  (active === t.key
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800")
                }
                type="button"
              >
                <span className="text-sm font-medium">{t.label}</span>
                <span className={`text-xs mt-0.5 ${active === t.key ? "text-slate-300 dark:text-slate-600" : "text-slate-500 dark:text-slate-400"} hidden sm:block`}>
                  {TAB_HELPER_TEXT[t.key]}
                </span>
              </button>
            ))}
          </div>
          {isPublic && (
            <span className="text-xs text-slate-500 dark:text-slate-400 hidden lg:block" data-testid="preview-indicator">
              Preview view · Full analysis available when logged in
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MomentCard({
  moment,
  isSelected,
  onClick,
  onPreview,
}: {
  moment: Moment;
  isSelected: boolean;
  onClick: () => void;
  onPreview: () => void;
}) {
  const canPreview = moment.clipStatus === "ready" && moment.previewUrl;
  const momentType = inferMomentType(moment);
  const typeStyle = getMomentTypeStyle(momentType);
  const TypeIcon = typeStyle.icon;

  return (
    <Card
      className={`p-4 sm:p-5 cursor-pointer transition-all ${
        isSelected
          ? "ring-2 ring-slate-900 dark:ring-white"
          : "hover:shadow-md"
      }`}
      onClick={onClick}
      data-testid={`moment-card-${moment.id}`}
    >
      {/* Header: Type badge, Role badge, Timestamp, Virality score */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Moment Type Badge */}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${typeStyle.bg} ${typeStyle.text}`}>
            <TypeIcon className="w-3 h-3" />
            {momentType}
          </span>
          {/* Role Badge */}
          <Badge className="bg-slate-900 text-white text-xs px-2 py-0.5 rounded-full">
            {moment.role}
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            {formatTimestamp(moment.startTime)}
          </span>
          {moment.momentKind === "viral" && moment.viralityScore != null && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
              <Sparkles className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
              <span className="text-xs font-bold text-yellow-700 dark:text-yellow-400">
                {moment.viralityScore}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Title (interpretation) */}
      <h3 className="font-semibold text-sm sm:text-base text-slate-900 dark:text-white mb-2" data-testid={`moment-title-${moment.id}`}>
        {moment.title}
      </h3>

      {/* Source statement - verbatim quote */}
      {moment.transcriptSnippet && (
        <blockquote className="border-l-2 border-slate-300 dark:border-slate-600 pl-3 mb-3 text-sm text-slate-600 dark:text-slate-400 italic line-clamp-2">
          "{moment.transcriptSnippet}"
        </blockquote>
      )}

      {/* Why this matters (implication) - only show if no transcript snippet to avoid duplication */}
      {moment.whyThisMatters && !moment.transcriptSnippet && (
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-3 line-clamp-2">
          {moment.whyThisMatters}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-2">
        {canPreview ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
            data-testid={`button-preview-${moment.id}`}
          >
            <Play className="w-4 h-4" />
            Preview
          </Button>
        ) : moment.clipStatus && moment.clipStatus !== "ready" ? (
          <Badge variant="secondary" className="text-xs">
            <Clock className="w-3 h-3 mr-1" />
            Generating clip…
          </Badge>
        ) : null}
      </div>
    </Card>
  );
}

function MomentDetailsPanel({
  moment,
  isPublic,
  autoPlay,
}: {
  moment: Moment | null;
  isPublic: boolean;
  autoPlay: boolean;
}) {
  const [showVideo, setShowVideo] = useState(autoPlay);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setShowVideo(autoPlay);
  }, [moment?.id, autoPlay]);

  if (!moment) {
    return (
      <Card className="p-4 sm:p-5">
        <div className="text-center text-slate-500 dark:text-slate-400 py-8">
          <Zap className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Select a moment to see details</p>
        </div>
      </Card>
    );
  }

  const canPreview = moment.clipStatus === "ready" && moment.previewUrl;
  const momentType = inferMomentType(moment);
  const typeStyle = getMomentTypeStyle(momentType);
  const TypeIcon = typeStyle.icon;

  const handleCopyQuote = () => {
    const quoteText = `"${moment.transcriptSnippet}" — ${formatTimestamp(moment.startTime)}`;
    navigator.clipboard.writeText(quoteText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="p-4 sm:p-5" data-testid="moment-details-panel">
      {/* Header: Type + Role + Timestamp */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${typeStyle.bg} ${typeStyle.text}`}>
          <TypeIcon className="w-3.5 h-3.5" />
          {momentType}
        </span>
        <Badge className="bg-slate-900 text-white text-xs px-2.5 py-1 rounded-full">
          {moment.role}
        </Badge>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          {formatTimestamp(moment.startTime)} – {formatTimestamp(moment.endTime)}
        </span>
      </div>

      {/* Layer 1: Title (Interpretation) */}
      <h3 className="font-semibold text-lg text-slate-900 dark:text-white mb-4">
        {moment.title}
      </h3>

      {/* Layer 2: Source Statement (Verbatim Quote) */}
      {moment.transcriptSnippet && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Source Statement
            </h4>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1 text-xs"
              onClick={handleCopyQuote}
              data-testid="button-copy-quote"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <blockquote className="border-l-3 border-primary/50 pl-4 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-r-lg text-sm text-slate-700 dark:text-slate-300">
            "{moment.transcriptSnippet}"
          </blockquote>
        </div>
      )}

      {/* Layer 3: Why This Matters (Implication) */}
      {moment.whyThisMatters && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
            Why This Matters
          </h4>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {moment.whyThisMatters}
          </p>
        </div>
      )}

      {/* Signals/Tags */}
      {moment.signals && moment.signals.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {moment.signals.map((signal, idx) => (
            <span
              key={idx}
              className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-300"
            >
              {signal}
            </span>
          ))}
        </div>
      )}

      {/* Video Preview */}
      {canPreview && (
        <div className="mt-4">
          {showVideo ? (
            <video
              src={moment.previewUrl!}
              controls
              autoPlay
              className="w-full rounded-lg"
              data-testid={`moment-video-${moment.id}`}
            />
          ) : (
            <Button
              className="w-full gap-2"
              onClick={() => setShowVideo(true)}
              data-testid={`button-play-${moment.id}`}
            >
              <Play className="w-4 h-4" />
              Watch Clip
            </Button>
          )}
        </div>
      )}

      {!canPreview && moment.clipStatus && moment.clipStatus !== "ready" && (
        <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
          <Clock className="w-5 h-5 mx-auto mb-1 text-slate-400" />
          <p className="text-xs text-slate-500 dark:text-slate-400">Generating clip…</p>
        </div>
      )}
    </Card>
  );
}

function CTACard({ isPublic, topMoment }: { isPublic: boolean; topMoment?: Moment | null }) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedInsight, setCopiedInsight] = useState(false);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyInsight = () => {
    if (topMoment) {
      const insight = `"${topMoment.whyThisMatters || topMoment.title}" — ${formatTimestamp(topMoment.startTime)}\n\n${window.location.href}`;
      navigator.clipboard.writeText(insight);
      setCopiedInsight(true);
      setTimeout(() => setCopiedInsight(false), 2000);
    } else {
      handleCopyLink();
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: document.title,
          url: window.location.href,
        });
      } catch {
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <h3 className="font-semibold text-base mb-3 text-slate-900 dark:text-white">Quick Actions</h3>
      <div className="space-y-2">
        {topMoment && (
          <Button 
            variant="outline" 
            className="w-full gap-2 justify-start text-left" 
            onClick={handleCopyInsight}
            data-testid="button-copy-insight"
          >
            <Quote className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">
              {copiedInsight ? "Copied insight!" : "Copy shareable insight"}
            </span>
          </Button>
        )}
        <Button 
          variant="outline" 
          className="w-full gap-2 justify-start" 
          onClick={handleShare}
          data-testid="button-share-analysis-rail"
        >
          <ExternalLink className="w-4 h-4 flex-shrink-0" />
          {copiedLink ? "Copied!" : "Share this analysis"}
        </Button>
        {isPublic && (
          <Link href="/create">
            <Button className="w-full gap-2" data-testid="cta-analyze-podcast">
              <Sparkles className="w-4 h-4" />
              Analyze your own episode — Free
            </Button>
          </Link>
        )}
        {!isPublic && (
          <Link href="/admin/clips">
            <Button variant="outline" className="w-full gap-2 justify-start" data-testid="cta-generate-clip">
              <Play className="w-4 h-4 flex-shrink-0" />
              Generate clip
            </Button>
          </Link>
        )}
      </div>

      {/* Secondary info for authenticated users */}
      {!isPublic && (
        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-3 h-3 text-green-500" />
              <span>Full analysis access</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-3 h-3 text-green-500" />
              <span>Export & clip generation</span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function NarrativeSegmentCard({
  segment,
  totalDuration,
  onViewClaims,
}: {
  segment: NarrativeSegment;
  totalDuration: number;
  onViewClaims: () => void;
}) {
  const labelStyles: Record<string, { bg: string; text: string; border: string }> = {
    setup: {
      bg: "bg-blue-50 dark:bg-blue-950/40",
      text: "text-blue-700 dark:text-blue-400",
      border: "border-l-blue-500",
    },
    "core insight": {
      bg: "bg-purple-50 dark:bg-purple-950/40",
      text: "text-purple-700 dark:text-purple-400",
      border: "border-l-purple-500",
    },
    insight: {
      bg: "bg-purple-50 dark:bg-purple-950/40",
      text: "text-purple-700 dark:text-purple-400",
      border: "border-l-purple-500",
    },
    contradiction: {
      bg: "bg-orange-50 dark:bg-orange-950/40",
      text: "text-orange-700 dark:text-orange-400",
      border: "border-l-orange-500",
    },
    example: {
      bg: "bg-teal-50 dark:bg-teal-950/40",
      text: "text-teal-700 dark:text-teal-400",
      border: "border-l-teal-500",
    },
    takeaway: {
      bg: "bg-green-50 dark:bg-green-950/40",
      text: "text-green-700 dark:text-green-400",
      border: "border-l-green-500",
    },
    resolution: {
      bg: "bg-green-50 dark:bg-green-950/40",
      text: "text-green-700 dark:text-green-400",
      border: "border-l-green-500",
    },
    "rising tension": {
      bg: "bg-amber-50 dark:bg-amber-950/40",
      text: "text-amber-700 dark:text-amber-400",
      border: "border-l-amber-500",
    },
  };

  const style = labelStyles[segment.label.toLowerCase()] || {
    bg: "bg-slate-50 dark:bg-slate-800/50",
    text: "text-slate-700 dark:text-slate-300",
    border: "border-l-slate-400",
  };

  const [showQuotes, setShowQuotes] = useState(false);
  const hasEvidence = segment.evidenceQuotes && segment.evidenceQuotes.length > 0;
  const hasTopics = segment.topics && segment.topics.length > 0;

  return (
    <Card 
      className={`p-4 sm:p-5 border-l-4 ${style.border} ${style.bg}`}
      data-testid={`segment-${segment.id}`}
    >
      <div className="flex items-start justify-between gap-4 mb-2">
        <span className={`text-xs font-semibold uppercase tracking-wide ${style.text}`}>
          {segment.label}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono flex-shrink-0">
          {formatTimestamp(segment.startTime)} – {formatTimestamp(segment.endTime || totalDuration)}
        </span>
      </div>
      
      {segment.summary && (
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-3">
          {segment.summary}
        </p>
      )}

      {/* Evidence quotes section */}
      {hasEvidence && (
        <div className="mb-3">
          <button
            onClick={() => setShowQuotes(!showQuotes)}
            className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 flex items-center gap-1"
            data-testid={`toggle-evidence-${segment.id}`}
          >
            <Quote className="w-3 h-3" />
            {showQuotes ? "Hide evidence" : `Show evidence (${segment.evidenceQuotes!.length})`}
          </button>
          
          {showQuotes && (
            <div className="mt-2 space-y-2 pl-3 border-l-2 border-slate-200 dark:border-slate-700">
              {segment.evidenceQuotes!.map((eq, idx) => (
                <div key={idx} className="text-xs">
                  <p className="text-slate-600 dark:text-slate-400 italic">
                    "{eq.quote}"
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {eq.speaker && (
                      <span className="text-slate-500 dark:text-slate-500">
                        — {eq.speaker}
                      </span>
                    )}
                    <span className="text-slate-400 dark:text-slate-500 font-mono">
                      {formatTimestamp(eq.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Topics */}
      {hasTopics && (
        <div className="flex flex-wrap gap-1 mb-3">
          {segment.topics!.map((topic, idx) => (
            <Badge key={idx} variant="secondary" className="text-xs px-1.5 py-0">
              {topic}
            </Badge>
          ))}
        </div>
      )}
      
      <div className="flex items-center justify-between pt-3 border-t border-slate-200/50 dark:border-slate-700/50">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {hasEvidence && `${segment.evidenceQuotes!.length} evidence quote${segment.evidenceQuotes!.length > 1 ? 's' : ''}`}
          {hasEvidence && hasTopics && ' · '}
          {hasTopics && `${segment.topics!.length} topic${segment.topics!.length > 1 ? 's' : ''}`}
          {!hasEvidence && !hasTopics && 'Linked claims · Topics'}
        </span>
        <button
          onClick={onViewClaims}
          className="text-xs text-primary hover:underline"
          data-testid={`link-view-claims-${segment.id}`}
        >
          View related claims →
        </button>
      </div>
    </Card>
  );
}

function NarrativeTimeline({
  segments,
  totalDuration,
  isPublic,
  onSwitchToClaims,
}: {
  segments: NarrativeSegment[];
  totalDuration: number;
  isPublic: boolean;
  onSwitchToClaims: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="mb-6" data-testid="narrative-framing">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          A structured breakdown of how this episode unfolds — from setup to key insights and takeaways.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Generated from full transcript analysis.
        </p>
      </div>

      <div className="space-y-4">
        {segments.map((segment) => (
          <NarrativeSegmentCard
            key={segment.id}
            segment={segment}
            totalDuration={totalDuration}
            onViewClaims={onSwitchToClaims}
          />
        ))}
      </div>

      {isPublic && (
        <Card className="p-5 border-dashed border-slate-300 dark:border-slate-600 text-center mt-6">
          <a 
            href="/api/login" 
            className="text-primary hover:underline font-semibold text-base" 
            data-testid="link-signin-narrative"
          >
            Unlock full episode analysis →
          </a>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            See all claims, transcript context, and references.
          </p>
        </Card>
      )}
    </div>
  );
}

function RelatedMomentsSection({ moments }: { moments: RelatedMoment[] }) {
  if (!moments || moments.length === 0) return null;

  return (
    <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-700">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
        Related Moments
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {moments.map((moment) => (
          <Card key={moment.id} className="p-4 hover:shadow-md transition-shadow">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
              {moment.podcastName} · {moment.episodeTitle}
            </div>
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white mb-2">
              {moment.title}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 line-clamp-2">
              {moment.whyThisMatters}
            </p>
            <Link href={moment.linkToEpisode}>
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="w-3 h-3" />
                View Episode
              </Button>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ClaimCard({ claim }: { claim: Claim }) {
  const [copied, setCopied] = useState(false);
  const theme = inferClaimTheme(claim);
  const themeColors = THEME_COLORS[theme] || THEME_COLORS.General;

  const handleCopy = () => {
    const text = `"${claim.claimText}" — ${formatTimestamp(claim.startTime)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Infer strength from confidence
  const strength: "single" | "repeated" | "emphasized" = 
    claim.strength || (claim.confidence >= 0.9 ? "emphasized" : claim.confidence >= 0.7 ? "repeated" : "single");

  return (
    <Card className="p-4" data-testid={`claim-card-${claim.id}`}>
      <div className="flex items-start gap-3">
        <Quote className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-sm font-medium text-slate-900 dark:text-white" data-testid={`claim-text-${claim.id}`}>
              {claim.claimText}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1 text-xs flex-shrink-0"
              onClick={handleCopy}
              data-testid={`button-copy-claim-${claim.id}`}
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                </>
              )}
            </Button>
          </div>
          {claim.whyItMatters && (
            <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">
              {claim.whyItMatters}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              {formatTimestamp(claim.startTime)}
            </span>
            {strength !== "single" && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                strength === "emphasized" 
                  ? "bg-primary/10 text-primary font-medium" 
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}>
                {strength === "emphasized" ? "Emphasized" : "Repeated"}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function QualityIndicator({ 
  momentsCount, 
  claimsCount, 
  narrativeCount,
  hasTranscript 
}: { 
  momentsCount: number; 
  claimsCount: number; 
  narrativeCount: number;
  hasTranscript: boolean;
}) {
  const issues: string[] = [];
  
  if (!hasTranscript) {
    issues.push("No transcript available");
  }
  if (momentsCount < 3) {
    issues.push(`Only ${momentsCount} key moment${momentsCount === 1 ? '' : 's'} detected`);
  }
  if (claimsCount === 0 && narrativeCount === 0) {
    issues.push("Analysis still processing");
  }

  if (issues.length === 0) return null;

  const isProcessing = claimsCount === 0 && narrativeCount === 0 && hasTranscript;

  return (
    <div 
      className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
        isProcessing 
          ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
          : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
      }`}
      data-testid="quality-indicator"
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div>
        <span className="font-medium">
          {isProcessing ? "Analysis in progress" : "Limited analysis available"}
        </span>
        <ul className="mt-1 text-xs opacity-80">
          {issues.map((issue, idx) => (
            <li key={idx}>• {issue}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ClaimsGroupedView({ claims, isPublic }: { claims: Claim[]; isPublic: boolean }) {
  const groupedClaims = groupClaimsByTheme(claims);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(Array.from(groupedClaims.keys())));

  const toggleGroup = (theme: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(theme)) {
      newExpanded.delete(theme);
    } else {
      newExpanded.add(theme);
    }
    setExpandedGroups(newExpanded);
  };

  return (
    <div className="space-y-6">
      {Array.from(groupedClaims.entries()).map(([theme, themeClaims]) => {
        const colors = THEME_COLORS[theme] || THEME_COLORS.General;
        const isExpanded = expandedGroups.has(theme);
        
        return (
          <div key={theme} className="space-y-2">
            <button
              onClick={() => toggleGroup(theme)}
              className={`w-full flex items-center justify-between p-3 rounded-lg ${colors.bg} ${colors.border} border transition hover:opacity-80`}
              data-testid={`theme-header-${theme.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className="flex items-center gap-2">
                <span className={`font-semibold text-sm ${colors.text}`}>{theme}</span>
                <Badge variant="secondary" className="text-xs">{themeClaims.length}</Badge>
              </div>
              <span className={`text-xs ${colors.text}`}>{isExpanded ? "Collapse" : "Expand"}</span>
            </button>
            
            {isExpanded && (
              <div className="space-y-2 pl-2">
                {themeClaims.map((claim) => (
                  <ClaimCard key={claim.id} claim={claim} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      
      {isPublic && claims.length >= 5 && (
        <Card className="p-5 border-dashed border-slate-300 dark:border-slate-600 text-center mt-4">
          <a 
            href="/api/login" 
            className="text-primary hover:underline font-semibold text-base" 
            data-testid="link-signin-claims"
          >
            Unlock full episode analysis →
          </a>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            See all claims, transcript context, exports, and comparisons.
          </p>
        </Card>
      )}
    </div>
  );
}

function EpisodeHeader({ episode }: { episode: Episode }) {
  const summary = episode.episodeSummary;
  
  // Use EpisodeSummary fields when available, fallback to legacy summaryOneLiner
  const headline = summary?.headline || null;
  const primaryInsight = summary?.primaryInsight;
  const replayReason = summary?.replayReason;
  const tags = summary?.tags || [];
  
  return (
    <div className="border-b border-slate-200 dark:border-slate-700">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Link href="/">
          <Button variant="ghost" size="sm" className="mb-4 -ml-2 gap-2" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </Link>

        {/* Metadata row: Podcast, Duration, Date */}
        <div className="flex items-center gap-3 mb-3 flex-wrap" data-testid="episode-metadata">
          <Link href={`/podcast/${episode.podcastId}`}>
            <span className="text-sm font-medium text-primary hover:underline" data-testid="link-podcast">
              {episode.podcastName}
            </span>
          </Link>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          {episode.durationSeconds && (
            <span className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              {formatDuration(episode.durationSeconds)}
            </span>
          )}
          {episode.publishedDate && (
            <>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <span className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(episode.publishedDate)}
              </span>
            </>
          )}
          {episode.episodeNumber && (
            <>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Ep. {episode.episodeNumber}
              </span>
            </>
          )}
        </div>

        {/* Episode title - use headline if available */}
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-slate-900 dark:text-white mb-4" data-testid="episode-title">
          {headline || episode.title}
        </h1>

        {/* Primary Insight (from EpisodeSummary) or legacy one-liner */}
        {primaryInsight ? (
          <div className="mb-4" data-testid="episode-insight">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs px-2 py-0.5 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
                <Zap className="w-3 h-3 mr-1" />
                {primaryInsight.label}
              </Badge>
            </div>
            <p className="text-base sm:text-lg text-slate-800 dark:text-slate-200 max-w-3xl leading-relaxed font-medium">
              {primaryInsight.statement}
            </p>
          </div>
        ) : episode.summaryOneLiner && (
          <p className="text-base sm:text-lg text-slate-700 dark:text-slate-300 max-w-3xl leading-relaxed mb-4" data-testid="episode-thesis">
            {episode.summaryOneLiner}
          </p>
        )}

        {/* Replay Reason (from EpisodeSummary) - distinct from insight */}
        {replayReason && (
          <div className="mb-4 pl-3 border-l-2 border-slate-300 dark:border-slate-600" data-testid="episode-replay-reason">
            <p className="text-sm text-slate-600 dark:text-slate-400 italic">
              {replayReason}
            </p>
          </div>
        )}

        {/* Topic Tags (from EpisodeSummary) */}
        {tags.length > 0 && (
          <div className="flex items-center gap-2 mb-4 flex-wrap" data-testid="episode-tags">
            {tags.slice(0, 5).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Trust signal badge */}
        <div className="flex items-center gap-3 flex-wrap" data-testid="analysis-badges">
          <Badge variant="outline" className="text-xs px-3 py-1 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30">
            <Sparkles className="w-3 h-3 mr-1.5" />
            Analyzed from full transcript
          </Badge>
          {summary?.stats && (
            <>
              {summary.stats.keyMomentsCount > 0 && (
                <Badge variant="outline" className="text-xs px-2 py-1">
                  {summary.stats.keyMomentsCount} moments
                </Badge>
              )}
              {summary.stats.claimsCount > 0 && (
                <Badge variant="outline" className="text-xs px-2 py-1">
                  {summary.stats.claimsCount} claims
                </Badge>
              )}
            </>
          )}
        </div>

        {/* Attribution footer */}
        <div className="mt-5 pt-4 border-t border-slate-200/50 dark:border-slate-700/50" data-testid="analysis-attribution">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Analysis based on publicly available podcast content. Quotes shown verbatim with timestamps.
          </p>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-white dark:bg-background">
      <div className="border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-8 w-20 mb-4" />
          <Skeleton className="h-4 w-48 mb-2" />
          <Skeleton className="h-10 w-3/4 mb-3" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-background/95 border-b border-slate-200 dark:border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex gap-2">
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-8 w-32 rounded-full" />
          </div>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-5">
                <Skeleton className="h-5 w-32 mb-2" />
                <Skeleton className="h-6 w-3/4 mb-3" />
                <Skeleton className="h-12 w-full mb-3" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              </Card>
            ))}
          </div>
          <div className="lg:col-span-4 space-y-4">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EpisodePublicPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null);
  const [autoPlayVideo, setAutoPlayVideo] = useState(false);

  // Read tab from URL hash
  const getTabFromHash = useCallback((): TabKey | null => {
    const hash = window.location.hash.slice(1);
    if (hash === "narrative" || hash === "claims" || hash === "moments") {
      return hash as TabKey;
    }
    return null;
  }, []);

  const [activeTab, setActiveTabState] = useState<TabKey | null>(getTabFromHash);

  // Update URL when tab changes
  const setActiveTab = useCallback((tab: TabKey) => {
    setActiveTabState(tab);
    window.history.replaceState(null, "", `#${tab}`);
  }, []);

  // Listen for hash changes (back/forward navigation)
  useEffect(() => {
    const handleHashChange = () => {
      const tabFromHash = getTabFromHash();
      if (tabFromHash) {
        setActiveTabState(tabFromHash);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [getTabFromHash]);

  const { data, isLoading, error } = useQuery<IntelligenceResponse>({
    queryKey: ["/api/episodes", id, "intelligence"],
    queryFn: async () => {
      const res = await fetch(`/api/episodes/${id}/intelligence`);
      if (!res.ok) throw new Error("Failed to load episode");
      return res.json();
    },
    enabled: !!id,
  });

  // Set default tab based on narrative availability
  const hasNarrative = (data?.narrativeSegments?.length ?? 0) > 0;
  const defaultTab: TabKey = hasNarrative ? "narrative" : "moments";
  const currentTab = activeTab ?? defaultTab;

  if (isLoading) return <LoadingSkeleton />;

  if (error || !data) {
    return (
      <div className="min-h-screen bg-white dark:bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Episode not found</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-4">This episode may have been removed or doesn't exist.</p>
          <Link href="/">
            <Button data-testid="button-go-home">Go Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const { episode, moments, claims, narrativeSegments, relatedMoments, viewer } = data;
  const isPublic = viewer === "public";
  const selectedMoment = moments.find((m) => m.id === selectedMomentId) || (moments.length > 0 ? moments[0] : null);

  return (
    <>
      <Helmet>
        <title>{episode.title} | {episode.podcastName} | Poddna</title>
        <meta name="description" content={episode.summaryOneLiner} />
        <link rel="canonical" href={`/episode/${episode.episodeId}`} />
        {episode.shouldNoIndex && (
          <meta name="robots" content="noindex,nofollow" />
        )}
      </Helmet>

      <div className="min-h-screen bg-white dark:bg-background" data-testid="episode-public-page">
        <EpisodeHeader episode={episode} />

        <StickyTabs active={currentTab} onChange={setActiveTab} isPublic={isPublic} hasNarrative={hasNarrative} />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <QualityIndicator 
            momentsCount={moments.length}
            claimsCount={claims.length}
            narrativeCount={narrativeSegments.length}
            hasTranscript={!!episode.durationSeconds || moments.length > 0 || claims.length > 0}
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-4">
            <div className="lg:col-span-8">
              {currentTab === "moments" && (
                <div className="space-y-4" data-testid="moments-tab-content">
                  {moments.length === 0 ? (
                    <Card className="p-8 text-center">
                      <Zap className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                      <h3 className="font-semibold text-lg mb-2 text-slate-900 dark:text-white">No moments yet</h3>
                      <p className="text-slate-500 dark:text-slate-400">
                        Viral moments are still being detected. Claims and narrative insights may already be available.
                      </p>
                    </Card>
                  ) : (
                    <>
                      {moments.map((moment) => (
                        <MomentCard
                          key={moment.id}
                          moment={moment}
                          isSelected={selectedMoment?.id === moment.id}
                          onClick={() => {
                            setSelectedMomentId(moment.id);
                            setAutoPlayVideo(false);
                          }}
                          onPreview={() => {
                            setSelectedMomentId(moment.id);
                            setAutoPlayVideo(true);
                          }}
                        />
                      ))}
                      {isPublic && moments.length >= 5 && (
                        <Card className="p-5 border-dashed border-slate-300 dark:border-slate-600 text-center">
                          <a 
                            href="/api/login" 
                            className="text-primary hover:underline font-semibold text-base" 
                            data-testid="link-signin-moments"
                          >
                            Unlock full episode analysis →
                          </a>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            See all claims, transcript context, exports, and comparisons.
                          </p>
                        </Card>
                      )}
                    </>
                  )}
                </div>
              )}

              {currentTab === "narrative" && (
                <div data-testid="narrative-tab-content">
                  {narrativeSegments.length === 0 ? (
                    <div>
                      <Card className="p-8 text-center">
                        <MapIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                        <h3 className="font-semibold text-lg mb-2 text-slate-900 dark:text-white">
                          What is a Narrative Map?
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                          Narrative Maps break down podcast episodes into key story beats — setup, core insights, contradictions, and takeaways — so you can quickly understand the structure of the conversation.
                        </p>
                        <Button 
                          variant="outline" 
                          className="mt-4"
                          onClick={() => setActiveTab("claims")}
                          data-testid="button-view-claims-fallback"
                        >
                          View Claims & Insights
                        </Button>
                      </Card>
                    </div>
                  ) : (
                    <NarrativeTimeline
                      segments={narrativeSegments}
                      totalDuration={episode.durationSeconds || 3600}
                      isPublic={isPublic}
                      onSwitchToClaims={() => setActiveTab("claims")}
                    />
                  )}

                  <div className="flex justify-center mt-6">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="gap-2"
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                      }}
                      data-testid="button-share-analysis"
                    >
                      Share this analysis
                    </Button>
                  </div>
                </div>
              )}

              {currentTab === "claims" && (
                <div data-testid="claims-tab-content">
                  {claims.length === 0 ? (
                    <Card className="p-8 text-center">
                      <Quote className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                      <h3 className="font-semibold text-lg mb-2 text-slate-900 dark:text-white">No claims extracted yet</h3>
                      <p className="text-slate-500 dark:text-slate-400">
                        Claims extraction is in progress. Check out the Narrative Map or Key Moments tabs while you wait.
                      </p>
                    </Card>
                  ) : (
                    <ClaimsGroupedView claims={claims} isPublic={isPublic} />
                  )}
                </div>
              )}

              <RelatedMomentsSection moments={relatedMoments || []} />
            </div>

            <div className="lg:col-span-4 space-y-4">
              {currentTab === "moments" && moments.length > 0 && (
                <MomentDetailsPanel 
                  moment={selectedMoment} 
                  isPublic={isPublic} 
                  autoPlay={autoPlayVideo}
                />
              )}
              <CTACard isPublic={isPublic} topMoment={moments?.[0] || null} />
            </div>
          </div>
        </div>

        <footer className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 border-t border-slate-200 dark:border-slate-700 mt-8">
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center" data-testid="footer-attribution">
            Analysis based on publicly available podcast content. PodDNA is not affiliated with the creators.
          </p>
        </footer>
      </div>
    </>
  );
}
