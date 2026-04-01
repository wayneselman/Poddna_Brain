import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Loader2, 
  Plus, 
  ArrowLeft,
  Play,
  Pause,
  Trash2,
  Rss,
  Youtube,
  Radio,
  Search,
  Clock,
  AlertTriangle,
  RefreshCw,
  Package,
  Check,
  Bot,
  CheckCircle2,
  XCircle,
  HelpCircle
} from "lucide-react";
import type { Program, ProgramSource, InsertProgramSource, ProgramConfig, IngestionEvent, IngestionRecommendation } from "@shared/schema";

const SOURCE_TYPE_ICONS: Record<string, any> = {
  rss_url: Rss,
  youtube_channel: Youtube,
  podcastindex_feed: Radio,
  podcastindex_query: Search,
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  rss_url: "RSS Feed",
  youtube_channel: "YouTube Channel",
  podcastindex_feed: "PodcastIndex Feed",
  podcastindex_query: "PodcastIndex Query",
};

interface ProgramDetailResponse {
  program: Program;
  sources: ProgramSource[];
  dailyCounts: { catalog: number; tier1: number };
}

export default function AdminProgramDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [sourceForm, setSourceForm] = useState<Partial<InsertProgramSource>>({
    type: "rss_url",
    value: "",
    label: "",
    enabled: true,
  });
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery<ProgramDetailResponse>({
    queryKey: ["/api/admin/programs", id],
    enabled: !!id,
  });

  const { data: events = [] } = useQuery<IngestionEvent[]>({
    queryKey: ["/api/admin/programs", id, "events"],
    enabled: !!id,
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/programs/${id}/pause`);
      if (!res.ok) throw new Error("Failed to pause program");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", id] });
      toast({ title: "Program paused" });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/programs/${id}/resume`);
      if (!res.ok) throw new Error("Failed to resume program");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", id] });
      toast({ title: "Program resumed" });
    },
  });

  const addSourceMutation = useMutation({
    mutationFn: async (data: Partial<InsertProgramSource>) => {
      const res = await apiRequest("POST", `/api/admin/programs/${id}/sources`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add source");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", id] });
      toast({ title: "Source added" });
      setIsAddSourceOpen(false);
      setSourceForm({ type: "rss_url", value: "", label: "", enabled: true });
    },
    onError: (error: any) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const toggleSourceMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const res = await apiRequest("POST", `/api/admin/sources/${sourceId}/toggle`);
      if (!res.ok) throw new Error("Failed to toggle source");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", id] });
    },
  });

  const deleteSourceMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/sources/${sourceId}`);
      if (!res.ok) throw new Error("Failed to delete source");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", id] });
      toast({ title: "Source removed" });
    },
  });

  const pollMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/programs/${id}/poll`);
      if (!res.ok) throw new Error("Failed to poll sources");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", id, "events"] });
      toast({ 
        title: "Poll Complete",
        description: `Found ${data.summary.newEvents} new events from ${data.summary.totalSources} source(s)` 
      });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to poll", variant: "destructive" });
    },
  });

  const catalogMutation = useMutation({
    mutationFn: async (eventIds: string[]) => {
      const res = await apiRequest("POST", `/api/admin/events/catalog`, { eventIds });
      if (!res.ok) throw new Error("Failed to catalog events");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", id, "events"] });
      setSelectedEventIds(new Set());
      toast({ 
        title: "Catalog Complete",
        description: `${data.summary.success} created, ${data.summary.skipped} skipped, ${data.summary.failed} failed` 
      });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to catalog", variant: "destructive" });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (eventIds: string[]) => {
      const res = await apiRequest("POST", `/api/admin/events/resolve`, { eventIds });
      if (!res.ok) throw new Error("Failed to resolve events");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", id, "events"] });
      setSelectedEventIds(new Set());
      toast({ 
        title: "Resolve Jobs Queued",
        description: `${data.summary.queued} queued, ${data.summary.skipped} skipped, ${data.summary.failed} failed` 
      });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to resolve", variant: "destructive" });
    },
  });

  // Agent Plan state and queries
  const [selectedRecIds, setSelectedRecIds] = useState<Set<string>>(new Set());

  const { data: recommendations = [], refetch: refetchRecs } = useQuery<IngestionRecommendation[]>({
    queryKey: ["/api/admin/programs", id, "recommendations"],
    enabled: !!id,
  });

  const runAgentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/programs/${id}/run-agent`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to run agent");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", id, "recommendations"] });
      toast({ 
        title: "Agent Run Complete",
        description: `Generated ${data.recommendationsCreated} recommendations` 
      });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Agent run failed", variant: "destructive" });
    },
  });

  const approveRecsMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", `/api/admin/recommendations/bulk-approve`, { ids });
      if (!res.ok) throw new Error("Failed to approve recommendations");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", id, "recommendations"] });
      setSelectedRecIds(new Set());
      toast({ title: `Approved ${data.approved} recommendations` });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to approve", variant: "destructive" });
    },
  });

  const rejectRecsMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", `/api/admin/recommendations/bulk-reject`, { ids });
      if (!res.ok) throw new Error("Failed to reject recommendations");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", id, "recommendations"] });
      setSelectedRecIds(new Set());
      toast({ title: `Rejected ${data.rejected} recommendations` });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to reject", variant: "destructive" });
    },
  });

  const [, navigate] = useLocation();
  
  const deleteProgramMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/admin/programs/${id}`);
      if (!res.ok) throw new Error("Failed to delete program");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      toast({ title: "Program deleted" });
      navigate("/admin/programs");
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to delete", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Program not found</p>
            <Link href="/admin/programs">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Programs
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { program, sources, dailyCounts } = data;
  const config = (program.config || {}) as ProgramConfig;

  const formatDate = (date: Date | string | null) => {
    if (!date) return "Never";
    return new Date(date).toLocaleString(undefined, { 
      month: "short", 
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const getSourcePlaceholder = (type: string) => {
    switch (type) {
      case "rss_url": return "https://example.com/feed.xml";
      case "youtube_channel": return "UC... or channel URL";
      case "podcastindex_feed": return "PodcastIndex Feed ID";
      case "podcastindex_query": return "Search query (e.g., 'true crime')";
      default: return "Enter source identifier";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-600">Active</Badge>;
      case "paused":
        return <Badge variant="secondary">Paused</Badge>;
      case "paused_due_to_config":
        return <Badge variant="destructive">Config Error</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {program.status === "paused_due_to_config" && (
        <Alert variant="destructive" data-testid="alert-config-error">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Configuration Error</AlertTitle>
          <AlertDescription>
            This program is paused because its configuration is invalid. Please review and fix the configuration settings below, then resume the program.
          </AlertDescription>
        </Alert>
      )}
      
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/admin/programs">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-program-name">{program.name}</h1>
            {program.description && (
              <p className="text-muted-foreground">{program.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(program.status)}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => pollMutation.mutate()} 
            disabled={pollMutation.isPending || sources.filter(s => s.enabled).length === 0}
            data-testid="button-poll"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${pollMutation.isPending ? "animate-spin" : ""}`} />
            {pollMutation.isPending ? "Polling..." : "Poll Now"}
          </Button>
          {program.status === "active" ? (
            <Button variant="outline" size="sm" onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending} data-testid="button-pause">
              <Pause className="w-4 h-4 mr-1" />
              Pause
            </Button>
          ) : (program.status === "paused" || program.status === "paused_due_to_config") ? (
            <Button variant="outline" size="sm" onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending} data-testid="button-resume">
              <Play className="w-4 h-4 mr-1" />
              Resume
            </Button>
          ) : null}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" data-testid="button-delete-program">
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Program?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{program.name}" and all its sources and events. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteProgramMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-confirm-delete"
                >
                  {deleteProgramMutation.isPending ? "Deleting..." : "Delete Program"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sources.length}</div>
            <p className="text-xs text-muted-foreground">{sources.filter(s => s.enabled).length} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Catalog</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dailyCounts.catalog} / {config.budgets?.maxCatalogPerDay || 100}</div>
            <p className="text-xs text-muted-foreground">episodes cataloged</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Tier 1</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dailyCounts.tier1} / {config.budgets?.maxTier1PerDay || 10}</div>
            <p className="text-xs text-muted-foreground">paid transcriptions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Last Agent Run</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">{formatDate(program.lastAgentRun)}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sources" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sources" data-testid="tab-sources">Sources</TabsTrigger>
          <TabsTrigger value="config" data-testid="tab-config">Configuration</TabsTrigger>
          <TabsTrigger value="events" data-testid="tab-events">Recent Events</TabsTrigger>
          <TabsTrigger value="agent" data-testid="tab-agent">Agent Plan</TabsTrigger>
        </TabsList>

        <TabsContent value="sources" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Monitored Sources</h3>
            <Dialog open={isAddSourceOpen} onOpenChange={setIsAddSourceOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-add-source">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Source
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Source</DialogTitle>
                  <DialogDescription>Add a new source to monitor for this program.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Source Type</Label>
                    <Select
                      value={sourceForm.type}
                      onValueChange={(v) => setSourceForm({ ...sourceForm, type: v })}
                    >
                      <SelectTrigger data-testid="select-source-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rss_url">RSS Feed</SelectItem>
                        <SelectItem value="youtube_channel">YouTube Channel</SelectItem>
                        <SelectItem value="podcastindex_feed">PodcastIndex Feed</SelectItem>
                        <SelectItem value="podcastindex_query">PodcastIndex Query</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Source URL / ID</Label>
                    <Input
                      placeholder={getSourcePlaceholder(sourceForm.type || "rss_url")}
                      value={sourceForm.value || ""}
                      onChange={(e) => setSourceForm({ ...sourceForm, value: e.target.value })}
                      data-testid="input-source-url"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Label (optional)</Label>
                    <Input
                      placeholder="e.g., 'NPR Politics', 'Joe Rogan'"
                      value={sourceForm.label || ""}
                      onChange={(e) => setSourceForm({ ...sourceForm, label: e.target.value })}
                      data-testid="input-source-label"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsAddSourceOpen(false)}>Cancel</Button>
                  <Button 
                    onClick={() => addSourceMutation.mutate(sourceForm)}
                    disabled={addSourceMutation.isPending || !sourceForm.value}
                    data-testid="button-submit-source"
                  >
                    {addSourceMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Add Source
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {sources.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Radio className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No sources configured yet</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setIsAddSourceOpen(true)}>
                  Add your first source
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sources.map((source) => {
                const Icon = SOURCE_TYPE_ICONS[source.type] || Radio;
                return (
                  <Card key={source.id} className={!source.enabled ? "opacity-60" : ""} data-testid={`card-source-${source.id}`}>
                    <CardContent className="flex items-center justify-between py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{source.label || source.value}</div>
                          <div className="text-xs text-muted-foreground">
                            {SOURCE_TYPE_LABELS[source.type] || source.type} • Last polled: {formatDate(source.lastPolledAt)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={source.enabled}
                          onCheckedChange={() => toggleSourceMutation.mutate(source.id)}
                          data-testid={`switch-source-${source.id}`}
                        />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive" data-testid={`button-delete-source-${source.id}`}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete source?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will remove the source from monitoring. Events already generated will remain.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteSourceMutation.mutate(source.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Budget & Limits</CardTitle>
              <CardDescription>Control daily ingestion caps</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Max Catalog Per Day</Label>
                  <div className="text-2xl font-medium">{config.budgets?.maxCatalogPerDay || 100}</div>
                  <p className="text-xs text-muted-foreground">Free transcripts per day</p>
                </div>
                <div className="space-y-2">
                  <Label>Max Tier 1 Per Day</Label>
                  <div className="text-2xl font-medium">{config.budgets?.maxTier1PerDay || 10}</div>
                  <p className="text-xs text-muted-foreground">Paid transcripts per day</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
              <CardDescription>Episode filtering criteria</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Min Duration (sec)</Label>
                  <div className="text-lg font-medium">{config.filters?.minDurationSec || 600}</div>
                </div>
                <div className="space-y-2">
                  <Label>Max Duration (sec)</Label>
                  <div className="text-lg font-medium">{config.filters?.maxDurationSec || 10800}</div>
                </div>
                <div className="space-y-2">
                  <Label>Languages</Label>
                  <div className="text-lg font-medium">{(config.filters?.languages || ["en"]).join(", ")}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Thresholds</CardTitle>
              <CardDescription>AI scoring thresholds</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Auto-Accept Candidate</Label>
                  <div className="text-lg font-medium">{config.thresholds?.autoAcceptCandidate || 0.85}</div>
                </div>
                <div className="space-y-2">
                  <Label>Review Minimum</Label>
                  <div className="text-lg font-medium">{config.thresholds?.reviewMin || 0.55}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transcript Preferences</CardTitle>
              <CardDescription>How to handle transcription</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Prefer YouTube Captions</Label>
                  <p className="text-xs text-muted-foreground">Use YouTube captions when available</p>
                </div>
                <Badge variant={config.transcriptPrefs?.preferYoutubeCaptions !== false ? "default" : "secondary"}>
                  {config.transcriptPrefs?.preferYoutubeCaptions !== false ? "Yes" : "No"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Prefer RSS Transcript Tags</Label>
                  <p className="text-xs text-muted-foreground">Use transcript tags from RSS feeds</p>
                </div>
                <Badge variant={config.transcriptPrefs?.preferRssTranscriptTags !== false ? "default" : "secondary"}>
                  {config.transcriptPrefs?.preferRssTranscriptTags !== false ? "Yes" : "No"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <div className="flex justify-between items-center gap-4 flex-wrap">
            <h3 className="text-lg font-medium">Recent Events</h3>
            <div className="flex items-center gap-2">
              {selectedEventIds.size > 0 && (
                <>
                  <span className="text-sm text-muted-foreground">{selectedEventIds.size} selected</span>
                  <Button 
                    size="sm" 
                    onClick={() => catalogMutation.mutate(Array.from(selectedEventIds))} 
                    disabled={catalogMutation.isPending || resolveMutation.isPending}
                    data-testid="button-catalog-selected"
                  >
                    <Package className="w-4 h-4 mr-1" />
                    {catalogMutation.isPending ? "Cataloging..." : "Catalog"}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="secondary"
                    onClick={() => resolveMutation.mutate(Array.from(selectedEventIds))} 
                    disabled={catalogMutation.isPending || resolveMutation.isPending}
                    data-testid="button-resolve-selected"
                  >
                    <Search className="w-4 h-4 mr-1" />
                    {resolveMutation.isPending ? "Resolving..." : "Resolve"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {events.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Clock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No events yet</p>
                <p className="text-xs text-muted-foreground mt-1">Events will appear here when monitors detect new episodes</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {events.slice(0, 50).map((event) => {
                const payload = (event.payload || {}) as Record<string, any>;
                const title = payload.title || "Untitled Episode";
                const source = payload.feedTitle || payload.channelTitle || "Unknown Source";
                const isCataloged = event.actionStatus === "cataloged";
                const isSelected = selectedEventIds.has(event.id);
                
                const getActionStatusBadge = (status: string) => {
                  switch (status) {
                    case "cataloged":
                      return <Badge variant="default" className="text-xs bg-green-600"><Check className="w-3 h-3 mr-1" />Cataloged</Badge>;
                    case "resolution_queued":
                      return <Badge variant="secondary" className="text-xs">Resolving</Badge>;
                    case "resolved":
                      return <Badge variant="default" className="text-xs bg-blue-600">Resolved</Badge>;
                    case "ignored":
                      return <Badge variant="outline" className="text-xs">Ignored</Badge>;
                    case "pending":
                    default:
                      return <Badge className="text-xs">Pending</Badge>;
                  }
                };
                
                return (
                  <Card key={event.id} className={isSelected ? "ring-2 ring-primary" : ""} data-testid={`card-event-${event.id}`}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        <Checkbox 
                          checked={isSelected}
                          disabled={isCataloged}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(selectedEventIds);
                            if (checked) {
                              newSet.add(event.id);
                            } else {
                              newSet.delete(event.id);
                            }
                            setSelectedEventIds(newSet);
                          }}
                          data-testid={`checkbox-event-${event.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{title}</div>
                          <div className="text-sm text-muted-foreground truncate">{source}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {formatDate(event.observedAt)}
                            {payload.pubDate && ` • Published: ${payload.pubDate}`}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className="text-xs">
                            {event.type === "youtube_upload_found" ? "YouTube" : 
                             event.type === "new_episode_found" ? "Episode" : event.type}
                          </Badge>
                          {getActionStatusBadge(event.actionStatus)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="agent" className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div>
              <h3 className="text-lg font-medium">AI Curator Agent</h3>
              <p className="text-sm text-muted-foreground">
                Last run: {formatDate(program.lastAgentRun)}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {selectedRecIds.size > 0 && (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => approveRecsMutation.mutate(Array.from(selectedRecIds))}
                    disabled={approveRecsMutation.isPending}
                    data-testid="button-approve-selected"
                  >
                    {approveRecsMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Approve ({selectedRecIds.size})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => rejectRecsMutation.mutate(Array.from(selectedRecIds))}
                    disabled={rejectRecsMutation.isPending}
                    data-testid="button-reject-selected"
                  >
                    {rejectRecsMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    <XCircle className="w-4 h-4 mr-1" />
                    Reject ({selectedRecIds.size})
                  </Button>
                </>
              )}
              <Button
                onClick={() => runAgentMutation.mutate()}
                disabled={runAgentMutation.isPending}
                data-testid="button-run-agent"
              >
                {runAgentMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Bot className="w-4 h-4 mr-2" />
                Run Agent Now
              </Button>
            </div>
          </div>

          {recommendations.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Bot className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No recommendations yet</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Run the agent to generate recommendations based on recent events.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {recommendations.map((rec) => {
                const isSelected = selectedRecIds.has(rec.id);
                const isPending = rec.status === "pending";
                
                const getActionIcon = (action: string) => {
                  switch (action) {
                    case "catalog": return <Package className="w-4 h-4" />;
                    case "resolve": return <RefreshCw className="w-4 h-4" />;
                    case "ignore": return <XCircle className="w-4 h-4" />;
                    case "review": return <HelpCircle className="w-4 h-4" />;
                    default: return null;
                  }
                };
                
                const getActionBadge = (action: string) => {
                  switch (action) {
                    case "catalog": 
                      return <Badge variant="default" className="bg-blue-600 text-xs">{action}</Badge>;
                    case "resolve": 
                      return <Badge variant="default" className="bg-purple-600 text-xs">{action}</Badge>;
                    case "ignore": 
                      return <Badge variant="secondary" className="text-xs">{action}</Badge>;
                    case "review": 
                      return <Badge variant="outline" className="border-yellow-500 text-yellow-600 text-xs">{action}</Badge>;
                    default: 
                      return <Badge variant="outline" className="text-xs">{action}</Badge>;
                  }
                };
                
                const getStatusBadge = (status: string) => {
                  switch (status) {
                    case "pending": 
                      return <Badge variant="outline" className="text-xs">Pending</Badge>;
                    case "approved": 
                      return <Badge variant="default" className="bg-green-600 text-xs">Approved</Badge>;
                    case "rejected": 
                      return <Badge variant="secondary" className="text-xs">Rejected</Badge>;
                    case "executed": 
                      return <Badge variant="default" className="text-xs">Executed</Badge>;
                    default: 
                      return <Badge variant="outline" className="text-xs">{status}</Badge>;
                  }
                };
                
                return (
                  <Card 
                    key={rec.id} 
                    className={isSelected ? "ring-2 ring-primary" : ""} 
                    data-testid={`card-rec-${rec.id}`}
                  >
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        <Checkbox 
                          checked={isSelected}
                          disabled={!isPending}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(selectedRecIds);
                            if (checked) {
                              newSet.add(rec.id);
                            } else {
                              newSet.delete(rec.id);
                            }
                            setSelectedRecIds(newSet);
                          }}
                          data-testid={`checkbox-rec-${rec.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {getActionIcon(rec.action)}
                            {getActionBadge(rec.action)}
                            <span className="text-sm text-muted-foreground">
                              Confidence: {Math.round((rec.confidence || 0) * 100)}%
                            </span>
                          </div>
                          <div className="text-sm">{rec.reason}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Event: {rec.eventId?.slice(0, 8) || rec.targetId?.slice(0, 8)}... • {formatDate(rec.createdAt)}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {getStatusBadge(rec.status)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
