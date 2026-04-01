import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Play, MessageSquare, TrendingUp } from "lucide-react";

function formatQuote(text: string): string {
  if (!text) return "";
  
  const trimmed = text.trim();
  
  const endsWithPunctuation = /[.!?]$/.test(trimmed);
  const endsWithWord = /[a-zA-Z]$/.test(trimmed);
  const endsIncomplete = /\s[a-zA-Z]{1,2}$/.test(trimmed);
  
  if (endsWithPunctuation) {
    return trimmed;
  }
  
  if (endsIncomplete || endsWithWord) {
    return trimmed + "...";
  }
  
  return trimmed;
}

interface HeroSectionProps {
  annotation: {
    id: string;
    content: string;
    segmentText: string;
    episodeTitle: string;
    podcastTitle: string;
    artworkUrl?: string;
    upvotes: number;
    episodeId: string;
  };
}

export default function HeroSection({ annotation }: HeroSectionProps) {
  return (
    <section className="relative h-[75vh] min-h-[500px] overflow-hidden" data-testid="hero-section">
      {/* Background with podcast artwork */}
      <div className="absolute inset-0">
        {annotation.artworkUrl ? (
          <img
            src={annotation.artworkUrl}
            alt={annotation.podcastTitle}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary via-purple-500 to-pink-500" />
        )}
        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/40" />
      </div>

      {/* Content overlay */}
      <div className="relative h-full flex items-end pb-20">
        <div className="container mx-auto px-6 max-w-6xl">
          {/* Featured badge */}
          <div className="flex items-center gap-2 mb-4" data-testid="hero-badge">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span className="text-sm font-semibold uppercase tracking-wider text-primary">
              Trending Annotation
            </span>
          </div>

          {/* Podcast and episode info */}
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-white/90" data-testid="hero-podcast-title">
              {annotation.podcastTitle}
            </h3>
            <p className="text-sm text-white/70" data-testid="hero-episode-title">
              {annotation.episodeTitle}
            </p>
          </div>

          {/* Quote in yellow, annotation in italics */}
          <div className="mb-8 max-w-4xl">
            <blockquote className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-snug mb-4" style={{ lineHeight: "1.35" }}>
              <span className="bg-yellow-400 text-black px-2 py-1.5 box-decoration-clone tracking-wide" data-testid="hero-quote">
                "{formatQuote(annotation.segmentText)}"
              </span>
            </blockquote>
            <p className="text-lg text-white/80 italic" data-testid="hero-annotation-content">
              {annotation.content}
            </p>
          </div>

          {/* CTAs */}
          <div className="flex flex-wrap items-center gap-4">
            <Link href={`/episode/${annotation.episodeId}`}>
              <Button
                size="lg"
                className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white border border-white/30"
                data-testid="button-hero-play"
              >
                <Play className="w-5 h-5 mr-2" />
                Play Episode
              </Button>
            </Link>
            <Link href={`/episode/${annotation.episodeId}#annotation-${annotation.id}`}>
              <Button
                size="lg"
                variant="outline"
                className="bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border-white/30"
                data-testid="button-hero-view-annotation"
              >
                <MessageSquare className="w-5 h-5 mr-2" />
                View Annotation
              </Button>
            </Link>
            <div className="flex items-center gap-2 text-white/80 ml-4" data-testid="hero-upvote-count">
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm font-medium">{annotation.upvotes.toLocaleString()} upvotes</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
