import { GoogleGenAI } from "@google/genai";
import { storage } from "../storage";
import { GeminiError } from "../ai/geminiClient";
import type { Job, EpisodeSource, EpisodeSegment } from "@shared/schema";

type ProgressCallback = (message: string, percentage: number) => void;

interface VisualAnalysis {
  segmentId: string;
  visualTags: string[];
  visualCaption: string | null;
}

interface VisionEnrichResult {
  segmentsAnalyzed: number;
  segmentsEnriched: number;
}

function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

export async function handleEpisodeVisionEnrichJob(
  job: Job,
  onProgress: ProgressCallback
): Promise<VisionEnrichResult> {
  console.log(`[VISION-ENRICH] Starting job ${job.id}`);
  
  const geminiApiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const geminiBaseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  
  if (!geminiApiKey) {
    throw new GeminiError("Gemini API key not configured", false, "CONFIG_ERROR");
  }
  if (!geminiBaseUrl) {
    throw new GeminiError("Gemini API base URL not configured", false, "CONFIG_ERROR");
  }
  
  const source = await storage.getEpisodeSource(job.episodeSourceId);
  if (!source) {
    throw new GeminiError(`Episode source not found: ${job.episodeSourceId}`, false);
  }
  
  const episode = await storage.getEpisode(source.episodeId);
  if (!episode) {
    throw new GeminiError(`Episode not found: ${source.episodeId}`, false);
  }
  
  onProgress("Finding video sources and segments...", 10);
  
  const allSources = await storage.getEpisodeSourcesByEpisode(source.episodeId);
  const videoSource = allSources.find(s => s.kind === "video" && s.platform === "youtube" && s.sourceUrl);
  
  if (!videoSource?.sourceUrl) {
    console.log(`[VISION-ENRICH] No YouTube video source found for episode ${source.episodeId}`);
    return { segmentsAnalyzed: 0, segmentsEnriched: 0 };
  }
  
  const videoId = extractYouTubeVideoId(videoSource.sourceUrl);
  if (!videoId) {
    throw new GeminiError(`Could not extract YouTube video ID from URL: ${videoSource.sourceUrl}`, false);
  }
  
  const segments = await storage.getEpisodeSegmentsByEpisode(source.episodeId);
  if (segments.length === 0) {
    console.log(`[VISION-ENRICH] No segments found for episode ${source.episodeId}`);
    return { segmentsAnalyzed: 0, segmentsEnriched: 0 };
  }
  
  const highValueSegments = selectHighValueSegments(segments);
  
  if (highValueSegments.length === 0) {
    console.log(`[VISION-ENRICH] No high-value segments found for enrichment`);
    return { segmentsAnalyzed: 0, segmentsEnriched: 0 };
  }
  
  console.log(`[VISION-ENRICH] Analyzing ${highValueSegments.length} high-value segments with video ID ${videoId}`);
  
  onProgress(`Analyzing ${highValueSegments.length} segments with Gemini Vision...`, 20);
  
  const ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      apiVersion: "",
      baseUrl: geminiBaseUrl,
    },
  });
  
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let enrichedCount = 0;
  
  for (let i = 0; i < highValueSegments.length; i++) {
    const segment = highValueSegments[i];
    const progress = 20 + Math.floor((i / highValueSegments.length) * 70);
    onProgress(`Analyzing segment ${i + 1}/${highValueSegments.length}...`, progress);
    
    try {
      const analysis = await analyzeSegmentVideo(
        ai,
        youtubeUrl,
        segment,
        episode.title
      );
      
      if (analysis.visualTags.length > 0 || analysis.visualCaption) {
        await storage.updateEpisodeSegment(segment.id, {
          visualTags: analysis.visualTags,
          visualCaption: analysis.visualCaption,
        });
        enrichedCount++;
        console.log(`[VISION-ENRICH] Enriched segment ${segment.id} with ${analysis.visualTags.length} tags`);
      }
    } catch (err) {
      console.error(`[VISION-ENRICH] Error analyzing segment ${segment.id}:`, err);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  onProgress("Vision enrichment complete", 100);
  
  return {
    segmentsAnalyzed: highValueSegments.length,
    segmentsEnriched: enrichedCount,
  };
}

function selectHighValueSegments(segments: EpisodeSegment[]): EpisodeSegment[] {
  const candidates: Array<{ segment: EpisodeSegment; score: number }> = [];
  
  for (const segment of segments) {
    let score = 0;
    
    if (segment.engagementScore && segment.engagementScore > 50) {
      score += segment.engagementScore;
    }
    
    const labelLower = segment.label.toLowerCase();
    if (labelLower.includes('chart') || labelLower.includes('data') || labelLower.includes('graph')) {
      score += 30;
    }
    if (labelLower.includes('screen') || labelLower.includes('shows') || labelLower.includes('display')) {
      score += 25;
    }
    if (labelLower.includes('tweet') || labelLower.includes('twitter') || labelLower.includes('post')) {
      score += 25;
    }
    if (labelLower.includes('product') || labelLower.includes('demo') || labelLower.includes('example')) {
      score += 20;
    }
    
    if (segment.segmentType === 'topic' && segment.isAiGenerated) {
      score += 10;
    }
    
    if (segment.visualTags && segment.visualTags.length > 0) {
      score -= 100;
    }
    
    if (score > 20) {
      candidates.push({ segment, score });
    }
  }
  
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 5).map(c => c.segment);
}

async function analyzeSegmentVideo(
  ai: GoogleGenAI,
  youtubeUrl: string,
  segment: EpisodeSegment,
  episodeTitle: string
): Promise<VisualAnalysis> {
  const startTime = segment.startTime;
  const endTime = segment.endTime || (startTime + 60);
  
  const prompt = `Analyze a YouTube video segment at timestamps ${formatTime(startTime)} to ${formatTime(endTime)}.

VIDEO URL: ${youtubeUrl}
EPISODE: ${episodeTitle}
SEGMENT TOPIC: ${segment.label}

TASK: Identify any notable visual elements in this video segment. Focus on:

1. VISUAL ELEMENTS TO DETECT (tag each one found):
   - "chart" - graphs, data visualizations, statistics displays
   - "tweet" - Twitter/X posts, social media screenshots
   - "article" - news articles, blog posts, headlines
   - "product" - physical products being shown
   - "screen" - computer/phone screen shares
   - "slide" - presentation slides
   - "image" - photos, illustrations being discussed
   - "website" - website screenshots or demos
   - "document" - PDFs, papers, text documents
   - "logo" - company logos, brand imagery
   - "face" - guest appearances, interview subjects

2. Provide a brief VISUAL CAPTION (1 sentence) describing what viewers see during this segment.

RESPONSE FORMAT (JSON only):
{
  "visualTags": ["chart", "screen"],
  "visualCaption": "Host displays a bar chart comparing market performance while explaining trends."
}

If no notable visual elements are found, return:
{
  "visualTags": [],
  "visualCaption": null
}

Return ONLY valid JSON.`;

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    });
    
    const responseText = result.text || "";
    const cleanedText = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    const parsed = JSON.parse(cleanedText);
    
    return {
      segmentId: segment.id,
      visualTags: Array.isArray(parsed.visualTags) ? parsed.visualTags : [],
      visualCaption: parsed.visualCaption || null,
    };
  } catch (err) {
    console.error(`[VISION-ENRICH] Parse error:`, err);
    return {
      segmentId: segment.id,
      visualTags: [],
      visualCaption: null,
    };
  }
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
}
