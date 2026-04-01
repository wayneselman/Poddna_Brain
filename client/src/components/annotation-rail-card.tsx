import { Link } from "wouter";
import PodcastArtwork from "@/components/podcast-artwork";
import { TrendingUp, MessageSquare } from "lucide-react";

function formatQuote(text: string): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (/[.!?]$/.test(trimmed)) return trimmed;
  if (/[a-zA-Z]$/.test(trimmed)) return trimmed + "...";
  return trimmed;
}

interface AnnotationRailCardProps {
  annotation: {
    id: string;
    content: string;
    text: string;
    upvotes: number;
    episodeId: string;
    episodeTitle: string;
    podcastTitle: string;
    artworkUrl?: string;
  };
  testId?: string;
}

export default function AnnotationRailCard({ annotation, testId }: AnnotationRailCardProps) {
  return (
    <Link href={`/episode/${annotation.episodeId}#annotation-${annotation.id}`}>
      <div
        className="flex-shrink-0 w-80 md:w-96 snap-start group cursor-pointer"
        data-testid={testId || `annotation-rail-card-${annotation.id}`}
      >
        <div className="bg-card border border-border rounded-lg p-6 transition-all duration-300 hover-elevate active-elevate-2 h-full flex flex-col">
          {/* Podcast info header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-shrink-0">
              <PodcastArtwork
                src={annotation.artworkUrl}
                alt={annotation.podcastTitle}
                size="sm"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm line-clamp-1" data-testid={`${testId}-podcast-title`}>
                {annotation.podcastTitle}
              </h4>
              <p className="text-xs text-muted-foreground line-clamp-1" data-testid={`${testId}-episode-title`}>
                {annotation.episodeTitle}
              </p>
            </div>
          </div>

          {/* Quote in yellow, annotation in italics */}
          <div className="flex-1 mb-4">
            <p className="text-base leading-normal mb-3" data-testid={`${testId}-quote`}>
              <span className="bg-yellow-400 text-black px-1.5 py-1 box-decoration-clone font-medium tracking-wide">
                "{formatQuote(annotation.text)}"
              </span>
            </p>
            <p className="text-sm text-muted-foreground italic line-clamp-2" data-testid={`${testId}-content`}>
              {annotation.content}
            </p>
          </div>

          {/* Footer with metrics */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground border-t border-border pt-4">
            <div className="flex items-center gap-1" data-testid={`${testId}-upvotes`}>
              <TrendingUp className="w-4 h-4" />
              <span>{annotation.upvotes.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <MessageSquare className="w-4 h-4" />
              <span>View in context</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
