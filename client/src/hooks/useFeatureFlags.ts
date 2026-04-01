import { useQuery } from "@tanstack/react-query";

interface FeatureFlags {
  CLIP_STUDIO_MODE?: string;
  HIDE_ENTITIES?: string;
  HIDE_SEMANTIC_SEARCH?: string;
  HIDE_SPONSORS?: string;
  HIDE_CLAIMS?: string;
  HIDE_PROGRAMS?: string;
  HIDE_TRANSCRIPTS_LAB?: string;
  HIDE_ANNOTATIONS?: string;
  HIDE_CATEGORIES?: string;
  HIDE_TOPICS?: string;
  [key: string]: string | undefined;
}

export function useFeatureFlags() {
  const { data: flags = {}, isLoading } = useQuery<FeatureFlags>({
    queryKey: ["/api/settings/feature-flags"],
    staleTime: 60000,
  });

  const isEnabled = (key: string): boolean => {
    return flags[key] === "true";
  };

  const isHidden = (key: string): boolean => {
    return flags[`HIDE_${key.toUpperCase()}`] === "true";
  };

  return {
    flags,
    isLoading,
    isEnabled,
    isHidden,
    clipStudioMode: isEnabled("CLIP_STUDIO_MODE"),
  };
}
