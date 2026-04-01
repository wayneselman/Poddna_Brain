import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  Search, 
  Download, 
  CheckCircle2, 
  XCircle, 
  Clock,
  Rss,
  Youtube,
  CheckCheck,
  AlertCircle,
  ExternalLink
} from "lucide-react";
import { Link } from "wouter";

interface FeedItem {
  externalId: string;
  title: string;
  publishedAt: string | null;
  durationSeconds: number;
  thumbnailUrl: string;
  audioUrl: string | null;
  videoUrl: string | null;
  alreadyInPodDNA: boolean;
  description?: string | null;
  transcriptUrl?: string | null;
  transcriptType?: string | null;
  chaptersUrl?: string | null;
  alternateEnclosures?: any[];
  markCurated?: boolean;
}

interface FeedPreviewResponse {
  sourceType: "rss" | "youtube";
  feedId?: number;
  feedTitle: string;
  feedAuthor?: string;
  feedImage?: string;
  items: FeedItem[];
}

interface ImportResult {
  externalId: string;
  episodeId?: string;
  title?: string;
  status: "imported" | "skipped" | "error";
  reason?: string;
  jobsQueued?: number;
  isCurated?: boolean;
}

interface ImportResponse {
  success: boolean;
  summary: {
    imported: number;
    skipped: number;
    errors: number;
  };
  results: ImportResult[];
}

function formatDuration(seconds: number): string {
  if (!seconds) return "--";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "--";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric",
      year: "numeric"
    });
  } catch {
    return "--";
  }
}

