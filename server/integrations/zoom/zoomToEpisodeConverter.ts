import { db } from "../../db";
import { podcasts, episodes, transcriptSegments, zoomMeetings, zoomTranscripts } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const SIGNWELL_PODCAST_ID = "signwell-internal-meetings";
const SIGNWELL_PODCAST_TITLE = "SignWell Internal Meetings";
const SIGNWELL_HOST = "SignWell Team";

interface ZoomUtterance {
  startMs: number;
  endMs: number;
  speaker: string | null;
  text: string;
}

export async function ensureSignWellPodcast(): Promise<string> {
  const existing = await db.query.podcasts.findFirst({
    where: eq(podcasts.id, SIGNWELL_PODCAST_ID),
  });

  if (existing) {
    return existing.id;
  }

  await db.insert(podcasts).values({
    id: SIGNWELL_PODCAST_ID,
    title: SIGNWELL_PODCAST_TITLE,
    host: SIGNWELL_HOST,
    description: "Internal research meetings and discussions",
  });

  return SIGNWELL_PODCAST_ID;
}

export async function convertZoomMeetingToEpisode(zoomMeetingId: string): Promise<{ episodeId: string; isNew: boolean }> {
  const meeting = await db.query.zoomMeetings.findFirst({
    where: eq(zoomMeetings.zoomMeetingId, zoomMeetingId),
  });

  if (!meeting) {
    throw new Error(`Zoom meeting not found: ${zoomMeetingId}`);
  }

  const transcript = await db.query.zoomTranscripts.findFirst({
    where: eq(zoomTranscripts.zoomMeetingId, zoomMeetingId),
  });

  if (!transcript) {
    throw new Error(`No transcript found for meeting: ${zoomMeetingId}`);
  }

  const utterances = transcript.utterancesJson as ZoomUtterance[];
  if (!utterances || utterances.length === 0) {
    throw new Error(`Empty transcript for meeting: ${zoomMeetingId}`);
  }

  await ensureSignWellPodcast();

  const existingEpisode = await db.query.episodes.findFirst({
    where: and(
      eq(episodes.externalSource, "zoom"),
      eq(episodes.externalEpisodeId, zoomMeetingId)
    ),
  });

  const durationMs = Math.max(...utterances.map(u => u.endMs));
  const durationSec = Math.ceil(durationMs / 1000);

  const episodeData = {
    podcastId: SIGNWELL_PODCAST_ID,
    title: meeting.topic || `Meeting ${zoomMeetingId}`,
    publishedAt: meeting.startTime || new Date(),
    duration: durationSec,
    type: "meeting",
    mediaUrl: `zoom://meeting/${zoomMeetingId}`,
    description: `Zoom meeting hosted by ${meeting.hostEmail}`,
    transcriptSource: "zoom",
    transcriptStatus: "ready" as const,
    status: "published",
    processingStatus: "ready_for_analysis" as const,
    externalSource: "zoom",
    externalEpisodeId: zoomMeetingId,
    visibility: "supporting" as const,
    sourceType: "zoom" as const,
    updatedAt: new Date(),
  };

  let episodeId: string;
  let isNew = false;

  if (existingEpisode) {
    await db.update(episodes)
      .set(episodeData)
      .where(eq(episodes.id, existingEpisode.id));
    episodeId = existingEpisode.id;

    await db.delete(transcriptSegments)
      .where(eq(transcriptSegments.episodeId, episodeId));
  } else {
    const [newEpisode] = await db.insert(episodes)
      .values(episodeData)
      .returning({ id: episodes.id });
    episodeId = newEpisode.id;
    isNew = true;
  }

  const segments = utterances.map((u, index) => ({
    episodeId,
    startTime: Math.floor(u.startMs / 1000),
    endTime: Math.ceil(u.endMs / 1000),
    text: u.text,
    type: "speech",
    speaker: u.speaker,
  }));

  if (segments.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < segments.length; i += batchSize) {
      const batch = segments.slice(i, i + batchSize);
      await db.insert(transcriptSegments)
        .values(batch)
        .onConflictDoNothing();
    }
  }

  return { episodeId, isNew };
}

export async function convertAllZoomMeetingsToEpisodes(): Promise<{ converted: number; errors: string[] }> {
  const meetings = await db.query.zoomMeetings.findMany();
  let converted = 0;
  const errors: string[] = [];

  for (const meeting of meetings) {
    try {
      const hasTranscript = await db.query.zoomTranscripts.findFirst({
        where: eq(zoomTranscripts.zoomMeetingId, meeting.zoomMeetingId),
      });

      if (hasTranscript) {
        await convertZoomMeetingToEpisode(meeting.zoomMeetingId);
        converted++;
      }
    } catch (error: any) {
      errors.push(`${meeting.zoomMeetingId}: ${error.message}`);
    }
  }

  return { converted, errors };
}
