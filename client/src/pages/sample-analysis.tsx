import { Link } from "wouter";
import { Helmet } from "react-helmet";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowRight, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Megaphone,
  FileText,
  BarChart3,
  MessageSquareQuote,
  ChevronDown,
  ChevronUp,
  Play
} from "lucide-react";
import { useState } from "react";

const SAMPLE_EPISODE_ID = "6b111d60-c9a1-4874-ac92-37736568afed";

interface EpisodeClaim {
  id: string;
  claimText: string;
  claimType: string;
  confidence: number;
  startTime: number;
}

interface SponsorSegment {
  id: string;
  brand: string | null;
  excerpt: string;
  confidence: number;
  startTime: number;
}

interface EpisodeChapter {
  id: string;
  title: string;
  summary: string | null;
  startTime: number;
}

interface EpisodeData {
  id: string;
  title: string;
  description: string | null;
  duration: number | null;
  publishedAt: string | null;
  podcast: {
    title: string;
    artworkUrl: string | null;
  };
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function ClaimTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    financial: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    medical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    sensitive: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    other: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  };
  
  return (
    <Badge className={colors[type] || colors.other} variant="secondary">
      {type}
    </Badge>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color = confidence >= 80 
    ? "text-green-600 dark:text-green-400" 
    : confidence >= 50 
      ? "text-yellow-600 dark:text-yellow-400" 
      : "text-red-600 dark:text-red-400";
  
  return (
    <span className={`text-sm font-medium ${color}`}>
      {confidence}% confidence
    </span>
  );
}

