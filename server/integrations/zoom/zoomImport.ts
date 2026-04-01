import { db } from "../../db";
import { zoomMeetings, zoomTranscripts } from "@shared/schema";
import type { ZoomUtterance } from "@shared/schema";
import { getMeetingRecordings, findTranscriptFile } from "./zoomRecordings";
import { downloadTranscriptVtt } from "./zoomDownload";
import { parseVtt, hasSpeakerLabels } from "./vttParser";
import { sleep } from "./sleep";
import type { ZoomImportResult, ZoomImportError } from "./zoomTypes";
import { eq } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || "/tmp/zoom-data";

async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err: any) {
    if (err.code !== "EEXIST") throw err;
  }
}

function getYear(dateStr?: string): number {
  if (!dateStr) return new Date().getFullYear();
  const d = new Date(dateStr);
  return d.getFullYear();
}

function getMonth(dateStr?: string): string {
  if (!dateStr) return String(new Date().getMonth() + 1).padStart(2, "0");
  const d = new Date(dateStr);
  return String(d.getMonth() + 1).padStart(2, "0");
}

export async function importSingleMeeting(
  meetingId: string,
  dryRun: boolean = false
): Promise<{
  success: boolean;
  transcriptFound: boolean;
  transcriptDownloaded: boolean;
  error?: ZoomImportError;
}> {
  try {
    const recordingDetails = await getMeetingRecordings(meetingId);
    if (!recordingDetails) {
      return {
        success: false,
        transcriptFound: false,
        transcriptDownloaded: false,
        error: {
          meetingId,
          step: "fetch_recordings",
          status: 404,
          message: "No recordings found for this meeting",
        },
      };
    }

    const hostEmail = recordingDetails.host_email || "unknown";
    const transcriptFile = findTranscriptFile(recordingDetails.recording_files);
    if (!transcriptFile || !transcriptFile.download_url) {
      const year = getYear(recordingDetails.start_time);
      if (!dryRun) {
        await db
          .insert(zoomMeetings)
          .values({
            zoomMeetingId: String(recordingDetails.id),
            hostEmail,
            topic: recordingDetails.topic || null,
            startTime: recordingDetails.start_time
              ? new Date(recordingDetails.start_time)
              : null,
            durationSec: recordingDetails.duration
              ? recordingDetails.duration * 60
              : null,
            year,
            rawZoomJson: recordingDetails as any,
          })
          .onConflictDoUpdate({
            target: zoomMeetings.zoomMeetingId,
            set: {
              topic: recordingDetails.topic || null,
              startTime: recordingDetails.start_time
                ? new Date(recordingDetails.start_time)
                : null,
              durationSec: recordingDetails.duration
                ? recordingDetails.duration * 60
                : null,
              rawZoomJson: recordingDetails as any,
            },
          });
      }

      return {
        success: true,
        transcriptFound: false,
        transcriptDownloaded: false,
      };
    }

    let vttContent: string;
    let downloadRetries = 0;
    const maxDownloadRetries = 3;
    
    while (downloadRetries < maxDownloadRetries) {
      try {
        vttContent = await downloadTranscriptVtt(transcriptFile.download_url);
        break;
      } catch (err: any) {
        downloadRetries++;
        if (err.message?.includes("429") && downloadRetries < maxDownloadRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, downloadRetries), 10000);
          console.log(`[ZOOM] Download rate limited, backing off ${backoffMs}ms (retry ${downloadRetries}/${maxDownloadRetries})...`);
          await sleep(backoffMs);
          continue;
        }
        if (downloadRetries >= maxDownloadRetries) {
          return {
            success: false,
            transcriptFound: true,
            transcriptDownloaded: false,
            error: {
              meetingId,
              step: "download_transcript",
              message: err.message || "Failed to download transcript after retries",
            },
          };
        }
      }
    }
    
    if (!vttContent!) {
      return {
        success: false,
        transcriptFound: true,
        transcriptDownloaded: false,
        error: {
          meetingId,
          step: "download_transcript",
          message: "Failed to download transcript - empty content",
        },
      };
    }

    const utterances = parseVtt(vttContent);
    const hasSpeakers = hasSpeakerLabels(utterances);
    const year = getYear(recordingDetails.start_time);
    const month = getMonth(recordingDetails.start_time);
    const transcriptDir = path.join(
      DATA_DIR,
      String(year),
      month,
      String(recordingDetails.id)
    );
    const transcriptPath = path.join(transcriptDir, "transcript.vtt");

    if (!dryRun) {
      await ensureDir(transcriptDir);
      await fs.writeFile(transcriptPath, vttContent, "utf-8");

      await db
        .insert(zoomMeetings)
        .values({
          zoomMeetingId: String(recordingDetails.id),
          hostEmail,
          topic: recordingDetails.topic || null,
          startTime: recordingDetails.start_time
            ? new Date(recordingDetails.start_time)
            : null,
          durationSec: recordingDetails.duration
            ? recordingDetails.duration * 60
            : null,
          year,
          rawZoomJson: recordingDetails as any,
        })
        .onConflictDoUpdate({
          target: zoomMeetings.zoomMeetingId,
          set: {
            topic: recordingDetails.topic || null,
            startTime: recordingDetails.start_time
              ? new Date(recordingDetails.start_time)
              : null,
            durationSec: recordingDetails.duration
              ? recordingDetails.duration * 60
              : null,
            rawZoomJson: recordingDetails as any,
          },
        });

      const existing = await db
        .select()
        .from(zoomTranscripts)
        .where(eq(zoomTranscripts.zoomMeetingId, String(recordingDetails.id)))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(zoomTranscripts).values({
          zoomMeetingId: String(recordingDetails.id),
          transcriptVttPath: transcriptPath,
          utterancesJson: utterances as any,
          hasSpeakerLabels: hasSpeakers,
        });
      } else {
        await db
          .update(zoomTranscripts)
          .set({
            transcriptVttPath: transcriptPath,
            utterancesJson: utterances as any,
            hasSpeakerLabels: hasSpeakers,
          })
          .where(eq(zoomTranscripts.zoomMeetingId, String(recordingDetails.id)));
      }
    }

    return {
      success: true,
      transcriptFound: true,
      transcriptDownloaded: true,
    };
  } catch (err: any) {
    return {
      success: false,
      transcriptFound: false,
      transcriptDownloaded: false,
      error: {
        meetingId,
        step: "unknown",
        message: err.message || "Unknown error",
      },
    };
  }
}

export async function importMeetingsByIds(
  meetingIds: string[],
  dryRun: boolean = false,
  delayMs: number = 200
): Promise<ZoomImportResult> {
  const result: ZoomImportResult = {
    meetingsRequested: meetingIds.length,
    meetingsProcessed: 0,
    transcriptsFound: 0,
    transcriptsDownloaded: 0,
    missingTranscripts: [],
    errors: [],
  };

  for (const meetingId of meetingIds) {
    const res = await importSingleMeeting(meetingId, dryRun);
    result.meetingsProcessed++;

    if (res.transcriptFound) {
      result.transcriptsFound++;
    } else {
      result.missingTranscripts.push(meetingId);
    }

    if (res.transcriptDownloaded) {
      result.transcriptsDownloaded++;
    }

    if (res.error) {
      result.errors.push(res.error);
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return result;
}
