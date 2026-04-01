import { Router } from "express";
import { z } from "zod";
import { db } from "../../db";
import { zoomMeetings, zoomTranscripts, episodes, jobs, episodeZoomAnalysis, claimInstances } from "@shared/schema";
import { requireAdminSessionOrKey } from "../../replitAuth";
import { importMeetingsByIds } from "../../integrations/zoom/zoomImport";
import { listUserRecordings } from "../../integrations/zoom/zoomRecordings";
import { sleep } from "../../integrations/zoom/sleep";
import { eq, and, desc, sql, isNull, count } from "drizzle-orm";
import type { ZoomImportResult } from "../../integrations/zoom/zoomTypes";
import multer from "multer";
import { parseMeetJamieTranscript, hasSpeakerLabels as hasMeetJamieSpeakers } from "../../integrations/zoom/meetJamieParser";
import { parsePlainText, parseDocx, hasSpeakerLabels as hasGenericSpeakers, detectFormat } from "../../integrations/zoom/genericTranscriptParser";
import { convertZoomMeetingToEpisode, convertAllZoomMeetingsToEpisodes } from "../../integrations/zoom/zoomToEpisodeConverter";
import { importFromSharedLink } from "../../integrations/zoom/zoomSharedLinkImport";
import { storage } from "../../storage";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || "/tmp/zoom-data";
const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

const importSharedLinkSchema = z.object({
  url: z.string().url(),
  autoConvert: z.boolean().default(true),
  autoAnalyze: z.boolean().default(true),
});

