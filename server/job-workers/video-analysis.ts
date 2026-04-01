import { storage } from "../storage";
import type { Job, InsertVideoEvent, VideoEvent } from "@shared/schema";
import { objectStorageClient } from "../objectStorage";
import { GoogleGenAI } from "@google/genai";
import { GeminiError } from "../ai/geminiClient";
import ffmpeg from "fluent-ffmpeg";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface VideoAnalysisJobResult {
  eventCount: number;
  scenes: Array<{
    startTime: number;
    endTime: number | null;
    label: string;
  }>;
}

interface GeminiSceneResponse {
  scenes: Array<{
    start_seconds: number;
    end_seconds: number;
    description: string;
    key_elements?: string[];
  }>;
}

function parseObjectPath(objectPath: string): { bucketName: string; objectName: string } {
  let normalizedPath = objectPath;
  if (normalizedPath.startsWith("/objects/")) {
    const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
    const entityId = normalizedPath.slice("/objects/".length);
    normalizedPath = `${privateDir}/${entityId}`;
  }
  
  if (!normalizedPath.startsWith("/")) {
    normalizedPath = `/${normalizedPath}`;
  }
  
  const pathParts = normalizedPath.split("/").filter(p => p.length > 0);
  if (pathParts.length < 2) {
    throw new Error("Invalid path: must contain at least a bucket name and object name");
  }
  
  return {
    bucketName: pathParts[0],
    objectName: pathParts.slice(1).join("/"),
  };
}

async function downloadVideoToTemp(storageUrl: string): Promise<string> {
  const { bucketName, objectName } = parseObjectPath(storageUrl);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`Video file not found in storage: ${storageUrl}`);
  }
  
  const tempDir = os.tmpdir();
  const tempPath = path.join(tempDir, `video-${Date.now()}.mp4`);
  
  await new Promise<void>((resolve, reject) => {
    const writeStream = fs.createWriteStream(tempPath);
    file.createReadStream()
      .on("error", reject)
      .pipe(writeStream)
      .on("finish", resolve)
      .on("error", reject);
  });
  
  return tempPath;
}

