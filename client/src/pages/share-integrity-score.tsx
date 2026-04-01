import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import { IntegrityShareCard, type IntegrityCardData } from "@/components/share-card-renderers";

export function IntegrityScoreSharePage() {
  const [, params] = useRoute("/share/integrity/:id");
  const episodeId = params?.id;

  const { data, isLoading, error } = useQuery<IntegrityCardData>({
    queryKey: ["/api/episodes", episodeId, "integrity-summary"],
    queryFn: async () => {
      const res = await fetch(`/api/episodes/${episodeId}/integrity-summary`);
      if (!res.ok) throw new Error("Failed to load integrity data");
      return res.json();
    },
    enabled: !!episodeId,
  });

  if (!episodeId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <p>Missing episode id.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-zinc-400">Loading integrity score...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <p className="text-zinc-400">Could not load integrity data.</p>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{data.episodeTitle} - Integrity Score | PodDNA</title>
        <meta name="description" content={`Integrity Score: ${data.integrityScore}/100 - ${data.podcastTitle || 'Podcast'} analyzed by PodDNA's Integrity Engine`} />
        <meta property="og:title" content={`${data.episodeTitle} - Integrity Score`} />
        <meta property="og:description" content={`Integrity Score: ${data.integrityScore}/100. ${data.sponsorCount} sponsors detected. ${data.claims.total} claims analyzed.`} />
        {data.artworkUrl && <meta property="og:image" content={data.artworkUrl} />}
      </Helmet>
      
      <div className="min-h-screen flex items-center justify-center bg-black text-white p-4">
        <IntegrityShareCard data={data} />
      </div>
    </>
  );
}
