import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Plus, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AnnotationCard from "./annotation-card";
import type { AnnotationWithAuthor, Episode, Podcast } from "@shared/schema";

interface AnnotationListProps {
  annotations: AnnotationWithAuthor[];
  episode: Episode;
  podcast?: Podcast;
  isLoading?: boolean;
  selectedAnnotationId?: string;
  onAnnotationClick?: (annotationId: string) => void;
  showAddForm?: boolean;
  defaultStartTime?: number;
  onAddComplete?: () => void;
  maxChars?: number;
  className?: string;
}

export default function AnnotationList({
  annotations,
  episode,
  podcast,
  isLoading = false,
  selectedAnnotationId,
  onAnnotationClick,
  showAddForm = false,
  defaultStartTime = 0,
  onAddComplete,
  maxChars = 300,
  className,
}: AnnotationListProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(showAddForm);
  const [content, setContent] = useState("");

  const createMutation = useMutation({
    mutationFn: async (data: { content: string; startTime: number; endTime?: number }) => {
      return await apiRequest("POST", `/api/episodes/${episode.id}/annotations`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episode.id, "annotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/annotations/trending"] });
      setContent("");
      setIsAdding(false);
      toast({
        title: "Annotation added",
        description: "Your note has been saved",
      });
      onAddComplete?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add annotation",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!content.trim()) return;
    if (content.length > maxChars) {
      toast({
        title: "Content too long",
        description: `Maximum ${maxChars} characters allowed`,
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate({
      content: content.trim(),
      startTime: defaultStartTime,
    });
  };

  const handleAnnotationClick = (annotation: AnnotationWithAuthor) => {
    onAnnotationClick?.(annotation.id);
  };

  const remainingChars = maxChars - content.length;

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)} data-testid="annotation-list-loading">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex gap-3">
                <Skeleton className="w-8 h-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)} data-testid="annotation-list">
      {user && (
        <div className="mb-4">
          {isAdding ? (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-medium">Add Your Note</CardTitle>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setIsAdding(false);
                      setContent("");
                    }}
                    data-testid="button-cancel-add"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Share your thoughts on this moment..."
                  className="min-h-[80px] resize-none mb-3"
                  maxLength={maxChars}
                  data-testid="textarea-new-annotation"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className={cn(
                    "text-xs",
                    remainingChars < 50 ? "text-warning" : "text-muted-foreground",
                    remainingChars < 0 && "text-destructive"
                  )}>
                    {remainingChars} characters remaining
                  </span>
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!content.trim() || createMutation.isPending || content.length > maxChars}
                    data-testid="button-submit-annotation"
                  >
                    <Send className="w-3 h-3 mr-1" />
                    {createMutation.isPending ? "Saving..." : "Post"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setIsAdding(true)}
              data-testid="button-add-annotation"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Annotation
            </Button>
          )}
        </div>
      )}

      {annotations.length === 0 ? (
        <div className="text-center py-8" data-testid="annotation-list-empty">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No annotations yet. Be the first to add one!
          </p>
        </div>
      ) : (
        annotations.map((annotation) => (
          <AnnotationCard
            key={annotation.id}
            annotation={annotation}
            isSelected={annotation.id === selectedAnnotationId}
            onClick={() => handleAnnotationClick(annotation)}
            episode={episode}
            podcast={podcast}
            segmentStartTime={defaultStartTime}
          />
        ))
      )}
    </div>
  );
}
