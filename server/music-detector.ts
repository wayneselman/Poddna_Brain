import FormData from "form-data";
import fetch from "node-fetch";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import pLimit from "p-limit";
import type { InsertMusicDetection } from "@shared/schema";

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

export interface MusicDetectorProgress {
  stage: string;
  progress: number;
  message: string;
}

export type ProgressCallback = (progress: MusicDetectorProgress) => void;

function isYouTubeUrl(url: string): boolean {
  return url.includes("youtube.com") || url.includes("youtu.be");
}

export async function detectMusicInEpisode(
  mediaUrl: string,
  episodeId: string,
  onProgress?: ProgressCallback
): Promise<InsertMusicDetection[]> {
  const apiToken = process.env.AUDD_API_TOKEN;
  if (!apiToken) {
    throw new Error("AUDD_API_TOKEN not configured");
  }

  const detections: InsertMusicDetection[] = [];
  const tempDir = `/tmp/music-detect-${episodeId}`;

  try {
    onProgress?.({ stage: "preparing", progress: 0, message: "Preparing audio for analysis..." });

    await fs.promises.mkdir(tempDir, { recursive: true });

    const audioPath = path.join(tempDir, "audio.mp3");
    onProgress?.({ stage: "downloading", progress: 5, message: "Downloading audio file..." });

    if (isYouTubeUrl(mediaUrl)) {
      console.log(`[MusicDetector] Downloading audio from YouTube: ${mediaUrl}`);
      await execAsync(
        `yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${audioPath}" "${mediaUrl}"`,
        { timeout: 600000 }
      );
    } else {
      await execAsync(`curl -L -o "${audioPath}" "${mediaUrl}"`, { timeout: 300000 });
    }

    const { stdout: durationOutput } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
    );
    const totalDuration = parseFloat(durationOutput.trim());

    if (isNaN(totalDuration) || totalDuration <= 0) {
      throw new Error("Could not determine audio duration");
    }

    console.log(`[MusicDetector] Audio duration: ${totalDuration}s`);

    const segmentDuration = 15;
    const skipInterval = 60;
    const segments: { start: number; path: string }[] = [];

    onProgress?.({ stage: "splitting", progress: 10, message: "Splitting audio into segments..." });

    for (let start = 0; start < totalDuration; start += skipInterval) {
      const segmentPath = path.join(tempDir, `segment_${start}.mp3`);
      try {
        await execAsync(
          `ffmpeg -y -ss ${start} -t ${segmentDuration} -i "${audioPath}" -acodec libmp3lame -ar 44100 "${segmentPath}" 2>/dev/null`
        );
        segments.push({ start, path: segmentPath });
      } catch (err) {
        console.log(`[MusicDetector] Skipping segment at ${start}s (might be past end)`);
      }
    }

    console.log(`[MusicDetector] Created ${segments.length} segments to analyze`);
    onProgress?.({ stage: "analyzing", progress: 20, message: `Analyzing ${segments.length} audio segments...` });

    const limit = pLimit(3);
    const detectedSongs = new Map<string, InsertMusicDetection>();

    const analyzeSegment = async (segment: { start: number; path: string }, index: number) => {
      try {
        const fileBuffer = await fs.promises.readFile(segment.path);
        
        const formData = new FormData();
        formData.append("api_token", apiToken);
        formData.append("file", fileBuffer, { filename: "audio.mp3", contentType: "audio/mpeg" });
        formData.append("return", "spotify,apple_music");

        const response = await fetch("https://api.audd.io/", {
          method: "POST",
          body: formData as any,
          headers: formData.getHeaders(),
        });

        const result = (await response.json()) as AuddResult;

        if (result.status === "success" && result.result) {
          const song = result.result;
          const songKey = `${song.artist}-${song.title}`.toLowerCase();

          if (!detectedSongs.has(songKey)) {
            const artworkUrl = song.spotify?.album?.images?.[0]?.url || 
              song.apple_music?.artwork?.url?.replace("{w}", "300").replace("{h}", "300");

            detectedSongs.set(songKey, {
              episodeId,
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

            console.log(`[MusicDetector] Found: ${song.artist} - ${song.title} at ${segment.start}s`);
          }
        }

        const progress = 20 + Math.round((index / segments.length) * 70);
        onProgress?.({ 
          stage: "analyzing", 
          progress, 
          message: `Analyzed ${index + 1}/${segments.length} segments (${detectedSongs.size} songs found)` 
        });

      } catch (err) {
        console.error(`[MusicDetector] Error analyzing segment at ${segment.start}s:`, err);
      }
    };

    await Promise.all(
      segments.map((segment, index) => limit(() => analyzeSegment(segment, index)))
    );

    detections.push(...Array.from(detectedSongs.values()).sort((a, b) => a.startTime - b.startTime));

    onProgress?.({ stage: "complete", progress: 100, message: `Found ${detections.length} songs` });
    console.log(`[MusicDetector] Detection complete. Found ${detections.length} unique songs.`);

  } finally {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.error("[MusicDetector] Cleanup error:", cleanupErr);
    }
  }

  return detections;
}
