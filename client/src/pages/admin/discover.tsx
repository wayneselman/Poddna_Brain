import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Podcast } from "@shared/schema";
import { 
  Loader2, 
  Search, 
  Download, 
  Podcast as PodcastIcon, 
  List,
  Copy,
  FileText,
  Music,
  Plus,
  Globe,
  ExternalLink
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const manualEpisodeSchema = z.object({
  podcastId: z.string().min(1, "Please select a podcast"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  mediaUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  publishedAt: z.string().optional(),
  duration: z.coerce.number().optional(),
  type: z.enum(["audio", "video"]),
  source: z.string().optional(),
});

const manualPodcastSchema = z.object({
  title: z.string().min(1, "Title is required"),
  host: z.string().min(1, "Host is required"),
  description: z.string().optional(),
  artworkUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

export default function AdminDiscoverPage() {
  const { toast } = useToast();
  
  // Podcast Index search state
  const [podcastIndexSearch, setPodcastIndexSearch] = useState("");
  const [podcastIndexResults, setPodcastIndexResults] = useState<any[]>([]);
  const [isSearchingPodcastIndex, setIsSearchingPodcastIndex] = useState(false);
  const [isImportingPodcast, setIsImportingPodcast] = useState(false);
  const [maxEpisodesToImport, setMaxEpisodesToImport] = useState(20);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Episode browsing state
  const [selectedPodcastForBrowsing, setSelectedPodcastForBrowsing] = useState<any | null>(null);
  const [podcastIndexEpisodes, setPodcastIndexEpisodes] = useState<any[]>([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [importingEpisodeId, setImportingEpisodeId] = useState<string | null>(null);
  const [showOnlyWithTranscripts, setShowOnlyWithTranscripts] = useState(false);
  
  // Manual add dialogs
  const [showAddPodcastDialog, setShowAddPodcastDialog] = useState(false);
  const [showAddEpisodeDialog, setShowAddEpisodeDialog] = useState(false);
  const [isAddingManual, setIsAddingManual] = useState(false);
  
  const { data: podcasts = [] } = useQuery<Podcast[]>({
    queryKey: ["/api/podcasts"],
  });

  const podcastForm = useForm<z.infer<typeof manualPodcastSchema>>({
    resolver: zodResolver(manualPodcastSchema),
    defaultValues: {
      title: "",
      host: "",
      description: "",
      artworkUrl: "",
    },
  });

  const episodeForm = useForm<z.infer<typeof manualEpisodeSchema>>({
    resolver: zodResolver(manualEpisodeSchema),
    defaultValues: {
      podcastId: "",
      title: "",
      description: "",
      mediaUrl: "",
      publishedAt: new Date().toISOString().split('T')[0],
      duration: 3600,
      type: "audio",
      source: "manual",
    },
  });

  // Search Podcast Index
  const searchPodcastIndex = async (query: string) => {
    if (!query.trim()) {
      setPodcastIndexResults([]);
      return;
    }
    
    setIsSearchingPodcastIndex(true);
    try {
      const res = await apiRequest("GET", `/api/admin/podcast-index/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Search failed");
      }
      
      const data = await res.json();
      setPodcastIndexResults(data.podcasts || data.feeds || []);
    } catch (error: any) {
      toast({
        title: "Search failed",
        description: error.message || "Failed to search Podcast Index",
        variant: "destructive",
      });
    } finally {
      setIsSearchingPodcastIndex(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setPodcastIndexSearch(value);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      searchPodcastIndex(value);
    }, 500);
  };

  // Import full podcast with episodes
  const importFromPodcastIndex = async (podcast: any) => {
    setIsImportingPodcast(true);
    try {
      const res = await apiRequest("POST", "/api/admin/podcast-index/import", {
        feedId: podcast.id,
        importEpisodes: true,
        maxEpisodes: maxEpisodesToImport,
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Import failed");
      }
      
      const data = await res.json();
      
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      
      toast({
        title: "Import successful!",
        description: `${data.podcast.title}: ${data.episodesImported} episodes imported${data.episodesSkipped > 0 ? `, ${data.episodesSkipped} skipped` : ""}`,
      });
      
      setPodcastIndexResults(prev => prev.filter(p => p.id !== podcast.id));
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import podcast",
        variant: "destructive",
      });
    } finally {
      setIsImportingPodcast(false);
    }
  };

  // Browse episodes from podcast
  const browseEpisodesFromPodcastIndex = async (podcast: any) => {
    setSelectedPodcastForBrowsing(podcast);
    setIsLoadingEpisodes(true);
    setPodcastIndexEpisodes([]);
    
    try {
      const res = await apiRequest("GET", `/api/admin/podcast-index/episodes/${podcast.id}?max=50`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to load episodes");
      }
      
      const data = await res.json();
      setPodcastIndexEpisodes(data.episodes || []);
    } catch (error: any) {
      toast({
        title: "Failed to load episodes",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingEpisodes(false);
    }
  };

  // Import single episode
  const importSingleEpisode = async (episode: any, generateTranscript: boolean = false) => {
    if (!selectedPodcastForBrowsing) return;
    
    setImportingEpisodeId(episode.id.toString());
    
    try {
      const importRes = await apiRequest("POST", "/api/admin/podcast-index/import", {
        feedId: selectedPodcastForBrowsing.id,
        importEpisodes: false,
        maxEpisodes: 0,
      });
      
      if (!importRes.ok) {
        const error = await importRes.json();
        throw new Error(error.error || "Failed to import podcast");
      }
      
      const podcastData = await importRes.json();
      const podcastId = podcastData.podcast.id;
      
      const episodeRes = await apiRequest("POST", "/api/episodes", {
        podcastId,
        title: episode.title,
        episodeNumber: 0,
        description: episode.description || "",
        publishedAt: episode.datePublished 
          ? new Date(episode.datePublished * 1000).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        duration: episode.duration || 0,
        type: episode.enclosureType?.includes("video") ? "video" : "audio",
        mediaUrl: episode.enclosureUrl || "",
        transcriptUrl: episode.transcriptUrl || null,
        transcriptType: episode.transcriptType || null,
      });
      
      if (!episodeRes.ok) {
        const error = await episodeRes.json();
        throw new Error(error.error || "Failed to create episode");
      }
      
      const createdEpisode = await episodeRes.json();
      
      // If episode has a transcript URL, automatically fetch and import it (no Gemini - direct parse)
      let transcriptImported = false;
      if (episode.transcriptUrl && episode.hasTranscript) {
        try {
          const transcriptRes = await apiRequest("POST", `/api/episodes/${createdEpisode.id}/transcript/fetch-embedded`, {
            transcriptUrl: episode.transcriptUrl,
          });
          
          if (transcriptRes.ok) {
            transcriptImported = true;
          }
        } catch (err) {
          console.error("Failed to import transcript:", err);
          // Don't fail the whole import if transcript fails
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      
      toast({
        title: "Episode imported!",
        description: transcriptImported 
          ? `"${episode.title}" has been added with transcript.`
          : `"${episode.title}" has been added. ${episode.hasTranscript ? "Transcript available - go to Transcript Lab to import." : generateTranscript ? "Go to Transcript Lab to generate transcript." : ""}`,
      });
      
      setPodcastIndexEpisodes(prev => prev.filter(e => e.id !== episode.id));
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setImportingEpisodeId(null);
    }
  };

  // Copy audio URL
  const copyAudioUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({
      title: "Copied!",
      description: "Audio URL copied to clipboard",
    });
  };

  // Add manual podcast
  const handleAddManualPodcast = async (data: z.infer<typeof manualPodcastSchema>) => {
    setIsAddingManual(true);
    try {
      const res = await apiRequest("POST", "/api/podcasts", data);
      if (!res.ok) throw new Error("Failed to create podcast");
      
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts"] });
      toast({ title: "Podcast created successfully" });
      podcastForm.reset();
      setShowAddPodcastDialog(false);
    } catch (error: any) {
      toast({
        title: "Failed to create podcast",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsAddingManual(false);
    }
  };

  // Add manual episode
  const handleAddManualEpisode = async (data: z.infer<typeof manualEpisodeSchema>) => {
    setIsAddingManual(true);
    try {
      const res = await apiRequest("POST", "/api/admin/episodes", {
        ...data,
        episodeNumber: 0,
      });
      if (!res.ok) throw new Error("Failed to create episode");
      
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      toast({ title: "Episode created successfully" });
      episodeForm.reset();
      setShowAddEpisodeDialog(false);
    } catch (error: any) {
      toast({
        title: "Failed to create episode",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsAddingManual(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-discover-title">Discover & Import</h1>
          <p className="text-muted-foreground mt-1">
            Find podcasts on Podcast Index or add content manually
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showAddPodcastDialog} onOpenChange={setShowAddPodcastDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-add-manual-podcast">
                <Plus className="w-4 h-4 mr-2" />
                Add Podcast
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Podcast Manually</DialogTitle>
                <DialogDescription>
                  Create a podcast for content not on Podcast Index (LinkedIn, etc.)
                </DialogDescription>
              </DialogHeader>
              <Form {...podcastForm}>
                <form onSubmit={podcastForm.handleSubmit(handleAddManualPodcast)} className="space-y-4">
                  <FormField
                    control={podcastForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Podcast title" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={podcastForm.control}
                    name="host"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Host</FormLabel>
                        <FormControl>
                          <Input placeholder="Host name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={podcastForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Podcast description" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={podcastForm.control}
                    name="artworkUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Artwork URL</FormLabel>
                        <FormControl>
                          <Input placeholder="https://..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={isAddingManual}>
                      {isAddingManual && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Create Podcast
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Dialog open={showAddEpisodeDialog} onOpenChange={setShowAddEpisodeDialog}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-manual-episode">
                <Plus className="w-4 h-4 mr-2" />
                Add Episode
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Episode Manually</DialogTitle>
                <DialogDescription>
                  Add an episode from any source (LinkedIn, direct upload, etc.)
                </DialogDescription>
              </DialogHeader>
              <Form {...episodeForm}>
                <form onSubmit={episodeForm.handleSubmit(handleAddManualEpisode)} className="space-y-4">
                  <FormField
                    control={episodeForm.control}
                    name="podcastId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Podcast</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a podcast" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {podcasts.map(podcast => (
                              <SelectItem key={podcast.id} value={podcast.id}>
                                {podcast.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={episodeForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Episode title" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={episodeForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Episode description" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={episodeForm.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="audio">Audio</SelectItem>
                              <SelectItem value="video">Video</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={episodeForm.control}
                      name="duration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Duration (seconds)</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={episodeForm.control}
                    name="mediaUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Media URL (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="https://..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={episodeForm.control}
                    name="source"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Source</FormLabel>
                        <FormControl>
                          <Input placeholder="LinkedIn, Manual upload, etc." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={isAddingManual}>
                      {isAddingManual && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Create Episode
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="podcast-index" className="space-y-4">
        <TabsList>
          <TabsTrigger value="podcast-index" data-testid="tab-podcast-index">
            <Globe className="w-4 h-4 mr-2" />
            Podcast Index
          </TabsTrigger>
          <TabsTrigger value="library" data-testid="tab-library">
            <PodcastIcon className="w-4 h-4 mr-2" />
            My Podcasts ({podcasts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="podcast-index" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Search Podcast Index
              </CardTitle>
              <CardDescription>
                Search millions of podcasts and import episodes with one click
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search podcasts..."
                    value={podcastIndexSearch}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-9"
                    data-testid="input-podcast-search"
                  />
                </div>
                <Button 
                  onClick={() => searchPodcastIndex(podcastIndexSearch)}
                  disabled={isSearchingPodcastIndex}
                >
                  {isSearchingPodcastIndex ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                </Button>
              </div>

              {/* Episode browsing panel */}
              {selectedPodcastForBrowsing && (
                <Card className="border-2 border-primary/20 bg-primary/5">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {selectedPodcastForBrowsing.artwork && (
                          <img 
                            src={selectedPodcastForBrowsing.artwork} 
                            alt="" 
                            className="w-12 h-12 rounded object-cover"
                          />
                        )}
                        <div>
                          <CardTitle className="text-lg">{selectedPodcastForBrowsing.title}</CardTitle>
                          <CardDescription>Browse and import individual episodes</CardDescription>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setSelectedPodcastForBrowsing(null);
                          setPodcastIndexEpisodes([]);
                        }}
                      >
                        Close
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Filter controls and stats */}
                    {!isLoadingEpisodes && podcastIndexEpisodes.length > 0 && (
                      <div className="flex items-center justify-between pb-2 border-b">
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                              type="checkbox"
                              checked={showOnlyWithTranscripts}
                              onChange={(e) => setShowOnlyWithTranscripts(e.target.checked)}
                              className="rounded border-primary"
                              data-testid="checkbox-filter-transcripts"
                            />
                            <span className="text-sm font-medium">Only show episodes with transcripts</span>
                          </label>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            <FileText className="w-3 h-3 mr-1" />
                            {podcastIndexEpisodes.filter(e => e.hasTranscript).length} with transcripts
                          </Badge>
                          <span>/ {podcastIndexEpisodes.length} total</span>
                        </div>
                      </div>
                    )}
                    
                    <div className="max-h-80 overflow-y-auto">
                    {isLoadingEpisodes ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    ) : podcastIndexEpisodes.length === 0 ? (
                      <p className="text-center text-muted-foreground py-4">No episodes found</p>
                    ) : (
                      <div className="space-y-3">
                        {podcastIndexEpisodes
                          .filter(episode => !showOnlyWithTranscripts || episode.hasTranscript)
                          .map((episode) => (
                          <div 
                            key={episode.id}
                            className={`flex items-start justify-between gap-3 p-3 border rounded-lg bg-background ${
                              episode.hasTranscript ? 'border-l-4 border-l-green-500' : ''
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-sm line-clamp-1">{episode.title}</h4>
                                {episode.hasTranscript && (
                                  <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs flex-shrink-0">
                                    <FileText className="w-3 h-3 mr-1" />
                                    Transcript
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                {episode.duration && (
                                  <span>{Math.floor(episode.duration / 60)}m</span>
                                )}
                                {episode.datePublished && (
                                  <span>
                                    {new Date(episode.datePublished * 1000).toLocaleDateString()}
                                  </span>
                                )}
                                {episode.enclosureUrl && (
                                  <Badge variant="outline" className="text-xs">
                                    <Music className="w-3 h-3 mr-1" />
                                    Audio
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              {episode.enclosureUrl && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => copyAudioUrl(episode.enclosureUrl)}
                                  title="Copy audio URL"
                                >
                                  <Copy className="w-3 h-3" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant={episode.hasTranscript ? "default" : "outline"}
                                onClick={() => importSingleEpisode(episode, false)}
                                disabled={importingEpisodeId === episode.id.toString()}
                                title={episode.hasTranscript ? "Import with transcript" : "Import episode only"}
                              >
                                {importingEpisodeId === episode.id.toString() ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : episode.hasTranscript ? (
                                  <>
                                    <FileText className="w-3 h-3 mr-1" />
                                    Import
                                  </>
                                ) : (
                                  <Download className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                          </div>
                        ))}
                        {showOnlyWithTranscripts && 
                          podcastIndexEpisodes.filter(e => e.hasTranscript).length === 0 && (
                          <p className="text-center text-muted-foreground py-4">
                            No episodes with transcripts available for this podcast
                          </p>
                        )}
                      </div>
                    )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Search results */}
              {podcastIndexResults.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {podcastIndexResults.length} results found
                  </h3>
                  {podcastIndexResults.map((podcast) => (
                    <div 
                      key={podcast.id}
                      className="flex items-center gap-4 p-4 border rounded-lg"
                    >
                      {podcast.artwork && (
                        <img 
                          src={podcast.artwork} 
                          alt={podcast.title}
                          className="w-16 h-16 rounded object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium line-clamp-1">{podcast.title}</h4>
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {podcast.author || podcast.ownerName}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {podcast.description}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => browseEpisodesFromPodcastIndex(podcast)}
                          disabled={isLoadingEpisodes}
                        >
                          <List className="w-4 h-4 mr-1" />
                          Browse
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => importFromPodcastIndex(podcast)}
                          disabled={isImportingPodcast}
                        >
                          {isImportingPodcast ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Download className="w-4 h-4 mr-1" />
                              Import
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {podcastIndexSearch && !isSearchingPodcastIndex && podcastIndexResults.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No podcasts found for "{podcastIndexSearch}"</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="library">
          <Card>
            <CardHeader>
              <CardTitle>Your Podcast Library</CardTitle>
              <CardDescription>
                Podcasts you've imported or created manually
              </CardDescription>
            </CardHeader>
            <CardContent>
              {podcasts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <PodcastIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No podcasts yet</p>
                  <p className="text-sm mt-1">Search Podcast Index or add one manually</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {podcasts.map((podcast) => (
                    <div 
                      key={podcast.id}
                      className="flex items-center gap-3 p-4 border rounded-lg"
                    >
                      {podcast.artworkUrl && (
                        <img 
                          src={podcast.artworkUrl} 
                          alt={podcast.title}
                          className="w-12 h-12 rounded object-cover"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium line-clamp-1">{podcast.title}</h4>
                        <p className="text-sm text-muted-foreground">{podcast.host}</p>
                      </div>
                      <Button variant="ghost" size="sm" asChild>
                        <a href={`/admin/episodes?podcast=${podcast.id}`}>
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
