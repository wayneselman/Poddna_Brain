import type { Annotation, Episode, Podcast } from "@shared/schema";

export type PlatformSize = 
  | "instagram-square"     // 1080x1080
  | "instagram-portrait"   // 1080x1350 (4:5)
  | "tiktok"              // 1080x1920 (9:16)
  | "linkedin"            // 1200x627
  | "twitter-square"      // 1200x1200
  | "twitter-landscape";  // 1200x675

interface PlatformDimensions {
  width: number;
  height: number;
  name: string;
}

export const PLATFORM_SIZES: Record<PlatformSize, PlatformDimensions> = {
  "instagram-square": { width: 1080, height: 1080, name: "Instagram Square" },
  "instagram-portrait": { width: 1080, height: 1350, name: "Instagram Portrait" },
  "tiktok": { width: 1080, height: 1920, name: "TikTok" },
  "linkedin": { width: 1200, height: 627, name: "LinkedIn" },
  "twitter-square": { width: 1200, height: 1200, name: "Twitter Square" },
  "twitter-landscape": { width: 1200, height: 675, name: "Twitter Landscape" },
};

interface GenerateCardOptions {
  annotation: Annotation;
  episode?: Episode;
  podcast?: Podcast;
  platform?: PlatformSize;
}

export async function generateAnnotationCard({
  annotation,
  episode,
  podcast,
  platform = "instagram-square",
}: GenerateCardOptions): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  const dimensions = PLATFORM_SIZES[platform];
  const { width, height } = dimensions;
  canvas.width = width;
  canvas.height = height;

  const isVertical = height > width;
  const isWide = width > height * 1.5;

  const gradient = ctx.createLinearGradient(0, 0, isVertical ? width : 0, height);
  gradient.addColorStop(0, "#1a1a2e");
  gradient.addColorStop(0.5, "#16213e");
  gradient.addColorStop(1, "#0f0f23");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const accentColor = "#F5C518";
  ctx.fillStyle = `${accentColor}15`;
  ctx.beginPath();
  ctx.arc(width * 0.85, height * 0.15, width * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(width * 0.15, height * 0.85, width * 0.15, 0, Math.PI * 2);
  ctx.fill();

  const padding = Math.min(width, height) * 0.06;

  if (isWide) {
    await renderLandscapeLayout(ctx, { annotation, episode, podcast, width, height, padding, accentColor });
  } else {
    await renderPortraitLayout(ctx, { annotation, episode, podcast, width, height, padding, accentColor, isVertical });
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob!);
    }, "image/png");
  });
}

