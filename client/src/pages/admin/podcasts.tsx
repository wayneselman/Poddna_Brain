import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Podcast, Episode, Category } from "@shared/schema";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Loader2, 
  Search, 
  Library, 
  Edit2, 
  Trash2,
  Plus,
  ExternalLink,
  Podcast as PodcastIcon,
  MoreVertical,
  RefreshCw,
  Rss,
  Tags,
  LayoutGrid,
  Star,
  StarOff,
  Home,
  Compass,
  Users,
  X
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export default function AdminPodcastsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingPodcast, setEditingPodcast] = useState<Podcast | null>(null);
  const [deletingPodcast, setDeletingPodcast] = useState<Podcast | null>(null);
  const [syncingPodcastId, setSyncingPodcastId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", host: "", description: "", artworkUrl: "", knownSpeakers: [] as string[] });
  const [newSpeakerName, setNewSpeakerName] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const { toast } = useToast();

  const { data: podcasts = [], isLoading: podcastsLoading } = useQuery<Podcast[]>({
    queryKey: ["/api/podcasts"],
  });

  const { data: featuredLanding = [] } = useQuery<Podcast[]>({
    queryKey: ["/api/podcasts/featured/landing"],
  });

  const { data: featuredExplore = [] } = useQuery<Podcast[]>({
    queryKey: ["/api/podcasts/featured/explore"],
  });

  const { data: episodes = [] } = useQuery<Episode[]>({
    queryKey: ["/api/episodes"],
  });

  const { data: allCategories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: podcastCategories = [], refetch: refetchPodcastCategories } = useQuery<Category[]>({
    queryKey: ["/api/podcasts", editingPodcast?.id, "categories"],
    queryFn: async () => {
      if (!editingPodcast) return [];
      const res = await fetch(`/api/podcasts/${editingPodcast.id}/categories`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!editingPodcast,
  });

  useEffect(() => {
    if (podcastCategories.length > 0) {
      setSelectedCategories(podcastCategories.map(c => c.id));
    } else {
      setSelectedCategories([]);
    }
  }, [podcastCategories]);

  const getEpisodeCount = (podcastId: string) => {
    return episodes.filter(e => e.podcastId === podcastId).length;
  };

  const filteredPodcasts = podcasts.filter(podcast => {
    const matchesSearch = 
      podcast.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      podcast.host?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      podcast.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Podcast> }) => {
      const res = await apiRequest("PATCH", `/api/podcasts/${id}`, data);
      if (!res.ok) throw new Error("Failed to update podcast");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts"] });
      toast({ title: "Podcast updated successfully" });
      setEditingPodcast(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update podcast", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/podcasts/${id}`);
      if (!res.ok) throw new Error("Failed to delete podcast");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      toast({ title: "Podcast deleted successfully" });
      setDeletingPodcast(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete podcast", description: error.message, variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (podcastId: string) => {
      setSyncingPodcastId(podcastId);
      const res = await apiRequest("POST", `/api/admin/podcasts/${podcastId}/sync-episodes`, { maxEpisodes: 50 });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to sync episodes");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      if (data.newEpisodesFound > 0) {
        toast({ 
          title: "New episodes found!", 
          description: `Imported ${data.newEpisodesFound} new episode${data.newEpisodesFound === 1 ? '' : 's'} for "${data.podcast.title}"` 
        });
      } else {
        toast({ 
          title: "Already up to date", 
          description: `No new episodes found for "${data.podcast.title}"` 
        });
      }
      setSyncingPodcastId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to sync episodes", description: error.message, variant: "destructive" });
      setSyncingPodcastId(null);
    },
  });

  const addCategoryMutation = useMutation({
    mutationFn: async ({ podcastId, categoryId }: { podcastId: string; categoryId: string }) => {
      const res = await apiRequest("POST", `/api/admin/podcasts/${podcastId}/categories`, { categoryId });
      if (!res.ok) throw new Error("Failed to add category");
      return res.json();
    },
    onSuccess: () => {
      refetchPodcastCategories();
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add category", description: error.message, variant: "destructive" });
    },
  });

  const removeCategoryMutation = useMutation({
    mutationFn: async ({ podcastId, categoryId }: { podcastId: string; categoryId: string }) => {
      const res = await apiRequest("DELETE", `/api/admin/podcasts/${podcastId}/categories/${categoryId}`);
      if (!res.ok) throw new Error("Failed to remove category");
      return res.json();
    },
    onSuccess: () => {
      refetchPodcastCategories();
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove category", description: error.message, variant: "destructive" });
    },
  });

  const featureLandingMutation = useMutation({
    mutationFn: async ({ id, featured }: { id: string; featured: boolean }) => {
      const res = await apiRequest("PATCH", `/api/podcasts/${id}/featured/landing`, { featured });
      if (!res.ok) throw new Error("Failed to update featured status");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts/featured/landing"] });
      toast({ title: variables.featured ? "Added to Landing page" : "Removed from Landing page" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  const featureExploreMutation = useMutation({
    mutationFn: async ({ id, featured }: { id: string; featured: boolean }) => {
      const res = await apiRequest("PATCH", `/api/podcasts/${id}/featured/explore`, { featured });
      if (!res.ok) throw new Error("Failed to update featured status");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts/featured/explore"] });
      toast({ title: variables.featured ? "Added to Explore page" : "Removed from Explore page" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  const handleCategoryToggle = (categoryId: string, checked: boolean) => {
    if (!editingPodcast) return;
    
    if (checked) {
      addCategoryMutation.mutate({ podcastId: editingPodcast.id, categoryId });
      setSelectedCategories(prev => [...prev, categoryId]);
    } else {
      removeCategoryMutation.mutate({ podcastId: editingPodcast.id, categoryId });
      setSelectedCategories(prev => prev.filter(id => id !== categoryId));
    }
  };

  const handleEditClick = (podcast: Podcast) => {
    setEditForm({
      title: podcast.title,
      host: podcast.host || "",
      description: podcast.description || "",
      artworkUrl: podcast.artworkUrl || "",
      knownSpeakers: podcast.knownSpeakers || [],
    });
    setNewSpeakerName("");
    setEditingPodcast(podcast);
  };

  const handleAddSpeaker = () => {
    const trimmedName = newSpeakerName.trim();
    if (trimmedName && !editForm.knownSpeakers.includes(trimmedName)) {
      setEditForm(prev => ({
        ...prev,
        knownSpeakers: [...prev.knownSpeakers, trimmedName]
      }));
      setNewSpeakerName("");
    }
  };

  const handleRemoveSpeaker = (speakerName: string) => {
    setEditForm(prev => ({
      ...prev,
      knownSpeakers: prev.knownSpeakers.filter(s => s !== speakerName)
    }));
  };

  const handleSaveEdit = () => {
    if (!editingPodcast) return;
    updateMutation.mutate({ id: editingPodcast.id, data: editForm });
  };

  const handleDeleteConfirm = () => {
    if (!deletingPodcast) return;
    deleteMutation.mutate(deletingPodcast.id);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-podcasts-title">Podcast Library</h1>
          <p className="text-muted-foreground mt-1">
            Manage all podcasts in your library
          </p>
        </div>
        <Link href="/admin/discover">
          <Button data-testid="button-add-podcast">
            <Plus className="w-4 h-4 mr-2" />
            Add Podcast
          </Button>
        </Link>
      </div>

      {/* Featured Podcasts Section */}
      <Card className="border-yellow-200 bg-yellow-50/30 dark:bg-yellow-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            Featured Podcasts
          </CardTitle>
          <CardDescription>
            Manage podcasts featured on Landing page (4 max) and Explore page (8 max)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="landing" className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="landing" className="flex items-center gap-2">
                <Home className="w-4 h-4" />
                Landing ({featuredLanding.length}/4)
              </TabsTrigger>
              <TabsTrigger value="explore" className="flex items-center gap-2">
                <Compass className="w-4 h-4" />
                Explore ({featuredExplore.length}/8)
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="landing" className="mt-4">
              {featuredLanding.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border rounded-lg bg-white dark:bg-background">
                  <Home className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No podcasts featured on landing page</p>
                  <p className="text-xs mt-1">Use the menu on any podcast below to feature it</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {featuredLanding.map((podcast) => (
                    <div key={podcast.id} className="relative group">
                      <div className="aspect-square rounded-lg overflow-hidden border-2 border-yellow-400">
                        {podcast.artworkUrl ? (
                          <img src={podcast.artworkUrl} alt={podcast.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center">
                            <PodcastIcon className="w-12 h-12 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-medium mt-2 line-clamp-1">{podcast.title}</p>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => featureLandingMutation.mutate({ id: podcast.id, featured: false })}
                        data-testid={`button-unfeature-landing-${podcast.id}`}
                      >
                        <StarOff className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="explore" className="mt-4">
              {featuredExplore.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border rounded-lg bg-white dark:bg-background">
                  <Compass className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No podcasts featured on explore page</p>
                  <p className="text-xs mt-1">Use the menu on any podcast below to feature it</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {featuredExplore.map((podcast) => (
                    <div key={podcast.id} className="relative group">
                      <div className="aspect-square rounded-lg overflow-hidden border-2 border-yellow-400">
                        {podcast.artworkUrl ? (
                          <img src={podcast.artworkUrl} alt={podcast.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center">
                            <PodcastIcon className="w-12 h-12 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-medium mt-2 line-clamp-1">{podcast.title}</p>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => featureExploreMutation.mutate({ id: podcast.id, featured: false })}
                        data-testid={`button-unfeature-explore-${podcast.id}`}
                      >
                        <StarOff className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Library className="w-5 h-5" />
                All Podcasts ({filteredPodcasts.length})
              </CardTitle>
              <CardDescription>
                Search and manage your podcast library
              </CardDescription>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search podcasts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-podcasts"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {podcastsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPodcasts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <PodcastIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No podcasts found</p>
              <Link href="/admin/discover">
                <Button variant="ghost" className="mt-2">
                  Import podcasts from Podcast Index →
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPodcasts.map((podcast) => (
                <div 
                  key={podcast.id} 
                  className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  data-testid={`podcast-row-${podcast.id}`}
                >
                  {podcast.artworkUrl ? (
                    <img 
                      src={podcast.artworkUrl} 
                      alt={podcast.title}
                      className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <PodcastIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium">{podcast.title}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {getEpisodeCount(podcast.id)} episodes
                      </Badge>
                      {featuredLanding.some(p => p.id === podcast.id) && (
                        <Badge className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300">
                          <Home className="w-3 h-3 mr-1" />
                          Landing
                        </Badge>
                      )}
                      {featuredExplore.some(p => p.id === podcast.id) && (
                        <Badge className="text-xs bg-blue-100 text-blue-800 border-blue-300">
                          <Compass className="w-3 h-3 mr-1" />
                          Explore
                        </Badge>
                      )}
                      {podcast.podcastIndexFeedId && (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                          <Rss className="w-3 h-3 mr-1" />
                          Syncable
                        </Badge>
                      )}
                    </div>
                    {podcast.host && (
                      <p className="text-sm text-muted-foreground mt-1">
                        by {podcast.host}
                      </p>
                    )}
                    {podcast.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {podcast.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Link href={`/podcast/${podcast.id}`}>
                      <Button variant="ghost" size="icon" data-testid={`button-view-${podcast.id}`}>
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-menu-${podcast.id}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {podcast.podcastIndexFeedId && (
                          <DropdownMenuItem 
                            onClick={() => syncMutation.mutate(podcast.id)}
                            disabled={syncingPodcastId === podcast.id}
                          >
                            {syncingPodcastId === podcast.id ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4 mr-2" />
                            )}
                            Check for New Episodes
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem 
                          onClick={() => featureLandingMutation.mutate({ 
                            id: podcast.id, 
                            featured: !featuredLanding.some(p => p.id === podcast.id) 
                          })}
                          disabled={featureLandingMutation.isPending}
                        >
                          {featuredLanding.some(p => p.id === podcast.id) ? (
                            <>
                              <StarOff className="w-4 h-4 mr-2" />
                              Remove from Landing
                            </>
                          ) : (
                            <>
                              <Home className="w-4 h-4 mr-2" />
                              Feature on Landing
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => featureExploreMutation.mutate({ 
                            id: podcast.id, 
                            featured: !featuredExplore.some(p => p.id === podcast.id) 
                          })}
                          disabled={featureExploreMutation.isPending}
                        >
                          {featuredExplore.some(p => p.id === podcast.id) ? (
                            <>
                              <StarOff className="w-4 h-4 mr-2" />
                              Remove from Explore
                            </>
                          ) : (
                            <>
                              <Compass className="w-4 h-4 mr-2" />
                              Feature on Explore
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEditClick(podcast)}>
                          <Edit2 className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => setDeletingPodcast(podcast)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingPodcast} onOpenChange={(open) => !open && setEditingPodcast(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Podcast</DialogTitle>
            <DialogDescription>
              Update podcast information
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                data-testid="input-edit-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-host">Host</Label>
              <Input
                id="edit-host"
                value={editForm.host}
                onChange={(e) => setEditForm(prev => ({ ...prev, host: e.target.value }))}
                data-testid="input-edit-host"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-artwork">Artwork URL</Label>
              <Input
                id="edit-artwork"
                value={editForm.artworkUrl}
                onChange={(e) => setEditForm(prev => ({ ...prev, artworkUrl: e.target.value }))}
                placeholder="https://..."
                data-testid="input-edit-artwork"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                rows={4}
                data-testid="input-edit-description"
              />
            </div>

            {/* Known Speakers Section */}
            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-yellow-600" />
                <Label className="text-base font-medium">Known Speakers</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Add regular hosts and speakers to improve AI transcription accuracy
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter speaker name..."
                  value={newSpeakerName}
                  onChange={(e) => setNewSpeakerName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSpeaker())}
                  data-testid="input-new-speaker"
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleAddSpeaker}
                  disabled={!newSpeakerName.trim()}
                  data-testid="button-add-speaker"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {editForm.knownSpeakers.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {editForm.knownSpeakers.map((speaker) => (
                    <Badge 
                      key={speaker} 
                      className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 pl-3 pr-1 py-1 flex items-center gap-1"
                    >
                      {speaker}
                      <button
                        type="button"
                        onClick={() => handleRemoveSpeaker(speaker)}
                        className="ml-1 rounded-full p-0.5 hover:bg-yellow-300"
                        data-testid={`button-remove-speaker-${speaker.replace(/\s+/g, "-")}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {editForm.knownSpeakers.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  No speakers added yet. The AI will use generic labels like "Host" and "Guest".
                </p>
              )}
            </div>

            {/* Categories Section */}
            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Tags className="w-4 h-4 text-yellow-600" />
                <Label className="text-base font-medium">Categories</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Select categories to help users discover this podcast
              </p>
              {allCategories.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center border rounded-lg bg-muted/30">
                  <LayoutGrid className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No categories available</p>
                  <Link href="/admin/categories">
                    <Button variant="ghost" size="sm" className="text-yellow-600 hover:text-yellow-700">
                      Create categories first →
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto p-1">
                  {allCategories.map((category) => (
                    <div
                      key={category.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedCategories.includes(category.id)
                          ? "border-yellow-400 bg-yellow-50"
                          : "border-gray-200 hover:border-yellow-200 hover:bg-yellow-50/50"
                      }`}
                      onClick={() => handleCategoryToggle(category.id, !selectedCategories.includes(category.id))}
                      data-testid={`category-checkbox-${category.id}`}
                    >
                      <Checkbox
                        checked={selectedCategories.includes(category.id)}
                        onCheckedChange={(checked) => handleCategoryToggle(category.id, checked as boolean)}
                        className="data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
                      />
                      <span className="text-sm font-medium">{category.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {selectedCategories.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {selectedCategories.map((catId) => {
                    const cat = allCategories.find(c => c.id === catId);
                    return cat ? (
                      <Badge key={catId} className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                        {cat.name}
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPodcast(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEdit} 
              disabled={updateMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingPodcast} onOpenChange={(open) => !open && setDeletingPodcast(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Podcast?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deletingPodcast?.title}" and all its episodes, transcripts, and annotations. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete Podcast
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
