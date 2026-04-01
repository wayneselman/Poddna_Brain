import { useState, useEffect, useRef, useMemo } from "react";
import { Play, Search, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TranscriptSegment as Segment, Annotation } from "@shared/schema";

interface InsightTag {
  keyIdea?: boolean;
  emotionalPeak?: boolean;
  claim?: boolean;
  sponsor?: boolean;
}

interface TranscriptReaderProps {
  segments: Segment[];
  annotations: Annotation[];
  aiTags: Record<string, InsightTag>;
  currentTime: number;
  activeSegmentId?: string;
  onSeek: (time: number) => void;
  onAddAnnotation?: (segmentId: string, startTime: number) => void;
  setSegmentRef?: (id: string, el: HTMLDivElement | null) => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function InsightChip({ label, color }: { label: string; color: "yellow" | "red" | "blue" | "gray" }) {
  const styles = {
    yellow: "bg-yellow-50 text-yellow-700 border border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800",
    red: "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
    blue: "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
    gray: "bg-gray-100 text-gray-700 border border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
  };

  return (
    <span 
      className={cn("px-2 py-0.5 text-xs rounded-md", styles[color])}
      data-testid={`chip-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {label}
    </span>
  );
}

function AnnotationBlock({ 
  annotation, 
  isExpanded, 
  onToggle 
}: { 
  annotation: Annotation; 
  isExpanded: boolean; 
  onToggle: () => void;
}) {
  const timeAgo = useMemo(() => {
    if (!annotation.createdAt) return "";
    const date = new Date(annotation.createdAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "1d ago";
    if (diffDays < 30) return `${diffDays}d ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  }, [annotation.createdAt]);

  return (
    <div className="mt-2 border-l-2 border-primary/30 pl-3" data-testid={`annotation-block-${annotation.id}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        data-testid={`button-toggle-annotation-${annotation.id}`}
      >
        <MessageSquare className="w-3 h-3" />
        <span>Annotation</span>
        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {isExpanded && (
        <div className="mt-2 text-sm text-muted-foreground" data-testid={`annotation-content-${annotation.id}`}>
          <p className="leading-relaxed">"{annotation.content}"</p>
          <p className="text-xs mt-1 opacity-70">— Saved {timeAgo}</p>
        </div>
      )}
    </div>
  );
}

export default function TranscriptReader({
  segments,
  annotations,
  aiTags,
  currentTime,
  activeSegmentId,
  onSeek,
  onAddAnnotation,
  setSegmentRef,
}: TranscriptReaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedAnnotations, setExpandedAnnotations] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredSegments = useMemo(() => {
    if (!searchQuery.trim()) return segments;
    const query = searchQuery.toLowerCase();
    return segments.filter(
      (seg) =>
        seg.text.toLowerCase().includes(query) ||
        seg.speaker?.toLowerCase().includes(query)
    );
  }, [segments, searchQuery]);

  const annotationsBySegment = useMemo(() => {
    const map: Record<string, Annotation[]> = {};
    annotations.forEach((a) => {
      if (a.segmentId) {
        if (!map[a.segmentId]) map[a.segmentId] = [];
        map[a.segmentId].push(a);
      }
    });
    return map;
  }, [annotations]);

  const toggleAnnotation = (annotationId: string) => {
    setExpandedAnnotations((prev) => {
      const next = new Set(prev);
      if (next.has(annotationId)) {
        next.delete(annotationId);
      } else {
        next.add(annotationId);
      }
      return next;
    });
  };

  return (
    <div ref={containerRef} className="mx-auto max-w-3xl px-4 py-6 flex flex-col gap-6" data-testid="transcript-reader">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search transcript..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-9 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          data-testid="input-search-transcript"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            data-testid="button-clear-search"
          >
            Clear
          </button>
        )}
      </div>

      {searchQuery && (
        <p className="text-xs text-muted-foreground" data-testid="text-search-results">
          {filteredSegments.length} result{filteredSegments.length !== 1 ? "s" : ""} found
        </p>
      )}

      <div className="flex flex-col gap-4">
        {filteredSegments.map((segment) => {
          const segmentTags = aiTags[segment.id] || {};
          const segmentAnnotations = annotationsBySegment[segment.id] || [];
          const isActive = segment.id === activeSegmentId;

          return (
            <div
              key={segment.id}
              ref={(el) => setSegmentRef?.(segment.id, el)}
              className={cn(
                "group relative pl-16",
                isActive && "bg-primary/5 -mx-4 px-4 py-2 rounded-lg pl-20"
              )}
              data-testid={`segment-${segment.id}`}
            >
              <button
                type="button"
                className={cn(
                  "absolute left-0 top-0 flex items-center gap-1 text-xs text-muted-foreground",
                  "opacity-0 group-hover:opacity-100 transition-opacity",
                  isActive && "opacity-100 text-primary"
                )}
                onClick={() => onSeek(segment.startTime)}
                data-testid={`button-play-${segment.id}`}
              >
                <Play className="w-3 h-3" />
                {formatTime(segment.startTime)}
              </button>

              {segment.speaker && (
                <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide" data-testid={`speaker-${segment.id}`}>
                  {segment.speaker}
                </p>
              )}

              <p 
                className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap"
                data-testid={`text-${segment.id}`}
              >
                {segment.text}
              </p>

              {(segmentTags.keyIdea || segmentTags.emotionalPeak || segmentTags.claim || segmentTags.sponsor) && (
                <div className="mt-2 flex flex-wrap gap-2" data-testid={`chips-${segment.id}`}>
                  {segmentTags.keyIdea && <InsightChip label="Key Idea" color="yellow" />}
                  {segmentTags.emotionalPeak && <InsightChip label="Emotional Peak" color="red" />}
                  {segmentTags.claim && <InsightChip label="Claim Detected" color="blue" />}
                  {segmentTags.sponsor && <InsightChip label="Sponsored" color="gray" />}
                </div>
              )}

              {segmentAnnotations.map((annotation) => (
                <AnnotationBlock
                  key={annotation.id}
                  annotation={annotation}
                  isExpanded={expandedAnnotations.has(annotation.id)}
                  onToggle={() => toggleAnnotation(annotation.id)}
                />
              ))}
            </div>
          );
        })}
      </div>

      {filteredSegments.length === 0 && searchQuery && (
        <div className="text-center py-12 text-muted-foreground" data-testid="no-results">
          <p>No matches found for "{searchQuery}"</p>
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="mt-2 text-sm text-primary hover:underline"
            data-testid="button-clear-search-empty"
          >
            Clear search
          </button>
        </div>
      )}
    </div>
  );
}