async function renderLandscapeLayout(
  ctx: CanvasRenderingContext2D,
  options: {
    annotation: Annotation;
    episode?: Episode;
    podcast?: Podcast;
    width: number;
    height: number;
    padding: number;
    accentColor: string;
  }
) {
  const { annotation, episode, podcast, width, height, padding, accentColor } = options;
  
  const leftColumnWidth = width * 0.32;
  const rightColumnX = leftColumnWidth + padding;
  const rightColumnWidth = width - rightColumnX - padding;
  
  const artworkSize = Math.min(leftColumnWidth - padding * 2, height * 0.5);
  const artworkX = padding;
  const artworkY = height / 2 - artworkSize / 2 - padding;
  
  if (podcast?.artworkUrl) {
    try {
      const img = await loadImage(podcast.artworkUrl);
      
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(artworkX, artworkY, artworkSize, artworkSize, 16);
      ctx.clip();
      ctx.drawImage(img, artworkX, artworkY, artworkSize, artworkSize);
      ctx.restore();

      ctx.strokeStyle = `${accentColor}50`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(artworkX, artworkY, artworkSize, artworkSize, 16);
      ctx.stroke();
    } catch (error) {
      console.warn("Failed to load podcast artwork:", error);
    }
  }
  
  const infoY = artworkY + artworkSize + padding * 0.6;
  const infoWidth = leftColumnWidth - padding * 1.5;
  
  if (podcast) {
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 ${height * 0.055}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "left";
    const podcastName = truncateText(ctx, podcast.title, infoWidth);
    ctx.fillText(podcastName, artworkX, infoY);
  }
  
  if (episode) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = `400 ${height * 0.04}px Inter, system-ui, sans-serif`;
    const epTitle = truncateText(ctx, episode.title, infoWidth);
    ctx.fillText(epTitle, artworkX, infoY + height * 0.06);
  }
  
  const quoteFontSize = Math.min(height * 0.095, 50);
  const quoteY = padding + quoteFontSize;
  
  ctx.fillStyle = accentColor;
  ctx.font = `bold ${quoteFontSize * 1.8}px Georgia, serif`;
  ctx.textAlign = "left";
  ctx.fillText('"', rightColumnX, quoteY);
  
  ctx.fillStyle = "#ffffff";
  ctx.font = `500 ${quoteFontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "left";
  
  const quoteMaxWidth = rightColumnWidth - quoteFontSize * 2;
  const quoteLines = wrapText(ctx, annotation.text, quoteMaxWidth);
  const lineHeight = quoteFontSize * 1.4;
  const maxLines = 4;
  const displayLines = quoteLines.slice(0, maxLines);
  if (quoteLines.length > maxLines) {
    displayLines[maxLines - 1] = displayLines[maxLines - 1].replace(/\s*$/, "...");
  }
  
  const quoteTextX = rightColumnX + quoteFontSize * 0.8;
  displayLines.forEach((line, index) => {
    const y = quoteY + quoteFontSize * 0.8 + index * lineHeight;
    
    ctx.fillStyle = `${accentColor}25`;
    const metrics = ctx.measureText(line);
    const highlightPadding = quoteFontSize * 0.15;
    ctx.fillRect(
      quoteTextX - highlightPadding,
      y - quoteFontSize * 0.75,
      metrics.width + highlightPadding * 2,
      quoteFontSize * 1.05
    );
    
    ctx.fillStyle = "#ffffff";
    ctx.fillText(line, quoteTextX, y);
  });
  
  const quoteEndY = quoteY + quoteFontSize * 0.8 + displayLines.length * lineHeight;
  ctx.fillStyle = accentColor;
  ctx.font = `bold ${quoteFontSize * 1.8}px Georgia, serif`;
  ctx.textAlign = "right";
  ctx.fillText('"', width - padding, quoteEndY - quoteFontSize * 0.3);
  
  const footerY = height - padding - height * 0.08;
  
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(rightColumnX, footerY, rightColumnWidth, 1);
  
  ctx.textAlign = "right";
  ctx.fillStyle = accentColor;
  ctx.font = `bold ${height * 0.055}px Inter, system-ui, sans-serif`;
  ctx.fillText("PODDNA", width - padding, footerY + height * 0.055);
  
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `400 ${height * 0.03}px Inter, system-ui, sans-serif`;
  ctx.fillText("poddna.io", width - padding, footerY + height * 0.09);
}

async function renderPortraitLayout(
  ctx: CanvasRenderingContext2D,
  options: {
    annotation: Annotation;
    episode?: Episode;
    podcast?: Podcast;
    width: number;
    height: number;
    padding: number;
    accentColor: string;
    isVertical: boolean;
  }
) {
  const { annotation, episode, podcast, width, height, padding, accentColor, isVertical } = options;
  const contentWidth = width - padding * 2;
  
  let artworkY = padding;
  const artworkSize = Math.min(width, height) * 0.15;
  
  if (podcast?.artworkUrl) {
    try {
      const img = await loadImage(podcast.artworkUrl);
      const artworkX = padding;
      
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(artworkX, artworkY, artworkSize, artworkSize, 12);
      ctx.clip();
      ctx.drawImage(img, artworkX, artworkY, artworkSize, artworkSize);
      ctx.restore();

      ctx.strokeStyle = `${accentColor}40`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(artworkX, artworkY, artworkSize, artworkSize, 12);
      ctx.stroke();
    } catch (error) {
      console.warn("Failed to load podcast artwork:", error);
    }
  }

  const quoteStartY = artworkY + artworkSize + padding * 1.5;
  
  const quoteFontSize = isVertical 
    ? Math.min(width * 0.065, 52)
    : Math.min(width * 0.055, 48);

  ctx.fillStyle = accentColor;
  ctx.font = `bold ${quoteFontSize * 2}px Georgia, serif`;
  ctx.textAlign = "left";
  ctx.fillText('"', padding, quoteStartY + quoteFontSize * 0.3);

  ctx.fillStyle = "#ffffff";
  ctx.font = `500 ${quoteFontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  
  const quoteMaxWidth = contentWidth - quoteFontSize * 2;
  const quoteLines = wrapText(ctx, annotation.text, quoteMaxWidth);
  const lineHeight = quoteFontSize * 1.35;
  
  const maxQuoteLines = isVertical ? 8 : 5;
  const displayLines = quoteLines.slice(0, maxQuoteLines);
  if (quoteLines.length > maxQuoteLines) {
    displayLines[maxQuoteLines - 1] = displayLines[maxQuoteLines - 1].replace(/\s*$/, "...");
  }
  
  displayLines.forEach((line, index) => {
    const y = quoteStartY + quoteFontSize + index * lineHeight;
    
    ctx.fillStyle = `${accentColor}30`;
    const metrics = ctx.measureText(line);
    const highlightPadding = quoteFontSize * 0.2;
    ctx.fillRect(
      width / 2 - metrics.width / 2 - highlightPadding,
      y - quoteFontSize * 0.8,
      metrics.width + highlightPadding * 2,
      quoteFontSize * 1.1
    );
    
    ctx.fillStyle = "#ffffff";
    ctx.fillText(line, width / 2, y);
  });

  const quoteEndY = quoteStartY + quoteFontSize + displayLines.length * lineHeight;
  ctx.fillStyle = accentColor;
  ctx.font = `bold ${quoteFontSize * 2}px Georgia, serif`;
  ctx.textAlign = "right";
  ctx.fillText('"', width - padding, quoteEndY - quoteFontSize * 0.5);

  if (annotation.content) {
    const contentY = quoteEndY + padding;
    const contentFontSize = quoteFontSize * 0.6;
    ctx.font = `400 ${contentFontSize}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.textAlign = "center";
    
    const contentLines = wrapText(ctx, annotation.content, contentWidth * 0.85);
    const maxContentLines = isVertical ? 4 : 2;
    const displayContentLines = contentLines.slice(0, maxContentLines);
    
    displayContentLines.forEach((line, index) => {
      ctx.fillText(line, width / 2, contentY + index * contentFontSize * 1.4);
    });
  }

  const footerHeight = Math.min(height * 0.12, 100);
  const footerY = height - footerHeight - padding;
  
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(padding, footerY, contentWidth, 1);
  
  if (podcast) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = `400 ${footerHeight * 0.25}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "left";
    
    const podcastText = truncateText(ctx, podcast.title, contentWidth * 0.6);
    ctx.fillText(podcastText, padding, footerY + footerHeight * 0.4);
    
    if (episode) {
      ctx.font = `300 ${footerHeight * 0.2}px Inter, system-ui, sans-serif`;
      const epText = truncateText(ctx, episode.title, contentWidth * 0.6);
      ctx.fillText(epText, padding, footerY + footerHeight * 0.7);
    }
  }

  ctx.textAlign = "right";
  ctx.fillStyle = accentColor;
  ctx.font = `bold ${footerHeight * 0.35}px Inter, system-ui, sans-serif`;
  ctx.fillText("PODDNA", width - padding, footerY + footerHeight * 0.5);
  
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `400 ${footerHeight * 0.18}px Inter, system-ui, sans-serif`;
  ctx.fillText("poddna.io", width - padding, footerY + footerHeight * 0.75);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  const metrics = ctx.measureText(text);
  if (metrics.width <= maxWidth) return text;
  
  let truncated = text;
  while (ctx.measureText(truncated + "...").width > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + "...";
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface PlatformTextTemplate {
  platform: string;
  template: string;
  charLimit?: number;
  includesLink: boolean;
  instructions: string;
}

export function generatePlatformText(
  annotation: Annotation,
  episode?: Episode,
  podcast?: Podcast,
  shareUrl?: string
): Record<string, PlatformTextTemplate> {
  const quote = `"${annotation.text}"`;
  const podcastName = podcast?.title || "Podcast";
  const episodeName = episode?.title || "Episode";
  const url = shareUrl || `https://poddna.io/episode/${annotation.episodeId}?annotation=${annotation.id}`;
  const shortContent = annotation.content ? annotation.content.slice(0, 100) + (annotation.content.length > 100 ? "..." : "") : "";
  
  return {
    twitter: {
      platform: "Twitter/X",
      template: `${quote}\n\n${shortContent}\n\nMore context: ${url}\n\nvia @PODDNA | poddna.io`,
      charLimit: 280,
      includesLink: true,
      instructions: "Copy and paste into a new tweet. The link will preview automatically.",
    },
    linkedin: {
      platform: "LinkedIn",
      template: `${quote}\n\n${annotation.content || ""}\n\n🎙️ From "${episodeName}" on ${podcastName}\n\n🔗 Discover more insights: ${url}\n\n---\nPowered by PODDNA - poddna.io\n\n#Podcast #Insights #PODDNA`,
      charLimit: 3000,
      includesLink: true,
      instructions: "Copy and paste into a LinkedIn post. Great for professional insights!",
    },
    instagram: {
      platform: "Instagram",
      template: `${quote}\n\n${annotation.content || ""}\n\n🎙️ ${podcastName} - ${episodeName}\n\n🔗 Full context in bio → ${url}\n\n.\n.\n.\n#podcast #podcastclips #insights #wisdom #quotes #podcastquotes #PODDNA`,
      charLimit: 2200,
      includesLink: false,
      instructions: `Copy for your caption. Update your bio link to: ${url}`,
    },
    tiktok: {
      platform: "TikTok",
      template: `${quote} 🎙️\n\n${annotation.content ? annotation.content.slice(0, 80) : ""}\n\n🔗 Full context: poddna.io\nBio: ${url}\n\n#podcast #podcastclips #viral #fyp #PODDNA`,
      charLimit: 2200,
      includesLink: false,
      instructions: `Use with your video caption. Add this to your bio: ${url}`,
    },
    youtube: {
      platform: "YouTube Comments",
      template: `${quote}\n\n${annotation.content || ""}\n\n🔗 Full breakdown with more context: ${url}\n\n- via PODDNA (poddna.io)`,
      includesLink: true,
      instructions: "Paste as a YouTube comment. Great for adding value to discussions!",
    },
    reddit: {
      platform: "Reddit",
      template: `**${quote}**\n\n${annotation.content || ""}\n\nSource: [${episodeName} - ${podcastName}](${url})\n\n*via [PODDNA](https://poddna.io)*`,
      includesLink: true,
      instructions: "Use in relevant subreddits. The markdown formatting will render nicely.",
    },
    text: {
      platform: "Plain Text",
      template: `${quote}\n\n${annotation.content || ""}\n\nFrom: ${episodeName} (${podcastName})\n\nFull context: ${url}\n\nPowered by PODDNA - https://poddna.io`,
      includesLink: true,
      instructions: "Universal format for any platform, emails, or messages.",
    },
  };
}
