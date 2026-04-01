import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Loader2, 
  TrendingUp, 
  Quote, 
  Users, 
  Link as LinkIcon,
  Copy,
  Sparkles,
  RefreshCcw,
  ExternalLink,
  Play,
  FileText,
  Twitter,
  Linkedin,
  Mail,
  Edit,
  Save,
  ThumbsUp,
  ThumbsDown,
  Minus
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface EntityQuote {
  text: string;
  episodeId: string;
  episodeTitle: string;
  timestamp: number | null;
  context?: string;
  sentiment?: string;
}

interface AggregatedEntity {
  id: string;
  name: string;
  type: string;
  description: string | null;
  affiliateNetwork: string | null;
  affiliateUrl: string | null;
  mentionCount: number;
  episodeCount: number;
  speakers: string[];
  quotes: EntityQuote[];
}

interface TopEntitiesResponse {
  entities: AggregatedEntity[];
  totalCount: number;
  filters: {
    type: string | undefined;
    minMentions: number;
    limit: number;
  };
}

interface GeneratedPost {
  title: string;
  hook: string;
  body: string;
  footer: string;
  hashtags: string[];
  platforms: {
    twitter: string;
    linkedin: string;
    newsletter: string;
  };
}

interface PostGenerationResponse {
  success: boolean;
  post: GeneratedPost | string;
  entitiesUsed: number;
  format: "full" | "quick";
}

interface ExtractionReadiness {
  transcripts: {
    pending: number;
    running: number;
    done: number;
    failed: number;
    total: number;
  };
  extraction: {
    pending: number;
    running: number;
    done: number;
    failed: number;
  };
  isReady: boolean;
  eligibleForExtraction: number;
  episodesWithTranscripts: number;
}

const entityTypeOptions = [
  { value: "all", label: "All Types" },
  { value: "product", label: "Products" },
  { value: "software", label: "Software" },
  { value: "service", label: "Services" },
  { value: "book", label: "Books" },
  { value: "other", label: "Other" },
];

const toneOptions = [
  { value: "data-driven", label: "Data-Driven" },
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
];

const affiliateNetworkOptions = [
  { value: "none", label: "No Affiliate Program" },
  { value: "amazon", label: "Amazon Associates" },
  { value: "custom", label: "Custom/Direct" },
  { value: "impact", label: "Impact" },
  { value: "partnerstack", label: "PartnerStack" },
  { value: "cj", label: "CJ Affiliate" },
];

