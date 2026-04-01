import { GoogleGenAI } from "@google/genai";
import { storage } from "../storage";
import { GeminiError } from "../ai/geminiClient";
import type { Job, EpisodeSource, InsertVideoEvent } from "@shared/schema";

interface GeminiSceneResponse {
  scenes: Array<{
    start_seconds: number;
    end_seconds: number;
    description: string;
    key_elements: string[];
  }>;
}

interface YouTubeVideoAnalysisResult {
  scenes: Array<{
    startTime: number;
    endTime: number;
    description: string;
    keyElements: string[];
  }>;
  videoTitle?: string;
  videoDuration?: number;
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

export async function handleYouTubeVideoAnalysisJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<YouTubeVideoAnalysisResult> {
  console.log(`[YOUTUBE-VIDEO-ANALYSIS] Starting job ${job.id}`);
  
  // Validate Gemini API configuration first
  const geminiApiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const geminiBaseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  
  if (!geminiApiKey) {
    throw new GeminiError("Gemini API key not configured (AI_INTEGRATIONS_GEMINI_API_KEY)", false, "CONFIG_ERROR");
  }
  if (!geminiBaseUrl) {
    throw new GeminiError("Gemini API base URL not configured (AI_INTEGRATIONS_GEMINI_BASE_URL)", false, "CONFIG_ERROR");
  }
  
  let source, episode, podcast;
  
  try {
    source = await storage.getEpisodeSource(job.episodeSourceId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching episode source: ${err.message}`, true, "STORAGE_ERROR");
  }
  
  if (!source) {
    throw new GeminiError(`Missing episodeSource for job ${job.id}`, false, "NOT_FOUND");
  }
  
  if (source.platform !== "youtube") {
    throw new GeminiError(`Source ${source.id} is not a YouTube source (platform: ${source.platform})`, false, "INVALID_SOURCE");
  }
  
  if (!source.sourceUrl) {
    throw new GeminiError(`No sourceUrl found for source ${source.id}`, false, "NO_SOURCE_URL");
  }
  
  const videoId = extractYouTubeVideoId(source.sourceUrl);
  if (!videoId) {
    throw new GeminiError(`Could not extract YouTube video ID from URL: ${source.sourceUrl}`, false, "INVALID_URL");
  }
  
  console.log(`[YOUTUBE-VIDEO-ANALYSIS] Extracted video ID: ${videoId}`);
  
  try {
    episode = await storage.getEpisode(source.episodeId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching episode: ${err.message}`, true, "STORAGE_ERROR");
  }
  
  if (!episode) {
    throw new GeminiError(`Episode not found for source ${source.id}`, false, "NOT_FOUND");
  }
  
  try {
    podcast = await storage.getPodcast(episode.podcastId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching podcast: ${err.message}`, true, "STORAGE_ERROR");
  }
  
  onProgress?.("Analyzing YouTube video with Gemini AI...", 20);
  
  const ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      apiVersion: "",
      baseUrl: geminiBaseUrl,
    },
  });
  
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  const prompt = `You are analyzing a YouTube video from a podcast episode to identify distinct scenes and visual moments.

EPISODE CONTEXT:
- Podcast: ${podcast?.title || "Unknown Podcast"}
- Episode: ${episode.title}
- YouTube URL: ${youtubeUrl}

YOUR TASK:
Watch and analyze the video content to identify distinct SCENES or visual segments. A scene is a coherent visual section where:
- The setting/location remains similar
- The camera angle or composition stays consistent
- The visual theme or activity is unified

For each scene, provide:
1. start_seconds: When this scene begins (in seconds from start)
2. end_seconds: When this scene ends (in seconds from start)
3. description: A concise 10-20 word description of what's happening visually
4. key_elements: 2-4 notable visual elements (people, objects, text on screen, graphics)

RULES:
- Watch the ENTIRE video to identify all major scenes
- Identify 5-20 scenes depending on visual variety and video length
- Note any on-screen text, graphics, b-roll footage, or visual transitions
- Include intro/outro sequences if they have distinct visuals
- Be specific about what you SEE in each scene
- For podcast videos, note when different topics are discussed if there are visual cues

Return ONLY valid JSON with this structure:
{
  "scenes": [
    {
      "start_seconds": 0,
      "end_seconds": 30,
      "description": "Intro animation with podcast logo and branding",
      "key_elements": ["podcast logo", "animated graphics", "title text"]
    },
    {
      "start_seconds": 30,
      "end_seconds": 300,
      "description": "Studio setup with hosts seated at desk discussing topic",
      "key_elements": ["two hosts", "studio desk", "podcast microphones", "branded backdrop"]
    }
  ]
}`;

  console.log(`[YOUTUBE-VIDEO-ANALYSIS] Sending request to Gemini with YouTube URL: ${youtubeUrl}`);
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: youtubeUrl,
                mimeType: "video/mp4",
              },
            },
            { text: prompt },
          ],
        },
      ],
    });
    
    onProgress?.("Parsing Gemini response...", 70);
    
    const text = response.text || "";
    console.log(`[YOUTUBE-VIDEO-ANALYSIS] Gemini response length: ${text.length} chars`);
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*"scenes"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[YOUTUBE-VIDEO-ANALYSIS] Failed to parse Gemini response:", text.substring(0, 500));
      throw new Error("Failed to parse scene detection response from Gemini");
    }
    
    // Clean up common JSON issues from AI responses
    let cleanedJson = jsonMatch[0]
      // Remove trailing commas before ] or }
      .replace(/,(\s*[\]}])/g, '$1')
      // Fix unquoted property names
      .replace(/(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
      // Remove control characters
      .replace(/[\x00-\x1F\x7F]/g, '')
      // Fix double quotes inside strings (common LLM error)
      .replace(/:\s*"([^"]*)"([^",\}\]]*)"([^"]*)"(\s*[,\}\]])/g, ':"$1\'$2\'$3"$4');
    
    let geminiResponse: GeminiSceneResponse;
    try {
      geminiResponse = JSON.parse(cleanedJson) as GeminiSceneResponse;
    } catch (parseError) {
      console.error("[YOUTUBE-VIDEO-ANALYSIS] JSON parse error:", parseError);
      console.error("[YOUTUBE-VIDEO-ANALYSIS] Raw JSON (first 2000 chars):", cleanedJson.substring(0, 2000));
      
      // Try to extract individual scenes as a fallback
      try {
        const scenesArray: any[] = [];
        const scenePattern = /\{\s*"start_seconds"\s*:\s*(\d+)\s*,\s*"end_seconds"\s*:\s*(\d+)\s*,\s*"description"\s*:\s*"([^"]+)"\s*,\s*"key_elements"\s*:\s*\[([^\]]*)\]\s*\}/g;
        let match;
        while ((match = scenePattern.exec(cleanedJson)) !== null) {
          const keyElements = match[4].split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(s => s);
          scenesArray.push({
            start_seconds: parseInt(match[1]),
            end_seconds: parseInt(match[2]),
            description: match[3],
            key_elements: keyElements
          });
        }
        if (scenesArray.length > 0) {
          console.log(`[YOUTUBE-VIDEO-ANALYSIS] Recovered ${scenesArray.length} scenes using regex fallback`);
          geminiResponse = { scenes: scenesArray };
        } else {
          throw new Error("Invalid JSON in Gemini response and regex fallback failed");
        }
      } catch (fallbackError) {
        throw new Error("Invalid JSON in Gemini response");
      }
    }
    
    if (!geminiResponse.scenes || geminiResponse.scenes.length === 0) {
      console.warn("[YOUTUBE-VIDEO-ANALYSIS] No scenes detected in video");
      return { scenes: [] };
    }
    
    console.log(`[YOUTUBE-VIDEO-ANALYSIS] Detected ${geminiResponse.scenes.length} scenes`);
    onProgress?.(`Detected ${geminiResponse.scenes.length} scenes. Saving...`, 85);
    
    // Clear existing video events for this source
    try {
      await storage.deleteVideoEventsByEpisodeSource(source.id);
    } catch (err: any) {
      throw new GeminiError(`Storage error deleting old video events: ${err.message}`, true, "STORAGE_ERROR");
    }
    
    // Map scenes to video events and insert
    const videoEvents: InsertVideoEvent[] = geminiResponse.scenes.map((scene) => ({
      episodeSourceId: source.id,
      startTime: scene.start_seconds,
      endTime: scene.end_seconds,
      eventType: "scene" as const,
      label: scene.description,
      payload: {
        key_elements: scene.key_elements,
        source: "gemini-youtube",
      },
    }));
    
    try {
      for (const event of videoEvents) {
        await storage.createVideoEvent(event);
      }
    } catch (err: any) {
      throw new GeminiError(`Storage error saving video events: ${err.message}`, true, "STORAGE_ERROR");
    }
    
    console.log(`[YOUTUBE-VIDEO-ANALYSIS] Inserted ${videoEvents.length} video events`);
    onProgress?.("Video analysis complete!", 100);
    
    return {
      scenes: geminiResponse.scenes.map((s) => ({
        startTime: s.start_seconds,
        endTime: s.end_seconds,
        description: s.description,
        keyElements: s.key_elements,
      })),
    };
    
  } catch (error: any) {
    console.error(`[YOUTUBE-VIDEO-ANALYSIS] Error:`, error.message);
    
    // If already a GeminiError, preserve its transient classification
    if (error instanceof GeminiError) {
      throw error;
    }
    
    // Classify errors as transient or permanent for non-GeminiError exceptions
    const msg = (error.message || "").toLowerCase();
    const status = error.status || error.code || "";
    
    // Transient errors that should be retried
    const isTransient = 
      msg.includes("resource_exhausted") ||
      msg.includes("rate limit") ||
      msg.includes("quota") ||
      msg.includes("unavailable") ||
      msg.includes("deadline") ||
      msg.includes("timeout") ||
      msg.includes("econnreset") ||
      msg.includes("enotfound") ||
      msg.includes("etimedout") ||
      String(status).includes("429") ||
      String(status).includes("503") ||
      String(status).includes("500");
    
    // Permanent errors that should fail fast
    const isPermanent = 
      msg.includes("permission_denied") ||
      msg.includes("invalid_argument") ||
      msg.includes("not_found") ||
      msg.includes("failed to parse") ||
      msg.includes("invalid json") ||
      String(status).includes("400") ||
      String(status).includes("403") ||
      String(status).includes("404");
    
    let errorMessage = error.message;
    if (msg.includes("permission_denied")) {
      errorMessage = "Gemini API permission denied. Check API key configuration.";
    } else if (msg.includes("resource_exhausted")) {
      errorMessage = "Gemini API rate limit exceeded. Try again later.";
    } else if (msg.includes("invalid_argument")) {
      errorMessage = "Invalid request to Gemini API. The video may be too long or unavailable.";
    }
    
    // Throw as GeminiError so job runner can classify correctly
    throw new GeminiError(errorMessage, isTransient && !isPermanent, status);
  }
}