export default function SampleAnalysisPage() {
  const [showAllClaims, setShowAllClaims] = useState(false);

  const { data: episode, isLoading: episodeLoading } = useQuery<EpisodeData>({
    queryKey: [`/api/episodes/${SAMPLE_EPISODE_ID}`],
  });

  const { data: claimsData, isLoading: claimsLoading } = useQuery<{ claims: EpisodeClaim[] }>({
    queryKey: [`/api/episodes/${SAMPLE_EPISODE_ID}/claims`],
  });

  const { data: sponsorsData, isLoading: sponsorsLoading } = useQuery<{ sponsors: SponsorSegment[] }>({
    queryKey: [`/api/episodes/${SAMPLE_EPISODE_ID}/sponsors`],
  });

  const { data: chaptersData, isLoading: chaptersLoading } = useQuery<{ chapters: EpisodeChapter[] }>({
    queryKey: [`/api/episodes/${SAMPLE_EPISODE_ID}/chapters`],
  });

  const claims = claimsData?.claims || [];
  const sponsors = sponsorsData?.sponsors || [];
  const chapters = chaptersData?.chapters || [];
  
  const displayedClaims = showAllClaims ? claims : claims.slice(0, 5);
  const claimsByType = claims.reduce((acc, claim) => {
    acc[claim.claimType] = (acc[claim.claimType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const isLoading = episodeLoading || claimsLoading || sponsorsLoading || chaptersLoading;

  return (
    <div className="min-h-screen bg-white dark:bg-background">
      <Helmet>
        <title>Sample Analysis - PodDNA | See Our Intelligence in Action</title>
        <meta name="description" content="Explore a real podcast analysis with AI-powered claim detection, sponsor identification, and semantic understanding. See what PodDNA can do for your content." />
      </Helmet>
      
      {/* Hero */}
      <section className="py-12 bg-gray-50 dark:bg-muted/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8">
            <Badge variant="secondary" className="mb-4">Sample Analysis</Badge>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-foreground mb-4" data-testid="text-sample-title">
              See PodDNA in Action
            </h1>
            <p className="text-lg text-gray-600 dark:text-muted-foreground max-w-2xl mx-auto">
              This is an actual analysis from our platform. See the depth of intelligence we extract from every episode.
            </p>
          </div>

          {/* Episode Card */}
          {episodeLoading ? (
            <Card className="p-6 max-w-3xl mx-auto">
              <div className="flex gap-4">
                <Skeleton className="w-24 h-24 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-4" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            </Card>
          ) : episode ? (
            <Card className="p-6 max-w-3xl mx-auto" data-testid="card-episode">
              <div className="flex gap-4">
                <div className="w-24 h-24 rounded-lg bg-gray-200 dark:bg-muted overflow-hidden flex-shrink-0">
                  {episode.podcast?.artworkUrl ? (
                    <img 
                      src={episode.podcast.artworkUrl} 
                      alt={episode.podcast.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Play className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-foreground mb-1 line-clamp-2">
                    {episode.title}
                  </h2>
                  <p className="text-gray-600 dark:text-muted-foreground text-sm mb-2">
                    {episode.podcast?.title}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-muted-foreground">
                    {episode.duration && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {Math.floor(episode.duration / 60)} min
                      </span>
                    )}
                    {episode.publishedAt && (
                      <span>
                        {new Date(episode.publishedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      </section>

      {/* Analysis Summary */}
      <section className="py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-6" data-testid="text-summary-title">
            Analysis Summary
          </h2>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-foreground">
                    {isLoading ? <Skeleton className="h-7 w-12" /> : claims.length}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-muted-foreground">Claims Detected</p>
                </div>
              </div>
            </Card>
            
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Megaphone className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-foreground">
                    {isLoading ? <Skeleton className="h-7 w-12" /> : sponsors.length}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-muted-foreground">Sponsor Segments</p>
                </div>
              </div>
            </Card>
            
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-foreground">
                    {isLoading ? <Skeleton className="h-7 w-12" /> : chapters.length}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-muted-foreground">Chapters</p>
                </div>
              </div>
            </Card>
            
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-foreground">
                    {isLoading ? <Skeleton className="h-7 w-12" /> : Object.keys(claimsByType).length}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-muted-foreground">Claim Categories</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Claims Section */}
          <div className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-foreground">
                Claims Analysis
              </h3>
              {!isLoading && Object.keys(claimsByType).length > 0 && (
                <div className="flex gap-2">
                  {Object.entries(claimsByType).map(([type, count]) => (
                    <Badge key={type} variant="outline" className="text-xs">
                      {type}: {count}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {claimsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : claims.length > 0 ? (
              <>
                <div className="space-y-3">
                  {displayedClaims.map((claim) => (
                    <Card key={claim.id} className="p-4" data-testid={`claim-card-${claim.id}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <ClaimTypeBadge type={claim.claimType} />
                            <span className="text-xs text-gray-500 dark:text-muted-foreground">
                              @ {formatTime(claim.startTime)}
                            </span>
                          </div>
                          <p className="text-gray-900 dark:text-foreground">
                            "{claim.claimText}"
                          </p>
                        </div>
                        <ConfidenceBadge confidence={claim.confidence} />
                      </div>
                    </Card>
                  ))}
                </div>
                {claims.length > 5 && (
                  <Button 
                    variant="ghost" 
                    className="w-full mt-4 gap-2"
                    onClick={() => setShowAllClaims(!showAllClaims)}
                    data-testid="button-show-more-claims"
                  >
                    {showAllClaims ? (
                      <>Show Less <ChevronUp className="w-4 h-4" /></>
                    ) : (
                      <>Show All {claims.length} Claims <ChevronDown className="w-4 h-4" /></>
                    )}
                  </Button>
                )}
              </>
            ) : (
              <p className="text-gray-500 dark:text-muted-foreground text-center py-8">
                No claims detected for this episode.
              </p>
            )}
          </div>

          {/* Sponsors Section */}
          {sponsors.length > 0 && (
            <div className="mb-12">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-foreground mb-4">
                Sponsor Context
              </h3>
              <div className="space-y-3">
                {sponsors.map((sponsor) => (
                  <Card key={sponsor.id} className="p-4" data-testid={`sponsor-card-${sponsor.id}`}>
                    <div className="flex items-start gap-3">
                      <Megaphone className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {sponsor.brand && (
                            <Badge variant="secondary">{sponsor.brand}</Badge>
                          )}
                          <span className="text-xs text-gray-500 dark:text-muted-foreground">
                            @ {formatTime(sponsor.startTime)}
                          </span>
                          <ConfidenceBadge confidence={sponsor.confidence} />
                        </div>
                        <p className="text-gray-600 dark:text-muted-foreground text-sm">
                          "{sponsor.excerpt}"
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Chapters Section */}
          {chapters.length > 0 && (
            <div className="mb-12">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-foreground mb-4">
                Episode Structure
              </h3>
              <div className="space-y-2">
                {chapters.map((chapter, index) => (
                  <Card key={chapter.id} className="p-4" data-testid={`chapter-card-${chapter.id}`}>
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium flex-shrink-0">
                        {index + 1}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-gray-900 dark:text-foreground">
                            {chapter.title}
                          </h4>
                          <span className="text-xs text-gray-500 dark:text-muted-foreground">
                            {formatTime(chapter.startTime)}
                          </span>
                        </div>
                        {chapter.summary && (
                          <p className="text-gray-600 dark:text-muted-foreground text-sm">
                            {chapter.summary}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Why It Matters */}
      <section className="py-12 bg-gray-50 dark:bg-muted/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-6 text-center" data-testid="text-why-matters">
            Why This Matters
          </h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="p-6">
              <MessageSquareQuote className="w-8 h-8 text-primary mb-4" />
              <h3 className="font-semibold text-gray-900 dark:text-foreground mb-2">
                This is One Episode
              </h3>
              <p className="text-gray-600 dark:text-muted-foreground text-sm">
                Imagine this level of analysis across your entire podcast portfolio. Hundreds of episodes. Thousands of claims. All indexed, searchable, and actionable.
              </p>
            </Card>
            
            <Card className="p-6">
              <CheckCircle2 className="w-8 h-8 text-primary mb-4" />
              <h3 className="font-semibold text-gray-900 dark:text-foreground mb-2">
                Fully Automated
              </h3>
              <p className="text-gray-600 dark:text-muted-foreground text-sm">
                This analysis happens automatically within hours of episode publication. No manual review required. Scale without adding headcount.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-foreground mb-4">
            Ready to See Your Content?
          </h2>
          <p className="text-gray-600 dark:text-muted-foreground mb-8">
            Schedule a demo to see PodDNA analyze podcasts relevant to your business.
          </p>
          <Link href="/request-demo">
            <Button size="lg" className="gap-2" data-testid="button-sample-cta">
              Request a Demo
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
