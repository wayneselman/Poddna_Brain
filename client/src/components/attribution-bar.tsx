import { ExternalLink, Shield } from "lucide-react";
import { SiYoutube, SiSpotify, SiApplepodcasts } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AttributionBarProps {
  sourceLink?: string | null;
  youtubeUrl?: string | null;
  spotifyUrl?: string | null;
  applePodcastsUrl?: string | null;
  className?: string;
}

export default function AttributionBar({
  sourceLink,
  youtubeUrl,
  spotifyUrl,
  applePodcastsUrl,
  className,
}: AttributionBarProps) {
  const hasLinks = youtubeUrl || spotifyUrl || applePodcastsUrl || sourceLink;
  const primaryLink = sourceLink || youtubeUrl || spotifyUrl || applePodcastsUrl;

  return (
    <div 
      className={cn(
        "p-4 bg-muted/30 rounded-lg border border-border/50",
        className
      )}
      data-testid="attribution-bar"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            Audio and content © original creators. PodDNA provides AI-generated highlights 
            and short excerpts for discovery and personal use.
          </p>
        </div>

        {hasLinks && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
            {primaryLink && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2 text-xs"
                onClick={() => window.open(primaryLink, "_blank")}
                data-testid="button-view-original"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View original episode
              </Button>
            )}
            
            <div className="flex items-center gap-1.5">
              {youtubeUrl && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => window.open(youtubeUrl, "_blank")}
                  data-testid="button-attribution-youtube"
                  title="Watch on YouTube"
                >
                  <SiYoutube className="w-4 h-4 text-red-600" />
                </Button>
              )}
              {spotifyUrl && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => window.open(spotifyUrl, "_blank")}
                  data-testid="button-attribution-spotify"
                  title="Listen on Spotify"
                >
                  <SiSpotify className="w-4 h-4 text-green-500" />
                </Button>
              )}
              {applePodcastsUrl && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => window.open(applePodcastsUrl, "_blank")}
                  data-testid="button-attribution-apple"
                  title="Listen on Apple Podcasts"
                >
                  <SiApplepodcasts className="w-4 h-4 text-purple-600" />
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
