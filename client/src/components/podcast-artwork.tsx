import { useState } from "react";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface PodcastArtworkProps {
  src?: string | null;
  alt: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  fallbackGradient?: string;
}

const sizeClasses = {
  sm: "w-12 h-12",
  md: "w-20 h-20",
  lg: "w-32 h-32",
  xl: "w-64 h-64",
};

const iconSizes = {
  sm: "w-5 h-5",
  md: "w-8 h-8",
  lg: "w-12 h-12",
  xl: "w-24 h-24",
};

export default function PodcastArtwork({
  src,
  alt,
  size = "md",
  className,
  fallbackGradient = "from-muted/80 to-muted",
}: PodcastArtworkProps) {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  if (!src || imageError) {
    return (
      <div
        className={cn(
          sizeClasses[size],
          "flex-shrink-0 rounded-lg bg-gradient-to-br flex items-center justify-center border border-border/50",
          fallbackGradient,
          className
        )}
        data-testid="artwork-fallback"
      >
        <Mic className={cn(iconSizes[size], "text-muted-foreground/60")} />
      </div>
    );
  }

  return (
    <div className={cn("relative flex-shrink-0", sizeClasses[size], className)}>
      {isLoading && (
        <div
          className={cn(
            "absolute inset-0 rounded-lg bg-muted animate-pulse"
          )}
          data-testid="artwork-loading"
        />
      )}
      <img
        src={src}
        alt={alt}
        className={cn(
          "w-full h-full object-cover rounded-lg transition-opacity duration-300",
          isLoading ? "opacity-0" : "opacity-100"
        )}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setImageError(true);
          setIsLoading(false);
        }}
        data-testid="artwork-image"
        loading="lazy"
      />
    </div>
  );
}
