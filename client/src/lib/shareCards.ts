export const SHARE_CARD_CONFIG = {
  aspectRatios: {
    portrait: "4/5",
    square: "1/1", 
    landscape: "16/9",
  },
  
  sizes: {
    portrait: { width: 500, height: 625 },
    square: { width: 500, height: 500 },
    landscape: { width: 800, height: 450 },
  },
  
  theme: {
    background: {
      primary: "from-[#0a0a1a] via-[#0f0f23] to-black",
      integrity: "from-[#050816] via-[#020617] to-black",
    },
    border: "border-white/10",
    text: {
      primary: "text-white",
      secondary: "text-zinc-400",
      tertiary: "text-zinc-500",
      accent: "text-yellow-400",
    },
    divider: "border-white/5",
  },
  
  brand: {
    name: "PodDNA",
    domain: "poddna.io",
    colors: {
      primary: "text-yellow-400",
      badge: "bg-yellow-500 text-black",
    },
  },
  
  typography: {
    quote: {
      small: "text-lg md:text-xl",
      medium: "text-xl md:text-2xl",
      large: "text-2xl md:text-3xl",
    },
    title: {
      small: "text-sm md:text-base",
      medium: "text-base md:text-lg",
      large: "text-lg md:text-xl",
    },
    caption: "text-xs md:text-sm",
    micro: "text-[10px] md:text-xs",
    tracking: "tracking-[0.25em]",
  },
};

export type AspectRatio = keyof typeof SHARE_CARD_CONFIG.aspectRatios;
export type CardType = "annotation" | "integrity";

export function getAspectRatioClass(ratio: AspectRatio): string {
  return `aspect-[${SHARE_CARD_CONFIG.aspectRatios[ratio]}]`;
}

export function getCardSize(ratio: AspectRatio) {
  return SHARE_CARD_CONFIG.sizes[ratio];
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 50) return "text-amber-300";
  return "text-rose-400";
}

export function getRiskLevelColor(level: "low" | "medium" | "high"): string {
  switch (level) {
    case "low": return "text-emerald-400";
    case "medium": return "text-amber-300";
    case "high": return "text-rose-400";
    default: return "text-zinc-400";
  }
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

export function formatTimestamp(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function generateShareUrl(type: CardType, id: string): string {
  return `${window.location.origin}/share/${type === "annotation" ? "annotation" : "integrity"}/${id}`;
}

export function generateSocialShareUrl(
  platform: "twitter" | "facebook" | "linkedin",
  url: string,
  text?: string
): string {
  switch (platform) {
    case "twitter":
      return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text || "")}&url=${encodeURIComponent(url)}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text || "")}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    default:
      return url;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareViaWebShare(data: {
  title: string;
  text: string;
  url: string;
}): Promise<boolean> {
  if (!navigator.share) return false;
  
  try {
    await navigator.share(data);
    return true;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return true;
    }
    return false;
  }
}
