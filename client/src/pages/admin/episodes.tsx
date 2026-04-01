import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Episode as BaseEpisode, Podcast } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Episode extends BaseEpisode {
  hasTranscript?: boolean;
}
import { 
  Loader2, 
  Search, 
  Library, 
  Edit2, 
  FileText, 
  Music,
  ExternalLink,
  Plus,
  Trash2,
  Wand2,
  CheckCircle2,
  Clock,
  ArrowRight
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function AdminEpisodesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPodcast, setFilterPodcast] = useState<string>("all");
  const [filterTranscript, setFilterTranscript] = useState<string>("all");
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { toast } = useToast();

  const { data: episodes = [], isLoading: episodesLoading } = useQuery<Episode[]>({
    queryKey: ["/api/episodes"],
  });

  const { data: podcasts = [], isLoading: podcastsLoading } = useQuery<Podcast[]>({
    queryKey: ["/api/podcasts"],
  });

  const isLoading = episodesLoading || podcastsLoading;

  const bulkDeleteMutation = useMutation({
    mutationFn: async (episodeIds: string[]) => {
      const results = await Promise.all(
        episodeIds.map(async (id) => {
          const res = await apiRequest("DELETE", `/api/episodes/${id}`);
          return { id, ok: res.ok };
        })
      );
      const failed = results.filter(r => !r.ok);
      if (failed.length > 0) {
        throw new Error(`Failed to delete ${failed.length} episode(s)`);
      }
      return results;
    },
    onSuccess: (_, deletedIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      toast({ 
        title: "Episodes deleted", 
        description: `Successfully deleted ${deletedIds.length} episode(s)` 
      });
      setSelectedEpisodes(new Set());
      setShowDeleteDialog(false);
    },
    onError: (error: Error) => {
      toast({ 
        title: "Delete failed", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const bulkTranscribeMutation = useMutation({
    mutationFn: async (episodeIds: string[]) => {
      const results = await Promise.all(
        episodeIds.map(async (id) => {
          const res = await apiRequest("POST", `/api/episodes/${id}/transcribe/assemblyai`);
          return { id, ok: res.ok };
        })
      );
      const failed = results.filter(r => !r.ok);
      return { total: episodeIds.length, queued: episodeIds.length - failed.length, failed: failed.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      toast({ 
        title: "Transcription jobs queued", 
        description: `Started transcription for ${result.queued} episode(s)${result.failed > 0 ? `. ${result.failed} failed.` : ''}` 
      });
      setSelectedEpisodes(new Set());
    },
    onError: (error: Error) => {
      toast({ 
        title: "Transcription failed", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const getPodcastTitle = (podcastId: string) => {
    const podcast = podcasts.find(p => p.id === podcastId);
    return podcast?.title || "Unknown Podcast";
  };

  const filteredEpisodes = episodes.filter(episode => {
    const matchesSearch = episode.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      episode.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPodcast = filterPodcast === "all" || episode.podcastId === filterPodcast;
    const matchesTranscript = filterTranscript === "all" || 
      (filterTranscript === "yes" && episode.hasTranscript) ||
      (filterTranscript === "no" && !episode.hasTranscript);
    
    return matchesSearch && matchesPodcast && matchesTranscript;
  });

  const toggleEpisodeSelection = (episodeId: string) => {
    const newSelection = new Set(selectedEpisodes);
    if (newSelection.has(episodeId)) {
      newSelection.delete(episodeId);
    } else {
      newSelection.add(episodeId);
    }
    setSelectedEpisodes(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedEpisodes.size === filteredEpisodes.length) {
      setSelectedEpisodes(new Set());
    } else {
      setSelectedEpisodes(new Set(filteredEpisodes.map(e => e.id)));
    }
  };

  const handleBulkDelete = () => {
    bulkDeleteMutation.mutate(Array.from(selectedEpisodes));
  };

  // Stats for transcription queue
  const transcribedCount = episodes.filter(e => e.hasTranscript).length;
  const pendingCount = episodes.filter(e => !e.hasTranscript).length;
  const transcriptionProgress = episodes.length > 0 ? (transcribedCount / episodes.length) * 100 : 0;
  
  // Selected episodes that need transcription
  const selectedNeedingTranscription = Array.from(selectedEpisodes).filter(id => {
    const episode = episodes.find(e => e.id === id);
    return episode && !episode.hasTranscript && episode.mediaUrl;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-episodes-title">Episode Library</h1>
          <p className="text-muted-foreground mt-1">
            Manage all episodes across your podcasts
          </p>
        </div>
        <Link href="/admin/discover">
          <Button data-testid="button-add-episode">
            <Plus className="w-4 h-4 mr-2" />
            Import Episodes
          </Button>
        </Link>
      </div>

      {/* Transcription Pipeline Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <Library className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{episodes.length}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
              
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              
              <div 
                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${
                  filterTranscript === "no" ? "bg-amber-100" : "hover:bg-muted"
                }`}
                onClick={() => setFilterTranscript(filterTranscript === "no" ? "all" : "no")}
              >
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
              
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              
              <div 
                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${
                  filterTranscript === "yes" ? "bg-green-100" : "hover:bg-muted"
                }`}
                onClick={() => setFilterTranscript(filterTranscript === "yes" ? "all" : "yes")}
              >
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{transcribedCount}</p>
                  <p className="text-xs text-muted-foreground">Complete</p>
                </div>
              </div>
            </div>
            
            <div className="text-right">
              <p className="text-2xl font-bold">{Math.round(transcriptionProgress)}%</p>
              <p className="text-xs text-muted-foreground">Processed</p>
            </div>
          </div>
          
          <div className="space-y-1">
            <Progress value={transcriptionProgress} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{transcribedCount} of {episodes.length} episodes transcribed</span>
              {pendingCount > 0 && (
                <span className="text-amber-600">{pendingCount} ready for processing</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions Bar */}
      {selectedEpisodes.size > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <Badge className="bg-primary text-primary-foreground">
                  {selectedEpisodes.size} selected
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {selectedEpisodes.size === filteredEpisodes.length 
                    ? "All episodes in view" 
                    : `${selectedEpisodes.size} of ${filteredEpisodes.length}`}
                </span>
                {selectedNeedingTranscription.length > 0 && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300">
                    <Clock className="w-3 h-3 mr-1" />
                    {selectedNeedingTranscription.length} need transcription
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSelectedEpisodes(new Set())}
                >
                  Clear
                </Button>
                {selectedNeedingTranscription.length > 0 && (
                  <Button 
                    size="sm"
                    onClick={() => bulkTranscribeMutation.mutate(selectedNeedingTranscription)}
                    disabled={bulkTranscribeMutation.isPending}
                    data-testid="button-bulk-transcribe"
                  >
                    {bulkTranscribeMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Wand2 className="w-4 h-4 mr-2" />
                    )}
                    Transcribe {selectedNeedingTranscription.length}
                  </Button>
                )}
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                  data-testid="button-bulk-delete"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Library className="w-5 h-5" />
                All Episodes ({filteredEpisodes.length})
              </CardTitle>
              <CardDescription>
                Search, filter, and manage your episode library
              </CardDescription>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search episodes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-episodes"
              />
            </div>
            <Select value={filterPodcast} onValueChange={setFilterPodcast}>
              <SelectTrigger className="w-[200px]" data-testid="select-filter-podcast">
                <SelectValue placeholder="All Podcasts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Podcasts</SelectItem>
                {podcasts.map(podcast => (
                  <SelectItem key={podcast.id} value={podcast.id}>
                    {podcast.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterTranscript} onValueChange={setFilterTranscript}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-transcript">
                <SelectValue placeholder="Transcript Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Episodes</SelectItem>
                <SelectItem value="yes">Has Transcript</SelectItem>
                <SelectItem value="no">No Transcript</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredEpisodes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Library className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No episodes found</p>
              <Link href="/admin/discover">
                <Button variant="ghost" className="mt-2 text-yellow-600">
                  Import episodes from Podcast Index →
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Select All Header */}
              <div className="flex items-center gap-3 px-4 py-2 border-b">
                <Checkbox
                  checked={selectedEpisodes.size === filteredEpisodes.length && filteredEpisodes.length > 0}
                  onCheckedChange={toggleSelectAll}
                  className="data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
                  data-testid="checkbox-select-all"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedEpisodes.size === filteredEpisodes.length && filteredEpisodes.length > 0
                    ? "Deselect all"
                    : "Select all"}
                </span>
              </div>
              
              {filteredEpisodes.map((episode) => (
                <div 
                  key={episode.id} 
                  className={`flex items-start gap-4 p-4 border rounded-lg transition-colors ${
                    selectedEpisodes.has(episode.id) 
                      ? "bg-yellow-50 border-yellow-200" 
                      : !episode.hasTranscript 
                        ? "bg-amber-50/50 border-l-4 border-l-amber-400 hover:bg-amber-50" 
                        : "hover:bg-muted/50"
                  }`}
                  data-testid={`episode-row-${episode.id}`}
                >
                  <Checkbox
                    checked={selectedEpisodes.has(episode.id)}
                    onCheckedChange={() => toggleEpisodeSelection(episode.id)}
                    className="mt-1 data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
                    data-testid={`checkbox-episode-${episode.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium">{episode.title}</h3>
                      {episode.hasTranscript ? (
                        <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 hover:bg-green-100">
                          <FileText className="w-3 h-3 mr-1" />
                          Transcribed
                        </Badge>
                      ) : (
                        <Badge className="text-xs bg-amber-100 text-amber-700 hover:bg-amber-100 border border-amber-200">
                          <Loader2 className="w-3 h-3 mr-1" />
                          Needs Transcription
                        </Badge>
                      )}
                      {episode.type === "video" && (
                        <Badge variant="outline" className="text-xs">
                          Video
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {getPodcastTitle(episode.podcastId)}
                    </p>
                    {episode.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {episode.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      {episode.publishedAt && (
                        <span>{new Date(episode.publishedAt).toLocaleDateString()}</span>
                      )}
                      {episode.duration && (
                        <span>{Math.floor(episode.duration / 60)}m</span>
                      )}
                      {episode.mediaUrl && (
                        <span className="flex items-center gap-1">
                          <Music className="w-3 h-3" />
                          Has audio
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Link href={`/admin/episodes/${episode.id}`}>
                      <Button variant="outline" size="sm">
                        <Edit2 className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                    </Link>
                    <Link href={`/episode/${episode.id}`}>
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="w-3 h-3 mr-1" />
                        View
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedEpisodes.size} Episode{selectedEpisodes.size > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected episode{selectedEpisodes.size > 1 ? 's' : ''} and all associated transcripts, annotations, and music detections. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleteMutation.isPending}
              data-testid="button-confirm-bulk-delete"
            >
              {bulkDeleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete {selectedEpisodes.size} Episode{selectedEpisodes.size > 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
