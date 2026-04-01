import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from "@/components/ui/collapsible";
import { 
  Sparkles, 
  ChevronDown, 
  ChevronRight,
  Check,
  ArrowUp,
  Clock,
} from "lucide-react";
import type { AnnotationWithAuthor } from "@shared/schema";

interface AiSuggestionsLaneProps {
  episodeId: string;
  onAnnotationClick?: (annotationId: string) => void;
  selectedAnnotationId?: string | null;
}

export default function AiSuggestionsLane({ 
  episodeId, 
  onAnnotationClick,
  selectedAnnotationId,
}: AiSuggestionsLaneProps) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [isOpen, setIsOpen] = useState(true);

  const { data: aiAnnotations, isLoading } = useQuery<AnnotationWithAuthor[]>({
    queryKey: ['/api/episodes', episodeId, 'annotations', { aiOnly: true }],
    queryFn: async () => {
      const response = await fetch(`/api/episodes/${episodeId}/annotations?aiOnly=true`);
      if (!response.ok) throw new Error("Failed to fetch AI suggestions");
      return response.json();
    },
  });

  const promoteMutation = useMutation({
    mutationFn: async (annotationId: string) => {
      return await apiRequest("PATCH", `/api/annotations/${annotationId}/promote`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/episodes', episodeId, 'annotations'] });
      toast({
        title: "Annotation promoted",
        description: "The AI suggestion is now a regular annotation",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to promote",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const formatTimeAgo = (date: Date | string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (isLoading) {
    return (
      <Card className="mb-4 overflow-hidden" data-testid="card-ai-suggestions-loading">
        <div className="p-4 border-b flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="p-4 space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      </Card>
    );
  }

  if (!aiAnnotations || aiAnnotations.length === 0) {
    return null;
  }

  return (
    <Card className="mb-4 overflow-hidden border-primary/20" data-testid="card-ai-suggestions">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button
            className="w-full p-4 border-b flex items-center justify-between gap-2 hover-elevate transition-colors"
            data-testid="button-toggle-ai-suggestions"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">AI Suggestions</h3>
              <Badge variant="secondary" className="text-xs">
                {aiAnnotations.length}
              </Badge>
            </div>
            {isOpen ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <ScrollArea className="max-h-[300px]">
            <div className="p-3 space-y-3">
              {aiAnnotations.map((annotation) => (
                <div
                  key={annotation.id}
                  className={`p-3 rounded-lg border transition-colors cursor-pointer hover-elevate ${
                    selectedAnnotationId === annotation.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-muted/30"
                  }`}
                  onClick={() => onAnnotationClick?.(annotation.id)}
                  data-testid={`card-ai-annotation-${annotation.id}`}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      {annotation.text && (
                        <div className="bg-yellow-400/10 border-l-2 border-yellow-400 pl-2 py-1 mb-2 rounded-r text-xs">
                          "{annotation.text}"
                        </div>
                      )}
                      <p className="text-sm text-foreground line-clamp-3">
                        {annotation.content}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ArrowUp className="w-3 h-3" />
                        {annotation.upvotes || 0}
                      </span>
                      {annotation.createdAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimeAgo(annotation.createdAt)}
                        </span>
                      )}
                    </div>
                    
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          promoteMutation.mutate(annotation.id);
                        }}
                        disabled={promoteMutation.isPending}
                        data-testid={`button-promote-${annotation.id}`}
                      >
                        <Check className="w-3 h-3 mr-1" />
                        {promoteMutation.isPending ? "Promoting..." : "Promote"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
