import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import VoteButtons from "@/components/vote-buttons";
import PodcastArtwork from "./podcast-artwork";
import PlatformShareModal from "./platform-share-modal";
import { Share2, Edit2, Trash2, X, Save, Clock, Flag, Link2 } from "lucide-react";
import { useState, useEffect } from "react";
import type { AnnotationWithAuthor, Episode, Podcast } from "@shared/schema";

const REPORT_REASONS = [
  { value: "spam", label: "Spam or advertising" },
  { value: "harassment", label: "Harassment or abuse" },
  { value: "misinformation", label: "Misinformation" },
  { value: "offtopic", label: "Off-topic or irrelevant" },
  { value: "other", label: "Other" },
] as const;

interface AnnotationWithVote extends AnnotationWithAuthor {
  userVote?: "up" | "down" | null;
}

interface AnnotationCardProps {
  annotation: AnnotationWithVote;
  isSelected: boolean;
  onClick: () => void;
  episode?: Episode;
  podcast?: Podcast;
  segmentStartTime?: number;
}

export default function AnnotationCard({ annotation, isSelected, onClick, episode, podcast, segmentStartTime }: AnnotationCardProps) {
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();
  const [showShareModal, setShowShareModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(annotation.content);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportReason, setReportReason] = useState<string>("");
  const [reportDetails, setReportDetails] = useState("");

  const isOwner = user?.id === annotation.userId;
  const isModerator = user?.role === "moderator";
  const canEdit = isOwner || isAdmin || isModerator;
  const isPending = annotation.status === "pending";
  const canReport = user && !isOwner;

  useEffect(() => {
    setEditContent(annotation.content);
  }, [annotation.content]);

  const formatTimeAgo = (date: Date | string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const handleOpenShareModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowShareModal(true);
  };

  const handleShareQuoteCard = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    const shareUrl = `${window.location.origin}/share/annotation/${annotation.id}`;
    const shareText = `"${annotation.text.slice(0, 100)}${annotation.text.length > 100 ? '...' : ''}" — via PodDNA`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Check out this podcast moment",
          text: shareText,
          url: shareUrl,
        });
        toast({
          title: "Shared!",
          description: "Quote card shared successfully",
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          await navigator.clipboard.writeText(shareUrl);
          toast({
            title: "Link copied!",
            description: "Quote card link copied to clipboard",
          });
        }
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: "Link copied!",
        description: "Quote card link copied to clipboard",
      });
    }
  };

  const updateMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest("PATCH", `/api/annotations/${annotation.id}`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", annotation.episodeId, "annotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile/annotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/annotations/trending"] });
      setIsEditing(false);
      toast({
        title: "Annotation updated",
        description: "Your changes have been saved",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/annotations/${annotation.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", annotation.episodeId, "annotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile/annotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/annotations/trending"] });
      toast({
        title: "Annotation deleted",
        description: "Your annotation has been removed",
      });
    },
    onError: () => {
      toast({
        title: "Failed to delete",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const reportMutation = useMutation({
    mutationFn: async (data: { reason: string; details?: string }) => {
      return await apiRequest("POST", `/api/annotations/${annotation.id}/report`, data);
    },
    onSuccess: () => {
      setShowReportDialog(false);
      setReportReason("");
      setReportDetails("");
      toast({
        title: "Report submitted",
        description: "Thank you for helping keep our community safe",
      });
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to submit report";
      toast({
        title: "Report failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
    setEditContent(annotation.content);
  };

  const handleSaveEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editContent.trim() && editContent !== annotation.content) {
      updateMutation.mutate(editContent);
    } else {
      setIsEditing(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate();
    setShowDeleteDialog(false);
  };

  const handleReport = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowReportDialog(true);
  };

  const confirmReport = () => {
    if (!reportReason) return;
    reportMutation.mutate({
      reason: reportReason,
      details: reportDetails.trim() || undefined,
    });
  };

  return (
    <Card
      id={`annotation-${annotation.id}`}
      className={`transition-all duration-200 cursor-pointer ${
        isSelected ? "ring-2 ring-primary" : "hover-elevate"
      }`}
      onClick={onClick}
      data-testid={`card-annotation-${annotation.id}`}
    >
      <CardContent className="p-4">
        <div className="flex gap-3">
          <Avatar className="w-8 h-8 flex-shrink-0 mt-0.5">
            <AvatarImage src={annotation.authorAvatar ?? undefined} />
            <AvatarFallback className="text-xs">
              {(annotation.authorName?.[0] || 'U').toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            {/* Header row with author info and podcast */}
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-foreground" data-testid={`text-author-${annotation.id}`}>
                  {annotation.authorName || 'Unknown User'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatTimeAgo(annotation.createdAt)}
                </span>
                {isPending && isOwner && (
                  <Badge variant="outline" className="text-xs gap-1" data-testid={`badge-pending-${annotation.id}`}>
                    <Clock className="w-3 h-3" />
                    Pending approval
                  </Badge>
                )}
              </div>
              {podcast && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <PodcastArtwork
                    src={podcast.artworkUrl}
                    alt={podcast.title}
                    size="sm"
                  />
                  <span className="text-xs text-muted-foreground truncate max-w-[100px] hidden sm:inline">
                    {podcast.title}
                  </span>
                </div>
              )}
            </div>

            {isEditing ? (
              <div className="mb-3" onClick={(e) => e.stopPropagation()}>
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[80px] text-sm"
                  data-testid={`textarea-edit-${annotation.id}`}
                  autoFocus
                />
              </div>
            ) : (
              <p className="text-sm text-foreground leading-relaxed mb-3 italic" data-testid={`text-content-${annotation.id}`}>
                {annotation.content}
              </p>
            )}

            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={handleSaveEdit}
                    disabled={updateMutation.isPending || !editContent.trim()}
                    data-testid={`button-save-${annotation.id}`}
                  >
                    <Save className="w-3 h-3 mr-1" />
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={handleCancelEdit}
                    disabled={updateMutation.isPending}
                    data-testid={`button-cancel-edit-${annotation.id}`}
                  >
                    <X className="w-3 h-3 mr-1" />
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  {canEdit && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={handleEdit}
                        data-testid={`button-edit-${annotation.id}`}
                      >
                        <Edit2 className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={handleDelete}
                        data-testid={`button-delete-${annotation.id}`}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={handleShareQuoteCard}
                    data-testid={`button-share-quote-${annotation.id}`}
                  >
                    <Link2 className="w-3 h-3 mr-1" />
                    Quote Card
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={handleOpenShareModal}
                    data-testid={`button-share-${annotation.id}`}
                  >
                    <Share2 className="w-3 h-3 mr-1" />
                    Image
                  </Button>
                  {canReport && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={handleReport}
                      data-testid={`button-report-${annotation.id}`}
                    >
                      <Flag className="w-3 h-3 mr-1" />
                      Report
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 self-start">
            <VoteButtons
              annotationId={annotation.id}
              episodeId={annotation.episodeId}
              upvotes={annotation.upvotes}
              downvotes={annotation.downvotes}
              userVote={annotation.userVote ?? null}
            />
          </div>
        </div>
      </CardContent>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete annotation?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your annotation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PlatformShareModal
        annotation={annotation}
        episode={episode}
        podcast={podcast}
        segmentStartTime={segmentStartTime}
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
      />

      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Report Annotation</DialogTitle>
            <DialogDescription>
              Help us maintain a healthy community by reporting content that violates our guidelines.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="report-reason">Reason for report</Label>
              <Select value={reportReason} onValueChange={setReportReason}>
                <SelectTrigger id="report-reason" data-testid="select-report-reason">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_REASONS.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-details">Additional details (optional)</Label>
              <Textarea
                id="report-details"
                placeholder="Provide any additional context that might help us review this report..."
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                className="min-h-[80px]"
                data-testid="textarea-report-details"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReportDialog(false)}
              disabled={reportMutation.isPending}
              data-testid="button-cancel-report"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmReport}
              disabled={!reportReason || reportMutation.isPending}
              data-testid="button-submit-report"
            >
              {reportMutation.isPending ? "Submitting..." : "Submit Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