export default function AffiliateArbitragePage() {
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [minMentions, setMinMentions] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);
  const [category, setCategory] = useState<string>("AI & Productivity Tools");
  const [tone, setTone] = useState<string>("data-driven");
  const [generatedPost, setGeneratedPost] = useState<GeneratedPost | null>(null);
  const [quickPost, setQuickPost] = useState<string | null>(null);
  const [isPostDialogOpen, setIsPostDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<AggregatedEntity | null>(null);
  const [editAffiliateUrl, setEditAffiliateUrl] = useState("");
  const [editAffiliateNetwork, setEditAffiliateNetwork] = useState("none");

  const { data: topEntities, isLoading, refetch } = useQuery<TopEntitiesResponse>({
    queryKey: ["/api/entities/top", typeFilter, minMentions, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter && typeFilter !== "all") params.set("type", typeFilter);
      params.set("minMentions", String(minMentions));
      params.set("limit", String(limit));
      const res = await fetch(`/api/entities/top?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch entities");
      return res.json();
    },
  });

  const { data: readiness, isLoading: readinessLoading, refetch: refetchReadiness } = useQuery<ExtractionReadiness>({
    queryKey: ["/api/admin/extraction-readiness"],
    refetchInterval: 10000,
  });

  const extractMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/trigger-batch-extraction", {});
      return res.json() as Promise<{ success: boolean; enqueued: number; skipped: number; message: string }>;
    },
    onSuccess: (data) => {
      toast({
        title: "Extraction Started",
        description: `Queued ${data.enqueued} extraction jobs (${data.skipped} skipped).`,
      });
      refetchReadiness();
    },
    onError: (error: Error) => {
      toast({
        title: "Extraction Failed",
        description: error.message || "Failed to start extraction.",
        variant: "destructive",
      });
    },
  });

  const batchTranscriptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/batch-transcripts", {});
      return res.json() as Promise<{ 
        success: boolean; 
        message: string; 
        stats: { total: number; succeeded: number; failed: number; apiCalls: number } 
      }>;
    },
    onSuccess: (data) => {
      toast({
        title: "Batch Processing Complete",
        description: data.message,
      });
      refetchReadiness();
    },
    onError: (error: Error) => {
      toast({
        title: "Batch Processing Failed",
        description: error.message || "Failed to process transcripts.",
        variant: "destructive",
      });
    },
  });

  const generatePostMutation = useMutation({
    mutationFn: async (quick: boolean) => {
      const res = await apiRequest("POST", "/api/admin/entities/generate-post", {
        category,
        type: typeFilter !== "all" ? typeFilter : undefined,
        minMentions,
        maxEntities: 10,
        tone,
        quick,
      });
      return res.json() as Promise<PostGenerationResponse>;
    },
    onSuccess: (data) => {
      if (data.format === "quick") {
        setQuickPost(data.post as string);
        setGeneratedPost(null);
      } else {
        setGeneratedPost(data.post as GeneratedPost);
        setQuickPost(null);
      }
      setIsPostDialogOpen(true);
      toast({
        title: "Post Generated",
        description: `Created ${data.format} post using ${data.entitiesUsed} entities.`,
      });
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Failed to generate recommendation post.",
        variant: "destructive",
      });
    },
  });

  const updateEntityMutation = useMutation({
    mutationFn: async ({ id, affiliateUrl, affiliateNetwork }: { id: string; affiliateUrl: string; affiliateNetwork: string }) => {
      return apiRequest("PATCH", `/api/admin/entities/${id}`, {
        affiliateUrl: affiliateUrl || null,
        affiliateNetwork: affiliateNetwork && affiliateNetwork !== "none" ? affiliateNetwork : null,
      });
    },
    onSuccess: () => {
      toast({
        title: "Entity Updated",
        description: "Affiliate link saved successfully.",
      });
      refetch();
      setEditingEntity(null);
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update entity affiliate link.",
        variant: "destructive",
      });
    },
  });

  const openEditDialog = (entity: AggregatedEntity) => {
    setEditingEntity(entity);
    setEditAffiliateUrl(entity.affiliateUrl || "");
    setEditAffiliateNetwork(entity.affiliateNetwork || "none");
  };

  const handleSaveEntity = () => {
    if (editingEntity) {
      updateEntityMutation.mutate({
        id: editingEntity.id,
        affiliateUrl: editAffiliateUrl,
        affiliateNetwork: editAffiliateNetwork,
      });
    }
  };

  const getSentimentIcon = (sentiment?: string) => {
    switch (sentiment) {
      case "positive":
        return <ThumbsUp className="h-3 w-3 text-green-500" />;
      case "negative":
        return <ThumbsDown className="h-3 w-3 text-red-500" />;
      default:
        return <Minus className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard.`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Affiliate Arbitrage Engine</h1>
          <p className="text-muted-foreground">
            Aggregate product mentions across podcasts and generate affiliate-ready posts
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {readiness && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mr-2" data-testid="text-readiness-status">
              <span className="font-medium">Transcripts:</span>
              {readiness.transcripts.done > 0 && (
                <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  {readiness.transcripts.done} done
                </Badge>
              )}
              {readiness.transcripts.running > 0 && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  {readiness.transcripts.running} running
                </Badge>
              )}
              {readiness.transcripts.pending > 0 && (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                  {readiness.transcripts.pending} pending
                </Badge>
              )}
              {readiness.transcripts.failed > 0 && (
                <Badge variant="outline" className="border-orange-300 text-orange-600 dark:border-orange-700 dark:text-orange-400">
                  {readiness.transcripts.failed} skipped
                </Badge>
              )}
              {readiness.eligibleForExtraction > 0 && (
                <span className="text-xs">
                  ({readiness.eligibleForExtraction} ready for extraction)
                </span>
              )}
            </div>
          )}
          {readiness && readiness.transcripts.pending > 0 && (
            <Button
              variant="default"
              onClick={() => batchTranscriptMutation.mutate()}
              disabled={batchTranscriptMutation.isPending}
              data-testid="button-batch-transcripts"
              title={`Process ${readiness.transcripts.pending} transcripts in batches of 10`}
            >
              {batchTranscriptMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Batch Process {readiness.transcripts.pending} Transcripts
            </Button>
          )}
          <Button
            variant={readiness?.isReady ? "default" : "outline"}
            onClick={() => extractMutation.mutate()}
            disabled={extractMutation.isPending || !readiness?.isReady || (readiness?.eligibleForExtraction ?? 0) === 0}
            data-testid="button-extract-entities"
            title={!readiness?.isReady ? "Wait for pending/running transcripts to complete" : undefined}
          >
            {extractMutation.isPending || readinessLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            {readiness?.isReady && (readiness?.eligibleForExtraction ?? 0) > 0
              ? `Extract from ${readiness.eligibleForExtraction} Episodes`
              : "Extract Entities"}
          </Button>
          <Button
            variant="outline"
            onClick={() => generatePostMutation.mutate(true)}
            disabled={generatePostMutation.isPending || !topEntities?.entities.length}
            data-testid="button-quick-post"
          >
            {generatePostMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Quick Post
          </Button>
          <Button
            onClick={() => generatePostMutation.mutate(false)}
            disabled={generatePostMutation.isPending || !topEntities?.entities.length}
            data-testid="button-generate-post"
          >
            {generatePostMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate Full Post
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters & Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Entity Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger data-testid="select-entity-type">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  {entityTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Min Mentions</Label>
              <Input
                type="number"
                min={1}
                value={minMentions}
                onChange={(e) => setMinMentions(parseInt(e.target.value) || 1)}
                data-testid="input-min-mentions"
              />
            </div>

            <div className="space-y-2">
              <Label>Max Results</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value) || 20)}
                data-testid="input-limit"
              />
            </div>

            <div className="space-y-2">
              <Label>Post Category</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="AI & Productivity Tools"
                data-testid="input-category"
              />
            </div>

            <div className="space-y-2">
              <Label>Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger data-testid="select-tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {toneOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Entities</p>
                <p className="text-2xl font-bold" data-testid="text-total-entities">
                  {topEntities?.totalCount || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-500/10">
                <Quote className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Quotes</p>
                <p className="text-2xl font-bold" data-testid="text-total-quotes">
                  {topEntities?.entities.reduce((sum, e) => sum + e.quotes.length, 0) || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <LinkIcon className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">With Affiliate Links</p>
                <p className="text-2xl font-bold" data-testid="text-with-links">
                  {topEntities?.entities.filter(e => e.affiliateUrl).length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top Mentioned Entities</CardTitle>
          <CardDescription>
            Products and tools ranked by podcast mentions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !topEntities?.entities.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No entities found matching your filters.</p>
              <p className="text-sm mt-2">Try running entity extraction first or adjusting your filters.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {topEntities.entities.map((entity, index) => (
                <Card key={entity.id} className="border" data-testid={`card-entity-${entity.id}`}>
                  <CardContent className="pt-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg font-medium text-muted-foreground">
                            #{index + 1}
                          </span>
                          <h3 className="text-lg font-semibold truncate" data-testid={`text-entity-name-${entity.id}`}>
                            {entity.name}
                          </h3>
                          <Badge variant="secondary">{entity.type}</Badge>
                          {entity.affiliateUrl && (
                            <Badge variant="outline" className="text-green-600 border-green-200">
                              <LinkIcon className="h-3 w-3 mr-1" />
                              Affiliate Link
                            </Badge>
                          )}
                        </div>

                        {entity.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {entity.description}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <TrendingUp className="h-4 w-4" />
                            <span data-testid={`text-mention-count-${entity.id}`}>
                              {entity.mentionCount} mentions
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Play className="h-4 w-4" />
                            <span>{entity.episodeCount} episodes</span>
                          </div>
                          {entity.speakers.length > 0 && (
                            <div className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              <span>{entity.speakers.slice(0, 3).join(", ")}</span>
                            </div>
                          )}
                        </div>

                        {entity.quotes.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {entity.quotes.slice(0, 2).map((quote, qIdx) => (
                              <div 
                                key={qIdx} 
                                className="pl-3 border-l-2 border-primary/30"
                                data-testid={`quote-${entity.id}-${qIdx}`}
                              >
                                <div className="flex items-start gap-2">
                                  {getSentimentIcon(quote.sentiment)}
                                  <div className="flex-1">
                                    <p className="text-sm italic">"{quote.text}"</p>
                                    {quote.context && (
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        Context: {quote.context}
                                      </p>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-1">
                                      From: {quote.episodeTitle}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(entity)}
                          data-testid={`button-edit-entity-${entity.id}`}
                        >
                          <Edit className="h-4 w-4" />
                          Edit
                        </Button>
                        {entity.affiliateUrl ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(entity.affiliateUrl!, "_blank")}
                            data-testid={`button-affiliate-link-${entity.id}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                            Open Link
                          </Button>
                        ) : (
                          <Badge variant="secondary" className="justify-center">
                            No Link
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isPostDialogOpen} onOpenChange={setIsPostDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generated Recommendation Post</DialogTitle>
            <DialogDescription>
              Copy and customize the content for your preferred platform
            </DialogDescription>
          </DialogHeader>

          {quickPost && (
            <div className="space-y-4">
              <div className="relative">
                <Textarea
                  value={quickPost}
                  readOnly
                  className="min-h-[300px] font-mono text-sm"
                  data-testid="textarea-quick-post"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(quickPost, "Post")}
                  data-testid="button-copy-quick-post"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {generatedPost && (
            <Tabs defaultValue="combined" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="combined" data-testid="tab-combined">
                  <FileText className="h-4 w-4 mr-2" />
                  Full Post
                </TabsTrigger>
                <TabsTrigger value="twitter" data-testid="tab-twitter">
                  <Twitter className="h-4 w-4 mr-2" />
                  Twitter
                </TabsTrigger>
                <TabsTrigger value="linkedin" data-testid="tab-linkedin">
                  <Linkedin className="h-4 w-4 mr-2" />
                  LinkedIn
                </TabsTrigger>
                <TabsTrigger value="newsletter" data-testid="tab-newsletter">
                  <Mail className="h-4 w-4 mr-2" />
                  Newsletter
                </TabsTrigger>
              </TabsList>

              <TabsContent value="combined" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Title</Label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(generatedPost.title, "Title")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-lg font-semibold" data-testid="text-post-title">
                    {generatedPost.title}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Hook</Label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(generatedPost.hook, "Hook")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-muted-foreground" data-testid="text-post-hook">
                    {generatedPost.hook}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Body</Label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(generatedPost.body, "Body")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <Textarea
                    value={generatedPost.body}
                    readOnly
                    className="min-h-[200px]"
                    data-testid="textarea-post-body"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Hashtags</Label>
                  <div className="flex flex-wrap gap-2">
                    {generatedPost.hashtags.map((tag, i) => (
                      <Badge key={i} variant="secondary" data-testid={`badge-hashtag-${i}`}>
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="twitter" className="mt-4">
                <div className="relative">
                  <Textarea
                    value={generatedPost.platforms.twitter}
                    readOnly
                    className="min-h-[400px] font-mono text-sm"
                    data-testid="textarea-twitter-post"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard(generatedPost.platforms.twitter, "Twitter thread")}
                    data-testid="button-copy-twitter"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="linkedin" className="mt-4">
                <div className="relative">
                  <Textarea
                    value={generatedPost.platforms.linkedin}
                    readOnly
                    className="min-h-[400px]"
                    data-testid="textarea-linkedin-post"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard(generatedPost.platforms.linkedin, "LinkedIn post")}
                    data-testid="button-copy-linkedin"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="newsletter" className="mt-4">
                <div className="relative">
                  <Textarea
                    value={generatedPost.platforms.newsletter}
                    readOnly
                    className="min-h-[400px]"
                    data-testid="textarea-newsletter-post"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard(generatedPost.platforms.newsletter, "Newsletter")}
                    data-testid="button-copy-newsletter"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingEntity} onOpenChange={(open) => !open && setEditingEntity(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Entity: {editingEntity?.name}</DialogTitle>
            <DialogDescription>
              Add or update the affiliate link for this entity
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Entity Name</Label>
              <Input value={editingEntity?.name || ""} disabled />
            </div>

            <div className="space-y-2">
              <Label>Entity Type</Label>
              <Input value={editingEntity?.type || ""} disabled />
            </div>

            <div className="space-y-2">
              <Label>Affiliate Network</Label>
              <Select value={editAffiliateNetwork} onValueChange={setEditAffiliateNetwork}>
                <SelectTrigger data-testid="select-affiliate-network">
                  <SelectValue placeholder="Select network" />
                </SelectTrigger>
                <SelectContent>
                  {affiliateNetworkOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Affiliate URL</Label>
              <Input
                value={editAffiliateUrl}
                onChange={(e) => setEditAffiliateUrl(e.target.value)}
                placeholder="https://example.com/affiliate?ref=..."
                data-testid="input-affiliate-url"
              />
            </div>

            {editingEntity && editingEntity.quotes.length > 0 && (
              <div className="space-y-2">
                <Label>Sample Quote</Label>
                <div className="p-3 bg-muted rounded-md text-sm">
                  <p className="italic">"{editingEntity.quotes[0].text}"</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    From: {editingEntity.quotes[0].episodeTitle}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setEditingEntity(null)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEntity}
              disabled={updateEntityMutation.isPending}
              data-testid="button-save-entity"
            >
              {updateEntityMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