router.post("/import-shared-link", requireAdminSessionOrKey, async (req, res) => {
  try {
    const parsed = importSharedLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { url, autoConvert, autoAnalyze } = parsed.data;

    console.log(`[ZOOM-SHARE] Import request for: ${url}`);
    const result = await importFromSharedLink(url);

    if (!result.success) {
      return res.status(400).json(result);
    }

    let episodeId: string | number | null = null;
    let analysisJobId: string | null = null;

    if (autoConvert && result.transcriptFound) {
      try {
        const convResult = await convertZoomMeetingToEpisode(result.meetingId);
        if (convResult.episodeId) {
          episodeId = convResult.episodeId;
          console.log(`[ZOOM-SHARE] Converted to episode ${episodeId}`);

          if (autoAnalyze) {
            const [job] = await db
              .insert(jobs)
              .values({
                type: "analyze_zoom_call",
                status: "pending",
                result: { episodeId },
              })
              .returning({ id: jobs.id });
            analysisJobId = job.id;
            console.log(`[ZOOM-SHARE] Queued analysis job ${analysisJobId}`);
          }
        }
      } catch (convErr: any) {
        console.error(`[ZOOM-SHARE] Auto-convert error: ${convErr.message}`);
      }
    }

    return res.json({
      ...result,
      episodeId,
      analysisJobId,
    });
  } catch (err: any) {
    console.error(`[ZOOM-SHARE] Import error: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

const importByMeetingIdsSchema = z.object({
  meetingIds: z.array(z.string()).min(1).max(100),
  dryRun: z.boolean().default(false),
});

router.post(
  "/import-by-meeting-ids",
  requireAdminSessionOrKey,
  async (req, res) => {
    try {
      const parsed = importByMeetingIdsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      const { meetingIds, dryRun } = parsed.data;

      console.log(
        `[ZOOM] Phase 1A: Importing ${meetingIds.length} meetings${dryRun ? " (DRY RUN)" : ""}`
      );

      const result = await importMeetingsByIds(meetingIds, dryRun);

      console.log(
        `[ZOOM] Phase 1A complete: ${result.transcriptsDownloaded}/${result.meetingsRequested} transcripts downloaded`
      );

      return res.json(result);
    } catch (err: any) {
      console.error("[ZOOM] Import by meeting IDs error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

const importByDateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hostEmail: z.string().email(),
  limitMeetings: z.number().min(1).max(500).default(50),
  dryRun: z.boolean().default(false),
});

router.post("/import", requireAdminSessionOrKey, async (req, res) => {
  try {
    const parsed = importByDateRangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { from, to, hostEmail, limitMeetings, dryRun } = parsed.data;

    console.log(
      `[ZOOM] Phase 1B: Listing recordings for ${hostEmail} from ${from} to ${to}${dryRun ? " (DRY RUN)" : ""}`
    );

    const allMeetingIds: string[] = [];
    let nextPageToken: string | undefined;
    let pageCount = 0;

    let retryCount = 0;
    const maxRetries = 5;

    do {
      try {
        const listResult = await listUserRecordings(
          hostEmail,
          from,
          to,
          nextPageToken
        );

        retryCount = 0;

        for (const meeting of listResult.meetings) {
          if (allMeetingIds.length >= limitMeetings) break;
          allMeetingIds.push(String(meeting.id));
        }

        nextPageToken = listResult.next_page_token;
        pageCount++;

        await sleep(200);
      } catch (err: any) {
        if (err.message?.includes("429") && retryCount < maxRetries) {
          retryCount++;
          const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 30000);
          console.log(`[ZOOM] Rate limited, backing off ${backoffMs}ms (retry ${retryCount}/${maxRetries})...`);
          await sleep(backoffMs);
          continue;
        }
        throw err;
      }
    } while (nextPageToken && allMeetingIds.length < limitMeetings);

    console.log(
      `[ZOOM] Found ${allMeetingIds.length} meetings across ${pageCount} pages`
    );

    if (allMeetingIds.length === 0) {
      return res.json({
        meetingsRequested: 0,
        meetingsProcessed: 0,
        transcriptsFound: 0,
        transcriptsDownloaded: 0,
        missingTranscripts: [],
        errors: [],
        message: "No meetings found in date range",
      });
    }

    const result = await importMeetingsByIds(allMeetingIds, dryRun);

    console.log(
      `[ZOOM] Phase 1B complete: ${result.transcriptsDownloaded}/${result.meetingsRequested} transcripts downloaded`
    );

    return res.json(result);
  } catch (err: any) {
    console.error("[ZOOM] Import by date range error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

const inventoryQuerySchema = z.object({
  year: z.string().optional(),
});

router.get("/inventory", requireAdminSessionOrKey, async (req, res) => {
  try {
    const parsed = inventoryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const yearFilter = parsed.data.year
      ? parseInt(parsed.data.year, 10)
      : undefined;

    let meetings;
    if (yearFilter) {
      const selectFields = {
        zoomMeetingId: zoomMeetings.zoomMeetingId,
        topic: zoomMeetings.topic,
        startTime: zoomMeetings.startTime,
        durationSec: zoomMeetings.durationSec,
        hostEmail: zoomMeetings.hostEmail,
        year: zoomMeetings.year,
        companyName: zoomMeetings.companyName,
        contactName: zoomMeetings.contactName,
        meetingDate: zoomMeetings.meetingDate,
        notes: zoomMeetings.notes,
        tags: zoomMeetings.tags,
        createdAt: zoomMeetings.createdAt,
      };
      meetings = await db
        .select(selectFields)
        .from(zoomMeetings)
        .where(eq(zoomMeetings.year, yearFilter))
        .orderBy(desc(zoomMeetings.startTime));
    } else {
      const selectFields = {
        zoomMeetingId: zoomMeetings.zoomMeetingId,
        topic: zoomMeetings.topic,
        startTime: zoomMeetings.startTime,
        durationSec: zoomMeetings.durationSec,
        hostEmail: zoomMeetings.hostEmail,
        year: zoomMeetings.year,
        companyName: zoomMeetings.companyName,
        contactName: zoomMeetings.contactName,
        meetingDate: zoomMeetings.meetingDate,
        notes: zoomMeetings.notes,
        tags: zoomMeetings.tags,
        createdAt: zoomMeetings.createdAt,
      };
      meetings = await db
        .select(selectFields)
        .from(zoomMeetings)
        .orderBy(desc(zoomMeetings.startTime));
    }

    const transcripts = await db
      .select({
        zoomMeetingId: zoomTranscripts.zoomMeetingId,
        transcriptVttPath: zoomTranscripts.transcriptVttPath,
      })
      .from(zoomTranscripts);

    const transcriptMap = new Map(
      transcripts.map((t) => [t.zoomMeetingId, t.transcriptVttPath])
    );

    // Get episodes linked to zoom meetings
    const zoomEpisodes = await db
      .select({
        id: episodes.id,
        externalEpisodeId: episodes.externalEpisodeId,
      })
      .from(episodes)
      .where(eq(episodes.sourceType, "zoom"));

    const episodeMap = new Map(
      zoomEpisodes.map((e) => [e.externalEpisodeId, e.id])
    );

    // Get episodes that have analysis
    const analyzedEpisodes = await db
      .select({
        episodeId: episodeZoomAnalysis.episodeId,
      })
      .from(episodeZoomAnalysis);

    const analyzedSet = new Set(analyzedEpisodes.map((a) => a.episodeId));

    const inventory = meetings.map((m) => {
      const episodeId = episodeMap.get(m.zoomMeetingId) || null;
      return {
        zoomMeetingId: m.zoomMeetingId,
        topic: m.topic,
        startTime: m.startTime,
        durationSec: m.durationSec,
        hostEmail: m.hostEmail,
        year: m.year,
        companyName: m.companyName || null,
        contactName: m.contactName || null,
        meetingDate: m.meetingDate || null,
        notes: m.notes || null,
        tags: m.tags || null,
        hasTranscript: transcriptMap.has(m.zoomMeetingId),
        transcriptPath: transcriptMap.get(m.zoomMeetingId) || null,
        createdAt: m.createdAt,
        episodeId,
        hasAnalysis: episodeId ? analyzedSet.has(episodeId) : false,
      };
    });

    return res.json({
      total: inventory.length,
      meetings: inventory,
    });
  } catch (err: any) {
    console.error("[ZOOM] Inventory error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.get("/transcript/:meetingId", requireAdminSessionOrKey, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const meeting = await db
      .select()
      .from(zoomMeetings)
      .where(eq(zoomMeetings.zoomMeetingId, meetingId))
      .limit(1);

    if (meeting.length === 0) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    const transcript = await db
      .select()
      .from(zoomTranscripts)
      .where(eq(zoomTranscripts.zoomMeetingId, meetingId))
      .limit(1);

    if (transcript.length === 0) {
      return res.json({
        meeting: {
          zoomMeetingId: meeting[0].zoomMeetingId,
          topic: meeting[0].topic,
          startTime: meeting[0].startTime,
          durationSec: meeting[0].durationSec,
          hostEmail: meeting[0].hostEmail,
        },
        hasTranscript: false,
        utterancesJson: null,
      });
    }

    return res.json({
      meeting: {
        zoomMeetingId: meeting[0].zoomMeetingId,
        topic: meeting[0].topic,
        startTime: meeting[0].startTime,
        durationSec: meeting[0].durationSec,
        hostEmail: meeting[0].hostEmail,
      },
      hasTranscript: true,
      transcriptVttPath: transcript[0].transcriptVttPath,
      hasSpeakerLabels: transcript[0].hasSpeakerLabels,
      utterancesJson: transcript[0].utterancesJson,
      transcriptText: transcript[0].transcriptText || null,
    });
  } catch (err: any) {
    console.error("[ZOOM] Get transcript error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.post(
  "/upload-transcript",
  requireAdminSessionOrKey,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const meetingId = req.body.meetingId as string | undefined;
      const filename = req.file.originalname || "transcript.txt";
      
      let format = req.body.format as string | undefined;
      if (!format || format === "auto") {
        const content = req.file.buffer.toString("utf-8");
        format = detectFormat(filename, content);
      }

      let utterances: { speaker: string | null; startMs: number; endMs: number; text: string }[] = [];
      let title: string | null = null;
      let summary: string | null = null;
      let hasSpeakers = false;

      if (format === "meetjamie") {
        const content = req.file.buffer.toString("utf-8");
        const parsed = parseMeetJamieTranscript(content);
        utterances = parsed.utterances;
        title = parsed.title;
        summary = parsed.executiveSummary || parsed.fullSummary || null;
        hasSpeakers = hasMeetJamieSpeakers(utterances);
      } else if (format === "docx") {
        const parsed = await parseDocx(req.file.buffer, filename);
        utterances = parsed.utterances;
        title = parsed.title;
        summary = parsed.summary;
        hasSpeakers = hasGenericSpeakers(utterances);
      } else {
        const content = req.file.buffer.toString("utf-8");
        const parsed = parsePlainText(content, filename);
        utterances = parsed.utterances;
        title = parsed.title;
        summary = parsed.summary;
        hasSpeakers = hasGenericSpeakers(utterances);
      }
      
      if (utterances.length === 0) {
        return res.status(400).json({ error: "No utterances found in transcript" });
      }

      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, "0");
      
      let zoomMeetingId = meetingId;
      
      if (!zoomMeetingId) {
        zoomMeetingId = `upload_${Date.now()}`;
      }

      const transcriptDir = path.join(DATA_DIR, String(year), month, zoomMeetingId);
      await fs.mkdir(transcriptDir, { recursive: true });
      
      const ext = filename.toLowerCase().endsWith(".docx") ? "docx" : "txt";
      const transcriptPath = path.join(transcriptDir, `transcript_${format}.${ext}`);
      await fs.writeFile(transcriptPath, req.file.buffer);

      const existingMeeting = meetingId 
        ? await db.select().from(zoomMeetings).where(eq(zoomMeetings.zoomMeetingId, meetingId)).limit(1)
        : [];

      if (existingMeeting.length === 0) {
        await db.insert(zoomMeetings).values({
          zoomMeetingId,
          hostEmail: "uploaded",
          topic: title || filename || "Uploaded Transcript",
          startTime: new Date(),
          durationSec: utterances.length > 0 
            ? Math.round((utterances[utterances.length - 1].endMs - utterances[0].startMs) / 1000)
            : null,
          year,
          rawZoomJson: { source: `${format}_upload`, filename },
        });
      }

      const existingTranscript = await db
        .select()
        .from(zoomTranscripts)
        .where(eq(zoomTranscripts.zoomMeetingId, zoomMeetingId))
        .limit(1);

      if (existingTranscript.length === 0) {
        await db.insert(zoomTranscripts).values({
          zoomMeetingId,
          transcriptVttPath: transcriptPath,
          utterancesJson: utterances as any,
          hasSpeakerLabels: hasSpeakers,
          transcriptText: summary,
        });
      } else {
        await db
          .update(zoomTranscripts)
          .set({
            transcriptVttPath: transcriptPath,
            utterancesJson: utterances as any,
            hasSpeakerLabels: hasSpeakers,
            transcriptText: summary,
          })
          .where(eq(zoomTranscripts.zoomMeetingId, zoomMeetingId));
      }

      console.log(`[ZOOM] Uploaded ${format} transcript: ${utterances.length} utterances for meeting ${zoomMeetingId}`);

      let episodeId: string | null = null;
      let episodeIsNew = false;
      try {
        const result = await convertZoomMeetingToEpisode(zoomMeetingId);
        episodeId = result.episodeId;
        episodeIsNew = result.isNew;
        console.log(`[ZOOM] Converted to episode: ${episodeId} (new: ${episodeIsNew})`);
      } catch (convErr: any) {
        console.error(`[ZOOM] Episode conversion failed: ${convErr.message}`);
      }

      return res.json({
        success: true,
        zoomMeetingId,
        title,
        format,
        utteranceCount: utterances.length,
        hasSpeakerLabels: hasSpeakers,
        transcriptPath,
        episodeId,
        episodeIsNew,
      });
    } catch (err: any) {
      console.error("[ZOOM] Upload transcript error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

router.post("/convert-all-to-episodes", requireAdminSessionOrKey, async (req, res) => {
  try {
    console.log("[ZOOM] Converting all Zoom meetings to episodes...");
    const result = await convertAllZoomMeetingsToEpisodes();
    console.log(`[ZOOM] Converted ${result.converted} meetings, ${result.errors.length} errors`);
    return res.json(result);
  } catch (err: any) {
    console.error("[ZOOM] Convert all error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.post("/convert-to-episode/:meetingId", requireAdminSessionOrKey, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const result = await convertZoomMeetingToEpisode(meetingId);
    console.log(`[ZOOM] Converted meeting ${meetingId} to episode ${result.episodeId}`);
    return res.json(result);
  } catch (err: any) {
    console.error("[ZOOM] Convert to episode error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.post("/analyze/:episodeId", requireAdminSessionOrKey, async (req, res) => {
  try {
    const { episodeId } = req.params;
    const force = req.query.force === "true";

    const episode = await db.query.episodes.findFirst({
      where: eq(episodes.id, episodeId),
    });

    if (!episode) {
      return res.status(404).json({ error: "Episode not found" });
    }

    if (episode.sourceType !== "zoom") {
      return res.status(400).json({ error: "Episode is not a Zoom call (sourceType must be 'zoom')" });
    }

    const existingAnalysis = await db.query.episodeZoomAnalysis.findFirst({
      where: eq(episodeZoomAnalysis.episodeId, episodeId),
    });

    if (existingAnalysis && !force) {
      return res.status(400).json({ 
        error: "Analysis already exists. Use ?force=true to re-analyze",
        existingAnalysis: {
          version: existingAnalysis.analysisVersion,
          createdAt: existingAnalysis.createdAt,
        },
      });
    }

    const pendingJobsForEpisode = await db
      .select({ id: jobs.id, result: jobs.result })
      .from(jobs)
      .where(and(
        eq(jobs.type, "analyze_zoom_call"),
        eq(jobs.status, "pending"),
      ));

    const existingJob = pendingJobsForEpisode.find(j => {
      const payload = j.result as { episodeId?: string } | null;
      return payload?.episodeId === episodeId;
    });

    if (existingJob) {
      return res.json({ 
        message: "Analysis job already queued",
        jobId: existingJob.id,
      });
    }

    const job = await storage.createJob({
      type: "analyze_zoom_call",
      status: "pending",
      result: { episodeId } as any,
    });

    console.log(`[ZOOM] Queued analyze_zoom_call job ${job.id} for episode ${episodeId}`);

    return res.json({
      message: "Analysis job queued",
      jobId: job.id,
      episodeId,
    });
  } catch (err: any) {
    console.error("[ZOOM] Analyze error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.post("/analyze-batch", requireAdminSessionOrKey, async (req, res) => {
  try {
    const force = req.query.force === "true";

    const zoomEpisodes = await db
      .select({
        id: episodes.id,
        title: episodes.title,
        transcriptStatus: episodes.transcriptStatus,
      })
      .from(episodes)
      .where(eq(episodes.sourceType, "zoom"))
      .orderBy(desc(episodes.createdAt));

    const existingAnalyses = await db
      .select({ episodeId: episodeZoomAnalysis.episodeId })
      .from(episodeZoomAnalysis);

    const analyzedSet = new Set(existingAnalyses.map(a => a.episodeId));

    const pendingJobs = await db
      .select({ result: jobs.result })
      .from(jobs)
      .where(and(
        eq(jobs.type, "analyze_zoom_call"),
        eq(jobs.status, "pending"),
      ));

    const pendingSet = new Set(
      pendingJobs
        .map(j => (j.result as { episodeId?: string } | null)?.episodeId)
        .filter(Boolean)
    );

    const toAnalyze = zoomEpisodes.filter(ep => {
      if (ep.transcriptStatus !== "ready") return false;
      if (pendingSet.has(ep.id)) return false;
      if (!force && analyzedSet.has(ep.id)) return false;
      return true;
    });

    const createdJobs: string[] = [];
    for (const ep of toAnalyze) {
      const job = await storage.createJob({
        type: "analyze_zoom_call",
        status: "pending",
        result: { episodeId: ep.id } as any,
      });
      createdJobs.push(job.id);
    }

    console.log(`[ZOOM] Queued ${createdJobs.length} analyze_zoom_call jobs`);

    return res.json({
      message: `Queued ${createdJobs.length} analysis jobs`,
      totalZoomEpisodes: zoomEpisodes.length,
      alreadyAnalyzed: analyzedSet.size,
      jobsCreated: createdJobs.length,
    });
  } catch (err: any) {
    console.error("[ZOOM] Analyze batch error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.get("/analysis/:episodeId", requireAdminSessionOrKey, async (req, res) => {
  try {
    const { episodeId } = req.params;

    const episode = await db.query.episodes.findFirst({
      where: eq(episodes.id, episodeId),
      columns: {
        id: true,
        title: true,
        sourceType: true,
        externalEpisodeId: true,
      },
    });

    if (!episode) {
      return res.status(404).json({ error: "Episode not found" });
    }

    const analysis = await db.query.episodeZoomAnalysis.findFirst({
      where: eq(episodeZoomAnalysis.episodeId, episodeId),
    });

    if (!analysis) {
      return res.json({
        episode,
        hasAnalysis: false,
        analysis: null,
      });
    }

    const claims = await db
      .select()
      .from(claimInstances)
      .where(eq(claimInstances.episodeId, episodeId))
      .orderBy(claimInstances.startMs);

    return res.json({
      episode,
      hasAnalysis: true,
      analysisVersion: analysis.analysisVersion,
      createdAt: analysis.createdAt,
      payload: analysis.payload,
      claimInstances: claims,
    });
  } catch (err: any) {
    console.error("[ZOOM] Get analysis error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.get("/analysis-summary", requireAdminSessionOrKey, async (req, res) => {
  try {
    const zoomEpisodes = await db
      .select({
        id: episodes.id,
        title: episodes.title,
        publishedAt: episodes.publishedAt,
        transcriptStatus: episodes.transcriptStatus,
        externalEpisodeId: episodes.externalEpisodeId,
      })
      .from(episodes)
      .where(eq(episodes.sourceType, "zoom"))
      .orderBy(desc(episodes.publishedAt));

    const analyses = await db
      .select({
        episodeId: episodeZoomAnalysis.episodeId,
        analysisVersion: episodeZoomAnalysis.analysisVersion,
        createdAt: episodeZoomAnalysis.createdAt,
      })
      .from(episodeZoomAnalysis);

    const analysisMap = new Map(analyses.map(a => [a.episodeId, a]));

    const claimCounts = await db
      .select({
        episodeId: claimInstances.episodeId,
        count: count(),
      })
      .from(claimInstances)
      .groupBy(claimInstances.episodeId);

    const claimCountMap = new Map(claimCounts.map(c => [c.episodeId, Number(c.count)]));

    const summary = zoomEpisodes.map(ep => ({
      id: ep.id,
      title: ep.title,
      publishedAt: ep.publishedAt,
      transcriptStatus: ep.transcriptStatus,
      externalEpisodeId: ep.externalEpisodeId,
      hasAnalysis: analysisMap.has(ep.id),
      analysisVersion: analysisMap.get(ep.id)?.analysisVersion ?? null,
      analysisCreatedAt: analysisMap.get(ep.id)?.createdAt ?? null,
      claimInstanceCount: claimCountMap.get(ep.id) ?? 0,
    }));

    return res.json({
      total: summary.length,
      analyzed: summary.filter(s => s.hasAnalysis).length,
      episodes: summary,
    });
  } catch (err: any) {
    console.error("[ZOOM] Analysis summary error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

const updateMeetingMetadataSchema = z.object({
  companyName: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  meetingDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
});

router.patch("/meetings/:meetingId", requireAdminSessionOrKey, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const parsed = updateMeetingMetadataSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const existing = await db
      .select({ id: zoomMeetings.id })
      .from(zoomMeetings)
      .where(eq(zoomMeetings.zoomMeetingId, meetingId))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    const updateData: Record<string, any> = {};
    const data = parsed.data;

    if (data.companyName !== undefined) updateData.companyName = data.companyName;
    if (data.contactName !== undefined) updateData.contactName = data.contactName;
    if (data.meetingDate !== undefined) {
      updateData.meetingDate = data.meetingDate ? new Date(data.meetingDate) : null;
    }
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.tags !== undefined) updateData.tags = data.tags;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const [updated] = await db
      .update(zoomMeetings)
      .set(updateData)
      .where(eq(zoomMeetings.zoomMeetingId, meetingId))
      .returning({
        zoomMeetingId: zoomMeetings.zoomMeetingId,
        companyName: zoomMeetings.companyName,
        contactName: zoomMeetings.contactName,
        meetingDate: zoomMeetings.meetingDate,
        notes: zoomMeetings.notes,
        tags: zoomMeetings.tags,
      });

    console.log(`[ZOOM] Updated metadata for meeting ${meetingId}:`, updateData);
    return res.json(updated);
  } catch (err: any) {
    console.error("[ZOOM] Update meeting metadata error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.post("/backfill-metadata", requireAdminSessionOrKey, async (req, res) => {
  try {
    const { callClaudeJson } = await import("../../ai/claudeClient");
    const force = req.body?.force === true;

    const whereClause = force
      ? undefined
      : sql`${zoomMeetings.companyName} IS NULL OR ${zoomMeetings.contactName} IS NULL`;

    const meetings = await db
      .select({
        zoomMeetingId: zoomMeetings.zoomMeetingId,
        topic: zoomMeetings.topic,
        hostEmail: zoomMeetings.hostEmail,
        companyName: zoomMeetings.companyName,
        contactName: zoomMeetings.contactName,
      })
      .from(zoomMeetings)
      .where(whereClause)
      .orderBy(desc(zoomMeetings.startTime));

    const transcripts = await db
      .select({
        zoomMeetingId: zoomTranscripts.zoomMeetingId,
        utterancesJson: zoomTranscripts.utterancesJson,
      })
      .from(zoomTranscripts);

    const transcriptMap = new Map(
      transcripts.map(t => [t.zoomMeetingId, t.utterancesJson as any[]])
    );

    const MetaSchema = z.object({
      companyName: z.string().nullable(),
      contactName: z.string().nullable(),
      isInternalMeeting: z.boolean(),
    });

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let internal = 0;
    const results: Array<{ meetingId: string; topic: string | null; company: string | null; contact: string | null; isInternal: boolean }> = [];

    console.log(`[ZOOM] Backfill metadata: ${meetings.length} meetings to process (force=${force})`);

    res.writeHead(200, { "Content-Type": "application/x-ndjson" });

    for (const meeting of meetings) {
      const utterances = transcriptMap.get(meeting.zoomMeetingId);
      if (!utterances || utterances.length === 0) {
        skipped++;
        continue;
      }

      try {
        const first80 = utterances
          .slice(0, 80)
          .map((u: any) => `${u.speaker || "Unknown"}: ${u.text}`)
          .join("\n");

        const speakerNames = [...new Set(utterances.map((u: any) => u.speaker).filter(Boolean))];

        const metaPrompt = `You are analyzing a Zoom call recording. The host is from SignWell (an e-signature platform). Your job is to extract metadata.

STEP 1: Determine if this is an INTERNAL meeting (between SignWell team members only) or an EXTERNAL meeting (with a prospect/customer/partner).
- Internal indicators: topic mentions "weekly", "team", "leads", "standup", "1:1", or all speakers are known SignWell employees
- Known SignWell people: Wayne Selman, Ruben Gamez, Sam Wehbe, Carlos, Liz (SignWell team)
- If internal, set isInternalMeeting=true and return null for both companyName and contactName

STEP 2: For EXTERNAL meetings, extract:
- companyName: The BUYER/PROSPECT's company (NOT SignWell). Look for:
  * Company names mentioned in introductions ("I'm from X", "at X company", "we at X")
  * Company names in the meeting topic/title
  * References to their product, platform, or organization name
  * Even partial mentions ("we're a fintech", "our agency") — try to find the actual name
- contactName: The primary buyer/prospect participant's full name (NOT any SignWell employee)

Meeting topic: ${meeting.topic || "Unknown"}
Host: ${meeting.hostEmail || "Unknown"}
Speakers in call: ${speakerNames.join(", ")}

Transcript (first ~80 utterances):
${first80}

Return JSON: {"companyName": "string or null", "contactName": "string or null", "isInternalMeeting": true/false}`;

        const metaResult = await callClaudeJson(metaPrompt, MetaSchema, {
          model: "claude-sonnet-4-5",
          temperature: 0.1,
          maxTokens: 300,
        });

        if (metaResult.isInternalMeeting) {
          internal++;
          console.log(`[ZOOM] Backfill ${processed + 1}/${meetings.length}: ${meeting.zoomMeetingId} → INTERNAL (${meeting.topic})`);
          res.write(JSON.stringify({ i: processed + 1, id: meeting.zoomMeetingId, status: "internal", topic: meeting.topic }) + "\n");
          processed++;
          continue;
        }

        const updateData: Record<string, any> = {};
        if (force || (!meeting.companyName && metaResult.companyName)) {
          if (metaResult.companyName) updateData.companyName = metaResult.companyName;
        }
        if (force || (!meeting.contactName && metaResult.contactName)) {
          if (metaResult.contactName) updateData.contactName = metaResult.contactName;
        }

        if (Object.keys(updateData).length > 0) {
          await db
            .update(zoomMeetings)
            .set(updateData)
            .where(eq(zoomMeetings.zoomMeetingId, meeting.zoomMeetingId));
          updated++;
          results.push({
            meetingId: meeting.zoomMeetingId,
            topic: meeting.topic,
            company: metaResult.companyName,
            contact: metaResult.contactName,
            isInternal: false,
          });
          console.log(`[ZOOM] Backfill ${processed + 1}/${meetings.length}: ${meeting.zoomMeetingId} → ${metaResult.companyName || "?"} / ${metaResult.contactName || "?"}`);
          res.write(JSON.stringify({ i: processed + 1, id: meeting.zoomMeetingId, status: "updated", company: metaResult.companyName, contact: metaResult.contactName }) + "\n");
        } else {
          skipped++;
          res.write(JSON.stringify({ i: processed + 1, id: meeting.zoomMeetingId, status: "skipped" }) + "\n");
        }

        processed++;

        if (processed % 5 === 0) {
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (err: any) {
        failed++;
        console.error(`[ZOOM] Backfill error for ${meeting.zoomMeetingId}: ${err.message}`);
        res.write(JSON.stringify({ i: processed + 1, id: meeting.zoomMeetingId, status: "error", error: err.message }) + "\n");
      }
    }

    console.log(`[ZOOM] Backfill complete: ${updated} updated, ${skipped} skipped, ${internal} internal, ${failed} failed`);

    res.write(JSON.stringify({
      done: true,
      total: meetings.length,
      processed,
      updated,
      skipped,
      internal,
      failed,
    }) + "\n");
    res.end();
  } catch (err: any) {
    console.error("[ZOOM] Backfill metadata error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
