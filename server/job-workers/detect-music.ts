import FormData from "form-data";
import fetch from "node-fetch";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import pLimit from "p-limit";
import { storage } from "../storage";
import { GeminiError } from "../ai/geminiClient";
import type { Job, InsertMusicDetection } from "@shared/schema";

const execAsync = promisify(exec);

interface AuddResult {
  status: string;
  result?: {
    artist: string;
    title: string;
    album?: string;
    release_date?: string;
    label?: string;
    timecode?: string;
    song_link?: string;
    spotify?: {
      external_urls?: {
        spotify?: string;
      };
      album?: {
        images?: Array<{ url: string; height: number; width: number }>;
      };
    };
    apple_music?: {
      url?: string;
      artwork?: {
        url?: string;
      };
    };
  };
  error?: {
    error_code?: number;
    error_message?: string;
  };
}

export interface MusicDetectionJobResult {
  songs: Array<{
    artist: string;
    title: string;
    startTime: number;
  }>;
  totalDetected: number;
}

function isYouTubeUrl(url: string): boolean {
  return url.includes("youtube.com") || url.includes("youtu.be");
}

export async function handleDetectMusicJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<MusicDetectionJobResult> {
  console.log(`[DETECT-MUSIC] Starting music detection job ${job.id}`);

  const apiToken = process.env.AUDD_API_TOKEN;
  if (!apiToken) {
    throw new GeminiError("AUDD_API_TOKEN not configured", false, "CONFIG_ERROR");
  }

  if (!job.episodeSourceId) {
    throw new GeminiError("Job missing episodeSourceId", false, "INVALID_INPUT");
  }

  const source = await storage.getEpisodeSource(job.episodeSourceId);
  if (!source) {
    throw new GeminiError(`Episode source not found: ${job.episodeSourceId}`, false, "NOT_FOUND");
  }

  const episode = await storage.getEpisode(source.episodeId);
  if (!episode) {
    throw new GeminiError(`Episode not found for source: ${job.episodeSourceId}`, false, "NOT_FOUND");
  }

  const mediaUrl = source.sourceUrl || episode.mediaUrl;
  if (!mediaUrl) {
    throw new GeminiError("No media URL available for music detection", false, "INVALID_INPUT");
  }

  const detections: InsertMusicDetection[] = [];
  const tempDir = `/tmp/music-detect-${job.id}`;

  try {
    onProgress?.("Preparing audio for analysis...", 0);

    try {
      await fs.promises.mkdir(tempDir, { recursive: true });
    } catch (err: any) {
      throw new GeminiError(`Failed to create temp directory: ${err.message}`, true, "FS_ERROR");
    }

    const audioPath = path.join(tempDir, "audio.mp3");
    onProgress?.("Downloading audio file...", 5);

    try {
      if (isYouTubeUrl(mediaUrl)) {
        console.log(`[DETECT-MUSIC] Downloading audio from YouTube: ${mediaUrl}`);
        await execAsync(
          `yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${audioPath}" "${mediaUrl}"`,
          { timeout: 600000 }
        );
      } else {
        await execAsync(`curl -L -o "${audioPath}" "${mediaUrl}"`, { timeout: 300000 });
      }
    } catch (err: any) {
      const msg = (err.message || "").toLowerCase();
      if (msg.includes("not found") || msg.includes("404") || msg.includes("unavailable")) {
        throw new GeminiError(`Audio download failed (resource not found): ${err.message}`, false, "NOT_FOUND");
      }
      throw new GeminiError(`Audio download failed: ${err.message}`, true, "DOWNLOAD_ERROR");
    }

    let totalDuration: number;
    try {
      const { stdout: durationOutput } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
      );
      totalDuration = parseFloat(durationOutput.trim());

      if (isNaN(totalDuration) || totalDuration <= 0) {
        throw new GeminiError("Could not determine audio duration", false, "INVALID_AUDIO");
      }
    } catch (err: any) {
      if (err instanceof GeminiError) throw err;
      throw new GeminiError(`FFprobe error: ${err.message}`, true, "FFPROBE_ERROR");
    }

    console.log(`[DETECT-MUSIC] Audio duration: ${totalDuration}s`);

    const segmentDuration = 15;
    const skipInterval = 60;
    const segments: { start: number; path: string }[] = [];

    onProgress?.("Splitting audio into segments...", 10);

    for (let start = 0; start < totalDuration; start += skipInterval) {
      const segmentPath = path.join(tempDir, `segment_${start}.mp3`);
      try {
        await execAsync(
          `ffmpeg -y -ss ${start} -t ${segmentDuration} -i "${audioPath}" -acodec libmp3lame -ar 44100 "${segmentPath}" 2>/dev/null`
        );
        segments.push({ start, path: segmentPath });
      } catch (err) {
        console.log(`[DETECT-MUSIC] Skipping segment at ${start}s (might be past end)`);
      }
    }

    console.log(`[DETECT-MUSIC] Created ${segments.length} segments to analyze`);
    onProgress?.(`Analyzing ${segments.length} audio segments...`, 20);

    const limit = pLimit(3);
    const detectedSongs = new Map<string, InsertMusicDetection>();
    let apiErrors: string[] = [];
    let transientErrorCount = 0;
    let permanentErrorCount = 0;
    let successfulSegmentCount = 0;

    const analyzeSegment = async (segment: { start: number; path: string }, index: number) => {
      try {
        const fileBuffer = await fs.promises.readFile(segment.path);

        const formData = new FormData();
        formData.append("api_token", apiToken);
        formData.append("file", fileBuffer, { filename: "audio.mp3", contentType: "audio/mpeg" });
        formData.append("return", "spotify,apple_music");

        let response;
        try {
          response = await fetch("https://api.audd.io/", {
            method: "POST",
            body: formData as any,
            headers: formData.getHeaders(),
          });
        } catch (fetchErr: any) {
          transientErrorCount++;
          apiErrors.push(`Network error: ${fetchErr.message}`);
          return;
        }

        if (!response.ok) {
          const status = response.status;
          if (status === 429 || status >= 500) {
            transientErrorCount++;
            apiErrors.push(`AudD API error: ${status}`);
            return;
          } else if (status === 401 || status === 403) {
            throw new GeminiError(`AudD API auth error: ${status}`, false, "AUTH_ERROR");
          } else if (status === 400 || status === 404 || status === 413) {
            permanentErrorCount++;
            apiErrors.push(`AudD error: ${status}`);
            return;
          }
          transientErrorCount++;
          apiErrors.push(`AudD API error: ${status}`);
          return;
        }

        let result: AuddResult;
        try {
          result = (await response.json()) as AuddResult;
        } catch (jsonErr: any) {
          permanentErrorCount++;
          apiErrors.push(`JSON parse error: ${jsonErr.message}`);
          return;
        }

        if (result.error) {
          const errorCode = result.error.error_code;
          if (errorCode === 300 || errorCode === 500 || errorCode === 503) {
            transientErrorCount++;
          } else {
            permanentErrorCount++;
          }
          apiErrors.push(`AudD error ${errorCode}: ${result.error.error_message}`);
          return;
        }

        if (result.status === "success") {
          successfulSegmentCount++;
          
          if (result.result) {
            const song = result.result;
            const songKey = `${song.artist}-${song.title}-${segment.start}`.toLowerCase();

            if (!detectedSongs.has(songKey)) {
              const artworkUrl =
                song.spotify?.album?.images?.[0]?.url ||
                song.apple_music?.artwork?.url?.replace("{w}", "300").replace("{h}", "300");

              detectedSongs.set(songKey, {
                episodeId: episode.id,
                startTime: segment.start,
                artist: song.artist,
                title: song.title,
                album: song.album || null,
                releaseDate: song.release_date || null,
                label: song.label || null,
                spotifyUrl: song.spotify?.external_urls?.spotify || null,
                appleMusicUrl: song.apple_music?.url || null,
                songLink: song.song_link || null,
                artworkUrl: artworkUrl || null,
              });

              console.log(`[DETECT-MUSIC] Found: ${song.artist} - ${song.title} at ${segment.start}s`);
            }
          }
        } else {
          permanentErrorCount++;
          apiErrors.push(`AudD unexpected status: ${result.status}`);
        }

        const progress = 20 + Math.round((index / segments.length) * 70);
        onProgress?.(
          `Analyzed ${index + 1}/${segments.length} segments (${detectedSongs.size} songs found)`,
          progress
        );
      } catch (err: any) {
        if (err instanceof GeminiError) throw err;
        console.error(`[DETECT-MUSIC] Error analyzing segment at ${segment.start}s:`, err);
        transientErrorCount++;
        apiErrors.push(err.message || "Unknown error");
      }
    };

    await Promise.all(segments.map((segment, index) => limit(() => analyzeSegment(segment, index))));

    const totalErrors = transientErrorCount + permanentErrorCount;
    
    console.log(`[DETECT-MUSIC] Analysis complete: ${successfulSegmentCount} successful, ${totalErrors} errors, ${detectedSongs.size} songs found`);
    
    if (successfulSegmentCount === 0 && totalErrors > 0) {
      const isTransient = transientErrorCount >= permanentErrorCount;
      throw new GeminiError(
        `Music detection failed: All ${segments.length} segments failed. ${apiErrors.slice(0, 3).join("; ")} (${transientErrorCount} transient, ${permanentErrorCount} permanent errors)`,
        isTransient,
        "API_ERROR"
      );
    }
    
    if (successfulSegmentCount === 0 && apiErrors.length > 0 && totalErrors === 0) {
      throw new GeminiError(
        `Music detection failed with unclassified errors: ${apiErrors.slice(0, 3).join("; ")}`,
        true,
        "API_ERROR"
      );
    }

    detections.push(...Array.from(detectedSongs.values()).sort((a, b) => a.startTime - b.startTime));

    // LOG ALL DETECTIONS BEFORE SAVE - Critical for cost recovery if save fails
    // This allows manual data recovery without re-running expensive API calls
    if (detections.length > 0) {
      console.log(`[DETECT-MUSIC] ========== DETECTION RESULTS (SAVE TO RECOVER) ==========`);
      console.log(`[DETECT-MUSIC] Episode ID: ${episode.id}`);
      console.log(`[DETECT-MUSIC] Episode Title: ${episode.title}`);
      console.log(`[DETECT-MUSIC] Total Songs: ${detections.length}`);
      console.log(`[DETECT-MUSIC] DETECTIONS_JSON_START`);
      console.log(JSON.stringify(detections, null, 2));
      console.log(`[DETECT-MUSIC] DETECTIONS_JSON_END`);
      console.log(`[DETECT-MUSIC] ========== END DETECTION RESULTS ==========`);
    }

    onProgress?.("Saving music detections...", 90);

    try {
      await storage.replaceMusicDetectionsForEpisode(episode.id, detections);
    } catch (err: any) {
      // Re-log the detections on error so they're visible near the error message
      console.error(`[DETECT-MUSIC] SAVE FAILED - Detections that need manual recovery:`);
      console.error(`[DETECT-MUSIC] RECOVERY_JSON: ${JSON.stringify(detections)}`);
      throw new GeminiError(`Storage error saving detections: ${err.message}`, true, "STORAGE_ERROR");
    }

    onProgress?.(`Found ${detections.length} songs`, 100);
    console.log(`[DETECT-MUSIC] Job ${job.id} complete. Found ${detections.length} unique songs.`);

    return {
      songs: detections.map((d) => ({
        artist: d.artist,
        title: d.title,
        startTime: d.startTime,
      })),
      totalDetected: detections.length,
    };
  } finally {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.error("[DETECT-MUSIC] Cleanup error:", cleanupErr);
    }
  }
}