export default function FeedImportPage() {
  const { toast } = useToast();
  const [feedUrl, setFeedUrl] = useState("");
  const [feedData, setFeedData] = useState<FeedPreviewResponse | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [markAllCurated, setMarkAllCurated] = useState(false);
  const [importResults, setImportResults] = useState<ImportResponse | null>(null);

  const previewMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/admin/feed-preview", { feedUrl: url });
      return response.json() as Promise<FeedPreviewResponse>;
    },
    onSuccess: (data) => {
      setFeedData(data);
      setImportResults(null);
      const selectableIds = data.items
        .filter(item => !item.alreadyInPodDNA)
        .map(item => item.externalId);
      setSelectedItems(new Set(selectableIds));
      toast({
        title: "Feed loaded",
        description: `Found ${data.items.length} episodes (${selectableIds.length} available to import)`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to load feed",
        description: error.message || "Please check the URL and try again",
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!feedData) throw new Error("No feed data");
      
      const itemsToImport = feedData.items
        .filter(item => selectedItems.has(item.externalId))
        .map(item => ({
          ...item,
          markCurated: markAllCurated,
        }));
      
      const response = await apiRequest("POST", "/api/admin/feed-import", {
        feedUrl,
        sourceType: feedData.sourceType,
        feedId: feedData.feedId,
        feedTitle: feedData.feedTitle,
        feedAuthor: feedData.feedAuthor,
        feedImage: feedData.feedImage,
        items: itemsToImport,
      });
      return response.json() as Promise<ImportResponse>;
    },
    onSuccess: (data) => {
      setImportResults(data);
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/episodes/catalog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/episodes"] });
      
      toast({
        title: "Import complete",
        description: `${data.summary.imported} episodes imported, ${data.summary.skipped} skipped, ${data.summary.errors} errors`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleLoadFeed = () => {
    if (!feedUrl.trim()) {
      toast({
        title: "URL required",
        description: "Please enter a feed URL",
        variant: "destructive",
      });
      return;
    }
    previewMutation.mutate(feedUrl.trim());
  };

  const handleToggleItem = (externalId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(externalId)) {
      newSelected.delete(externalId);
    } else {
      newSelected.add(externalId);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    if (!feedData) return;
    const selectableIds = feedData.items
      .filter(item => !item.alreadyInPodDNA)
      .map(item => item.externalId);
    setSelectedItems(new Set(selectableIds));
  };

  const handleSelectNone = () => {
    setSelectedItems(new Set());
  };

  const selectableCount = feedData?.items.filter(i => !i.alreadyInPodDNA).length || 0;
  const selectedCount = selectedItems.size;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-heading">Feed Import</h1>
        <p className="text-muted-foreground mt-1">
          Batch import episodes from RSS feeds or YouTube playlists
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="w-5 h-5" />
            Load Feed
          </CardTitle>
          <CardDescription>
            Paste a podcast RSS feed URL or YouTube playlist/channel URL
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="https://feeds.example.com/podcast.xml or https://youtube.com/playlist?list=..."
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLoadFeed()}
              disabled={previewMutation.isPending}
              className="flex-1"
              data-testid="input-feed-url"
            />
            <Button 
              onClick={handleLoadFeed}
              disabled={previewMutation.isPending || !feedUrl.trim()}
              data-testid="button-load-feed"
            >
              {previewMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              Load Feed
            </Button>
          </div>
        </CardContent>
      </Card>

      {feedData && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  {feedData.feedImage && (
                    <img 
                      src={feedData.feedImage} 
                      alt="" 
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                  )}
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {feedData.sourceType === "youtube" ? (
                        <Youtube className="w-5 h-5 text-red-500" />
                      ) : (
                        <Rss className="w-5 h-5 text-orange-500" />
                      )}
                      {feedData.feedTitle}
                    </CardTitle>
                    {feedData.feedAuthor && (
                      <CardDescription>{feedData.feedAuthor}</CardDescription>
                    )}
                  </div>
                </div>
                <Badge variant="secondary">
                  {feedData.items.length} episodes
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectableCount === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <h3 className="font-semibold text-lg">All episodes already imported</h3>
                  <p className="text-muted-foreground mt-1">
                    All {feedData.items.length} episodes from this feed are already in PodDNA.
                  </p>
                  <Link href="/episodes">
                    <Button variant="outline" className="mt-4">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View Episode Catalog
                    </Button>
                  </Link>
                </div>
              ) : (
              <>
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    {selectedCount} of {selectableCount} selected
                  </span>
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={handleSelectAll}
                      disabled={selectedCount === selectableCount}
                      data-testid="button-select-all"
                    >
                      Select All
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={handleSelectNone}
                      disabled={selectedCount === 0}
                      data-testid="button-select-none"
                    >
                      Select None
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="mark-curated"
                    checked={markAllCurated}
                    onCheckedChange={(checked) => setMarkAllCurated(checked === true)}
                    data-testid="checkbox-mark-curated"
                  />
                  <label 
                    htmlFor="mark-curated" 
                    className="text-sm font-medium cursor-pointer"
                  >
                    Mark as curated
                  </label>
                </div>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {feedData.items.map((item) => {
                  const isSelected = selectedItems.has(item.externalId);
                  const isDisabled = item.alreadyInPodDNA;
                  const result = importResults?.results.find(r => r.externalId === item.externalId);
                  
                  return (
                    <div 
                      key={item.externalId}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        isDisabled 
                          ? "bg-muted/30 opacity-60" 
                          : isSelected 
                            ? "bg-primary/5 border-primary/20" 
                            : "hover:bg-muted/50"
                      }`}
                      data-testid={`feed-item-${item.externalId}`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggleItem(item.externalId)}
                        disabled={isDisabled}
                        data-testid={`checkbox-item-${item.externalId}`}
                      />
                      
                      {item.thumbnailUrl && (
                        <img 
                          src={item.thumbnailUrl} 
                          alt="" 
                          className="w-16 h-12 rounded object-cover flex-shrink-0"
                        />
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm line-clamp-1">{item.title}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDuration(item.durationSeconds)}
                          </span>
                          <span>{formatDate(item.publishedAt)}</span>
                          {item.audioUrl && (
                            <Badge variant="outline" className="text-[10px] py-0">Audio</Badge>
                          )}
                          {item.videoUrl && (
                            <Badge variant="outline" className="text-[10px] py-0">Video</Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex-shrink-0">
                        {item.alreadyInPodDNA ? (
                          <Badge variant="secondary" className="text-xs">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            In PodDNA
                          </Badge>
                        ) : result ? (
                          result.status === "imported" ? (
                            <Badge className="bg-green-500 text-xs">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Imported
                            </Badge>
                          ) : result.status === "error" ? (
                            <Badge variant="destructive" className="text-xs">
                              <XCircle className="w-3 h-3 mr-1" />
                              Failed
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              Skipped
                            </Badge>
                          )
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
              )}
            </CardContent>
          </Card>

          {selectableCount > 0 && (
          <div className="flex items-center justify-between sticky bottom-0 bg-background py-4 border-t">
            <div className="text-sm text-muted-foreground">
              {selectedCount > 0 ? (
                <>Ready to import <strong>{selectedCount}</strong> episode{selectedCount !== 1 ? "s" : ""}</>
              ) : (
                "Select episodes to import"
              )}
            </div>
            <div className="flex items-center gap-3">
              {importResults && (
                <Link href="/episodes">
                  <Button variant="outline" data-testid="button-view-catalog">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Catalog
                  </Button>
                </Link>
              )}
              <Button
                onClick={() => importMutation.mutate()}
                disabled={selectedCount === 0 || importMutation.isPending}
                size="lg"
                data-testid="button-import-episodes"
              >
                {importMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Add Selected Episodes
              </Button>
            </div>
          </div>
          )}
        </>
      )}

      {importResults && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-green-800">
              <CheckCheck className="w-5 h-5" />
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span><strong>{importResults.summary.imported}</strong> imported</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-muted-foreground" />
                <span><strong>{importResults.summary.skipped}</strong> skipped</span>
              </div>
              {importResults.summary.errors > 0 && (
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <span><strong>{importResults.summary.errors}</strong> errors</span>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Episodes have been queued for transcript processing. You can check their status in the Episode Library.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
