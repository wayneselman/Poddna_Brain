import { db } from "../../db";
import { zoomMeetings, zoomTranscripts } from "@shared/schema";
import { parseVtt, hasSpeakerLabels } from "./vttParser";
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

interface SharedLinkInfo {
  baseDomain: string;
  fileId: string;
  originalUrl: string;
}

interface ZoomRecordingInfo {
  topic: string;
  meetingStartTime: string;
  fileStartTime: number;
  duration: number;
  hostId: string;
  encryptedMeetingId: string;
  hasTranscript: boolean;
  transcriptUrl: string | null;
  ccUrl: string | null;
  mp4Url: string | null;
  recordingId: string | null;
}

export function parseSharedZoomLink(url: string): SharedLinkInfo {
  const parsed = new URL(url);
  const baseDomain = `${parsed.protocol}//${parsed.host}`;

  const playMatch = parsed.pathname.match(/\/rec\/play\/(.+)/);
  const shareMatch = parsed.pathname.match(/\/rec\/share\/(.+)/);
  const pathId = playMatch?.[1] || shareMatch?.[1];

  if (!pathId) {
    throw new Error(
      "Invalid Zoom shared link format. Expected /rec/play/... or /rec/share/..."
    );
  }

  return { baseDomain, fileId: pathId, originalUrl: url };
}

export async function resolveFileIdFromPage(
  linkInfo: SharedLinkInfo
): Promise<string> {
  const playUrl = `${linkInfo.baseDomain}/rec/play/${linkInfo.fileId}`;
  const resp = await fetch(playUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    redirect: "follow",
  });

  if (!resp.ok) {
    throw new Error(`Failed to load Zoom recording page: HTTP ${resp.status}`);
  }

  const html = await resp.text();
  const match = html.match(
    /window\.recordingMobilePlayData\s*=\s*\{[^}]*fileId:\s*'([^']+)'/
  );
  if (match) {
    return match[1];
  }

  return linkInfo.fileId;
}

export async function fetchRecordingInfo(
  baseDomain: string,
  fileId: string,
  refererUrl: string
): Promise<ZoomRecordingInfo> {
  const infoUrl = `${baseDomain}/nws/recording/1.0/play/info/${fileId}`;

  const resp = await fetch(infoUrl, {
    headers: {
      Referer: refererUrl,
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    throw new Error(
      `Failed to fetch recording info: HTTP ${resp.status}`
    );
  }

  const data = await resp.json();

  if (!data.status || data.errorCode !== 0) {
    throw new Error(
      `Zoom API error: ${data.errorMessage || "Unknown error"} (code: ${data.errorCode})`
    );
  }

  const result = data.result;
  const meet = result.meet || {};
  const recording = result.recording || {};

  let transcriptUrl: string | null = null;
  if (result.transcriptUrl) {
    transcriptUrl = result.transcriptUrl.startsWith("http")
      ? result.transcriptUrl
      : `${baseDomain}${result.transcriptUrl}`;
  }

  let ccUrl: string | null = null;
  if (result.ccUrl) {
    ccUrl = result.ccUrl.startsWith("http")
      ? result.ccUrl
      : `${baseDomain}${result.ccUrl}`;
  }

  return {
    topic: meet.topic || "Untitled Meeting",
    meetingStartTime: meet.meetingStartTimeStr || "",
    fileStartTime: result.fileStartTime || 0,
    duration: result.duration || 0,
    hostId: result.hostId || "",
    encryptedMeetingId: meet.encryptMeetingId || "",
    hasTranscript: result.hasTranscript === true,
    transcriptUrl,
    ccUrl,
    mp4Url: result.viewMp4Url || result.mp4Url || null,
    recordingId: recording.id || null,
  };
}

async function downloadVttTranscript(
  vttUrl: string,
  refererUrl: string
): Promise<string> {
  const resp = await fetch(vttUrl, {
    headers: {
      Referer: refererUrl,
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!resp.ok) {
    throw new Error(`Failed to download VTT transcript: HTTP ${resp.status}`);
  }

  return resp.text();
}

export interface SharedLinkImportResult {
  success: boolean;
  meetingId: string;
  topic: string;
  duration: number;
  startTime: string;
  transcriptFound: boolean;
  utteranceCount: number;
  hasSpeakers: boolean;
  error?: string;
}

export async function importFromSharedLink(
  url: string
): Promise<SharedLinkImportResult> {
  const linkInfo = parseSharedZoomLink(url);

  console.log(
    `[ZOOM-SHARE] Processing shared link from ${linkInfo.baseDomain}`
  );

  const resolvedFileId = await resolveFileIdFromPage(linkInfo);
  console.log(`[ZOOM-SHARE] Resolved file ID: ${resolvedFileId.substring(0, 30)}...`);

  const info = await fetchRecordingInfo(
    linkInfo.baseDomain,
    resolvedFileId,
    url
  );

  console.log(
    `[ZOOM-SHARE] Recording: "${info.topic}" (${info.duration}s, started ${info.meetingStartTime})`
  );

  const meetingId = `shared_${Date.now()}`;
  const startDate = info.fileStartTime
    ? new Date(info.fileStartTime)
    : new Date();
  const year = startDate.getFullYear();
  const month = String(startDate.getMonth() + 1).padStart(2, "0");

  let vttContent = "";
  let utterances: any[] = [];
  let hasSpeakers = false;

  const transcriptSource = info.transcriptUrl || info.ccUrl;
  if (info.hasTranscript && transcriptSource) {
    console.log(`[ZOOM-SHARE] Downloading transcript...`);
    vttContent = await downloadVttTranscript(transcriptSource, url);
    utterances = parseVtt(vttContent);
    hasSpeakers = hasSpeakerLabels(utterances);
    console.log(
      `[ZOOM-SHARE] Parsed ${utterances.length} utterances (speakers: ${hasSpeakers})`
    );
  } else {
    console.log(`[ZOOM-SHARE] No transcript available for this recording`);
  }

  await db
    .insert(zoomMeetings)
    .values({
      zoomMeetingId: meetingId,
      hostEmail: `zoom-host-${info.hostId}`,
      topic: info.topic,
      startTime: startDate,
      durationSec: info.duration || null,
      year,
      rawZoomJson: {
        source: "shared_link",
        originalUrl: url,
        encryptedMeetingId: info.encryptedMeetingId,
        recordingId: info.recordingId,
        hostId: info.hostId,
        mp4Available: !!info.mp4Url,
      } as any,
    })
    .onConflictDoUpdate({
      target: zoomMeetings.zoomMeetingId,
      set: {
        topic: info.topic,
        startTime: startDate,
        durationSec: info.duration || null,
      },
    });

  if (utterances.length > 0) {
    const transcriptDir = path.join(DATA_DIR, String(year), month, meetingId);
    const transcriptPath = path.join(transcriptDir, "transcript.vtt");

    await ensureDir(transcriptDir);
    await fs.writeFile(transcriptPath, vttContent, "utf-8");

    const existing = await db
      .select()
      .from(zoomTranscripts)
      .where(eq(zoomTranscripts.zoomMeetingId, meetingId))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(zoomTranscripts).values({
        zoomMeetingId: meetingId,
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
        .where(eq(zoomTranscripts.zoomMeetingId, meetingId));
    }
  }

  console.log(`[ZOOM-SHARE] Successfully imported as ${meetingId}`);

  return {
    success: true,
    meetingId,
    topic: info.topic,
    duration: info.duration,
    startTime: startDate.toISOString(),
    transcriptFound: utterances.length > 0,
    utteranceCount: utterances.length,
    hasSpeakers,
  };
}
