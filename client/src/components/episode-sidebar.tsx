import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  MessageSquare, 
  Sparkles, 
  Users, 
  Play, 
  ThumbsUp,
  Headphones,
  Tag
} from "lucide-react";
import type { Annotation, ClipWithAuthor } from "@shared/schema";

interface EpisodeSidebarProps {
  episodeId: string;
  annotations: Annotation[];
  clips: ClipWithAuthor[];
  onSeek: (seconds: number) => void;
  onAnnotationClick?: (annotationId: string) => void;
}

type SidebarTab = "community" | "ai" | "clips";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hrs}:${remainingMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface AiSuggestion {
  id: string;
  episodeId: string;
  segmentId: string | null;
  content: string;
  type: string;
  startTime: number | null;
  createdAt: string;
}

export default function EpisodeSidebar({ 
  episodeId, 
  annotations, 
  clips,
  onSeek,
  onAnnotationClick 
}: EpisodeSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("community");

  const { data: aiSuggestions = [], isLoading: aiLoading } = useQuery<AiSuggestion[]>({
    queryKey: ['/api/episodes', episodeId, 'ai-suggestions'],
    enabled: !!episodeId,
  });

  const tabCounts = {
    community: annotations.length,
    ai: aiSuggestions.length,
    clips: clips.length,
  };

  const hasAnyContent = annotations.length > 0 || aiSuggestions.length > 0 || clips.length > 0;

  if (!hasAnyContent && !aiLoading) {
    return null;
  }

  return (
    <Card className="rounded-xl border overflow-hidden" data-testid="episode-sidebar">
      <div className="flex border-b bg-muted/30">
        <button
          type="button"
          onClick={() => setActiveTab("community")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "community" 
              ? "text-foreground border-b-2 border-primary bg-background" 
              : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="sidebar-tab-community"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Community</span>
          {tabCounts.community > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {tabCounts.community}
            </Badge>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("ai")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "ai" 
              ? "text-foreground border-b-2 border-primary bg-background" 
              : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="sidebar-tab-ai"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI</span>
          {tabCounts.ai > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {tabCounts.ai}
            </Badge>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("clips")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "clips" 
              ? "text-foreground border-b-2 border-primary bg-background" 
              : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="sidebar-tab-clips"
        >
          <Headphones className="w-3.5 h-3.5" />
          <span>Clips</span>
          {tabCounts.clips > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {tabCounts.clips}
            </Badge>
          )}
        </button>
      </div>

      <ScrollArea className="h-[320px]">
        <div className="p-3">
          {activeTab === "community" && (
            <div className="space-y-2" data-testid="sidebar-community-content">
              {annotations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No annotations yet</p>
                  <p className="text-xs mt-1">Be the first to add one!</p>
                </div>
              ) : (
                annotations.slice(0, 8).map((annotation) => (
                  <button
                    key={annotation.id}
                    type="button"
                    onClick={() => {
                      onSeek(annotation.timestamp || 0);
                      onAnnotationClick?.(annotation.id);
                    }}
                    className="w-full p-2.5 rounded-lg border hover-elevate text-left transition-all"
                    data-testid={`sidebar-annotation-${annotation.id}`}
                  >
                    {annotation.text && (
                      <p className="text-xs text-muted-foreground italic border-l-2 border-primary pl-2 mb-1.5 line-clamp-1">
                        "{annotation.text}"
                      </p>
                    )}
                    <p className="text-sm text-foreground line-clamp-2">
                      {annotation.content}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs font-mono text-primary flex items-center gap-0.5">
                        <Play className="w-2.5 h-2.5" />
                        {formatTime(annotation.timestamp || 0)}
                      </span>
                      {annotation.upvotes > 0 && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <ThumbsUp className="w-2.5 h-2.5" />
                          {annotation.upvotes}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {activeTab === "ai" && (
            <div className="space-y-2" data-testid="sidebar-ai-content">
              {aiLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full rounded-lg" />
                  <Skeleton className="h-16 w-full rounded-lg" />
                </div>
              ) : aiSuggestions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No AI suggestions</p>
                  <p className="text-xs mt-1">Run analysis to generate insights</p>
                </div>
              ) : (
                aiSuggestions.slice(0, 8).map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => suggestion.startTime && onSeek(suggestion.startTime)}
                    className="w-full p-2.5 rounded-lg border hover-elevate text-left transition-all"
                    data-testid={`sidebar-ai-${suggestion.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground line-clamp-2">{suggestion.content}</p>
                        {suggestion.startTime && (
                          <span className="text-xs font-mono text-primary flex items-center gap-0.5 mt-1">
                            <Play className="w-2.5 h-2.5" />
                            {formatTime(suggestion.startTime)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {activeTab === "clips" && (
            <div className="space-y-2" data-testid="sidebar-clips-content">
              {clips.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Headphones className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No clips yet</p>
                  <p className="text-xs mt-1">Create clips from interesting moments</p>
                </div>
              ) : (
                clips.slice(0, 8).map((clip) => (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => onSeek(clip.startTime)}
                    className="w-full flex items-center gap-2 p-2.5 rounded-lg border hover-elevate text-left"
                    data-testid={`sidebar-clip-${clip.id}`}
                  >
                    <Play className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-sm text-foreground flex-1 line-clamp-1">
                      {clip.title || `Clip at ${formatTime(clip.startTime)}`}
                    </span>
                    <span className="text-xs font-mono text-primary shrink-0">
                      {formatTime(clip.startTime)}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}
