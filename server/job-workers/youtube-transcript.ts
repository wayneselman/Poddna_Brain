import https from "https";
import { Innertube } from "youtubei.js";
import { db } from "../db";
import { storage } from "../storage";
import { 
  jobs, 
  episodeSources, 
  sourceTranscripts, 
  sourceTranscriptSegments,
  transcriptSegments,
  episodes,
  type Job,
  type EpisodeSource 
} from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Queues the analysis pipeline jobs after transcription completes.
 * This ensures episodes automatically progress from transcription → analysis.
 */
async function queueAnalysisPipeline(episodeSourceId: string, episodeId: string): Promise<void> {
  const analysisJobs = [
    "episode_annotate",
    "generate_chapters", 
    "detect_sponsors",
    "detect_claims",
    "extract_highlights",
  ];

  console.log(`[YOUTUBE-TRANSCRIPT] Queuing ${analysisJobs.length} analysis jobs for episode ${episodeId}`);
  
  // Check for existing jobs to avoid duplicates
  const existingJobs = await storage.getJobsByEpisodeSource(episodeSourceId);
  const existingTypes = new Set(existingJobs.map((j: { type: string }) => j.type));

  for (const jobType of analysisJobs) {
    if (existingTypes.has(jobType)) {
      console.log(`[YOUTUBE-TRANSCRIPT] Skipping ${jobType} - already exists`);
      continue;
    }
    
    try {
      await storage.createJob({
        episodeSourceId,
        type: jobType,
        status: "pending",
        attempts: 0,
      });
      console.log(`[YOUTUBE-TRANSCRIPT] Queued ${jobType} job`);
    } catch (err) {
      console.error(`[YOUTUBE-TRANSCRIPT] Failed to queue ${jobType}:`, err);
    }
  }

  // Update episode processing status to indicate analysis is underway
  await db.update(episodes)
    .set({
      processingStatus: "analyzing",
      updatedAt: new Date(),
    })
    .where(eq(episodes.id, episodeId));
    
  console.log(`[YOUTUBE-TRANSCRIPT] Updated episode ${episodeId} processing status to analyzing`);
}

/**
 * Custom error for YouTube transcript failures that may be transient.
 * YouTube A/B tests transcript panel formats - some work with youtubei.js, some don't.
 * Retrying later may hit a different panel format that works.
 */
export class YouTubeTransientError extends Error {
  public readonly transient = true;
  
