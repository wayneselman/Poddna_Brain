import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Helmet } from "react-helmet";
import { SiYoutube } from "react-icons/si";
import { 
  Loader2, 
  AlertCircle, 
  ShieldCheck, 
  Megaphone, 
  AlertTriangle, 
  Clock, 
  FileText,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ArrowRight,
  Sparkles,
  Building2,
  Mail,
  CheckCircle2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SponsorSegment {
  startTime: number;
  endTime: number;
  brand: string | null;
  confidence: number;
  excerpt: string;
}

interface ClaimSegment {
  startTime: number;
  endTime: number | null;
  claimText: string;
  claimType: string;
  confidence: number;
}

interface AnalysisResults {
  videoTitle: string;
  videoDuration: number | null;
  channelName: string | null;
  transcriptSegmentCount: number;
  sponsors: SponsorSegment[];
  claims: ClaimSegment[];
  healthScore: number;
  summary: string;
}

interface AnalyzerRequest {
  id: string;
  status: "pending" | "processing" | "ready" | "error";
  youtubeUrl: string;
  createdAt: string;
  results?: AnalysisResults;
  errorMessage?: string;
}

function formatTimestamp(seconds: number | null): string {
  if (seconds === null) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "Unknown duration";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m`;
}

function getHealthScoreColor(score: number): string {
  if (score >= 80) return "text-green-600 dark:text-green-400";
  if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function getHealthScoreBg(score: number): string {
  if (score >= 80) return "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800";
  if (score >= 60) return "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800";
  return "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800";
}

function getClaimTypeBadgeColor(type: string): string {
  switch (type) {
    case "financial":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "medical":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "sensitive":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  }
}

function AnalyzerForm({ onSubmit, isLoading }: { onSubmit: (url: string) => void; isLoading: boolean }) {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit(url.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <SiYoutube className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
          <Input
            type="url"
            placeholder="Paste a YouTube podcast URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="pl-12 pr-4 py-6 text-lg rounded-xl border-gray-300 dark:border-gray-700 focus:border-yellow-500 focus:ring-yellow-500"
            disabled={isLoading}
            data-testid="input-youtube-url"
          />
        </div>
        <Button 
          type="submit" 
          size="lg"
          className="px-8 py-6 text-lg rounded-xl bg-yellow-500 hover:bg-yellow-600 text-black font-semibold"
          disabled={isLoading || !url.trim()}
          data-testid="button-analyze"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              Generate Snapshot
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function LeadCaptureForm({ episodeUrl }: { episodeUrl: string }) {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const submitMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/analyzer/leads", { 
        email: email.trim().toLowerCase(), 
        company: company.trim() || null, 
        episodeUrl,
        source: "analyzer"
      });
      return response;
    },
    onSuccess: () => {
      setIsSubmitted(true);
      toast({
        title: "Thank you!",
        description: "We'll be in touch soon with more insights.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && email.includes("@")) {
      submitMutation.mutate();
    }
  };

  if (isSubmitted) {
    return (
      <Card className="border-2 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
        <CardContent className="p-6 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-600 dark:text-green-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-1" data-testid="text-lead-success-title">
            Thanks for your interest!
          </h3>
          <p className="text-gray-600 dark:text-muted-foreground text-sm" data-testid="text-lead-success-message">
            We'll reach out soon with more podcast intelligence insights and early access to new features.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
      <CardContent className="p-6">
        <div className="text-center mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-1" data-testid="text-lead-form-title">
            Get deeper insights for your business
          </h3>
          <p className="text-gray-600 dark:text-muted-foreground text-sm" data-testid="text-lead-form-subtitle">
            Leave your email to learn how podcast intelligence can help your team.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="email"
                placeholder="Work email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                required
                disabled={submitMutation.isPending}
                data-testid="input-lead-email"
              />
            </div>
            <div className="relative flex-1">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Company (optional)"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="pl-10"
                disabled={submitMutation.isPending}
                data-testid="input-lead-company"
              />
            </div>
          </div>
          <Button 
            type="submit" 
            className="w-full bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 dark:text-gray-900"
            disabled={submitMutation.isPending || !email.trim() || !email.includes("@")}
            data-testid="button-submit-lead"
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Get Insights"
            )}
          </Button>
          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            No spam. Just podcast intelligence.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

function LoadingState({ status }: { status: string }) {
  const messages: Record<string, string> = {
    pending: "Initializing analysis...",
    processing: "Analyzing transcript, detecting sponsors and claims...",
  };

  return (
    <div className="text-center py-16">
      <div className="inline-flex items-center justify-center w-20 h-20 bg-yellow-100 dark:bg-yellow-900/20 rounded-full mb-6">
        <Loader2 className="w-10 h-10 text-yellow-600 animate-spin" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-3" data-testid="text-loading-title">
        Analyzing Your Podcast
      </h2>
      <p className="text-gray-600 dark:text-muted-foreground max-w-md mx-auto" data-testid="text-loading-message">
        {messages[status] || "Processing..."}
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
        This typically takes 30-60 seconds for a standard episode.
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="text-center py-16">
      <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 dark:bg-red-900/20 rounded-full mb-6">
        <AlertCircle className="w-10 h-10 text-red-600" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-3" data-testid="text-error-title">
        Analysis Failed
      </h2>
      <p className="text-gray-600 dark:text-muted-foreground max-w-md mx-auto mb-6" data-testid="text-error-message">
        {message}
      </p>
      <Button onClick={onRetry} variant="outline" data-testid="button-retry">
        Try Again
      </Button>
    </div>
  );
}

function SponsorCard({ sponsor, index }: { sponsor: SponsorSegment; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border border-gray-200 dark:border-border" data-testid={`card-sponsor-${index}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                <Clock className="w-3 h-3 mr-1" />
                {formatTimestamp(sponsor.startTime)}
              </Badge>
              {sponsor.brand && (
                <Badge variant="outline">{sponsor.brand}</Badge>
              )}
              <Badge variant="secondary" className="text-xs">
                {sponsor.confidence}% confidence
              </Badge>
            </div>
            <p className={`text-sm text-gray-600 dark:text-muted-foreground ${expanded ? "" : "line-clamp-2"}`}>
              {sponsor.excerpt}
            </p>
          </div>
          {sponsor.excerpt.length > 100 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setExpanded(!expanded)}
              className="flex-shrink-0"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ClaimCard({ claim, index }: { claim: ClaimSegment; index: number }) {
  return (
    <Card className="border border-gray-200 dark:border-border" data-testid={`card-claim-${index}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className={getClaimTypeBadgeColor(claim.claimType)}>
                {claim.claimType}
              </Badge>
              <Badge variant="secondary" className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                <Clock className="w-3 h-3 mr-1" />
                {formatTimestamp(claim.startTime)}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {claim.confidence}% confidence
              </Badge>
            </div>
            <p className="text-sm text-gray-700 dark:text-muted-foreground">
              "{claim.claimText}"
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultsDisplay({ results, youtubeUrl }: { results: AnalysisResults; youtubeUrl: string }) {
  const [showAllSponsors, setShowAllSponsors] = useState(false);
  const [showAllClaims, setShowAllClaims] = useState(false);

  const displayedSponsors = showAllSponsors ? results.sponsors : results.sponsors.slice(0, 3);
  const displayedClaims = showAllClaims ? results.claims : results.claims.slice(0, 5);

  const claimsByType: Record<string, number> = {};
  for (const claim of results.claims) {
    claimsByType[claim.claimType] = (claimsByType[claim.claimType] || 0) + 1;
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-foreground mb-2" data-testid="text-results-title">
          {results.videoTitle}
        </h2>
        <div className="flex items-center justify-center gap-4 text-gray-600 dark:text-muted-foreground">
          {results.channelName && (
            <span className="flex items-center gap-1">
              <SiYoutube className="w-4 h-4 text-red-500" />
              {results.channelName}
            </span>
          )}
          {results.videoDuration && (
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {formatDuration(results.videoDuration)}
            </span>
          )}
          <a 
            href={youtubeUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-600 hover:underline"
          >
            <ExternalLink className="w-4 h-4" />
            Watch
          </a>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className={`border-2 ${getHealthScoreBg(results.healthScore)}`} data-testid="card-health-score">
          <CardContent className="p-6 text-center">
            <div className={`text-5xl font-bold mb-2 ${getHealthScoreColor(results.healthScore)}`}>
              {results.healthScore}
            </div>
            <div className="text-sm text-gray-600 dark:text-muted-foreground font-medium">
              Integrity Score
            </div>
            <ShieldCheck className={`w-6 h-6 mx-auto mt-2 ${getHealthScoreColor(results.healthScore)}`} />
          </CardContent>
        </Card>

        <Card className="border border-gray-200 dark:border-border" data-testid="card-sponsors-count">
          <CardContent className="p-6 text-center">
            <div className="text-5xl font-bold mb-2 text-orange-600 dark:text-orange-400">
              {results.sponsors.length}
            </div>
            <div className="text-sm text-gray-600 dark:text-muted-foreground font-medium">
              Sponsor Segments
            </div>
            <Megaphone className="w-6 h-6 mx-auto mt-2 text-orange-500" />
          </CardContent>
        </Card>

        <Card className="border border-gray-200 dark:border-border" data-testid="card-claims-count">
          <CardContent className="p-6 text-center">
            <div className="text-5xl font-bold mb-2 text-blue-600 dark:text-blue-400">
              {results.claims.length}
            </div>
            <div className="text-sm text-gray-600 dark:text-muted-foreground font-medium">
              Verifiable Claims
            </div>
            <AlertTriangle className="w-6 h-6 mx-auto mt-2 text-blue-500" />
          </CardContent>
        </Card>
      </div>

      <Card className="border border-gray-200 dark:border-border">
        <CardContent className="p-6">
          <p className="text-lg text-gray-700 dark:text-muted-foreground leading-relaxed" data-testid="text-summary">
            {results.summary}
          </p>
        </CardContent>
      </Card>

      {results.sponsors.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-orange-500" />
              Sponsor Segments
            </h3>
            {results.sponsors.length > 3 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowAllSponsors(!showAllSponsors)}
                data-testid="button-show-all-sponsors"
              >
                {showAllSponsors ? "Show Less" : `Show All (${results.sponsors.length})`}
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {displayedSponsors.map((sponsor, i) => (
              <SponsorCard key={i} sponsor={sponsor} index={i} />
            ))}
          </div>
        </div>
      )}

      {results.claims.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-blue-500" />
              Verifiable Claims
              {Object.keys(claimsByType).length > 0 && (
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({Object.entries(claimsByType).map(([type, count]) => `${count} ${type}`).join(", ")})
                </span>
              )}
            </h3>
            {results.claims.length > 5 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowAllClaims(!showAllClaims)}
                data-testid="button-show-all-claims"
              >
                {showAllClaims ? "Show Less" : `Show All (${results.claims.length})`}
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {displayedClaims.map((claim, i) => (
              <ClaimCard key={i} claim={claim} index={i} />
            ))}
          </div>
        </div>
      )}

      <Card className="border-2 border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-1">
                Need Full Portfolio Intelligence?
              </h3>
              <p className="text-gray-600 dark:text-muted-foreground text-sm">
                Get transcript diffing, batch processing, exports, and governance workflows for your organization.
              </p>
            </div>
            <Link href="/request-demo">
              <Button className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold" data-testid="button-upgrade-cta">
                <ArrowRight className="w-4 h-4 mr-2" />
                Request a Demo
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <LeadCaptureForm episodeUrl={youtubeUrl} />

      <div className="text-center pt-4">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Analyzed {results.transcriptSegmentCount} transcript segments
        </p>
        <Button variant="outline" onClick={() => window.location.reload()} data-testid="button-analyze-another">
          Analyze Another Episode
        </Button>
      </div>
    </div>
  );
}

export default function AnalyzerPage() {
  const [, setLocation] = useLocation();
  const [requestId, setRequestId] = useState<string | null>(null);
  const { toast } = useToast();

  const submitMutation = useMutation({
    mutationFn: async (youtubeUrl: string) => {
      const response = await apiRequest("POST", "/api/analyzer", { youtubeUrl });
      return response.json();
    },
    onSuccess: (data) => {
      setRequestId(data.id);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start analysis",
        variant: "destructive",
      });
    },
  });

  const { data: request, refetch } = useQuery<AnalyzerRequest>({
    queryKey: ["/api/analyzer", requestId],
    queryFn: async () => {
      const response = await fetch(`/api/analyzer/${requestId}`);
      if (!response.ok) throw new Error("Failed to fetch status");
      return response.json();
    },
    enabled: !!requestId,
    refetchInterval: (data) => {
      if (data?.state?.data?.status === "ready" || data?.state?.data?.status === "error") {
        return false;
      }
      return 3000;
    },
  });

  const handleSubmit = (url: string) => {
    setRequestId(null);
    submitMutation.mutate(url);
  };

  const handleRetry = () => {
    setRequestId(null);
    submitMutation.reset();
  };

  const isLoading = submitMutation.isPending || 
    (request?.status === "pending" || request?.status === "processing");
  const hasError = request?.status === "error";
  const hasResults = request?.status === "ready" && request.results;

  return (
    <div className="min-h-screen bg-white dark:bg-background">
      <Helmet>
        <title>Podcast Intelligence Preview | PodDNA</title>
        <meta name="description" content="Preview PodDNA's semantic intelligence on any YouTube podcast. Detect sponsors, verify claims, and check content integrity." />
      </Helmet>

      {/* B2B Repositioning Banner */}
      <div className="bg-gray-900 dark:bg-gray-800 text-white px-4 py-3">
        <div className="max-w-4xl mx-auto text-center text-sm">
          <span className="font-medium">Preview Mode:</span>{" "}
          This preview demonstrates PodDNA's semantic intelligence on a single episode. Portfolio monitoring, exports, and governance workflows require a{" "}
          <Link href="/request-demo" className="text-yellow-400 hover:text-yellow-300 underline font-medium">
            PodDNA deployment
          </Link>.
        </div>
      </div>

      <section className="py-16 lg:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          {!requestId && !submitMutation.isPending && (
            <>
              <div className="text-center mb-12">
                <Badge className="mb-4 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 hover-elevate" data-testid="badge-beta">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Limited Preview
                </Badge>
                <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 dark:text-foreground mb-4" data-testid="text-page-title">
                  Podcast Intelligence Preview
                </h1>
                <p className="text-xl text-gray-600 dark:text-muted-foreground max-w-2xl mx-auto" data-testid="text-page-subtitle">
                  Paste any YouTube podcast URL to instantly detect sponsors, verify claims, and check content integrity.
                </p>
              </div>

              <AnalyzerForm onSubmit={handleSubmit} isLoading={false} />

              <div className="mt-12 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Works with any YouTube video that has captions
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <ShieldCheck className="w-4 h-4 text-green-500" />
                    Integrity scoring
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <Megaphone className="w-4 h-4 text-orange-500" />
                    Sponsor detection
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <AlertTriangle className="w-4 h-4 text-blue-500" />
                    Claims extraction
                  </div>
                </div>
              </div>
            </>
          )}

          {(submitMutation.isPending || (isLoading && !hasResults)) && (
            <LoadingState status={request?.status || "pending"} />
          )}

          {hasError && (
            <ErrorState 
              message={request?.errorMessage || "An unknown error occurred"} 
              onRetry={handleRetry} 
            />
          )}

          {hasResults && request?.results && (
            <ResultsDisplay results={request.results} youtubeUrl={request.youtubeUrl} />
          )}
        </div>
      </section>
    </div>
  );
}
