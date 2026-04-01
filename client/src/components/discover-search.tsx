import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Plus,
  Check,
  Loader2,
  Clock,
  ChevronRight,
  Podcast,
} from "lucide-react";
import PodcastArtwork from "@/components/podcast-artwork";

interface DiscoverPodcast {
  id: string | null;
  podcastIndexFeedId: string;
  title: string;
  author: string;
  description: string;
  artworkUrl: string | null;
  feedUrl: string;
  episodeCount?: number;
  inPodDNA: boolean;
}

interface DiscoverEpisode {
  podcastIndexId: number;
  guid: string;
  title: string;
  description: string;
  publishedAt: string | null;
  duration: number;
  audioUrl: string;
  videoUrl?: string;
  artworkUrl: string | null;
  transcriptUrl?: string;
  chaptersUrl?: string;
  inPodDNA: boolean;
}

interface EpisodesResponse {
  podcast: {
    podcastIndexFeedId: string;
    title: string;
    author: string;
    description: string;
    artworkUrl: string | null;
    feedUrl: string;
    inPodDNA: boolean;
    podcastId: string | null;
  };
  count: number;
  episodes: DiscoverEpisode[];
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { 
    month: "short", 
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined
  });
}

export default function DiscoverSearch() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedPodcast, setSelectedPodcast] = useState<DiscoverPodcast | null>(null);
  const [importingEpisodes, setImportingEpisodes] = useState<Set<string>>(new Set());
  const [importedEpisodeIds, setImportedEpisodeIds] = useState<Set<string>>(new Set());

  const handleSearch = () => {
    if (searchQuery.trim().length >= 2) {
      setDebouncedQuery(searchQuery);
    }
  };

  const episodesQueryKey = selectedPodcast?.podcastIndexFeedId 
    ? `/api/discover/podcast/${selectedPodcast.podcastIndexFeedId}/episodes?max=50`
    : null;

  const { data: searchResults, isLoading: searchLoading } = useQuery<{
    source: string;
    count: number;
    podcasts: DiscoverPodcast[];
  }>({
    queryKey: [`/api/discover/search?q=${encodeURIComponent(debouncedQuery)}`],
    enabled: debouncedQuery.length >= 2,
  });

  const { data: episodesData, isLoading: episodesLoading } = useQuery<EpisodesResponse>({
    queryKey: [episodesQueryKey],
    enabled: !!episodesQueryKey,
  });

  interface ImportResponse {
    success: boolean;
    isNew: boolean;
    isNewPodcast?: boolean;
    episode: any;
    podcast: any;
    message: string;
  }

  const importMutation = useMutation({
    mutationFn: async ({ podcast, episode }: { podcast: DiscoverPodcast | EpisodesResponse["podcast"]; episode: DiscoverEpisode }): Promise<ImportResponse> => {
      const res = await apiRequest("POST", "/api/episodes/import", {
        podcast: {
          title: podcast.title,
          description: podcast.description,
          artworkUrl: podcast.artworkUrl,
          feedUrl: podcast.feedUrl,
          host: podcast.author,
          podcastIndexFeedId: podcast.podcastIndexFeedId,
        },
        episode: {
          title: episode.title,
          description: episode.description,
          audioUrl: episode.audioUrl,
          videoUrl: episode.videoUrl,
          duration: episode.duration,
          publishedAt: episode.publishedAt,
          transcriptUrl: episode.transcriptUrl,
          chaptersUrl: episode.chaptersUrl,
        },
      });
      return res.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: data.isNew ? "Episode added" : "Already in PodDNA",
        description: data.isNew 
          ? `"${variables.episode.title}" is now being processed`
          : `"${variables.episode.title}" already exists`,
      });
      
      setImportingEpisodes(prev => {
        const next = new Set(prev);
        next.delete(variables.episode.guid);
        return next;
      });

      setImportedEpisodeIds(prev => new Set(prev).add(variables.episode.guid));

      queryClient.invalidateQueries({ queryKey: [episodesQueryKey] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes/catalog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes/enriched"] });
    },
    onError: (error: any, variables) => {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: error.message || "Could not add episode to PodDNA",
      });
      setImportingEpisodes(prev => {
        const next = new Set(prev);
        next.delete(variables.episode.guid);
        return next;
      });
    },
  });

  const handleImport = (episode: DiscoverEpisode) => {
    if (!episodesData?.podcast) return;
    
    setImportingEpisodes(prev => new Set(prev).add(episode.guid));
    importMutation.mutate({ podcast: episodesData.podcast, episode });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search for podcasts to add..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-9"
            data-testid="input-discover-search"
          />
        </div>
        <Button onClick={handleSearch} disabled={searchQuery.length < 2} data-testid="button-discover-search">
          <Search className="w-4 h-4 mr-2" />
          Search
        </Button>
      </div>

      {searchLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}

      {searchResults && searchResults.podcasts.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Found {searchResults.count} podcasts
          </p>
          <div className="space-y-2">
            {searchResults.podcasts.map((podcast) => (
              <Card 
                key={podcast.podcastIndexFeedId}
                className={`hover-elevate cursor-pointer transition-all ${
                  selectedPodcast?.podcastIndexFeedId === podcast.podcastIndexFeedId 
                    ? "ring-2 ring-primary" 
                    : ""
                }`}
                onClick={() => setSelectedPodcast(podcast)}
                data-testid={`card-discover-podcast-${podcast.podcastIndexFeedId}`}
              >
                <CardContent className="p-3">
                  <div className="flex gap-3">
                    <PodcastArtwork
                      src={podcast.artworkUrl}
                      alt={podcast.title}
                      size="sm"
                      className="w-14 h-14 rounded-lg flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium truncate">{podcast.title}</h4>
                        {podcast.inPodDNA && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-950/30">
                            <Check className="w-2.5 h-2.5 mr-0.5" />
                            In PodDNA
                          </Badge>
                        )}
                      </div>
                      {podcast.author && (
                        <p className="text-sm text-muted-foreground truncate">{podcast.author}</p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        {podcast.episodeCount && (
                          <span>{podcast.episodeCount} episodes</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground self-center flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {searchResults && searchResults.podcasts.length === 0 && (
        <div className="text-center py-8">
          <Podcast className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No podcasts found for "{debouncedQuery}"</p>
        </div>
      )}

      <Dialog open={!!selectedPodcast} onOpenChange={(open) => {
        if (!open) {
          if (episodesQueryKey) {
            queryClient.removeQueries({ queryKey: [episodesQueryKey] });
          }
          setSelectedPodcast(null);
          setImportingEpisodes(new Set());
          setImportedEpisodeIds(new Set());
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedPodcast && (
                <>
                  <PodcastArtwork
                    src={selectedPodcast.artworkUrl}
                    alt={selectedPodcast.title}
                    size="sm"
                    className="w-10 h-10 rounded-lg"
                  />
                  <div className="min-w-0">
                    <div className="truncate">{selectedPodcast.title}</div>
                    {selectedPodcast.author && (
                      <div className="text-sm font-normal text-muted-foreground truncate">
                        {selectedPodcast.author}
                      </div>
                    )}
                  </div>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="flex-1 -mx-6 px-6">
            {episodesLoading ? (
              <div className="space-y-3 py-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : episodesData && episodesData.episodes.length > 0 ? (
              <div className="space-y-2 py-4">
                {episodesData.episodes.map((episode) => {
                  const isImporting = importingEpisodes.has(episode.guid);
                  const isInPodDNA = episode.inPodDNA || importedEpisodeIds.has(episode.guid);
                  
                  return (
                    <Card 
                      key={episode.guid}
                      className="hover-elevate"
                      data-testid={`card-discover-episode-${episode.podcastIndexId}`}
                    >
                      <CardContent className="p-3">
                        <div className="flex gap-3">
                          <PodcastArtwork
                            src={episode.artworkUrl || episodesData.podcast.artworkUrl}
                            alt={episode.title}
                            size="sm"
                            className="w-12 h-12 rounded flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <h5 className="font-medium text-sm line-clamp-2 mb-1">
                              {episode.title}
                            </h5>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {episode.duration > 0 && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatDuration(episode.duration)}
                                </span>
                              )}
                              {episode.publishedAt && (
                                <span>{formatDate(episode.publishedAt)}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {isInPodDNA ? (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-950/30">
                                <Check className="w-2.5 h-2.5 mr-0.5" />
                                Added
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleImport(episode);
                                }}
                                disabled={isImporting}
                                data-testid={`button-import-episode-${episode.podcastIndexId}`}
                              >
                                {isImporting ? (
                                  <>
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                    Adding...
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3 h-3 mr-1" />
                                    Add
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No episodes found</p>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