async function extractFrames(
  videoPath: string,
  intervalSeconds: number = 10
): Promise<{ framePaths: string[]; timestamps: number[] }> {
  const tempDir = path.join(os.tmpdir(), `frames-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  
  // First, get video duration using ffprobe
  const duration = await new Promise<number>((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      
      const dur = metadata.format.duration;
      if (!dur || dur <= 0) {
        reject(new Error("Could not determine video duration - ffprobe returned no duration"));
        return;
      }
      
      resolve(dur);
    });
  });
  
  console.log(`[VIDEO-ANALYSIS] Video duration: ${duration}s`);
  
  // Calculate timestamps for frame extraction (every intervalSeconds, max 60 frames)
  const rawFrameCount = Math.ceil(duration / intervalSeconds);
  const frameCount = Math.min(rawFrameCount, 60); // Enforce max 60 frames
  
  if (frameCount === 0) {
    console.log(`[VIDEO-ANALYSIS] No frames to extract (duration too short)`);
    return { framePaths: [], timestamps: [] };
  }
  
  console.log(`[VIDEO-ANALYSIS] Extracting ${frameCount} frames at ${intervalSeconds}s intervals`);
  
  const framePaths: string[] = [];
  const timestamps: number[] = [];
  
  // Extract frames sequentially to avoid race conditions
  for (let i = 0; i < frameCount; i++) {
    const timestamp = i * intervalSeconds;
    const outputPath = path.join(tempDir, `frame-${String(i).padStart(4, "0")}.jpg`);
    
    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
          .screenshots({
            timestamps: [timestamp],
            filename: `frame-${String(i).padStart(4, "0")}.jpg`,
            folder: tempDir,
            size: "640x360",
          })
          .on("end", () => {
            if (fs.existsSync(outputPath)) {
              framePaths.push(outputPath);
              timestamps.push(timestamp);
            }
            resolve();
          })
          .on("error", (err) => {
            // Log warning but don't fail - some frames may fail to extract
            console.warn(`[VIDEO-ANALYSIS] Frame extraction warning at ${timestamp}s:`, err.message);
            resolve(); // Continue with other frames
          });
      });
    } catch (err) {
      console.warn(`[VIDEO-ANALYSIS] Unexpected error extracting frame at ${timestamp}s:`, err);
      // Continue with other frames
    }
  }
  
  console.log(`[VIDEO-ANALYSIS] Successfully extracted ${framePaths.length}/${frameCount} frames`);
  
  return { framePaths, timestamps };
}

async function analyzeFramesWithGemini(
  framePaths: string[],
  timestamps: number[],
  episodeTitle: string,
  podcastTitle: string
): Promise<GeminiSceneResponse> {
  const ai = new GoogleGenAI({
    apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY!,
    httpOptions: {
      apiVersion: "",
      baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL!,
    },
  });

  const frameContents: Array<{ inlineData: { mimeType: string; data: string }; text?: never } | { text: string; inlineData?: never }> = [];
  
  for (let i = 0; i < framePaths.length; i++) {
    const framePath = framePaths[i];
    const timestamp = timestamps[i];
    
    const frameData = fs.readFileSync(framePath);
    const base64Data = frameData.toString("base64");
    
    frameContents.push({
      text: `[Frame at ${Math.floor(timestamp / 60)}:${String(Math.floor(timestamp % 60)).padStart(2, "0")}]`,
    });
    frameContents.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Data,
      },
    });
  }

  const prompt = `You are analyzing video frames from a podcast episode to identify distinct scenes and visual moments.

EPISODE CONTEXT:
- Podcast: ${podcastTitle}
- Episode: ${episodeTitle}

FRAMES PROVIDED:
The following images are keyframes extracted at regular intervals from the video. Each frame is labeled with its timestamp.

YOUR TASK:
Analyze the visual content and identify distinct SCENES or visual segments. A scene is a coherent visual section where:
- The setting/location remains similar
- The camera angle or composition stays consistent
- The visual theme or activity is unified

For each scene, provide:
1. start_seconds: When this scene begins (use the closest frame timestamp)
2. end_seconds: When this scene ends (use the next scene's start or video end)
3. description: A concise 10-20 word description of what's happening visually
4. key_elements: 2-4 notable visual elements (people, objects, text on screen)

RULES:
- Focus on VISUAL content, not audio/speech (you can't hear the video)
- Identify 3-15 scenes depending on visual variety
- Merge similar consecutive frames into single scenes
- Note any on-screen text, graphics, or b-roll footage
- Be specific about what you SEE, not what you assume

Return ONLY valid JSON with this structure:
{
  "scenes": [
    {
      "start_seconds": 0,
      "end_seconds": 30,
      "description": "Studio interview setup with two hosts at desk",
      "key_elements": ["two hosts", "studio desk", "podcast microphones", "branded backdrop"]
    }
  ]
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            ...frameContents,
          ],
        },
      ],
    });

    const text = response.text || "";
    
    const jsonMatch = text.match(/\{[\s\S]*"scenes"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[VIDEO-ANALYSIS] Failed to parse Gemini response:", text);
      throw new GeminiError("Failed to parse scene detection response - no JSON found", false, "INVALID_JSON");
    }
    
    try {
      return JSON.parse(jsonMatch[0]) as GeminiSceneResponse;
    } catch (parseError) {
      console.error("[VIDEO-ANALYSIS] JSON parse error:", parseError);
      throw new GeminiError("Failed to parse scene detection JSON response", false, "JSON_PARSE_ERROR");
    }
  } catch (error: any) {
    // If already a GeminiError, rethrow
    if (error instanceof GeminiError) {
      throw error;
    }
    
    // Classify API errors
    const msg = (error.message || "").toLowerCase();
    const status = error.status || error.code || "";
    
    const isTransient = 
      msg.includes("resource_exhausted") ||
      msg.includes("rate limit") ||
      msg.includes("quota") ||
      msg.includes("unavailable") ||
      msg.includes("deadline") ||
      msg.includes("timeout") ||
      String(status).includes("429") ||
      String(status).includes("503") ||
      String(status).includes("500");
    
    throw new GeminiError(error.message || "Video analysis API call failed", isTransient, status);
  }
}

function cleanupTempFiles(tempVideoPath: string, framePaths: string[]) {
  try {
    if (fs.existsSync(tempVideoPath)) {
      fs.unlinkSync(tempVideoPath);
    }
    
    for (const framePath of framePaths) {
      if (fs.existsSync(framePath)) {
        fs.unlinkSync(framePath);
      }
    }
    
    if (framePaths.length > 0) {
      const frameDir = path.dirname(framePaths[0]);
      if (fs.existsSync(frameDir)) {
        const remaining = fs.readdirSync(frameDir);
        if (remaining.length === 0) {
          fs.rmdirSync(frameDir);
        }
      }
    }
  } catch (cleanupError) {
    console.warn("[VIDEO-ANALYSIS] Cleanup warning:", cleanupError);
  }
}

