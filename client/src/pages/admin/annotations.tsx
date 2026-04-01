import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Podcast, Episode } from "@shared/schema";
import { 
  Loader2, 
  Search, 
  Star,
  StarOff,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Home
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface AnnotationWithMetadata {
  id: string;
  content: string;
  text: string;
  upvotes: number;
  downvotes: number;
  segmentId: string;
  episodeId: string;
  episodeTitle?: string;
  podcastTitle?: string;
  artworkUrl?: string;
  featured: boolean;
  featuredAt: string | null;
  isHero?: boolean;
  createdAt: string;
  authorName?: string;
}

interface TrendingAnnotationsResponse {
  annotations: AnnotationWithMetadata[];
  total: number;
  page: number;
  pageSize: number;
}

const FEATURED_PAGE_SIZE = 5;

export default function AdminAnnotationsPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPodcast, setFilterPodcast] = useState<string>("all");
  const [filterFeatured, setFilterFeatured] = useState<string>("all");
  const [featuredPage, setFeaturedPage] = useState(1);

  const { data: trendingData, isLoading: trendingLoading } = useQuery<TrendingAnnotationsResponse>({
    queryKey: ["/api/annotations/trending"],
  });
  
  // Extract annotations array from response, defaulting to empty array
  const trendingAnnotations = trendingData?.annotations ?? [];

  const { data: featuredAnnotations = [], isLoading: featuredLoading } = useQuery<AnnotationWithMetadata[]>({
    queryKey: ["/api/annotations/featured"],
  });

  const { data: podcasts = [] } = useQuery<Podcast[]>({
    queryKey: ["/api/podcasts"],
  });

  const { data: episodes = [] } = useQuery<Episode[]>({
    queryKey: ["/api/episodes"],
  });

  const allAnnotations = (() => {
    const annotationMap = new Map<string, AnnotationWithMetadata>();
    
    featuredAnnotations.forEach(ann => {
      annotationMap.set(ann.id, { ...ann, featured: true });
    });
    
    trendingAnnotations.forEach(ann => {
      if (!annotationMap.has(ann.id)) {
        annotationMap.set(ann.id, { ...ann, featured: false });
      }
    });
    
    return Array.from(annotationMap.values());
  })();

  const toggleFeaturedMutation = useMutation({
    mutationFn: async ({ id, featured }: { id: string; featured: boolean }) => {
      const res = await apiRequest("PATCH", `/api/annotations/${id}/featured`, { featured });
      if (!res.ok) throw new Error("Failed to update featured status");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/annotations/trending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/annotations/featured"] });
      toast({ title: "Featured status updated" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to update", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const toggleHeroMutation = useMutation({
    mutationFn: async ({ id, isHero }: { id: string; isHero: boolean }) => {
      const res = await apiRequest("PATCH", `/api/annotations/${id}/hero`, { isHero });
      if (!res.ok) throw new Error("Failed to update front page status");
      return await res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/annotations/trending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/annotations/featured"] });
      toast({ title: variables.isHero ? "Set as front page hero" : "Removed from front page" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to update", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const getEpisodeById = (episodeId: string) => {
    return episodes.find(e => e.id === episodeId);
  };

  const getPodcastByEpisodeId = (episodeId: string) => {
    const episode = getEpisodeById(episodeId);
    if (!episode) return null;
    return podcasts.find(p => p.id === episode.podcastId);
  };

  const enrichedAnnotations = allAnnotations.map(ann => ({
    ...ann,
    episodeData: getEpisodeById(ann.episodeId),
    podcastData: getPodcastByEpisodeId(ann.episodeId),
  }));

  const filteredAnnotations = enrichedAnnotations.filter(ann => {
    const matchesSearch = searchTerm === "" || 
      ann.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ann.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ann.episodeTitle || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ann.podcastTitle || "").toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesPodcast = filterPodcast === "all" || 
      (ann.podcastData && ann.podcastData.id === filterPodcast);
    
    const matchesFeatured = filterFeatured === "all" ||
      (filterFeatured === "featured" && ann.featured) ||
      (filterFeatured === "not-featured" && !ann.featured);
    
    return matchesSearch && matchesPodcast && matchesFeatured;
  });

  const isLoading = trendingLoading || featuredLoading;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-annotations-title">
          Featured Annotations
        </h1>
        <p className="text-muted-foreground">
          Select annotations to feature on the homepage
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            Currently Featured ({featuredAnnotations.length})
          </CardTitle>
          <CardDescription>
            Featured annotations appear prominently on the homepage
          </CardDescription>
        </CardHeader>
        <CardContent>
          {featuredLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : featuredAnnotations.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No featured annotations yet. Select annotations below to feature them.
            </p>
          ) : (
            <>
              <div className="space-y-3">
                {featuredAnnotations
                  .slice((featuredPage - 1) * FEATURED_PAGE_SIZE, featuredPage * FEATURED_PAGE_SIZE)
                  .map((ann, index) => {
                    const globalIndex = (featuredPage - 1) * FEATURED_PAGE_SIZE + index;
                    return (
                      <div 
                        key={ann.id} 
                        className={`flex items-start gap-3 p-3 rounded-lg border ${
                          ann.isHero 
                            ? "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-400" 
                            : "bg-yellow-50/50 dark:bg-yellow-950/20"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          {ann.isHero ? (
                            <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center">
                              <Home className="w-4 h-4 text-black" />
                            </div>
                          ) : (
                            <span className="text-lg font-bold text-muted-foreground">#{globalIndex + 1}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium line-clamp-1">"{ann.text}"</p>
                            {ann.isHero && (
                              <Badge className="bg-yellow-500 text-black text-xs">Front Page</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                            {ann.content}
                          </p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <span>{ann.episodeTitle}</span>
                            <span>•</span>
                            <span>{ann.podcastTitle}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Front Page</span>
                            <Switch
                              checked={ann.isHero || false}
                              onCheckedChange={(checked) => toggleHeroMutation.mutate({ id: ann.id, isHero: checked })}
                              disabled={toggleHeroMutation.isPending}
                              data-testid={`switch-hero-${ann.id}`}
                            />
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleFeaturedMutation.mutate({ id: ann.id, featured: false })}
                            disabled={toggleFeaturedMutation.isPending}
                            data-testid={`button-unfeature-${ann.id}`}
                          >
                            <StarOff className="w-4 h-4 mr-1" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })}
              </div>
              
              {/* Pagination for Featured Annotations */}
              {featuredAnnotations.length > FEATURED_PAGE_SIZE && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <span className="text-sm text-muted-foreground">
                    Showing {(featuredPage - 1) * FEATURED_PAGE_SIZE + 1}-{Math.min(featuredPage * FEATURED_PAGE_SIZE, featuredAnnotations.length)} of {featuredAnnotations.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFeaturedPage(p => Math.max(1, p - 1))}
                      disabled={featuredPage === 1}
                      data-testid="button-featured-prev"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm px-2">
                      Page {featuredPage} of {Math.ceil(featuredAnnotations.length / FEATURED_PAGE_SIZE)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFeaturedPage(p => Math.min(Math.ceil(featuredAnnotations.length / FEATURED_PAGE_SIZE), p + 1))}
                      disabled={featuredPage >= Math.ceil(featuredAnnotations.length / FEATURED_PAGE_SIZE)}
                      data-testid="button-featured-next"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            All Annotations
          </CardTitle>
          <CardDescription>
            Browse and select annotations to feature
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search annotations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-annotations"
                />
              </div>
            </div>
            <Select value={filterPodcast} onValueChange={setFilterPodcast}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All podcasts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All podcasts</SelectItem>
                {podcasts.map(podcast => (
                  <SelectItem key={podcast.id} value={podcast.id}>
                    {podcast.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterFeatured} onValueChange={setFilterFeatured}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Featured status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="featured">Featured</SelectItem>
                <SelectItem value="not-featured">Not featured</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredAnnotations.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No annotations found
            </p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Status</TableHead>
                    <TableHead>Highlighted Text</TableHead>
                    <TableHead className="hidden md:table-cell">Episode</TableHead>
                    <TableHead className="w-[100px] text-center">Votes</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAnnotations.map(ann => (
                    <TableRow key={ann.id}>
                      <TableCell>
                        {ann.featured ? (
                          <Badge className="bg-yellow-500 text-yellow-50">
                            <Star className="w-3 h-3 mr-1" />
                            Featured
                          </Badge>
                        ) : (
                          <Badge variant="outline">Regular</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-md">
                          <p className="text-sm font-medium line-clamp-1">
                            "{ann.text}"
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                            {ann.content}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="text-sm">
                          <p className="line-clamp-1">{ann.episodeTitle || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {ann.podcastTitle || "Unknown"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <span className="flex items-center text-green-600">
                            <ChevronUp className="w-4 h-4" />
                            {ann.upvotes}
                          </span>
                          <span className="flex items-center text-red-600">
                            <ChevronDown className="w-4 h-4" />
                            {ann.downvotes}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant={ann.featured ? "outline" : "default"}
                            size="sm"
                            onClick={() => toggleFeaturedMutation.mutate({ 
                              id: ann.id, 
                              featured: !ann.featured 
                            })}
                            disabled={toggleFeaturedMutation.isPending}
                            data-testid={`button-toggle-featured-${ann.id}`}
                          >
                            {ann.featured ? (
                              <>
                                <StarOff className="w-4 h-4 mr-1" />
                                Unfeature
                              </>
                            ) : (
                              <>
                                <Star className="w-4 h-4 mr-1" />
                                Feature
                              </>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
