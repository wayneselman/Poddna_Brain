import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Podcast, ClipWithFullMetadata } from "@shared/schema";
import { 
  Loader2, 
  Search, 
  Trash2,
  ExternalLink,
  Headphones,
  Copy,
  Play,
  Clock,
  Video,
  Flame,
  TrendingUp,
  Send,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Edit,
  Upload,
  FileVideo,
  CheckCircle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ViralMoment {
  id: string;
  episodeId: string;
  startTime: number;
  endTime: number;
  transcript: string;
  viralityScore: number;
  contentType: string;
  hook: string | null;
  clipStatus: string;
  clipError: string | null;
  videoPath: string | null;
  captionedPath: string | null;
  optimizedPath: string | null;
  postingStatus: string | null;
  platform: string | null;
  description: string | null;
  hashtags: string[] | null;
  postedAt: string | null;
  postUrl: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  createdAt: string;
  // Enriched fields from endpoint
  episodeTitle?: string;
  videoUrl?: string | null;
  podcastId?: string | null;
}

export default function AdminClipsPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPodcast, setFilterPodcast] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("viral");
  const [editingMoment, setEditingMoment] = useState<ViralMoment | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editHashtags, setEditHashtags] = useState("");
  const [editPostUrl, setEditPostUrl] = useState("");
  const [editViews, setEditViews] = useState("");
  const [editLikes, setEditLikes] = useState("");
  const [editComments, setEditComments] = useState("");
  const [editShares, setEditShares] = useState("");
  const [uploadingMomentId, setUploadingMomentId] = useState<string | null>(null);
  const [previewMomentId, setPreviewMomentId] = useState<string | null>(null);

  const { data: clips = [], isLoading } = useQuery<ClipWithFullMetadata[]>({
    queryKey: ["/api/admin/clips"],
  });

  const { data: viralMoments = [], isLoading: viralLoading } = useQuery<ViralMoment[]>({
    queryKey: ["/api/admin/viral-moments/ready-for-posting"],
  });

  const { data: pendingMoments = [], isLoading: pendingLoading } = useQuery<ViralMoment[]>({
    queryKey: ["/api/admin/viral-moments/pending-clips"],
  });

  const { data: postedMoments = [], isLoading: postedLoading } = useQuery<ViralMoment[]>({
    queryKey: ["/api/admin/viral-moments/posted"],
  });

  const { data: podcasts = [] } = useQuery<Podcast[]>({
    queryKey: ["/api/podcasts"],
  });

  const uploadClipMutation = useMutation({
    mutationFn: async ({ momentId, file }: { momentId: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      
      const res = await fetch(`/api/admin/viral-moments/${momentId}/upload-clip`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Upload failed");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/viral-moments/pending-clips"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/viral-moments/ready-for-posting"] });
      toast({ 
        title: "Clip uploaded successfully", 
        description: "You can now burn captions onto this clip" 
      });
      setUploadingMomentId(null);
    },
    onError: (error: Error) => {
      toast({ 
        title: "Upload failed", 
        description: error.message,
        variant: "destructive" 
      });
      setUploadingMomentId(null);
    },
  });

  const handleFileUpload = (momentId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith("video/")) {
      toast({ title: "Invalid file type", description: "Please upload a video file", variant: "destructive" });
      return;
    }
    
    if (file.size > 100 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 100MB", variant: "destructive" });
      return;
    }
    
    setUploadingMomentId(momentId);
    uploadClipMutation.mutate({ momentId, file });
  };

  const burnCaptionsMutation = useMutation({
    mutationFn: async (momentId: string) => {
      const res = await apiRequest("POST", `/api/viral-moments/${momentId}/burn-captions`);
      if (!res.ok) throw new Error("Failed to burn captions");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/viral-moments/ready-for-posting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/viral-moments/posted"] });
      toast({ title: "Captions burned successfully" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to burn captions", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Regenerate captions with new PodDNA highlighting style
  const regenerateCaptionsMutation = useMutation({
    mutationFn: async (momentId: string) => {
      const res = await apiRequest("POST", `/api/viral-moments/${momentId}/burn-captions`, {
        forceRegenerate: true
      });
      if (!res.ok) throw new Error("Failed to regenerate captions");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/viral-moments/ready-for-posting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/viral-moments/posted"] });
      toast({ title: "Captions regenerated with PodDNA highlighting!" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to regenerate captions", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const updatePostingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/viral-moments/${id}/posting`, data);
      if (!res.ok) throw new Error("Failed to update posting status");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/viral-moments/ready-for-posting"] });
      setEditingMoment(null);
      toast({ title: "Posting info updated" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to update", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const updateMetricsMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/viral-moments/${id}/metrics`, data);
      if (!res.ok) throw new Error("Failed to update metrics");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/viral-moments/ready-for-posting"] });
      setEditingMoment(null);
      toast({ title: "Metrics updated" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to update metrics", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const openEditDialog = (moment: ViralMoment) => {
    setEditingMoment(moment);
    setEditDescription(moment.description || "");
    setEditHashtags(moment.hashtags?.join(", ") || "");
    setEditPostUrl(moment.postUrl || "");
    setEditViews(moment.views?.toString() || "");
    setEditLikes(moment.likes?.toString() || "");
    setEditComments(moment.comments?.toString() || "");
    setEditShares(moment.shares?.toString() || "");
  };

  const savePosting = () => {
    if (!editingMoment) return;
    updatePostingMutation.mutate({
      id: editingMoment.id,
      data: {
        description: editDescription,
        hashtags: editHashtags.split(",").map(h => h.trim()).filter(Boolean),
        postUrl: editPostUrl || undefined,
        postingStatus: editPostUrl ? "posted" : "ready",
      }
    });
  };

  const saveMetrics = () => {
    if (!editingMoment) return;
    updateMetricsMutation.mutate({
      id: editingMoment.id,
      data: {
        views: editViews ? parseInt(editViews) : null,
        likes: editLikes ? parseInt(editLikes) : null,
        comments: editComments ? parseInt(editComments) : null,
        shares: editShares ? parseInt(editShares) : null,
      }
    });
  };

  const markAsPosted = (moment: ViralMoment) => {
    updatePostingMutation.mutate({
      id: moment.id,
      data: { postingStatus: "posted" }
    });
  };

  const deleteClipMutation = useMutation({
    mutationFn: async (clipId: string) => {
      const res = await apiRequest("DELETE", `/api/clips/${clipId}`);
      if (!res.ok) throw new Error("Failed to delete clip");
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clips"] });
      toast({ title: "Clip deleted" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to delete", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const filteredClips = clips.filter(clip => {
    const matchesSearch = searchTerm === "" || 
      clip.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      clip.episodeTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      clip.podcastTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (clip.authorName || "").toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesPodcast = filterPodcast === "all" || 
      podcasts.some(p => p.id === filterPodcast && p.title === clip.podcastTitle);
    
    return matchesSearch && matchesPodcast;
  });

  const formatDuration = (startTime: number, endTime: number) => {
    const duration = endTime - startTime;
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const generateYtDlpCommand = (moment: ViralMoment) => {
    const videoUrl = moment.videoUrl || "PASTE_YOUTUBE_URL_HERE";
    const start = formatTime(moment.startTime);
    const end = formatTime(moment.endTime);
    const filename = `${moment.id.slice(0, 8)}.mp4`;
    return `yt-dlp "${videoUrl}" --download-sections "*${start}-${end}" -f "best[height<=1080]" -o "${filename}"`;
  };

  const copyYtDlpCommand = (moment: ViralMoment) => {
    const command = generateYtDlpCommand(moment);
    navigator.clipboard.writeText(command);
    toast({ title: "Command copied!", description: "Paste into your terminal to download the clip" });
  };

  const copyClipLink = (clipId: string) => {
    const url = `${window.location.origin}/clip/${clipId}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied to clipboard" });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Video className="w-6 h-6" />
            Clip Library
          </h1>
          <p className="text-muted-foreground">
            Manage audio clips and viral video clips for posting
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-lg px-3 py-1">
            <Flame className="w-4 h-4 mr-1" />
            {viralMoments.length} viral
          </Badge>
          <Badge variant="outline" className="text-lg px-3 py-1">
            <Headphones className="w-4 h-4 mr-1" />
            {clips.length} audio
          </Badge>
        </div>
      </div>

      {/* Edit Dialog for viral moments */}
      <Dialog open={!!editingMoment} onOpenChange={(open) => !open && setEditingMoment(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Posting Details</DialogTitle>
            <DialogDescription>
              Update description, hashtags, and track performance
            </DialogDescription>
          </DialogHeader>
          {editingMoment && (
            <div className="space-y-4">
              <div className="p-3 rounded border bg-muted/30">
                <p className="text-sm font-medium line-clamp-2">{editingMoment.hook || editingMoment.transcript}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline">{editingMoment.contentType}</Badge>
                  <span className="text-sm text-orange-500 font-bold">{editingMoment.viralityScore}/100</span>
                </div>
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Add a catchy description for social media..."
                  className="mt-1"
                  data-testid="input-edit-description"
                />
              </div>
              
              <div>
                <Label htmlFor="hashtags">Hashtags (comma-separated)</Label>
                <Input
                  id="hashtags"
                  value={editHashtags}
                  onChange={(e) => setEditHashtags(e.target.value)}
                  placeholder="#podcast, #viral, #clips"
                  className="mt-1"
                  data-testid="input-edit-hashtags"
                />
              </div>
              
              <div>
                <Label htmlFor="postUrl">Post URL (after posting)</Label>
                <Input
                  id="postUrl"
                  value={editPostUrl}
                  onChange={(e) => setEditPostUrl(e.target.value)}
                  placeholder="https://tiktok.com/..."
                  className="mt-1"
                  data-testid="input-edit-post-url"
                />
              </div>

              <div className="border-t pt-4">
                <Label className="mb-2 block">Performance Metrics</Label>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <Label htmlFor="views" className="text-xs">Views</Label>
                    <Input
                      id="views"
                      type="number"
                      value={editViews}
                      onChange={(e) => setEditViews(e.target.value)}
                      placeholder="0"
                      className="mt-1"
                      data-testid="input-edit-views"
                    />
                  </div>
                  <div>
                    <Label htmlFor="likes" className="text-xs">Likes</Label>
                    <Input
                      id="likes"
                      type="number"
                      value={editLikes}
                      onChange={(e) => setEditLikes(e.target.value)}
                      placeholder="0"
                      className="mt-1"
                      data-testid="input-edit-likes"
                    />
                  </div>
                  <div>
                    <Label htmlFor="comments" className="text-xs">Comments</Label>
                    <Input
                      id="comments"
                      type="number"
                      value={editComments}
                      onChange={(e) => setEditComments(e.target.value)}
                      placeholder="0"
                      className="mt-1"
                      data-testid="input-edit-comments"
                    />
                  </div>
                  <div>
                    <Label htmlFor="shares" className="text-xs">Shares</Label>
                    <Input
                      id="shares"
                      type="number"
                      value={editShares}
                      onChange={(e) => setEditShares(e.target.value)}
                      placeholder="0"
                      className="mt-1"
                      data-testid="input-edit-shares"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingMoment(null)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button 
              variant="secondary"
              onClick={saveMetrics}
              disabled={updateMetricsMutation.isPending}
              data-testid="button-save-metrics"
            >
              Save Metrics
            </Button>
            <Button 
              onClick={savePosting}
              disabled={updatePostingMutation.isPending}
              data-testid="button-save-posting"
            >
              {updatePostingMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Save Details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Video Preview Dialog */}
      <Dialog open={!!previewMomentId} onOpenChange={(open) => !open && setPreviewMomentId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Video Preview</DialogTitle>
            <DialogDescription>
              Preview the captioned clip before posting
            </DialogDescription>
          </DialogHeader>
          {previewMomentId && (
            <div className="aspect-[9/16] max-h-[70vh] bg-black rounded-lg overflow-hidden">
              <video 
                controls 
                className="w-full h-full object-contain"
                src={`/api/admin/viral-moments/${previewMomentId}/preview`}
              >
                Your browser does not support the video tag.
              </video>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewMomentId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="upload" className="gap-2" data-testid="tab-upload-clips">
            <Upload className="w-4 h-4" />
            Upload Clips ({pendingMoments.length})
          </TabsTrigger>
          <TabsTrigger value="viral" className="gap-2" data-testid="tab-viral-clips">
            <Flame className="w-4 h-4" />
            Ready for Posting ({viralMoments.length})
          </TabsTrigger>
          <TabsTrigger value="posted" className="gap-2" data-testid="tab-posted-clips">
            <CheckCircle className="w-4 h-4" />
            Posted ({postedMoments.length})
          </TabsTrigger>
          <TabsTrigger value="audio" className="gap-2" data-testid="tab-audio-clips">
            <Headphones className="w-4 h-4" />
            Audio Clips ({clips.length})
          </TabsTrigger>
        </TabsList>

        {/* Upload Tab - For manually uploading clips */}
        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-500" />
                Upload Clips Manually
              </CardTitle>
              <CardDescription>
                Download clips locally using yt-dlp, then upload them here for AI captioning
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6 p-4 bg-muted/50 rounded-lg border">
                <h3 className="font-medium mb-2">How to Download Clips:</h3>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li><strong>Install yt-dlp</strong> (one-time): Mac: <code className="bg-muted px-1 rounded">brew install yt-dlp</code> | Windows: <a href="https://github.com/yt-dlp/yt-dlp/releases" target="_blank" rel="noopener" className="underline">Download here</a></li>
                  <li><strong>Copy command</strong>: Click the copy button next to any viral moment below</li>
                  <li><strong>Run in terminal</strong>: Paste the command and press Enter - downloads just the clip segment</li>
                  <li><strong>Upload here</strong>: Click Upload and select the downloaded .mp4 file</li>
                </ol>
                <p className="text-xs text-muted-foreground mt-3">After uploading, use "Burn Captions" to add TikTok-style captions automatically.</p>
              </div>
              
              {pendingLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : pendingMoments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>All viral moments have clips</p>
                  <p className="text-sm mt-1">Detect more viral moments from an episode page</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingMoments.map((moment) => (
                    <div 
                      key={moment.id} 
                      className="p-4 rounded-lg border bg-card hover-elevate"
                      data-testid={`pending-moment-${moment.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">{moment.contentType}</Badge>
                            <div className="flex items-center gap-1">
                              <TrendingUp className="w-3 h-3 text-orange-500" />
                              <span className="text-sm font-bold text-orange-500">{moment.viralityScore}</span>
                            </div>
                            <Badge variant="secondary" className="font-mono text-xs">
                              {formatTime(moment.startTime)} - {formatTime(moment.endTime)}
                            </Badge>
                          </div>
                          
                          {moment.episodeTitle && (
                            <p className="text-xs text-muted-foreground mb-1">{moment.episodeTitle}</p>
                          )}
                          {moment.hook && (
                            <p className="font-medium text-sm mb-1">{moment.hook}</p>
                          )}
                          <p className="text-sm text-muted-foreground line-clamp-2">{moment.transcript}</p>
                          
                          {moment.clipStatus === "failed" && moment.clipError && (
                            <p className="mt-1 text-xs text-red-500">Error: {moment.clipError}</p>
                          )}
                          
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 p-2 bg-muted/30 rounded text-xs font-mono overflow-x-auto">
                              {generateYtDlpCommand(moment)}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyYtDlpCommand(moment)}
                              data-testid={`button-copy-command-${moment.id}`}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                          
                          {!moment.videoUrl && (
                            <p className="text-xs text-amber-600 mt-1">
                              No YouTube URL found - replace PASTE_YOUTUBE_URL_HERE in the command
                            </p>
                          )}
                        </div>
                        
                        <div className="flex flex-col gap-2">
                          <label 
                            htmlFor={`upload-${moment.id}`}
                            className="cursor-pointer"
                          >
                            <Button
                              variant="default"
                              size="sm"
                              disabled={uploadingMomentId === moment.id}
                              asChild
                            >
                              <span>
                                {uploadingMomentId === moment.id ? (
                                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                ) : (
                                  <Upload className="w-4 h-4 mr-1" />
                                )}
                                Upload
                              </span>
                            </Button>
                          </label>
                          <input
                            id={`upload-${moment.id}`}
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={(e) => handleFileUpload(moment.id, e)}
                            disabled={uploadingMomentId === moment.id}
                            data-testid={`input-upload-${moment.id}`}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Viral Clips Tab */}
        <TabsContent value="viral">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
                Posting Queue
              </CardTitle>
              <CardDescription>
                Viral moments ready for TikTok, Reels, and Shorts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {viralLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : viralMoments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Flame className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No clips ready for posting</p>
                  <p className="text-sm mt-1">Run the clip pipeline from an episode page</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {viralMoments.map((moment) => (
                    <div 
                      key={moment.id} 
                      className="p-4 rounded-lg border bg-card hover-elevate"
                      data-testid={`viral-moment-${moment.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">{moment.contentType}</Badge>
                            <div className="flex items-center gap-1">
                              <TrendingUp className="w-3 h-3 text-orange-500" />
                              <span className="text-sm font-bold text-orange-500">{moment.viralityScore}</span>
                            </div>
                            <span className="text-xs text-muted-foreground font-mono">
                              {formatTime(moment.startTime)} - {formatTime(moment.endTime)}
                            </span>
                          </div>
                          
                          {moment.hook && (
                            <p className="font-medium text-sm mb-1">{moment.hook}</p>
                          )}
                          <p className="text-sm text-muted-foreground line-clamp-2">{moment.transcript}</p>
                          
                          <div className="flex items-center gap-2 mt-3 flex-wrap">
                            <Badge 
                              variant={moment.clipStatus === "ready" ? "default" : moment.clipStatus === "failed" ? "destructive" : "secondary"}
                            >
                              clip: {moment.clipStatus}
                            </Badge>
                            {moment.captionedPath && (
                              <Badge variant="outline">captioned</Badge>
                            )}
                            {moment.optimizedPath && (
                              <Badge variant="outline">optimized</Badge>
                            )}
                            {moment.platform && (
                              <Badge variant="secondary">{moment.platform}</Badge>
                            )}
                            <Badge 
                              variant={moment.postingStatus === "posted" ? "default" : "secondary"}
                            >
                              {moment.postingStatus || "draft"}
                            </Badge>
                          </div>

                          {moment.postingStatus === "posted" && (moment.views || moment.likes) && (
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              {moment.views !== null && (
                                <span className="flex items-center gap-1">
                                  <Eye className="w-3 h-3" />
                                  {moment.views.toLocaleString()}
                                </span>
                              )}
                              {moment.likes !== null && (
                                <span className="flex items-center gap-1">
                                  <Heart className="w-3 h-3" />
                                  {moment.likes.toLocaleString()}
                                </span>
                              )}
                              {moment.comments !== null && (
                                <span className="flex items-center gap-1">
                                  <MessageCircle className="w-3 h-3" />
                                  {moment.comments.toLocaleString()}
                                </span>
                              )}
                              {moment.shares !== null && (
                                <span className="flex items-center gap-1">
                                  <Share2 className="w-3 h-3" />
                                  {moment.shares.toLocaleString()}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex flex-col gap-2">
                          {(moment.captionedPath || moment.videoPath) && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setPreviewMomentId(moment.id)}
                              data-testid={`button-preview-${moment.id}`}
                            >
                              <Play className="w-4 h-4 mr-1" />
                              Preview
                            </Button>
                          )}
                          {moment.clipStatus === "ready" && !moment.captionedPath && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => burnCaptionsMutation.mutate(moment.id)}
                              disabled={burnCaptionsMutation.isPending}
                              data-testid={`button-burn-captions-${moment.id}`}
                            >
                              {burnCaptionsMutation.isPending ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              ) : (
                                <FileVideo className="w-4 h-4 mr-1" />
                              )}
                              Burn Captions
                            </Button>
                          )}
                          {moment.captionedPath && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => regenerateCaptionsMutation.mutate(moment.id)}
                              disabled={regenerateCaptionsMutation.isPending}
                              data-testid={`button-regenerate-captions-${moment.id}`}
                            >
                              {regenerateCaptionsMutation.isPending ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              ) : (
                                <FileVideo className="w-4 h-4 mr-1" />
                              )}
                              Restyle
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(moment)}
                            data-testid={`button-edit-moment-${moment.id}`}
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                          {moment.postingStatus !== "posted" && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => markAsPosted(moment)}
                              disabled={updatePostingMutation.isPending}
                              data-testid={`button-mark-posted-${moment.id}`}
                            >
                              <Send className="w-4 h-4 mr-1" />
                              Posted
                            </Button>
                          )}
                          {moment.postUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(moment.postUrl!, "_blank")}
                              data-testid={`button-view-post-${moment.id}`}
                            >
                              <ExternalLink className="w-4 h-4 mr-1" />
                              View
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Posted Tab - Clips that have been posted */}
        <TabsContent value="posted">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Posted Clips</CardTitle>
              <CardDescription>
                Clips that have been posted to social media platforms
              </CardDescription>
            </CardHeader>
            <CardContent>
              {postedLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : postedMoments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No posted clips yet</p>
                  <p className="text-sm mt-1">Mark clips as posted from the "Ready for Posting" tab</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {postedMoments.map((moment) => (
                    <div
                      key={moment.id}
                      className="p-4 border rounded-lg"
                      data-testid={`posted-moment-${moment.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Badge variant="default" className="gap-1">
                              <Flame className="w-3 h-3" />
                              {moment.viralityScore}
                            </Badge>
                            <Badge variant="outline">{moment.contentType}</Badge>
                            {moment.platform && (
                              <Badge variant="secondary">{moment.platform}</Badge>
                            )}
                            <Badge variant="default">posted</Badge>
                          </div>
                          
                          {moment.hook && (
                            <p className="font-medium text-sm mb-1">{moment.hook}</p>
                          )}
                          
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                            {moment.transcript}
                          </p>
                          
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {Math.floor(moment.startTime / 60)}:{String(Math.floor(moment.startTime % 60)).padStart(2, "0")} - 
                              {Math.floor(moment.endTime / 60)}:{String(Math.floor(moment.endTime % 60)).padStart(2, "0")}
                              ({Math.round(moment.endTime - moment.startTime)}s)
                            </span>
                            {moment.postedAt && (
                              <span>Posted {formatDistanceToNow(new Date(moment.postedAt), { addSuffix: true })}</span>
                            )}
                          </div>

                          {/* Performance metrics */}
                          <div className="flex items-center gap-4 text-sm">
                            {moment.views !== null && (
                              <span className="flex items-center gap-1">
                                <Eye className="w-4 h-4 text-muted-foreground" />
                                {moment.views.toLocaleString()} views
                              </span>
                            )}
                            {moment.likes !== null && (
                              <span className="flex items-center gap-1">
                                <Heart className="w-4 h-4 text-muted-foreground" />
                                {moment.likes.toLocaleString()}
                              </span>
                            )}
                            {moment.comments !== null && (
                              <span className="flex items-center gap-1">
                                <MessageCircle className="w-4 h-4 text-muted-foreground" />
                                {moment.comments.toLocaleString()}
                              </span>
                            )}
                            {moment.shares !== null && (
                              <span className="flex items-center gap-1">
                                <Share2 className="w-4 h-4 text-muted-foreground" />
                                {moment.shares.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex flex-col gap-2">
                          {(moment.captionedPath || moment.videoPath) && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setPreviewMomentId(moment.id)}
                              data-testid={`button-preview-posted-${moment.id}`}
                            >
                              <Play className="w-4 h-4 mr-1" />
                              Preview
                            </Button>
                          )}
                          {moment.captionedPath && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => regenerateCaptionsMutation.mutate(moment.id)}
                              disabled={regenerateCaptionsMutation.isPending}
                              data-testid={`button-restyle-posted-${moment.id}`}
                            >
                              {regenerateCaptionsMutation.isPending ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              ) : (
                                <FileVideo className="w-4 h-4 mr-1" />
                              )}
                              Restyle
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(moment)}
                            data-testid={`button-edit-posted-${moment.id}`}
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Update Metrics
                          </Button>
                          {moment.postUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(moment.postUrl!, "_blank")}
                              data-testid={`button-view-posted-${moment.id}`}
                            >
                              <ExternalLink className="w-4 h-4 mr-1" />
                              View Post
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audio Clips Tab */}
        <TabsContent value="audio">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Audio Clips</CardTitle>
              <CardDescription>
                Browse and manage shareable audio clips
              </CardDescription>
            </CardHeader>
            <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search clips by title, episode, podcast, or author..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-clips"
              />
            </div>
            <Select value={filterPodcast} onValueChange={setFilterPodcast}>
              <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-filter-podcast">
                <SelectValue placeholder="Filter by podcast" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Podcasts</SelectItem>
                {podcasts.map((podcast) => (
                  <SelectItem key={podcast.id} value={podcast.id}>
                    {podcast.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredClips.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Headphones className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No clips found</p>
              {searchTerm || filterPodcast !== "all" ? (
                <p className="text-sm mt-1">Try adjusting your filters</p>
              ) : (
                <p className="text-sm mt-1">Create clips from the Transcript Lab</p>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clip</TableHead>
                    <TableHead>Episode / Podcast</TableHead>
                    <TableHead>Time Range</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClips.map((clip) => (
                    <TableRow key={clip.id} data-testid={`clip-row-${clip.id}`}>
                      <TableCell>
                        <div className="flex items-start gap-3">
                          {clip.podcastArtworkUrl ? (
                            <img 
                              src={clip.podcastArtworkUrl} 
                              alt="" 
                              className="w-12 h-12 rounded object-cover"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                              <Headphones className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium line-clamp-2 text-sm">
                              {clip.title}
                            </p>
                            {clip.transcriptText && (
                              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                {clip.transcriptText}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="text-sm line-clamp-1">{clip.episodeTitle}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {clip.podcastTitle}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>{formatTime(clip.startTime)} - {formatTime(clip.endTime)}</span>
                        </div>
                        <Badge variant="secondary" className="mt-1 text-xs">
                          {formatDuration(clip.startTime, clip.endTime)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{clip.authorName || "Unknown"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(clip.createdAt), { addSuffix: true })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyClipLink(clip.id)}
                            title="Copy link"
                            data-testid={`button-copy-clip-${clip.id}`}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(`/clip/${clip.id}`, "_blank")}
                            title="View clip"
                            data-testid={`button-view-clip-${clip.id}`}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                title="Delete clip"
                                data-testid={`button-delete-clip-${clip.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Clip?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete this audio clip. Shared links will no longer work.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteClipMutation.mutate(clip.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
