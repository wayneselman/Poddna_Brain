import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  Play,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  MessageSquare,
  Tag,
  Building2,
  TrendingUp,
} from "lucide-react";
import type { SearchResult } from "@shared/schema";

function formatTime(ms: number | null): string {
  if (ms === null) return "--:--";
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatTimeSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface SearchFilters {
  claimOnly: boolean;
  contradictionsOnly: boolean;
  supportsOnly: boolean;
  certaintyMin: number;
  sentimentMin: number;
}

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({
    claimOnly: false,
    contradictionsOnly: false,
    supportsOnly: false,
    certaintyMin: 0,
    sentimentMin: 0,
  });

  const buildQueryString = () => {
    const params = new URLSearchParams();
    params.set("q", submittedQuery);
    if (filters.claimOnly) params.set("claimOnly", "true");
    if (filters.contradictionsOnly) params.set("contradictionsOnly", "true");
    if (filters.supportsOnly) params.set("supportsOnly", "true");
    if (filters.certaintyMin > 0) params.set("certaintyMin", filters.certaintyMin.toString());
    if (filters.sentimentMin > 0) params.set("sentimentMin", filters.sentimentMin.toString());
    return params.toString();
  };

  const { data: searchData, isLoading, error, refetch } = useQuery<{
    results: SearchResult[];
    meta: { query: string; limit: number; filters: object };
  }>({
    queryKey: ["/api/search", submittedQuery, filters],
    queryFn: async () => {
      const response = await fetch(`/api/search?${buildQueryString()}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Search failed");
      }
      return response.json();
    },
    enabled: submittedQuery.length > 0,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setSubmittedQuery(searchQuery.trim());
    }
  };

  const results = searchData?.results || [];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-search-title">
            Semantic Search
          </h1>
          <p className="text-muted-foreground">
            Search across all podcast episodes using natural language
          </p>
        </div>

        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search for topics, ideas, claims..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-base"
                data-testid="input-search"
              />
            </div>
            <Button type="submit" size="lg" disabled={!searchQuery.trim() || isLoading} data-testid="button-search">
              {isLoading ? "Searching..." : "Search"}
            </Button>
          </div>
        </form>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <Card className="p-4" data-testid="card-filters">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Filters
              </h3>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="claimOnly"
                    checked={filters.claimOnly}
                    onCheckedChange={(checked) =>
                      setFilters({ ...filters, claimOnly: checked === true })
                    }
                    data-testid="checkbox-claims-only"
                  />
                  <Label htmlFor="claimOnly" className="text-sm cursor-pointer">
                    Only claims
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="contradictionsOnly"
                    checked={filters.contradictionsOnly}
                    onCheckedChange={(checked) =>
                      setFilters({ ...filters, contradictionsOnly: checked === true })
                    }
                    data-testid="checkbox-contradictions-only"
                  />
                  <Label htmlFor="contradictionsOnly" className="text-sm cursor-pointer">
                    Has contradictions
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="supportsOnly"
                    checked={filters.supportsOnly}
                    onCheckedChange={(checked) =>
                      setFilters({ ...filters, supportsOnly: checked === true })
                    }
                    data-testid="checkbox-supports-only"
                  />
                  <Label htmlFor="supportsOnly" className="text-sm cursor-pointer">
                    Has supporting evidence
                  </Label>
                </div>

                <div className="pt-2 border-t">
                  <Label className="text-sm text-muted-foreground mb-2 block">
                    Min Certainty: {Math.round(filters.certaintyMin * 100)}%
                  </Label>
                  <Slider
                    value={[filters.certaintyMin]}
                    onValueChange={([val]) => setFilters({ ...filters, certaintyMin: val })}
                    min={0}
                    max={1}
                    step={0.1}
                    className="mb-4"
                    data-testid="slider-certainty"
                  />
                </div>

                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">
                    Min Emotional Intensity: {Math.round(filters.sentimentMin * 100)}%
                  </Label>
                  <Slider
                    value={[filters.sentimentMin]}
                    onValueChange={([val]) => setFilters({ ...filters, sentimentMin: val })}
                    min={0}
                    max={1}
                    step={0.1}
                    data-testid="slider-sentiment"
                  />
                </div>

                {submittedQuery && (
                  <Button
                    variant="outline"
                    className="w-full mt-4"
                    onClick={() => refetch()}
                    data-testid="button-apply-filters"
                  >
                    Apply Filters
                  </Button>
                )}
              </div>
            </Card>
          </div>

          <div className="lg:col-span-3">
            {!submittedQuery && (
              <div className="text-center py-16 text-muted-foreground" data-testid="search-empty-state">
                <Search className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg">Enter a search query to find relevant content</p>
                <p className="text-sm mt-2">
                  Try searching for topics like "funding", "burnout", or "leadership"
                </p>
              </div>
            )}

            {isLoading && (
              <div className="space-y-4" data-testid="search-loading">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Card key={i} className="p-4">
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-1/2 mb-4" />
                    <Skeleton className="h-16 w-full" />
                  </Card>
                ))}
              </div>
            )}

            {error && (
              <Card className="p-8 text-center" data-testid="search-error">
                <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-destructive opacity-50" />
                <p className="text-destructive">{(error as Error).message}</p>
                <Button variant="outline" className="mt-4" onClick={() => refetch()}>
                  Try Again
                </Button>
              </Card>
            )}

            {submittedQuery && !isLoading && !error && results.length === 0 && (
              <Card className="p-8 text-center" data-testid="search-no-results">
                <Search className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">No results found</p>
                <p className="text-muted-foreground mt-1">
                  Try adjusting your filters or search for something else
                </p>
              </Card>
            )}

            {results.length > 0 && (
              <div className="space-y-4" data-testid="search-results">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">
                    Found {results.length} result{results.length !== 1 ? "s" : ""}
                  </p>
                </div>

                {results.map((result) => (
                  <Card
                    key={result.statementId}
                    className="p-4 hover-elevate transition-all"
                    data-testid={`search-result-${result.statementId}`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex-1 min-w-0">
                        <Link href={`/episode/${result.episodeId}?t=${Math.floor((result.startTime || 0) / 1000)}`}>
                          <span className="font-semibold hover:text-primary transition-colors cursor-pointer line-clamp-1">
                            {result.episodeTitle}
                          </span>
                        </Link>
                        {result.podcastTitle && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {result.podcastTitle}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs font-mono">
                          <Play className="w-3 h-3 mr-1" />
                          {formatTimeSeconds(result.startTime ?? 0)}
                        </Badge>
                        <Badge
                          variant={result.claimFlag ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {result.claimFlag ? "Claim" : "Statement"}
                        </Badge>
                      </div>
                    </div>

                    <p className="text-sm text-foreground mb-3 leading-relaxed">
                      {result.text}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {result.certainty !== undefined && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <TrendingUp className="w-3 h-3" />
                          {Math.round(result.certainty * 100)}% certain
                        </span>
                      )}

                      {result.polarity && (
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            result.polarity === "supportive"
                              ? "border-green-500/50 text-green-700"
                              : result.polarity === "skeptical"
                              ? "border-red-500/50 text-red-700"
                              : ""
                          }`}
                        >
                          {result.polarity}
                        </Badge>
                      )}

                      {result.hasContradictions && (
                        <Badge variant="destructive" className="text-xs">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Contradicts
                        </Badge>
                      )}

                      {result.hasSupports && (
                        <Badge variant="outline" className="text-xs border-green-500/50 text-green-700">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Supported
                        </Badge>
                      )}
                    </div>

                    {(result.topics.length > 0 || result.entities.length > 0) && (
                      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t">
                        {result.topics.slice(0, 3).map((topic) => (
                          <Badge key={topic.id} variant="secondary" className="text-xs">
                            <Tag className="w-3 h-3 mr-1" />
                            {topic.name}
                          </Badge>
                        ))}
                        {result.entities.slice(0, 3).map((entity) => (
                          <Badge key={entity.id} variant="outline" className="text-xs">
                            <Building2 className="w-3 h-3 mr-1" />
                            {entity.name}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Relevance: {Math.round(result.score * 100)}%
                      </span>
                      <Link href={`/episode/${result.episodeId}?t=${Math.floor((result.startTime || 0) / 1000)}`}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" data-testid={`button-goto-${result.statementId}`}>
                          Go to moment
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
