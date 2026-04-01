import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Music, Video } from "lucide-react";
import AnnotationCard from "./annotation-card";
import type { TranscriptSegment, Annotation, Episode, Podcast } from "@shared/schema";

interface TranscriptSegmentProps {
  segment: TranscriptSegment;
  annotations: Annotation[];
  isActive: boolean;
  selectedAnnotation: string | null;
  onSeek: (time: number) => void;
  onTextSelect: (
    segmentId: string,
    text: string,
    startOffset: number,
    endOffset: number,
    rect: DOMRect
  ) => void;
  onAnnotationClick: (annotationId: string) => void;
  episode?: Episode;
  podcast?: Podcast;
}

export default function TranscriptSegment({
  segment,
  annotations,
  isActive,
  selectedAnnotation,
  onSeek,
  onTextSelect,
  onAnnotationClick,
  episode,
  podcast,
}: TranscriptSegmentProps) {
  const textRef = useRef<HTMLParagraphElement>(null);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !textRef.current) return;

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString().trim();
    
    if (selectedText.length < 3) return;

    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(textRef.current);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preSelectionRange.toString().length;
    const endOffset = startOffset + selectedText.length;

    const rect = range.getBoundingClientRect();
    onTextSelect(segment.id, selectedText, startOffset, endOffset, rect);
  };

  const renderTextWithAnnotations = () => {
    if (annotations.length === 0) {
      return <span>{segment.text}</span>;
    }

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    const sortedAnnotations = [...annotations].sort((a, b) => a.startOffset - b.startOffset);

    sortedAnnotations.forEach((annotation, idx) => {
      if (annotation.startOffset > lastIndex) {
        parts.push(
          <span key={`text-${idx}`}>
            {segment.text.slice(lastIndex, annotation.startOffset)}
          </span>
        );
      }

      const isSelected = selectedAnnotation === annotation.id;
      parts.push(
        <mark
          key={`annotation-${annotation.id}`}
          className={`cursor-pointer transition-colors ${
            isSelected
              ? "bg-yellow-400 text-black"
              : "bg-yellow-200 hover:bg-yellow-300 text-black"
          }`}
          onClick={() => onAnnotationClick(annotation.id)}
          data-testid={`mark-annotation-${annotation.id}`}
        >
          {segment.text.slice(annotation.startOffset, annotation.endOffset)}
        </mark>
      );

      lastIndex = annotation.endOffset;
    });

    if (lastIndex < segment.text.length) {
      parts.push(<span key="text-end">{segment.text.slice(lastIndex)}</span>);
    }

    return <>{parts}</>;
  };

  const getSegmentIcon = () => {
    if (segment.type === "music") return <Music className="w-4 h-4" />;
    if (segment.type === "clip") return <Video className="w-4 h-4" />;
    return null;
  };

  const getSegmentLabel = () => {
    if (segment.type === "music") return "MUSIC";
    if (segment.type === "clip") return "CLIP";
    return null;
  };

  return (
    <div
      className={`relative group transition-all duration-300 rounded-lg p-3 -mx-3 ${
        isActive 
          ? "opacity-100 bg-primary/5 border-l-4 border-primary" 
          : "opacity-70 hover:opacity-90 border-l-4 border-transparent"
      }`}
      data-testid={`segment-${segment.id}`}
    >
      <div className="flex gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="flex-shrink-0 h-auto py-0 px-2 text-xs font-mono text-muted-foreground hover:text-primary"
          onClick={() => onSeek(segment.startTime)}
          data-testid={`button-timestamp-${segment.id}`}
        >
          <Clock className="w-3 h-3 mr-1" />
          {formatTime(segment.startTime)}
        </Button>

        <div className="flex-1">
          {segment.speaker && segment.type === "speech" && (
            <div className="mb-2">
              <span className="text-sm font-semibold text-foreground">{segment.speaker}</span>
            </div>
          )}

          {(segment.type === "music" || segment.type === "clip") && (
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className="text-xs">
                {getSegmentIcon()}
                <span className="ml-1">{getSegmentLabel()}</span>
              </Badge>
              {segment.speaker && (
                <span className="text-xs text-muted-foreground">{segment.speaker}</span>
              )}
            </div>
          )}

          <p
            ref={textRef}
            className={`font-serif text-base leading-relaxed select-text mb-6 ${
              segment.type === "music"
                ? "italic text-muted-foreground border-l-4 border-primary/30 pl-4"
                : "text-foreground"
            }`}
            onMouseUp={handleMouseUp}
            data-testid={`text-segment-${segment.id}`}
          >
            {renderTextWithAnnotations()}
          </p>

          {annotations.length > 0 && (
            <div className="mt-4 space-y-3">
              {annotations.map((annotation) => (
                <AnnotationCard
                  key={annotation.id}
                  annotation={annotation}
                  isSelected={selectedAnnotation === annotation.id}
                  onClick={() => onAnnotationClick(annotation.id)}
                  episode={episode}
                  podcast={podcast}
                  segmentStartTime={segment.startTime}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
