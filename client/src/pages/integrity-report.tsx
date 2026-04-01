import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldCheck, FileText, AlertCircle, Megaphone, Clock, ArrowLeft, Printer, ExternalLink, CheckCircle, XCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Helmet } from "react-helmet";

type IntegrityReportResponse = {
  episode: {
    id: string;
    title: string;
    description: string | null;
    publishedAt: string | null;
    duration: number | null;
    mediaUrl: string | null;
    videoUrl: string | null;
  };
  podcast: {
    id: string;
    title: string;
    host: string | null;
    artworkUrl: string | null;
  } | null;
  diff: {
    similarity: number;
    addedCount: number;
    removedCount: number;
    modifiedCount: number;
    primarySourceLabel: string;
    secondarySourceLabel: string;
    samples: Array<{
      type: "added" | "removed" | "modified";
      timestampSeconds: number | null;
      primaryText: string | null;
      secondaryText: string | null;
    }>;
  } | null;
  sponsors: {
    totalCount: number;
    segments: Array<{
      brand: string | null;
      timestampSeconds: number | null;
      confidence: number | null;
      excerpt: string | null;
    }>;
  } | null;
  claims: {
    totalCount: number;
    byType: {
      financial: number;
      medical: number;
      sensitive: number;
      other: number;
    };
    items: Array<{
      claimType: "financial" | "medical" | "sensitive" | "other";
      text: string;
      timestampSeconds: number | null;
      severity: "low" | "medium" | "high" | null;
    }>;
  } | null;
  generatedAt: string;
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "Unknown duration";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m ${s}s`;
}

function formatTimestamp(seconds: number | null): string {
  if (seconds === null) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Unknown date";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

type DiffSample = {
  type: "added" | "removed" | "modified";
  timestampSeconds: number | null;
  primaryText: string | null;
  secondaryText: string | null;
};

function DiffSampleCard({ sample }: { sample: DiffSample }) {
  // Normalize sample type to valid values, default to "modified" if unknown
  const validTypes = ["added", "removed", "modified"] as const;
  const sampleType = validTypes.includes(sample.type as any) ? sample.type : "modified";
  
  const typeColors: Record<string, string> = {
    added: "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800",
    removed: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800",
    modified: "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800",
  };

  const typeLabels: Record<string, { label: string; icon: React.ReactNode }> = {
    added: { label: "Added", icon: <CheckCircle className="w-3 h-3" /> },
    removed: { label: "Removed", icon: <XCircle className="w-3 h-3" /> },
    modified: { label: "Modified", icon: <RefreshCw className="w-3 h-3" /> },
  };

  const typeInfo = typeLabels[sampleType];
  
  // Safely handle text values
  const primaryText = typeof sample.primaryText === 'string' ? sample.primaryText : null;
  const secondaryText = typeof sample.secondaryText === 'string' ? sample.secondaryText : null;

  return (
    <div className={`p-3 rounded-lg border ${typeColors[sampleType]} print:break-inside-avoid`}>
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="outline" className="text-xs gap-1">
          {typeInfo.icon}
          {typeInfo.label}
        </Badge>
        {sample.timestampSeconds !== null && typeof sample.timestampSeconds === 'number' && (
          <span className="text-xs text-muted-foreground">
            at {formatTimestamp(sample.timestampSeconds)}
          </span>
        )}
      </div>
      {sampleType === "modified" ? (
        <div className="space-y-1 text-sm">
          {primaryText && (
            <p className="text-red-700 dark:text-red-300 line-through">{primaryText}</p>
          )}
          {secondaryText && (
            <p className="text-green-700 dark:text-green-300">{secondaryText}</p>
          )}
        </div>
      ) : sampleType === "added" ? (
        <p className="text-sm text-green-700 dark:text-green-300">{secondaryText || "No text"}</p>
      ) : (
        <p className="text-sm text-red-700 dark:text-red-300">{primaryText || "No text"}</p>
      )}
    </div>
  );
}

function MutedSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-4 text-center text-muted-foreground print:break-inside-avoid">
      <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
      <p className="font-medium">{title}</p>
      <p className="text-sm">{children}</p>
    </div>
  );
}

function SummaryCard({ 
  title, 
  value, 
  subtext, 
  variant = "default" 
}: { 
  title: string; 
  value: string | number; 
  subtext?: string; 
  variant?: "default" | "success" | "warning" | "danger" | "muted";
}) {
  const variantColors = {
    default: "text-foreground",
    success: "text-green-600 dark:text-green-400",
    warning: "text-yellow-600 dark:text-yellow-400",
    danger: "text-red-600 dark:text-red-400",
    muted: "text-muted-foreground",
  };

  return (
    <div className="text-center p-4 rounded-lg bg-muted/30 print:break-inside-avoid">
      <div className={`text-3xl font-bold ${variantColors[variant]}`}>{value}</div>
      <div className="text-sm font-medium mt-1">{title}</div>
      {subtext && <div className="text-xs text-muted-foreground mt-0.5">{subtext}</div>}
    </div>
  );
}

export default function IntegrityReportPage() {
  const params = useParams<{ id: string }>();
  const id = params.id!;

  const { data, isLoading, error } = useQuery<IntegrityReportResponse>({
    queryKey: [`/api/episodes/${id}/integrity-report`],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-3">Loading integrity report...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h1 className="text-xl font-semibold mb-2">Unable to Load Report</h1>
          <p className="text-muted-foreground mb-4">
            The integrity report for this episode could not be loaded. The episode may not exist or there was a server error.
          </p>
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Return Home
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const { episode, podcast, diff, sponsors, claims, generatedAt } = data;

  // Normalize and sanitize values for safe rendering
  // Diff values
  const diffSimilarity = diff && typeof diff.similarity === 'number' ? diff.similarity : 0;
  const diffAdded = diff && typeof diff.addedCount === 'number' ? diff.addedCount : 0;
  const diffRemoved = diff && typeof diff.removedCount === 'number' ? diff.removedCount : 0;
  const diffModified = diff && typeof diff.modifiedCount === 'number' ? diff.modifiedCount : 0;
  // Filter samples to only include valid objects with recognized types and at least one text field
  const diffSamplesRaw = diff && Array.isArray(diff.samples) ? diff.samples : [];
  const diffSamples = diffSamplesRaw.filter((s): s is DiffSample => {
    if (!s || typeof s !== 'object') return false;
    if (!['added', 'removed', 'modified'].includes(s.type)) return false;
    // Validate timestamp is number or null
    if (s.timestampSeconds !== null && typeof s.timestampSeconds !== 'number') return false;
    // Require at least one text field to be a non-empty string
    const hasText = (typeof s.primaryText === 'string' && s.primaryText.length > 0) ||
                    (typeof s.secondaryText === 'string' && s.secondaryText.length > 0);
    return hasText;
  });
  const diffPrimaryLabel = diff?.primarySourceLabel && typeof diff.primarySourceLabel === 'string' 
    ? diff.primarySourceLabel : "Unknown Source";
  const diffSecondaryLabel = diff?.secondarySourceLabel && typeof diff.secondarySourceLabel === 'string' 
    ? diff.secondarySourceLabel : "Unknown Source";
  
  // Sponsor values
  const sponsorCount = sponsors && typeof sponsors.totalCount === 'number' ? sponsors.totalCount : 0;
  const sponsorSegments = sponsors && Array.isArray(sponsors.segments) ? sponsors.segments : [];
  
  // Claims values
  const claimsCount = claims && typeof claims.totalCount === 'number' ? claims.totalCount : 0;
  const claimsByType = {
    financial: claims?.byType && typeof claims.byType.financial === 'number' ? claims.byType.financial : 0,
    medical: claims?.byType && typeof claims.byType.medical === 'number' ? claims.byType.medical : 0,
    sensitive: claims?.byType && typeof claims.byType.sensitive === 'number' ? claims.byType.sensitive : 0,
    other: claims?.byType && typeof claims.byType.other === 'number' ? claims.byType.other : 0,
  };
  const claimItems = claims && Array.isArray(claims.items) ? claims.items : [];

  // Determine consistency color
  const consistencyVariant = diff 
    ? diffSimilarity >= 95 ? "success" : diffSimilarity >= 80 ? "warning" : "danger"
    : "muted";

  return (
    <>
      <Helmet>
        <title>Integrity Report - {episode.title} | PODDNA</title>
        <meta name="description" content={`Podcast integrity report for ${episode.title}. Transcript consistency, sponsor detection, and claims analysis.`} />
      </Helmet>

      <div className="integrity-report min-h-screen bg-background text-foreground print:bg-white print:text-black">
        <div className="mx-auto max-w-5xl px-4 py-8 print:px-2 print:py-4">
          
          {/* Header */}
          <header className="flex flex-col md:flex-row gap-4 border-b pb-6 mb-6 print:pb-4 print:mb-4">
            <div className="flex gap-4 flex-1">
              {podcast?.artworkUrl && (
                <img
                  src={podcast.artworkUrl}
                  alt={podcast.title}
                  className="h-20 w-20 rounded-lg object-cover flex-shrink-0 print:h-16 print:w-16"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0" />
                  <h1 className="text-xl md:text-2xl font-semibold">
                    Podcast Integrity Report
                  </h1>
                </div>
                <p className="text-sm text-muted-foreground mt-1 truncate">
                  {podcast?.title && <span className="font-medium">{podcast.title}</span>}
                  {podcast?.title && " • "}
                  <span>{episode.title}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Published: {formatDate(episode.publishedAt)} • Duration: {formatDuration(episode.duration)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Report generated: {formatDate(generatedAt)}
                </p>
              </div>
            </div>

            {/* Action buttons - hidden in print */}
            <div className="flex flex-row md:flex-col gap-2 print:hidden flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="button-print-report">
                <Printer className="w-4 h-4 mr-2" />
                Print / PDF
              </Button>
              <Button variant="ghost" size="sm" asChild data-testid="button-view-interactive">
                <Link href={`/episode/${episode.id}?tab=integrity`}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Interactive View
                </Link>
              </Button>
            </div>
          </header>

          {/* Summary Cards */}
          <section className="mb-8 print:mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Executive Summary
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SummaryCard
                title="Transcript Consistency"
                value={diff ? `${diffSimilarity}%` : "—"}
                subtext={diff ? `${diffPrimaryLabel} vs ${diffSecondaryLabel}` : "Not analyzed"}
                variant={consistencyVariant}
              />
              <SummaryCard
                title="Transcript Changes"
                value={diff ? diffAdded + diffRemoved + diffModified : "—"}
                subtext={diff ? `${diffAdded} added, ${diffRemoved} removed` : "Not analyzed"}
                variant={diff ? "default" : "muted"}
              />
              <SummaryCard
                title="Sponsor Segments"
                value={sponsors ? sponsorCount : "—"}
                subtext={sponsors ? "Detected mentions" : "Not analyzed"}
                variant={sponsors && sponsorCount > 0 ? "warning" : sponsors ? "success" : "muted"}
              />
              <SummaryCard
                title="Claims Detected"
                value={claims ? claimsCount : "—"}
                subtext={claims ? `${claimsByType.financial} financial, ${claimsByType.medical} medical` : "Not analyzed"}
                variant={claims && claimsCount > 0 ? "warning" : claims ? "success" : "muted"}
              />
            </div>
          </section>

          {/* Transcript Differences Section */}
          <section className="mb-8 print:mb-6 print:break-inside-avoid">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <RefreshCw className="w-5 h-5" />
                  Transcript Consistency & Differences
                </CardTitle>
              </CardHeader>
              <CardContent>
                {diff ? (
                  <>
                    <p className="text-sm text-muted-foreground mb-4">
                      Comparing <strong>{diffPrimaryLabel}</strong> vs{" "}
                      <strong>{diffSecondaryLabel}</strong>. 
                      {diffSimilarity >= 95 && " Transcripts are highly consistent."}
                      {diffSimilarity >= 80 && diffSimilarity < 95 && " Some differences detected between sources."}
                      {diffSimilarity < 80 && " Significant discrepancies found between transcript sources."}
                    </p>

                    {diffSamples.length === 0 ? (
                      <p className="text-sm italic text-muted-foreground">No representative differences to display.</p>
                    ) : (
                      <div className="space-y-3">
                        {diffSamples.slice(0, 6).map((sample, idx) => (
                          <DiffSampleCard key={`diff-${idx}`} sample={sample} />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <MutedSection title="Transcript Comparison Not Available">
                    No transcript comparison has been generated for this episode yet.
                  </MutedSection>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Sponsor Mentions Section */}
          <section className="mb-8 print:mb-6 print:break-inside-avoid">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Megaphone className="w-5 h-5" />
                  Sponsor Mentions
                  {sponsors && sponsorCount > 0 && (
                    <Badge variant="secondary" className="ml-2">{sponsorCount} found</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sponsors === null ? (
                  <MutedSection title="Sponsor Detection Not Available">
                    Sponsor detection has not been run for this episode yet.
                  </MutedSection>
                ) : sponsorCount === 0 ? (
                  <div className="py-4 text-center text-muted-foreground">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                    <p className="font-medium">No Sponsor Segments Detected</p>
                    <p className="text-sm">This episode appears to have no detectable sponsor mentions.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sponsorSegments.slice(0, 10).map((segment, idx) => (
                      <div 
                        key={`sponsor-${idx}`} 
                        className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 print:break-inside-avoid"
                      >
                        <div className="flex-shrink-0 w-16 text-xs text-muted-foreground font-mono">
                          {formatTimestamp(segment?.timestampSeconds ?? null)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{segment?.excerpt ?? "No excerpt available"}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {segment?.brand && (
                            <Badge variant="outline" className="text-xs">
                              {segment.brand}
                            </Badge>
                          )}
                          {segment?.confidence != null && (
                            <span className="text-xs text-muted-foreground">
                              {Math.round(segment.confidence * 100)}% confidence
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Claims Section */}
          <section className="mb-8 print:mb-6 print:break-inside-avoid">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <AlertCircle className="w-5 h-5" />
                  Claims & High-Risk Statements
                  {claims && claimsCount > 0 && (
                    <Badge variant="secondary" className="ml-2">{claimsCount} found</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {claims === null ? (
                  <MutedSection title="Claims Detection Not Available">
                    Claims extraction has not been run for this episode yet.
                  </MutedSection>
                ) : claimsCount === 0 ? (
                  <div className="py-4 text-center text-muted-foreground">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                    <p className="font-medium">No High-Risk Claims Detected</p>
                    <p className="text-sm">This episode appears to have no detectable high-risk statements.</p>
                  </div>
                ) : (
                  <>
                    {/* Claims type breakdown */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {claimsByType.financial > 0 && (
                        <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/20">
                          {claimsByType.financial} Financial
                        </Badge>
                      )}
                      {claimsByType.medical > 0 && (
                        <Badge variant="outline" className="bg-red-50 dark:bg-red-900/20">
                          {claimsByType.medical} Medical
                        </Badge>
                      )}
                      {claimsByType.sensitive > 0 && (
                        <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-900/20">
                          {claimsByType.sensitive} Sensitive
                        </Badge>
                      )}
                      {claimsByType.other > 0 && (
                        <Badge variant="outline" className="bg-gray-50 dark:bg-gray-900/20">
                          {claimsByType.other} Other
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-2">
                      {claimItems.slice(0, 10).map((claim, idx) => {
                        const typeColors: Record<string, string> = {
                          financial: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
                          medical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
                          sensitive: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
                          other: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
                        };
                        const claimType = claim?.claimType ?? "other";
                        const colorClass = typeColors[claimType] ?? typeColors.other;

                        return (
                          <div 
                            key={`claim-${idx}`}
                            className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 print:break-inside-avoid"
                          >
                            <div className="flex-shrink-0 w-16 text-xs text-muted-foreground font-mono">
                              {formatTimestamp(claim?.timestampSeconds ?? null)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm">{claim?.text ?? "No claim text available"}</p>
                            </div>
                            <Badge className={`text-xs flex-shrink-0 ${colorClass}`}>
                              {claimType}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Footer */}
          <footer className="border-t pt-4 text-center text-xs text-muted-foreground print:border-t-0">
            <p>Generated by PODDNA Integrity Analysis • {formatDate(generatedAt)}</p>
            <p className="mt-1">
              This report is for informational purposes only. Claims and sponsor detection are AI-generated and should be verified.
            </p>
          </footer>

          {/* Back button - hidden in print */}
          <div className="mt-6 text-center print:hidden">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/episode/${episode.id}`}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Episode
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