  constructor(message: string) {
    super(message);
    this.name = "YouTubeTransientError";
  }
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

interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

/**
 * Fetches transcript using youtube-transcript.io API (paid, more reliable)
 */
async function fetchFromYouTubeTranscriptIO(videoId: string): Promise<TranscriptSegment[]> {
  const apiToken = process.env.YOUTUBE_TRANSCRIPT_API_TOKEN;
  if (!apiToken) {
    throw new Error("YOUTUBE_TRANSCRIPT_API_TOKEN not configured");
  }

  console.log(`[YOUTUBE-TRANSCRIPT] Trying youtube-transcript.io API...`);

  const data = JSON.stringify({ ids: [videoId] });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.youtube-transcript.io',
      path: '/api/transcripts',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${apiToken}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(body);
            // Response format: array of video results
            if (Array.isArray(parsed) && parsed.length > 0) {
              const videoResult = parsed[0];
              if (videoResult.error) {
                reject(new Error(`youtube-transcript.io: ${videoResult.error}`));
                return;
              }
              if (videoResult.tracks && videoResult.tracks.length > 0) {
                // Get the first track (usually English auto-generated)
                const track = videoResult.tracks[0];
                // API response format changed: now uses 'transcript' instead of 'segments'
                // and fields are 'start'/'dur' as strings instead of numbers
                const transcriptData = track.transcript || track.segments;
                if (transcriptData && Array.isArray(transcriptData)) {
                  const segments: TranscriptSegment[] = transcriptData.map((seg: any) => {
                    // Handle both old format (numbers) and new format (strings with 'dur' key)
                    // Guard against empty strings or undefined by coercing to Number first
                    const startVal = Number(seg.start) || 0;
                    const durVal = Number(seg.dur ?? seg.duration) || 0;
                    return {
                      text: seg.text || "",
                      start: Number.isFinite(startVal) ? Math.round(startVal * 1000) : 0, // Convert to ms
                      duration: Number.isFinite(durVal) ? Math.round(durVal * 1000) : 0,
                    };
                  }).filter((seg: TranscriptSegment) => seg.text.trim().length > 0);
                  
                  console.log(`[YOUTUBE-TRANSCRIPT] youtube-transcript.io returned ${segments.length} segments`);
                  resolve(segments);
                  return;
                }
              }
            }
            reject(new Error('youtube-transcript.io returned no transcript data'));
          } catch (error) {
            reject(new Error('Failed to parse youtube-transcript.io response'));
          }
        } else if (res.statusCode === 429) {
          reject(new Error('youtube-transcript.io: Rate limit exceeded'));
        } else if (res.statusCode === 403) {
          reject(new Error('youtube-transcript.io: Access forbidden'));
        } else if (res.statusCode === 404) {
          reject(new Error('youtube-transcript.io: Video not found'));
        } else if (res.statusCode === 503) {
          reject(new Error('youtube-transcript.io: Service temporarily unavailable'));
        } else {
          reject(new Error(`youtube-transcript.io returned status ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => reject(new Error(`youtube-transcript.io: ${error.message}`)));
    req.write(data);
    req.end();
  });
}

/**
 * Fetches transcript using youtubei.js (free fallback, less reliable)
 */
async function fetchFromYoutubeiJS(videoId: string): Promise<{ segments: TranscriptSegment[], title?: string }> {
  console.log(`[YOUTUBE-TRANSCRIPT] Trying youtubei.js fallback...`);
  
  const yt = await Innertube.create();
  const info = await yt.getInfo(videoId);
  const title = info.basic_info.title;
  
  const transcriptInfo = await info.getTranscript();
  
  if (!transcriptInfo?.transcript?.content?.body?.initial_segments) {
    throw new Error("No captions available for this YouTube video");
  }
  
  const rawSegments = transcriptInfo.transcript.content.body.initial_segments;
  
  const segments: TranscriptSegment[] = rawSegments
    .filter((seg: any) => seg.type === "TranscriptSegment")
    .map((seg: any) => ({
      text: seg.snippet?.text || "",
      start: parseInt(seg.start_ms) || 0,
      duration: (parseInt(seg.end_ms) || 0) - (parseInt(seg.start_ms) || 0),
    }))
    .filter((seg: TranscriptSegment) => seg.text.trim().length > 0);
  
  console.log(`[YOUTUBE-TRANSCRIPT] youtubei.js returned ${segments.length} segments`);
  return { segments, title };
}

export async function runYouTubeTranscriptJob(job: Job, source: EpisodeSource): Promise<void> {
  console.log(`[YOUTUBE-TRANSCRIPT] Starting job ${job.id} for source ${source.id}`);
  
  if (!source.sourceUrl) {
    throw new Error("No source URL provided for YouTube transcript job");
  }
  
  const videoId = extractYouTubeVideoId(source.sourceUrl);
  if (!videoId) {
    throw new Error(`Could not extract YouTube video ID from URL: ${source.sourceUrl}`);
  }
  
  console.log(`[YOUTUBE-TRANSCRIPT] Extracted video ID: ${videoId}`);
  
  let segments: TranscriptSegment[] = [];
  let videoTitle: string | undefined;
  let usedProvider = "youtube-transcript.io";
  
  // === TIER 1: YouTube captions (free, fastest) ===
  let captionsAvailable = true;
  let permanentVideoError: string | null = null;
  
  // Try youtube-transcript.io first (paid, more reliable)
  try {
    segments = await fetchFromYouTubeTranscriptIO(videoId);
  } catch (primaryError: any) {
    console.log(`[YOUTUBE-TRANSCRIPT] Tier 1a (youtube-transcript.io) failed: ${primaryError.message}`);
    
    // Fallback to youtubei.js
    try {
      const result = await fetchFromYoutubeiJS(videoId);
      segments = result.segments;
      videoTitle = result.title;
      usedProvider = "youtubei.js";
    } catch (fallbackError: any) {
      console.log(`[YOUTUBE-TRANSCRIPT] Tier 1b (youtubei.js) failed: ${fallbackError.message}`);
      
      // Check for permanent video-level errors (these can't be fixed by Whisper either)
      if (fallbackError.message.includes("Sign in to confirm your age")) {
        permanentVideoError = "Video is age-restricted and cannot be accessed";
      } else if (fallbackError.message.includes("Private video")) {
        permanentVideoError = "Video is private and cannot be accessed";
      } else if (fallbackError.message.includes("Video unavailable")) {
        permanentVideoError = "Video is unavailable or has been removed";
      }
      
      if (permanentVideoError) {
        throw new Error(permanentVideoError);
      }
      
      // No captions or transient failure — try Whisper
      captionsAvailable = false;
      
      // Check if error is transient (rate limits, etc.)
      const isTransient = fallbackError.message.includes("status code 400") || 
                         fallbackError.message.includes("ParsingError") ||
                         fallbackError.message.includes("Type mismatch") ||
                         primaryError.message.includes("Rate limit") ||
                         primaryError.message.includes("temporarily unavailable");
      
      if (isTransient && !fallbackError.message.includes("No captions available")) {
        // Transient caption-fetch error — retry later before trying expensive Whisper
        throw new YouTubeTransientError(`Transcript fetch failed (may work on retry): ${primaryError.message}`);
      }
      
      console.log(`[YOUTUBE-TRANSCRIPT] No YouTube captions available, trying Whisper fallback...`);
    }
  }
  
  // === TIER 2: Whisper local transcription (free, slower) ===
  if (segments.length === 0 && !captionsAvailable) {
    try {
      const { downloadAudioFromYouTube, transcribeWithWhisper } = await import("../services/whisper-transcribe");
      
      console.log(`[YOUTUBE-TRANSCRIPT] Tier 2: Downloading audio for Whisper transcription...`);
      const audioPath = await downloadAudioFromYouTube(videoId);
      
      console.log(`[YOUTUBE-TRANSCRIPT] Tier 2: Running Whisper (small model, CPU)...`);
      const whisperResult = await transcribeWithWhisper(audioPath, "small");
      
      // Clean up audio file
      try {
        const fs = await import("fs");
        fs.unlinkSync(audioPath);
        console.log(`[YOUTUBE-TRANSCRIPT] Cleaned up audio file`);
      } catch {}
      
      segments = whisperResult.segments.map(seg => ({
        text: seg.text,
        start: Math.round(seg.start * 1000), // Convert to ms
        duration: Math.round((seg.end - seg.start) * 1000),
      }));
      
      usedProvider = "whisper-local";
      console.log(`[YOUTUBE-TRANSCRIPT] Whisper produced ${segments.length} segments`);
      
    } catch (whisperError: any) {
      console.error(`[YOUTUBE-TRANSCRIPT] Tier 2 (Whisper) failed: ${whisperError.message}`);
      
      // === TIER 3: AssemblyAI (paid, best quality) ===
      if (process.env.ASSEMBLYAI_API_KEY) {
        try {
          console.log(`[YOUTUBE-TRANSCRIPT] Tier 3: Trying AssemblyAI fallback...`);
          const { downloadAudioFromYouTube } = await import("../services/whisper-transcribe");
          
          let audioPath: string;
          try {
            audioPath = await downloadAudioFromYouTube(videoId);
          } catch (dlErr: any) {
            throw new Error(`Failed to download audio for AssemblyAI: ${dlErr.message}`);
          }
          
          const assemblyResponse = await fetch("https://api.assemblyai.com/v2/upload", {
            method: "POST",
            headers: { "Authorization": process.env.ASSEMBLYAI_API_KEY! },
            body: (await import("fs")).readFileSync(audioPath),
          });
          
          if (!assemblyResponse.ok) {
            throw new Error(`AssemblyAI upload failed: ${assemblyResponse.status}`);
          }
          
          const { upload_url } = await assemblyResponse.json() as { upload_url: string };
          
          const transcriptResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
            method: "POST",
            headers: {
              "Authorization": process.env.ASSEMBLYAI_API_KEY!,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              audio_url: upload_url,
              speaker_labels: true,
            }),
          });
          
          if (!transcriptResponse.ok) {
            throw new Error(`AssemblyAI transcript request failed: ${transcriptResponse.status}`);
          }
          
          const { id: transcriptId } = await transcriptResponse.json() as { id: string };
          
          // Poll for completion (max 15 minutes)
          const maxPollTime = 15 * 60 * 1000;
          const pollStart = Date.now();
          let assemblyResult: any = null;
          
          while (Date.now() - pollStart < maxPollTime) {
            await new Promise(r => setTimeout(r, 5000));
            
            const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
              headers: { "Authorization": process.env.ASSEMBLYAI_API_KEY! },
            });
            
            const pollResult = await pollResponse.json() as any;
            
            if (pollResult.status === "completed") {
              assemblyResult = pollResult;
              break;
            } else if (pollResult.status === "error") {
              throw new Error(`AssemblyAI transcription error: ${pollResult.error}`);
            }
          }
          
          if (!assemblyResult) {
            throw new Error("AssemblyAI transcription timed out after 15 minutes");
          }
          
          // Clean up audio file
          try { (await import("fs")).unlinkSync(audioPath); } catch {}
          
          if (assemblyResult.utterances) {
            segments = assemblyResult.utterances.map((u: any) => ({
              text: u.text,
              start: u.start,
              duration: u.end - u.start,
            }));
          } else if (assemblyResult.words) {
            // Group words into sentence-level segments
            let currentSegment = { text: "", start: 0, duration: 0 };
            const assemblySegments: TranscriptSegment[] = [];
            
            for (const word of assemblyResult.words) {
              if (!currentSegment.text) {
                currentSegment.start = word.start;
              }
              currentSegment.text += (currentSegment.text ? " " : "") + word.text;
              currentSegment.duration = word.end - currentSegment.start;
              
              if (word.text.match(/[.!?]$/) || currentSegment.duration > 10000) {
                assemblySegments.push({ ...currentSegment });
                currentSegment = { text: "", start: 0, duration: 0 };
              }
            }
            if (currentSegment.text) {
              assemblySegments.push(currentSegment);
            }
            segments = assemblySegments;
          }
          
          usedProvider = "assemblyai";
          console.log(`[YOUTUBE-TRANSCRIPT] AssemblyAI produced ${segments.length} segments`);
          
        } catch (assemblyError: any) {
          console.error(`[YOUTUBE-TRANSCRIPT] Tier 3 (AssemblyAI) failed: ${assemblyError.message}`);
          throw new Error(`All transcription methods failed. YouTube captions: not available. Whisper: ${whisperError.message}. AssemblyAI: ${assemblyError.message}`);
        }
      } else {
        throw new Error(`Video has no YouTube captions and Whisper transcription failed: ${whisperError.message}`);
      }
    }
  }
  
  if (segments.length === 0) {
    throw new Error("Transcript segments were empty after filtering");
  }
  
  console.log(`[YOUTUBE-TRANSCRIPT] Using ${segments.length} segments from ${usedProvider}`);
  
  try {
    const existingTranscript = await db.query.sourceTranscripts.findFirst({
      where: eq(sourceTranscripts.episodeSourceId, source.id),
    });
    
    if (existingTranscript) {
      console.log(`[YOUTUBE-TRANSCRIPT] Deleting existing transcript ${existingTranscript.id}`);
      await db.delete(sourceTranscriptSegments)
        .where(eq(sourceTranscriptSegments.sourceTranscriptId, existingTranscript.id));
      await db.delete(sourceTranscripts)
        .where(eq(sourceTranscripts.id, existingTranscript.id));
    }
    
    const [transcript] = await db.insert(sourceTranscripts).values({
      episodeSourceId: source.id,
      provider: "youtube",
      language: "en",
    }).returning();
    
    console.log(`[YOUTUBE-TRANSCRIPT] Created source transcript ${transcript.id}`);
    
    const segmentInserts = segments.map((seg) => ({
      sourceTranscriptId: transcript.id,
      startTime: Math.round(seg.start),
      endTime: Math.round(seg.start + seg.duration),
      text: seg.text,
      speaker: null,
    }));
    
    const CHUNK_SIZE = 200;
    for (let i = 0; i < segmentInserts.length; i += CHUNK_SIZE) {
      await db.insert(sourceTranscriptSegments).values(segmentInserts.slice(i, i + CHUNK_SIZE));
    }
    
    console.log(`[YOUTUBE-TRANSCRIPT] Inserted ${segmentInserts.length} source-level segments`);
    
    // CANONICAL PATH: Also write to episode-level transcriptSegments
    const episode = await storage.getEpisode(source.episodeId);
    const hasExistingBetterTranscript = episode?.transcriptStatus === "ready" && 
      episode?.transcriptSource && episode.transcriptSource !== "youtube";
    
    if (hasExistingBetterTranscript) {
      console.log(`[YOUTUBE-TRANSCRIPT] Skipping canonical write - episode already has ${episode.transcriptSource} transcript`);
    } else {
      console.log(`[YOUTUBE-TRANSCRIPT] Writing to canonical episode-level transcriptSegments...`);

      // Delete existing episode-level segments so this write is a clean slate.
      // Using ON CONFLICT DO NOTHING below means even if a segment slipped through,
      // retries are fully safe.
      await storage.deleteAllSegmentsForEpisode(source.episodeId);

      const usedStartTimes = new Set<number>();
      const canonicalSegments = segments.map(seg => {
        let startTime = Math.floor(seg.start / 1000);
        while (usedStartTimes.has(startTime)) {
          startTime += 1;
        }
        usedStartTimes.add(startTime);
        return {
          episodeId: source.episodeId,
          startTime,
          endTime: Math.ceil((seg.start + seg.duration) / 1000),
          text: seg.text,
          type: "speech" as const,
          speaker: null as string | null,
        };
      });

      // Batch insert — much faster than one-at-a-time, and ON CONFLICT DO NOTHING
      // makes this safe to re-run on any retry without hitting the unique constraint.
      const EPISODE_CHUNK_SIZE = 200;
      for (let i = 0; i < canonicalSegments.length; i += EPISODE_CHUNK_SIZE) {
        await db.insert(transcriptSegments)
          .values(canonicalSegments.slice(i, i + EPISODE_CHUNK_SIZE))
          .onConflictDoNothing();
      }

      console.log(`[YOUTUBE-TRANSCRIPT] Inserted ${canonicalSegments.length} episode-level segments`);
      
      await db.update(episodes)
        .set({
          transcriptStatus: "ready",
          transcriptSource: "youtube",
          updatedAt: new Date(),
        })
        .where(eq(episodes.id, source.episodeId));
      
      console.log(`[YOUTUBE-TRANSCRIPT] Updated episode ${source.episodeId} status to ready`);
      
      await queueAnalysisPipeline(source.id, source.episodeId);
    }
    
    const jobResult = typeof job.result === "string" ? JSON.parse(job.result || "{}") : (job.result || {});
    const requestedAnalysis: string[] = (jobResult as any).analysisTypes || [];
    const ingestionRequestId = (jobResult as any).ingestionRequestId;
    
    if (requestedAnalysis.includes("viral_moments")) {
      console.log(`[YOUTUBE-TRANSCRIPT] Chaining detect_viral_moments for ingestion request ${ingestionRequestId}`);
      await storage.createJob({
        type: "detect_viral_moments",
        episodeSourceId: source.id,
        pipelineStage: "INTEL",
        result: { episodeId: source.episodeId, ingestionRequestId },
      });
    }

    if (ingestionRequestId) {
      try {
        await storage.updateIngestionRequest(ingestionRequestId, {
          processingSteps: [
            { step: "transcript", status: "complete", completedAt: new Date().toISOString(), provider: usedProvider },
            ...(requestedAnalysis.includes("viral_moments") ? [{ step: "viral_moments", status: "processing" }] : []),
          ],
        });
      } catch (err) {
        console.error(`[YOUTUBE-TRANSCRIPT] Failed to update ingestion request ${ingestionRequestId}:`, err);
      }
    }

    await db.update(jobs)
      .set({
        status: "done",
        result: {
          transcriptId: transcript.id,
          segmentCount: segments.length,
          videoTitle: videoTitle || "Unknown",
          language: transcript.language,
          provider: usedProvider,
        },
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, job.id));
    
    console.log(`[YOUTUBE-TRANSCRIPT] Job ${job.id} completed successfully via ${usedProvider}`);
    
  } catch (error: any) {
    console.error(`[YOUTUBE-TRANSCRIPT] Error:`, error.message);
    throw error;
  }
}