export async function handleVideoAnalysisJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<VideoAnalysisJobResult> {
  console.log(`[VIDEO-ANALYSIS] Starting video analysis job ${job.id}`);
  
  let source, episode, podcast;
  
  try {
    source = await storage.getEpisodeSource(job.episodeSourceId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching episode source: ${err.message}`, true, "STORAGE_ERROR");
  }
  
  if (!source) {
    throw new GeminiError(`Missing episodeSource for job ${job.id}`, false, "NOT_FOUND");
  }
  
  if (source.kind !== "video") {
    throw new GeminiError(`Source ${source.id} is not a video source (kind: ${source.kind})`, false, "INVALID_SOURCE");
  }
  
  const videoUrl = source.storageUrl;
  if (!videoUrl) {
    throw new GeminiError(`No storageUrl found for source ${source.id}. Video analysis requires uploaded videos.`, false, "NO_STORAGE_URL");
  }
  
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
  
  onProgress?.("Downloading video...", 10);
  
  let tempVideoPath = "";
  let framePaths: string[] = [];
  
  try {
    try {
      tempVideoPath = await downloadVideoToTemp(videoUrl);
    } catch (err: any) {
      const msg = (err.message || "").toLowerCase();
      const isNotFound = msg.includes("not found") || msg.includes("no such");
      throw new GeminiError(
        `Failed to download video: ${err.message}`,
        !isNotFound,
        isNotFound ? "VIDEO_NOT_FOUND" : "DOWNLOAD_ERROR"
      );
    }
    
    console.log(`[VIDEO-ANALYSIS] Downloaded video to ${tempVideoPath}`);
    
    onProgress?.("Extracting frames...", 30);
    
    let extracted, timestamps;
    try {
      const result = await extractFrames(tempVideoPath, 10);
      extracted = result.framePaths;
      timestamps = result.timestamps;
    } catch (err: any) {
      throw new GeminiError(`FFmpeg error extracting frames: ${err.message}`, true, "FFMPEG_ERROR");
    }
    
    framePaths = extracted;
    
    if (framePaths.length === 0) {
      throw new GeminiError("No frames could be extracted from video", false, "NO_FRAMES");
    }
    
    console.log(`[VIDEO-ANALYSIS] Extracted ${framePaths.length} frames`);
    onProgress?.(`Extracted ${framePaths.length} frames. Analyzing with AI...`, 50);
    
    const geminiResponse = await analyzeFramesWithGemini(
      framePaths,
      timestamps,
      episode.title,
      podcast?.title || "Unknown Podcast"
    );
    
    onProgress?.("Processing scenes...", 80);
    
    try {
      await storage.deleteVideoEventsByEpisodeSource(source.id);
    } catch (err: any) {
      throw new GeminiError(`Storage error deleting old video events: ${err.message}`, true, "STORAGE_ERROR");
    }
    
    const videoEvents: InsertVideoEvent[] = geminiResponse.scenes.map((scene) => ({
      episodeSourceId: source.id,
      startTime: Math.round(scene.start_seconds),
      endTime: scene.end_seconds ? Math.round(scene.end_seconds) : null,
      eventType: "scene",
      label: scene.description,
      payload: scene.key_elements ? { keyElements: scene.key_elements } : null,
    }));
    
    let savedEvents: VideoEvent[] = [];
    if (videoEvents.length > 0) {
      try {
        savedEvents = await storage.createVideoEvents(videoEvents);
      } catch (err: any) {
        throw new GeminiError(`Storage error saving video events: ${err.message}`, true, "STORAGE_ERROR");
      }
    }
    
    onProgress?.("Complete!", 100);
    
    console.log(`[VIDEO-ANALYSIS] Job ${job.id} complete. ${savedEvents.length} scenes detected.`);
    
    return {
      eventCount: savedEvents.length,
      scenes: geminiResponse.scenes.map(s => ({
        startTime: Math.round(s.start_seconds),
        endTime: s.end_seconds ? Math.round(s.end_seconds) : null,
        label: s.description,
      })),
    };
  } finally {
    cleanupTempFiles(tempVideoPath, framePaths);
  }
}
