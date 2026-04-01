import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Helmet } from "react-helmet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import AudioClipCard from "@/components/audio-clip-card";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { ClipWithFullMetadata } from "@shared/schema";

export default function ClipPage() {
  const { id } = useParams<{ id: string }>();

  const { data: clip, isLoading, error } = useQuery<ClipWithFullMetadata>({
    queryKey: ["/api/clips", id],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-[500px] w-full bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (error || !clip) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="text-center text-white">
          <h1 className="text-2xl font-bold mb-2">Clip not found</h1>
          <p className="text-zinc-400 mb-4">This clip may have been deleted or doesn't exist.</p>
          <Link href="/">
            <Button variant="outline" className="text-white border-zinc-700">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const clipUrl = `${window.location.origin}/clip/${clip.id}`;
  const ogImage = clip.podcastArtworkUrl || "/og-default.png";

  return (
    <>
      <Helmet>
        <title>{clip.title} | {clip.podcastTitle} - PODDNA</title>
        <meta name="description" content={clip.transcriptText || `Audio clip from ${clip.episodeTitle}`} />
        
        <meta property="og:title" content={`${clip.title} | ${clip.podcastTitle}`} />
        <meta property="og:description" content={clip.transcriptText || `Audio clip from ${clip.episodeTitle}`} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={clipUrl} />
        <meta property="og:type" content="music.song" />
        <meta property="og:site_name" content="PODDNA" />
        
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${clip.title} | ${clip.podcastTitle}`} />
        <meta name="twitter:description" content={clip.transcriptText || `Audio clip from ${clip.episodeTitle}`} />
        <meta name="twitter:image" content={ogImage} />
      </Helmet>

      <div className="min-h-screen bg-zinc-950 flex flex-col">
        <header className="p-4 flex items-center justify-between border-b border-zinc-800">
          <Link href="/">
            <span className="text-primary font-bold text-xl cursor-pointer">PODDNA</span>
          </Link>
          <Link href={`/episode/${clip.episodeId}`}>
            <Button variant="outline" size="sm" className="text-white border-zinc-700 bg-zinc-900">
              <ExternalLink className="w-4 h-4 mr-2" />
              Full Episode
            </Button>
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <AudioClipCard
              clip={clip}
              podcast={{
                id: "",
                title: clip.podcastTitle,
                artworkUrl: clip.podcastArtworkUrl || null,
                description: null,
                feedUrl: "",
                author: null,
                website: null,
                language: null,
                categories: null,
                explicit: false,
                episodeCount: 0,
                lastUpdated: null,
                addedBy: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                knownSpeakers: [],
              }}
              mediaUrl={clip.mediaUrl}
              episodeTitle={clip.episodeTitle}
              onShare={() => {
                navigator.share?.({
                  title: clip.title,
                  text: clip.transcriptText || `Check out this clip from ${clip.podcastTitle}`,
                  url: clipUrl,
                }).catch(() => {
                  navigator.clipboard.writeText(clipUrl);
                });
              }}
            />
          </div>
        </main>
      </div>
    </>
  );
}
