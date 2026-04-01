import { Link } from "wouter";
import PodcastArtwork from "@/components/podcast-artwork";

interface PodcastCardProps {
  podcast: {
    id: string;
    title: string;
    host?: string | null;
    artworkUrl?: string | null;
  };
  testId?: string;
}

export default function PodcastCard({ podcast, testId }: PodcastCardProps) {
  return (
    <Link href={`/podcast/${podcast.id}`}>
      <div
        className="flex-shrink-0 w-64 snap-start group cursor-pointer"
        data-testid={testId || `podcast-card-${podcast.id}`}
      >
        <div className="relative overflow-hidden rounded-lg transition-all duration-300 group-hover:shadow-2xl group-hover:shadow-primary/20">
          {/* Artwork with hover zoom */}
          <div className="overflow-hidden rounded-lg">
            <PodcastArtwork
              src={podcast.artworkUrl}
              alt={podcast.title}
              size="lg"
              className="transition-transform duration-300 group-hover:scale-110"
            />
          </div>

          {/* Glassmorphic overlay on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg flex items-end p-4">
            <div>
              <h3 className="text-white font-semibold text-sm line-clamp-2 mb-1">
                {podcast.title}
              </h3>
              {podcast.host && (
                <p className="text-white/80 text-xs line-clamp-1">{podcast.host}</p>
              )}
            </div>
          </div>
        </div>

        {/* Title below (visible when not hovering) */}
        <div className="mt-3 group-hover:opacity-0 transition-opacity duration-300">
          <h3 className="font-semibold text-sm line-clamp-2 mb-1" data-testid={`${testId}-title`}>
            {podcast.title}
          </h3>
          {podcast.host && (
            <p className="text-muted-foreground text-xs line-clamp-1" data-testid={`${testId}-host`}>
              {podcast.host}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
