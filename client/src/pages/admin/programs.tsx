import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  Loader2, 
  Plus, 
  Play,
  Pause,
  Eye,
  Radio,
  Calendar,
  Activity
} from "lucide-react";
import type { Program, InsertProgram, ProgramConfig } from "@shared/schema";

const defaultConfig: ProgramConfig = {
  filters: {
    languages: ["en"],
    minDurationSec: 600,
    maxDurationSec: 10800,
  },
  thresholds: {
    autoAcceptCandidate: 0.85,
    reviewMin: 0.55,
  },
  budgets: {
    maxCatalogPerDay: 100,
    maxTier1PerDay: 10,
  },
  transcriptPrefs: {
    preferYoutubeCaptions: true,
    preferRssTranscriptTags: true,
  },
};

export default function AdminProgramsPage() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<InsertProgram>>({
    name: "",
    description: "",
    config: defaultConfig,
  });

  const { data: programs = [], isLoading } = useQuery<Program[]>({
    queryKey: ["/api/admin/programs"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<InsertProgram>) => {
      const res = await apiRequest("POST", "/api/admin/programs", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create program");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      toast({ title: "Program created successfully" });
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to create program", variant: "destructive" });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/programs/${id}/pause`);
      if (!res.ok) throw new Error("Failed to pause program");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      toast({ title: "Program paused" });
    },
    onError: (error: any) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/programs/${id}/resume`);
      if (!res.ok) throw new Error("Failed to resume program");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      toast({ title: "Program resumed" });
    },
    onError: (error: any) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      config: defaultConfig,
    });
  };

  const handleCreate = () => {
    if (!formData.name) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-600" data-testid="badge-status-active">Active</Badge>;
      case "paused":
        return <Badge variant="secondary" data-testid="badge-status-paused">Paused</Badge>;
      case "archived":
        return <Badge variant="outline" data-testid="badge-status-archived">Archived</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "Never";
    return new Date(date).toLocaleDateString(undefined, { 
      month: "short", 
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Ingestion Programs</h1>
          <p className="text-muted-foreground">Manage automated podcast discovery and ingestion workflows</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-program">
              <Plus className="w-4 h-4 mr-2" />
              New Program
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Ingestion Program</DialogTitle>
              <DialogDescription>
                Create a new program to automatically discover and ingest podcast content.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Program Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Tech Podcasts, True Crime Shows"
                  value={formData.name || ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  data-testid="input-program-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="What kind of content does this program target?"
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  data-testid="input-program-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Daily Budget Caps</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Catalog (free)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={(formData.config as ProgramConfig)?.budgets?.maxCatalogPerDay || 100}
                      onChange={(e) => {
                        const cfg = (formData.config || defaultConfig) as ProgramConfig;
                        setFormData({
                          ...formData,
                          config: {
                            ...cfg,
                            budgets: {
                              ...cfg.budgets,
                              maxCatalogPerDay: parseInt(e.target.value) || 100,
                            },
                          },
                        });
                      }}
                      data-testid="input-daily-catalog-cap"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Tier 1 (paid)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={50}
                      value={(formData.config as ProgramConfig)?.budgets?.maxTier1PerDay || 10}
                      onChange={(e) => {
                        const cfg = (formData.config || defaultConfig) as ProgramConfig;
                        setFormData({
                          ...formData,
                          config: {
                            ...cfg,
                            budgets: {
                              ...cfg.budgets,
                              maxTier1PerDay: parseInt(e.target.value) || 10,
                            },
                          },
                        });
                      }}
                      data-testid="input-daily-tier1-cap"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  You can configure more options after creation.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} data-testid="button-cancel">
                Cancel
              </Button>
              <Button 
                onClick={handleCreate} 
                disabled={createMutation.isPending}
                data-testid="button-submit-program"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Program
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {programs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Radio className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No ingestion programs yet</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              Create your first program to start automatically discovering and ingesting podcast content.
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-program">
              <Plus className="w-4 h-4 mr-2" />
              Create First Program
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {programs.map((program) => {
            const config = (program.config || {}) as ProgramConfig;
            return (
              <Card key={program.id} className="hover-elevate" data-testid={`card-program-${program.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{program.name}</CardTitle>
                      {program.description && (
                        <CardDescription className="line-clamp-2 mt-1">
                          {program.description}
                        </CardDescription>
                      )}
                    </div>
                    {getStatusBadge(program.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Activity className="w-4 h-4" />
                      <span>Daily cap: {config.budgets?.maxCatalogPerDay || 100}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      <span>Tier 1: {config.budgets?.maxTier1PerDay || 10}/day</span>
                    </div>
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    Last agent run: {formatDate(program.lastAgentRun)}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Link href={`/admin/programs/${program.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full" data-testid={`button-view-${program.id}`}>
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                    </Link>
                    {program.status === "active" ? (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => pauseMutation.mutate(program.id)}
                        disabled={pauseMutation.isPending}
                        data-testid={`button-pause-${program.id}`}
                      >
                        <Pause className="w-4 h-4" />
                      </Button>
                    ) : program.status === "paused" ? (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => resumeMutation.mutate(program.id)}
                        disabled={resumeMutation.isPending}
                        data-testid={`button-resume-${program.id}`}
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
