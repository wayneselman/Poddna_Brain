import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Helmet } from "react-helmet";
import {
  Search,
  ArrowRight,
  Map as MapIcon,
  FileText,
  Sparkles,
  Zap,
  LogIn,
  Lock,
  Flame,
  Quote,
  ChevronRight,
  Copy,
  Check,
  MessageSquare,
  TrendingUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ExploreFeedResponse {
  heroInsight: {
    title: string;
    topicTags: string[];
    episodeCount: number;
    totalMinutes: number;
    sourceQuote: {
      text: string;
      episodeId: string;
      episodeTitle: string;
      timestamp: number;
    } | null;
  } | null;
  featuredPlaybook: EpisodeCard | null;
  topEpisodes: EpisodeCard[];
  trendingTopics: { topic: string; episodeCount: number; claimCount: number }[];
  trendingInsights: {
    claim: string;
    theme: string;
    episodeId: string;
    episodeTitle: string;
    podcastName: string;
    confidence: number;
    episodeCount: number;
  }[];
  mostCitedQuotes: {
    text: string;
    episodeId: string;
    episodeTitle: string;
    podcastName: string;
    timestamp: number;
  }[];
  meta: {
    totalEpisodes: number;
    totalClaims: number;
    totalMoments: number;
  };
}

interface EpisodeSummary {
  headline?: string;
  subheadline?: string;
  primaryInsight?: {
    label: string;
    statement: string;
  };
  replayReason?: string;
  tags?: string[];
  playbookType?: string;
  generatedAt?: string;
}

interface EpisodeCard {
  id: string;
  title: string;
  podcastName: string;
  podcastId: string;
  publishedAt: string | null;
  durationSec: number | null;
  hook: string;
  bestQuote: string;
  bestQuoteTime: number;
  depthScore: number;
  themes: string[];
  badges: {
    hasNarrative: boolean;
    narrativeSegmentCount: number;
    claimsCount: number;
    momentsCount: number;
  };
  analysisUrl: string;
  podcastImageUrl: string | null;
  episodeSummary?: EpisodeSummary | null;
}

const CLICK_STORAGE_KEY = "explore_episode_clicks";
const GATE_THRESHOLD = 5;

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const TOPIC_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Growth: { bg: "bg-green-50 dark:bg-green-950/40", text: "text-green-700 dark:text-green-400", border: "border-green-200 dark:border-green-800" },
  Product: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-400", border: "border-blue-200 dark:border-blue-800" },
  Hiring: { bg: "bg-purple-50 dark:bg-purple-950/40", text: "text-purple-700 dark:text-purple-400", border: "border-purple-200 dark:border-purple-800" },
  Monetization: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800" },
  Strategy: { bg: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-700 dark:text-indigo-400", border: "border-indigo-200 dark:border-indigo-800" },
  Leadership: { bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-400", border: "border-rose-200 dark:border-rose-800" },
  "AI & Tech": { bg: "bg-cyan-50 dark:bg-cyan-950/40", text: "text-cyan-700 dark:text-cyan-400", border: "border-cyan-200 dark:border-cyan-800" },
  General: { bg: "bg-slate-50 dark:bg-slate-950/40", text: "text-slate-700 dark:text-slate-400", border: "border-slate-200 dark:border-slate-800" },
};

const INSIGHT_LABELS = ["THE INSIGHT", "THE TRADEOFF", "THE BET", "THE PATTERN", "KEY DECISION"];

function getInsightLabel(episode: EpisodeCard): string {
  // Use episodeSummary primaryInsight label if available
  if (episode.episodeSummary?.primaryInsight?.label) {
    return episode.episodeSummary.primaryInsight.label.toUpperCase();
  }
  // Fallback to rotating labels
  const hash = episode.id.charCodeAt(0) + episode.id.charCodeAt(episode.id.length - 1);
  return INSIGHT_LABELS[hash % INSIGHT_LABELS.length];
}

function extractKeyPattern(episode: EpisodeCard): string {
  // Use episodeSummary primaryInsight statement if available (the WHAT)
  if (episode.episodeSummary?.primaryInsight?.statement) {
    const statement = episode.episodeSummary.primaryInsight.statement;
    return statement.length > 120 ? statement.slice(0, 117) + "..." : statement;
  }
  // Fallback: Extract FIRST sentence from hook for KEY DECISION
  const hook = episode.hook || "";
  if (hook.length > 20) {
    const sentences = hook.split(/[.!?]+/).filter(s => s.trim().length > 15);
    if (sentences.length > 0) {
      const sentence = sentences[0].trim();
      return sentence.length > 100 ? sentence.slice(0, 97) + "..." : sentence;
    }
  }
  if (hook.length > 100) {
    return hook.slice(0, 97) + "...";
  }
  return hook || "A critical decision point for scaling teams.";
}

function getReplayReason(episode: EpisodeCard): string {
  // Use episodeSummary replayReason if available (the SO WHAT - distinct from primaryInsight)
  if (episode.episodeSummary?.replayReason) {
    return episode.episodeSummary.replayReason;
  }
  // Fallback: Extract SECOND+ sentences from hook (distinct from primaryInsight)
  const hook = episode.hook || "";
  if (hook.length > 20) {
    const sentences = hook.split(/[.!?]+/).filter(s => s.trim().length > 15);
    if (sentences.length > 1) {
      // Join remaining sentences after the first one
      const remaining = sentences.slice(1).map(s => s.trim()).join(". ");
      return remaining.length > 150 ? remaining.slice(0, 147) + "..." : remaining + ".";
    }
  }
  // If only one sentence or no hook, use generic text to avoid duplication
  return "Structured analysis of key claims, insights, and narrative structure.";
}

function HoverPreviewDrawer({ 
  quote, 
  timestamp, 
  episodeId,
  visible,
}: { 
  quote: string;
  timestamp: number;
  episodeId: string;
  visible: boolean;
}) {
  if (!quote) return null;
  
  return (
    <div 
      className={`absolute left-0 right-0 bottom-0 z-10 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shadow-lg transition-all duration-200 ease-out ${
        visible 
          ? "opacity-100 translate-y-0" 
          : "opacity-0 translate-y-2 pointer-events-none"
      }`}
      style={{ visibility: visible ? "visible" : "hidden" }}
      data-testid="hover-preview-drawer"
    >
      <div className="p-3">
        <div className="flex items-start gap-2">
          <Quote className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-700 dark:text-slate-300 italic line-clamp-2">
              "{quote}"
            </p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {formatTimestamp(timestamp)}
              </span>
              <Link href={`/episode/${episodeId}?t=${timestamp}`}>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="text-primary gap-1"
                  data-testid="button-view-moment"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-xs">View moment</span>
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [showGate, setShowGate] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Check gate status
  useEffect(() => {
    if (user) {
      setShowGate(false);
      return;
    }
    const clicks = parseInt(localStorage.getItem(CLICK_STORAGE_KEY) || "0", 10);
    if (clicks >= GATE_THRESHOLD) {
      setShowGate(true);
    }
  }, [user]);

  // URL param sync
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const topic = params.get("topic");
    if (q) setSearchQuery(q);
    if (topic) setSelectedTopic(topic);
  }, []);

  const { data, isLoading } = useQuery<ExploreFeedResponse>({
    queryKey: ["/api/explore/feed"],
  });

  const handleEpisodeClick = () => {
    if (user) return;
    const clicks = parseInt(localStorage.getItem(CLICK_STORAGE_KEY) || "0", 10);
    const newClicks = clicks + 1;
    localStorage.setItem(CLICK_STORAGE_KEY, newClicks.toString());
    if (newClicks >= GATE_THRESHOLD) {
      setShowGate(true);
    }
  };

  // Update URL with search/topic params
  const updateUrlParams = useCallback((q: string, topic: string | null) => {
    const url = new URL(window.location.href);
    if (q) {
      url.searchParams.set("q", q);
    } else {
      url.searchParams.delete("q");
    }
    if (topic) {
      url.searchParams.set("topic", topic);
    } else {
      url.searchParams.delete("topic");
    }
    window.history.replaceState({}, "", url.toString());
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    updateUrlParams(value, selectedTopic);
  };

  const handleTopicClick = (topic: string) => {
    const newTopic = selectedTopic === topic ? null : topic;
    setSelectedTopic(newTopic);
    updateUrlParams(searchQuery, newTopic);
  };

  // Filter episodes by search and topic using themes array
  const filteredEpisodes = (data?.topEpisodes || []).filter((ep) => {
    const matchesSearch = !searchQuery || 
      ep.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ep.podcastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ep.hook.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTopic = !selectedTopic || (ep.themes || []).includes(selectedTopic);
    return matchesSearch && matchesTopic;
  });

  return (
    <>
      <Helmet>
        <title>Explore Podcast Insights | PodDNA</title>
        <meta
          name="description"
          content="Browse PodDNA's index of analyzed podcast conversations. Explore narrative maps, key claims, and insights from influential episodes."
        />
      </Helmet>

      <div className="min-h-screen bg-white dark:bg-background">
        {/* Trending Insight Hero */}
        <div className="border-b border-gray-100 dark:border-gray-800 bg-gradient-to-b from-amber-50/50 to-white dark:from-amber-950/20 dark:to-background">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
            {isLoading ? (
              <TrendingInsightSkeleton />
            ) : data?.heroInsight ? (
              <TrendingInsightHero insight={data.heroInsight} />
            ) : null}
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column - Main Content */}
            <div className="lg:col-span-8 space-y-8">
              {/* Search + Topic Filters */}
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="search"
                    placeholder="Search episodes, topics, or insights..."
                    className="pl-12 h-12 text-base border-gray-200 dark:border-gray-700 bg-white dark:bg-background"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    data-testid="input-explore-search"
                  />
                </div>
                
                {/* Topic Chips */}
                <div className="flex flex-wrap gap-2">
                  {(data?.trendingTopics || []).slice(0, 8).map((topic) => {
                    const colors = TOPIC_COLORS[topic.topic] || TOPIC_COLORS.General;
                    const isSelected = selectedTopic === topic.topic;
                    return (
                      <Tooltip key={topic.topic}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => handleTopicClick(topic.topic)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                              isSelected 
                                ? `${colors.bg} ${colors.text} ring-2 ring-offset-1 ring-current` 
                                : `${colors.bg} ${colors.text}`
                            }`}
                            data-testid={`chip-topic-${topic.topic}`}
                          >
                            {topic.topic}
                            <span className="ml-1 opacity-60">({topic.episodeCount})</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {topic.episodeCount} episodes with {topic.topic.toLowerCase()} insights
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>

              {/* Founder Playbooks Section */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-5 h-5 text-amber-500" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {selectedTopic 
                      ? `Insights where leaders discuss ${selectedTopic}` 
                      : "Founder Playbooks"}
                  </h2>
                </div>

                {isLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-64 rounded-xl" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Skeleton className="h-48 rounded-xl" />
                      <Skeleton className="h-48 rounded-xl" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Featured Playbook (large) */}
                    {data?.featuredPlaybook && (
                      <FeaturedPlaybookCard 
                        episode={data.featuredPlaybook} 
                        onClick={handleEpisodeClick}
                        isGated={showGate}
                      />
                    )}

                    {/* Episode Grid (smaller cards) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {filteredEpisodes.slice(0, 6).map((episode) => (
                        <PlaybookCard 
                          key={episode.id} 
                          episode={episode} 
                          onClick={handleEpisodeClick}
                          isGated={showGate}
                        />
                      ))}
                    </div>

                    {/* Show more - momentum copy */}
                    {filteredEpisodes.length > 6 && (
                      <div className="text-center pt-6 pb-2">
                        <div className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <TrendingUp className="w-4 h-4 text-primary" />
                          <span>Patterns emerge as you explore more episodes</span>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {filteredEpisodes.length} episodes analyzed
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Sidebar */}
            <div className="lg:col-span-4 space-y-6">
              {/* Most Debated Insight - Curiosity Module */}
              <MostDebatedInsight 
                quotes={data?.mostCitedQuotes || []}
                isLoading={isLoading}
              />

              {/* Trending Insights */}
              <TrendingInsights 
                insights={data?.trendingInsights || []} 
                isLoading={isLoading}
              />

              {/* Most Cited Quotes */}
              <MostCitedQuotes 
                quotes={data?.mostCitedQuotes || []} 
                isLoading={isLoading} 
              />

              {/* Top Episodes Mini List */}
              <TopEpisodesMiniList 
                episodes={data?.topEpisodes?.slice(0, 5) || []} 
                isLoading={isLoading}
                onClick={handleEpisodeClick}
                isGated={showGate}
              />

              {/* CTA Card */}
              <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 border-amber-200 dark:border-amber-800">
                <CardContent className="p-5 text-center">
                  <Sparkles className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                    Analyze Your Podcast
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Get AI-powered insights, claims extraction, and narrative maps.
                  </p>
                  <Link href="/create">
                    <Button className="w-full gap-2" data-testid="button-analyze-cta">
                      <Sparkles className="w-4 h-4" />
                      Get Started Free
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Gate Modal (inline) */}
        {showGate && !user && (
          <InlineGate />
        )}

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-center">
            <p className="text-xs text-gray-400">
              PodDNA provides AI-generated analysis of public podcast content. 
              Insights are derived from transcripts and may not reflect speaker intent.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ============ Components ============

function TrendingInsightHero({ insight }: { insight: ExploreFeedResponse["heroInsight"] }) {
  if (!insight) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
        <Flame className="w-5 h-5" />
        <span className="text-sm font-semibold uppercase tracking-wide">Trending Insight This Week</span>
      </div>

      <div className="max-w-3xl">
        <h1 
          className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-3 leading-tight"
          data-testid="text-hero-title"
        >
          "{insight.sourceQuote?.text || insight.title}"
        </h1>

        <p className="text-sm text-amber-700 dark:text-amber-300 font-medium mb-2">
          Why this insight keeps resurfacing in fast-scaling companies.
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-600 dark:text-gray-400 text-sm mb-4">
          <span>{insight.episodeCount} episodes</span>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <span>{Math.round(insight.totalMinutes / 60)}+ hours of discussion</span>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">↗ Seed → IPO coverage</span>
        </div>

        {/* Topic Tags */}
        <div className="flex flex-wrap gap-2 mb-6">
          {insight.topicTags.map((tag) => {
            const colors = TOPIC_COLORS[tag] || TOPIC_COLORS.General;
            return (
              <Badge 
                key={tag} 
                variant="outline" 
                className={`${colors.bg} ${colors.text} ${colors.border}`}
              >
                {tag}
              </Badge>
            );
          })}
        </div>

        {/* CTA */}
        <Link href={insight.sourceQuote ? `/episode/${insight.sourceQuote.episodeId}` : "/explore"}>
          <Button size="lg" className="gap-2" data-testid="button-explore-idea">
            See how leaders apply this at different stages
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

function TrendingInsightSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-12 w-full max-w-2xl" />
      <Skeleton className="h-5 w-64" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-16" />
      </div>
      <Skeleton className="h-11 w-40" />
    </div>
  );
}

function FeaturedPlaybookCard({ 
  episode, 
  onClick,
  isGated,
}: { 
  episode: EpisodeCard; 
  onClick: () => void;
  isGated: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const { toast } = useToast();

  const handleGatedClick = () => {
    toast({
      title: "Sign in to continue",
      description: "Create a free account to unlock full access.",
    });
  };

  const content = (
    <Card 
      className="hover-elevate transition-all border-2 border-gray-100 dark:border-gray-800 overflow-visible relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="p-6">
        <div className="flex gap-4">
          {episode.podcastImageUrl && (
            <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
              <img src={episode.podcastImageUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 
              className="font-bold text-lg sm:text-xl text-gray-900 dark:text-white line-clamp-2 mb-2"
              data-testid={`text-featured-title`}
            >
              {episode.title}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              {episode.podcastName}
              {episode.durationSec && <span className="mx-1.5">·</span>}
              {episode.durationSec && formatDuration(episode.durationSec)}
            </p>
          </div>
        </div>

        {/* Key Pattern */}
        <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            {getInsightLabel(episode)}
          </p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {extractKeyPattern(episode)}
          </p>
        </div>

        {/* Quote */}
        {episode.bestQuote && (
          <div className="mt-4 pl-4 border-l-4 border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 py-2 pr-3 rounded-r">
            <p className="text-gray-700 dark:text-gray-300 italic line-clamp-2">
              "{episode.bestQuote}"
            </p>
          </div>
        )}

        {/* Replay Reason / Why founders replay this */}
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Why founders replay this
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
            {getReplayReason(episode)}
          </p>
        </div>

        {/* Badges & CTA */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {episode.badges.hasNarrative && (
            <Badge variant="secondary" className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 gap-1">
              <MapIcon className="w-3 h-3" />
              {episode.badges.narrativeSegmentCount} segments
            </Badge>
          )}
          {episode.badges.claimsCount > 0 && (
            <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 gap-1">
              <MessageSquare className="w-3 h-3" />
              {episode.badges.claimsCount} claims
            </Badge>
          )}
          <span className="ml-auto text-sm font-medium text-primary flex items-center gap-1">
            {isGated && <Lock className="w-3 h-3" />}
            View analysis
            <ArrowRight className="w-4 h-4" />
          </span>
        </div>
      </CardContent>
      
      {episode.bestQuote && (
        <HoverPreviewDrawer
          quote={episode.bestQuote}
          timestamp={episode.bestQuoteTime || 0}
          episodeId={episode.id}
          visible={isHovered && !isGated}
        />
      )}
    </Card>
  );

  if (isGated) {
    return (
      <div onClick={handleGatedClick} className="cursor-pointer opacity-90" data-testid="card-featured-playbook">
        {content}
      </div>
    );
  }

  return (
    <Link href={episode.analysisUrl} onClick={onClick}>
      <div data-testid="card-featured-playbook">{content}</div>
    </Link>
  );
}

function PlaybookCard({ 
  episode, 
  onClick,
  isGated,
}: { 
  episode: EpisodeCard; 
  onClick: () => void;
  isGated: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const { toast } = useToast();

  const handleGatedClick = () => {
    toast({
      title: "Sign in to continue",
      description: "Create a free account to unlock full access.",
    });
  };

  const content = (
    <Card 
      className="hover-elevate transition-all h-full border border-gray-100 dark:border-gray-800 overflow-visible relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="p-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
          {getInsightLabel(episode)}
        </p>
        <h3 
          className="font-semibold text-gray-900 dark:text-white line-clamp-2 mb-2"
          data-testid={`text-playbook-title-${episode.id}`}
        >
          {episode.title}
        </h3>

        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2 mb-2">
          {extractKeyPattern(episode)}
        </p>

        {episode.bestQuote && (
          <p className="text-xs text-gray-500 dark:text-gray-400 italic line-clamp-2 mb-3">
            "{episode.bestQuote}"
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-2">
          {episode.badges.hasNarrative && (
            <Badge variant="secondary" className="text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
              <MapIcon className="w-2.5 h-2.5 mr-1" />
              Narrative
            </Badge>
          )}
          {episode.badges.momentsCount > 0 && (
            <Badge variant="secondary" className="text-xs bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400">
              {episode.badges.momentsCount} Moments
            </Badge>
          )}
          <span className="ml-auto text-xs font-medium text-primary flex items-center">
            View
            <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </CardContent>
      
      {episode.bestQuote && (
        <HoverPreviewDrawer
          quote={episode.bestQuote}
          timestamp={episode.bestQuoteTime || 0}
          episodeId={episode.id}
          visible={isHovered && !isGated}
        />
      )}
    </Card>
  );

  if (isGated) {
    return (
      <div onClick={handleGatedClick} className="cursor-pointer opacity-75" data-testid={`card-playbook-${episode.id}`}>
        {content}
      </div>
    );
  }

  return (
    <Link href={episode.analysisUrl} onClick={onClick}>
      <div data-testid={`card-playbook-${episode.id}`}>{content}</div>
    </Link>
  );
}

function MostDebatedInsight({ 
  quotes, 
  isLoading,
}: { 
  quotes: ExploreFeedResponse["mostCitedQuotes"];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="border-2 border-rose-200 dark:border-rose-800 bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-950/30 dark:to-orange-950/30">
        <CardContent className="p-4">
          <Skeleton className="h-5 w-40 mb-3" />
          <Skeleton className="h-16 w-full mb-2" />
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (!quotes || quotes.length === 0) return null;

  const debatedQuote = quotes[0];

  return (
    <Card className="border-2 border-rose-200 dark:border-rose-800 bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-950/30 dark:to-orange-950/30">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Flame className="w-4 h-4 text-rose-500" />
          <h3 className="font-bold text-rose-700 dark:text-rose-400 text-sm uppercase tracking-wide">
            Most Debated This Week
          </h3>
        </div>
        <p className="text-gray-900 dark:text-white font-medium mb-2 line-clamp-3">
          "{debatedQuote.text}"
        </p>
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">
            {debatedQuote.episodeTitle}
          </p>
          <Link href={`/episode/${debatedQuote.episodeId}`}>
            <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700 dark:text-rose-400 px-2 gap-1">
              Explore
              <ChevronRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function TrendingInsights({ 
  insights, 
  isLoading,
}: { 
  insights: { 
    claim: string; 
    theme: string; 
    episodeId: string; 
    episodeTitle: string; 
    podcastName: string;
    confidence: number;
    episodeCount: number;
  }[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-5 w-32 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!insights || insights.length === 0) {
    return null;
  }

  return (
    <Card data-testid="card-trending-insights">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Trending Insights</h3>
        </div>
        <div className="space-y-3">
          {insights.slice(0, 5).map((insight, idx) => (
            <Link 
              key={idx} 
              href={`/episode/${insight.episodeId}`}
              className="block group"
              data-testid={`link-trending-insight-${idx}`}
            >
              <div className="p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2 group-hover:text-primary transition-colors">
                  "{insight.claim}"
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {insight.theme}
                  </Badge>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                    from {insight.podcastName}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MostCitedQuotes({ 
  quotes, 
  isLoading,
}: { 
  quotes: ExploreFeedResponse["mostCitedQuotes"];
  isLoading: boolean;
}) {
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const { toast } = useToast();

  const handleCopy = async (quote: typeof quotes[0], index: number) => {
    const text = `"${quote.text}" — ${quote.episodeTitle} (${formatTimestamp(quote.timestamp)})`;
    await navigator.clipboard.writeText(text);
    setCopiedId(index);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-5 w-32 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (quotes.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Quote className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Most Cited Quotes</h3>
        </div>
        <div className="space-y-3">
          {quotes.slice(0, 5).map((quote, i) => (
            <div 
              key={i} 
              className="group relative p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
            >
              <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 italic pr-8">
                "{quote.text}"
              </p>
              <p className="text-xs text-gray-400 mt-1 truncate">
                {quote.episodeTitle}
              </p>
              <button
                onClick={() => handleCopy(quote, i)}
                className="absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200 dark:hover:bg-gray-700"
                data-testid={`button-copy-quote-${i}`}
              >
                {copiedId === i ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-gray-400" />
                )}
              </button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TopEpisodesMiniList({ 
  episodes, 
  isLoading,
  onClick,
  isGated,
}: { 
  episodes: EpisodeCard[];
  isLoading: boolean;
  onClick: () => void;
  isGated: boolean;
}) {
  const { toast } = useToast();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-5 w-32 mb-4" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleGatedClick = () => {
    toast({
      title: "Sign in to continue",
      description: "Create a free account to unlock full access.",
    });
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Top Episodes</h3>
        </div>
        <div className="space-y-1">
          {episodes.map((ep, i) => {
            const content = (
              <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <span className="text-sm font-medium text-gray-400 w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    {ep.title}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </div>
            );

            if (isGated) {
              return (
                <div key={ep.id} onClick={handleGatedClick} className="cursor-pointer opacity-75">
                  {content}
                </div>
              );
            }

            return (
              <Link key={ep.id} href={ep.analysisUrl} onClick={onClick}>
                {content}
              </Link>
            );
          })}
        </div>
        <Link href="/explore">
          <button className="mt-3 text-sm text-primary font-medium flex items-center gap-1">
            View your ideas
            <ChevronRight className="w-4 h-4" />
          </button>
        </Link>
      </CardContent>
    </Card>
  );
}

function InlineGate() {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-transparent dark:from-background dark:via-background pt-16 pb-6 px-4 z-50">
      <Card className="max-w-lg mx-auto bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/50 dark:to-yellow-950/50 border-amber-200 dark:border-amber-800">
        <CardContent className="p-6 text-center">
          <Sparkles className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
            Continue Exploring
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Sign in to unlock all insights, claims, and narrative maps.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/login">
              <Button variant="outline" className="gap-2" data-testid="gate-button-sign-in">
                <LogIn className="w-4 h-4" />
                Sign in
              </Button>
            </Link>
            <Link href="/create">
              <Button className="gap-2" data-testid="gate-button-analyze">
                <Sparkles className="w-4 h-4" />
                Analyze your podcast
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
