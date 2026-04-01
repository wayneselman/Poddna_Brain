import { storage } from "./storage";

interface OgMeta {
  title: string;
  description: string;
  image: string;
  type: string;
  twitterCard: string;
  twitterTitle: string;
  twitterDescription: string;
}

const CREATOR_LANDING: OgMeta = {
  title: "PODDNA — Your Podcast Has Patterns. We Surface Them.",
  description: "Paste a YouTube URL and get AI-detected viral moments, narrative structure, and claim tracking. 3 free analyses — no account required.",
  image: "/og-creator.png",
  type: "website",
  twitterCard: "summary_large_image",
  twitterTitle: "PODDNA — Find Your Best Podcast Moments",
  twitterDescription: "AI-powered viral moment detection for podcast creators. Paste a YouTube URL, get clip-ready moments in minutes.",
};

async function getAnalyzePageMeta(pathSegments: string): Promise<OgMeta> {
  const base = { ...CREATOR_LANDING };
  try {
    const idMatch = pathSegments.match(/\/creator\/analyze\/(.+?)(?:\?|$)/);
    if (!idMatch) return base;
    const id = idMatch[1];

    if (id === "existing") return base;

    const request = await storage.getIngestionRequest(id);
    if (request?.episodeId) {
      const episode = await storage.getEpisode(request.episodeId);
      if (episode?.title && episode.title !== "Processing...") {
        const sources = await storage.getEpisodeSourcesByEpisode(request.episodeId);
        const ytSource = sources.find((s: any) => s.platform === "youtube");
        const videoId = ytSource?.sourceUrl?.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];

        base.title = `${episode.title} — PODDNA Analysis`;
        base.description = `AI-detected viral moments and intelligence for "${episode.title}". See what patterns PODDNA found.`;
        base.twitterTitle = `${episode.title} — Viral Moments`;
        base.twitterDescription = base.description;
        if (videoId) {
          base.image = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        }
      }
    }
  } catch {
  }
  return base;
}

function replaceMeta(html: string, meta: OgMeta): string {
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${meta.title}</title>`
  );
  html = html.replace(
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${meta.description}" />`
  );
  html = html.replace(
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${meta.title}" />`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${meta.description}" />`
  );
  html = html.replace(
    /<meta property="og:type" content="[^"]*" \/>/,
    `<meta property="og:type" content="${meta.type}" />`
  );
  html = html.replace(
    /<meta name="twitter:card" content="[^"]*" \/>/,
    `<meta name="twitter:card" content="${meta.twitterCard}" />`
  );
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${meta.twitterTitle}" />`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="${meta.twitterDescription}" />`
  );

  if (!html.includes('og:image')) {
    html = html.replace(
      '</head>',
      `    <meta property="og:image" content="${meta.image}" />\n    <meta name="twitter:image" content="${meta.image}" />\n  </head>`
    );
  } else {
    html = html.replace(
      /<meta property="og:image" content="[^"]*" \/>/,
      `<meta property="og:image" content="${meta.image}" />`
    );
  }

  if (!html.includes('twitter:image')) {
    html = html.replace(
      '</head>',
      `    <meta name="twitter:image" content="${meta.image}" />\n  </head>`
    );
  } else {
    html = html.replace(
      /<meta name="twitter:image" content="[^"]*" \/>/,
      `<meta name="twitter:image" content="${meta.image}" />`
    );
  }

  return html;
}

export async function injectOgTags(html: string, url: string): Promise<string> {
  if (!url.startsWith("/creator")) return html;

  let meta: OgMeta;
  if (url === "/creator" || url === "/creator/") {
    meta = CREATOR_LANDING;
  } else if (url.startsWith("/creator/analyze")) {
    meta = await getAnalyzePageMeta(url);
  } else {
    meta = CREATOR_LANDING;
  }

  return replaceMeta(html, meta);
}
