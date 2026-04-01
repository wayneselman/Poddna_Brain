import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import { truncateText } from "@/lib/shareCards";
import { AnnotationShareCard, type AnnotationCardData } from "@/components/share-card-renderers";

export function ShareAnnotationPage() {
  const [, params] = useRoute("/share/annotation/:id");
  const annotationId = params?.id;

  const { data, isLoading, error } = useQuery<AnnotationCardData>({
    queryKey: ["/api/annotations", annotationId, "share-summary"],
    queryFn: async () => {
      const res = await fetch(`/api/annotations/${annotationId}/share-summary`);
      if (!res.ok) throw new Error("Failed to load annotation");
      return res.json();
    },
    enabled: !!annotationId,
  });

  if (!annotationId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <p>Missing annotation id.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-zinc-400">Loading annotation...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <p className="text-zinc-400">Could not load annotation.</p>
      </div>
    );
  }

  const artworkUrl = data.episode.artworkUrl || data.podcast.artworkUrl;
  const truncatedQuote = truncateText(data.text, 280);
  const ogDescription = `"${truncatedQuote}" — from ${data.podcast.title}`;

  return (
    <>
      <Helmet>
        <title>Annotation on {data.episode.title} | PodDNA</title>
        <meta name="description" content={ogDescription} />
        <meta property="og:title" content={`"${truncateText(truncatedQuote, 60)}..." - PodDNA`} />
        <meta property="og:description" content={ogDescription} />
        {artworkUrl && <meta property="og:image" content={artworkUrl} />}
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      <div className="min-h-screen flex items-center justify-center bg-black text-white p-4">
        <AnnotationShareCard data={data} aspectRatio="portrait" />

        <div className="fixed bottom-6 left-0 right-0 flex justify-center">
          <Link
            href={`/episodes/${data.episode.id}`}
            className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-full text-sm transition-colors"
            data-testid="link-view-episode"
          >
            View Full Episode on PodDNA
          </Link>
        </div>
      </div>
    </>
  );
}

export default ShareAnnotationPage;
