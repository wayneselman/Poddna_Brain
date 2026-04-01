import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Loader2, 
  ArrowLeft,
  Save,
  Merge,
  User,
  Package,
  BookOpen,
  Building2,
  MapPin,
  Lightbulb,
  HelpCircle,
  ExternalLink,
  Clock,
  Check,
  ChevronsUpDown
} from "lucide-react";
import type { CanonicalEntity } from "@shared/schema";

interface EntityMention {
  mentionId: string;
  rawText: string | null;
  episodeId: string;
  episodeTitle: string;
  startTime: number | null;
  statementText: string | null;
}

interface EntityDetailResponse {
  entity: CanonicalEntity;
  mentions: EntityMention[];
}

interface EntitySearchResult {
  id: string;
  name: string;
  type: string;
  mentionCount: number;
}

const entityTypeIcons: Record<string, typeof User> = {
  person: User,
  product: Package,
  book: BookOpen,
  company: Building2,
  place: MapPin,
  concept: Lightbulb,
  other: HelpCircle,
};

function formatTime(seconds: number | null): string {
  if (seconds === null) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function AdminCanonicalEntityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [externalRefs, setExternalRefs] = useState<Record<string, string>>({});
  const [isInitialized, setIsInitialized] = useState(false);

  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [selectedMergeTarget, setSelectedMergeTarget] = useState<EntitySearchResult | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const { data, isLoading, error } = useQuery<EntityDetailResponse>({
    queryKey: ["/api/admin/canonical-entities", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/canonical-entities/${id}`);
      if (!res.ok) throw new Error("Failed to fetch entity");
      return res.json();
    },
    enabled: !!id,
  });

  if (data && !isInitialized) {
    setName(data.entity.name);
    setType(data.entity.type);
    setExternalRefs((data.entity.externalRefs as Record<string, string>) || {});
    setIsInitialized(true);
  }

  const { data: searchResults = { items: [] } } = useQuery<{ items: EntitySearchResult[] }>({
    queryKey: ["/api/admin/canonical-entities/search", mergeSearch, id],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (mergeSearch) params.set("q", mergeSearch);
      if (id) params.set("excludeId", id);
      const res = await fetch(`/api/admin/canonical-entities/search?${params}`);
      if (!res.ok) return { items: [] };
      return res.json();
    },
    enabled: isMergeOpen && mergeSearch.length > 0,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/admin/canonical-entities/${id}`, {
        name,
        type,
        externalRefs,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/canonical-entities", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/canonical-entities"] });
      toast({ title: "Entity Updated", description: "Changes saved successfully" });
    },
    onError: () => {
      toast({ title: "Update Failed", description: "Failed to save changes", variant: "destructive" });
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async (targetId: string) => {
      const res = await apiRequest("POST", "/api/admin/canonical-entities/merge", {
        sourceId: id,
        targetId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Entities Merged", description: data.message });
      navigate("/admin/canonical-entities");
    },
    onError: () => {
      toast({ title: "Merge Failed", description: "Failed to merge entities", variant: "destructive" });
    },
  });

  const handleMerge = () => {
    if (selectedMergeTarget) {
      mergeMutation.mutate(selectedMergeTarget.id);
    }
  };

  const mentionsByEpisode = (data?.mentions ?? []).reduce((acc, mention) => {
    if (!acc[mention.episodeId]) {
      acc[mention.episodeId] = {
        episodeTitle: mention.episodeTitle,
        mentions: [],
      };
    }
    acc[mention.episodeId].mentions.push(mention);
    return acc;
  }, {} as Record<string, { episodeTitle: string; mentions: EntityMention[] }>);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <HelpCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="font-medium">Entity not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/canonical-entities")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Entities
        </Button>
      </div>
    );
  }

  const Icon = entityTypeIcons[data.entity.type] || HelpCircle;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/canonical-entities")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <Icon className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold" data-testid="text-entity-name">{data.entity.name}</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={isMergeOpen} onOpenChange={setIsMergeOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-merge">
                <Merge className="h-4 w-4 mr-2" />
                Merge Into...
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Merge Entity</DialogTitle>
                <DialogDescription>
                  Merge "{data.entity.name}" into another entity. All mentions will be transferred.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label>Select target entity</Label>
                <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between mt-2"
                      data-testid="button-select-merge-target"
                    >
                      {selectedMergeTarget ? selectedMergeTarget.name : "Search for entity..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput 
                        placeholder="Search entities..." 
                        value={mergeSearch}
                        onValueChange={setMergeSearch}
                        data-testid="input-merge-search"
                      />
                      <CommandList>
                        <CommandEmpty>No entities found.</CommandEmpty>
                        <CommandGroup>
                          {searchResults.items.map((entity) => (
                            <CommandItem
                              key={entity.id}
                              value={entity.name}
                              onSelect={() => {
                                setSelectedMergeTarget(entity);
                                setIsSearchOpen(false);
                              }}
                              data-testid={`option-merge-${entity.id}`}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  selectedMergeTarget?.id === entity.id ? "opacity-100" : "opacity-0"
                                }`}
                              />
                              {entity.name}
                              <Badge variant="secondary" className="ml-2 text-xs">
                                {entity.type}
                              </Badge>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsMergeOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleMerge} 
                  disabled={!selectedMergeTarget || mergeMutation.isPending}
                  data-testid="button-confirm-merge"
                >
                  {mergeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Merge
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="button-save">
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Entity Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="input-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger data-testid="select-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="person">Person</SelectItem>
                    <SelectItem value="product">Product</SelectItem>
                    <SelectItem value="book">Book</SelectItem>
                    <SelectItem value="company">Company</SelectItem>
                    <SelectItem value="place">Place</SelectItem>
                    <SelectItem value="concept">Concept</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>External Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wikipedia">Wikipedia</Label>
                <Input
                  id="wikipedia"
                  placeholder="https://en.wikipedia.org/wiki/..."
                  value={externalRefs.wikipedia || ""}
                  onChange={(e) => setExternalRefs({ ...externalRefs, wikipedia: e.target.value })}
                  data-testid="input-wikipedia"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amazon">Amazon</Label>
                <Input
                  id="amazon"
                  placeholder="https://amazon.com/..."
                  value={externalRefs.amazon || ""}
                  onChange={(e) => setExternalRefs({ ...externalRefs, amazon: e.target.value })}
                  data-testid="input-amazon"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  placeholder="https://..."
                  value={externalRefs.website || ""}
                  onChange={(e) => setExternalRefs({ ...externalRefs, website: e.target.value })}
                  data-testid="input-website"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Mentions
                <Badge variant="secondary">{data.mentions.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(mentionsByEpisode).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No mentions found for this entity</p>
                </div>
              ) : (
                <Accordion type="multiple" className="w-full">
                  {Object.entries(mentionsByEpisode).map(([episodeId, { episodeTitle, mentions }]) => (
                    <AccordionItem key={episodeId} value={episodeId}>
                      <AccordionTrigger className="hover:no-underline" data-testid={`accordion-episode-${episodeId}`}>
                        <div className="flex items-center gap-3 text-left">
                          <span className="font-medium">{episodeTitle}</span>
                          <Badge variant="outline">{mentions.length} mention{mentions.length !== 1 ? 's' : ''}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 pt-2">
                          {mentions.map((mention) => (
                            <div 
                              key={mention.mentionId} 
                              className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                              data-testid={`mention-${mention.mentionId}`}
                            >
                              <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-[60px]">
                                <Clock className="h-3 w-3" />
                                {formatTime(mention.startTime)}
                              </div>
                              <div className="flex-1 space-y-1">
                                {mention.rawText && (
                                  <p className="text-sm font-medium">"{mention.rawText}"</p>
                                )}
                                {mention.statementText && (
                                  <p className="text-sm text-muted-foreground line-clamp-2">
                                    {mention.statementText}
                                  </p>
                                )}
                              </div>
                              <a 
                                href={`/admin/episodes/${episodeId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
