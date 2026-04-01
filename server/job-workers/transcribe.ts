import { storage } from "../storage";
import type { Job } from "@shared/schema";
import {
  submitTranscriptionJob,
  pollUntilComplete,
  convertToSegmentsAsync,
} from "../assembly-transcription";
import {
  parseSharedZoomLink,
  resolveFileIdFromPage,
  fetchRecordingInfo,
} from "../integrations/zoom/zoomSharedLinkImport";
import { parseVtt, hasSpeakerLabels } from "../integrations/zoom/vttParser";

export interface TranscribeJobResult {
  assemblyJobId: string;
  segmentCount: number;
  transcriptSource: "assembly" | "zoom_vtt";
}

export async function handleTranscribeJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<TranscribeJobResult> {
  console.log(`[JOB-WORKER] Starting transcribe job ${job.id}`);

  const source = await storage.getEpisodeSource(job.episodeSourceId);
  if (!source) {
    throw new Error(`Missing episodeSource for job ${job.id}`);
  }

  let audioUrl = source.storageUrl || source.sourceUrl;
  if (!audioUrl) {
    throw new Error(`No audio URL found for source ${source.id}`);
  }

  const episode = await storage.getEpisode(source.episodeId);
  if (!episode) {
    throw new Error(`Episode not found for source ${source.id}`);
  }

  if (/zoom\.(us|com)\/rec\/(play|share)\//.test(audioUrl) || /\.zoom\.us\/rec\/(play|share)\//.test(audioUrl)) {
    try {
      console.log(`[JOB-WORKER] Detected Zoom shared link, resolving recording info...`);
      const linkInfo = parseSharedZoomLink(audioUrl);
      const fileId = await resolveFileIdFromPage(linkInfo);
      const info = await fetchRecordingInfo(linkInfo.baseDomain, fileId, audioUrl);
      console.log(`[JOB-WORKER] Zoom recording: "${info.topic}" (hasTranscript: ${info.hasTranscript})`);

      const vttSource = info.transcriptUrl || info.ccUrl;
      if (info.hasTranscript && vttSource) {
        console.log(`[JOB-WORKER] Downloading VTT transcript from Zoom (skipping AssemblyAI)...`);
        onProgress?.("Downloading Zoom VTT transcript...", 20);
        const vttResp = await fetch(vttSource, {
          headers: { Referer: audioUrl, "User-Agent": "Mozilla/5.0" },
        });
        if (!vttResp.ok) {
          throw new Error(`Failed to download VTT: HTTP ${vttResp.status}`);
        }
        const vttContent = await vttResp.text();
        const utterances = parseVtt(vttContent);
        const speakers = hasSpeakerLabels(utterances);
        console.log(`[JOB-WORKER] Parsed ${utterances.length} utterances from Zoom VTT (speakers: ${speakers})`);

        if (utterances.length > 0) {
          onProgress?.("Saving Zoom transcript segments...", 80);
          await storage.deleteAllSegmentsForEpisode(episode.id);

          const usedStartTimes = new Set<number>();
          let savedCount = 0;
          for (const u of utterances) {
            let startTime = u.startMs;
            while (usedStartTimes.has(startTime)) {
              startTime += 1;
            }
            usedStartTimes.add(startTime);
            await storage.createSegment({
              episodeId: episode.id,
              startTime,
              endTime: u.endMs,
              text: u.text,
              type: "dialogue",
              speaker: u.speaker || null,
            });
            savedCount++;
          }

          await storage.updateEpisode(episode.id, {
            transcriptStatus: "ready",
            transcriptSource: "zoom_vtt",
          });

          console.log(`[JOB-WORKER] Zoom VTT transcribe complete. ${savedCount} segments created.`);
          onProgress?.("Zoom transcript imported!", 100);

          const jobResult = typeof job.result === "string" ? JSON.parse(job.result || "{}") : (job.result || {});
          const requestedAnalysis: string[] = (jobResult as any).analysisTypes || [];
          const ingestionRequestId = (jobResult as any).ingestionRequestId;

          if (requestedAnalysis.includes("viral_moments") && source) {
            console.log(`[JOB-WORKER] Chaining detect_viral_moments for ingestion ${ingestionRequestId}`);
            await storage.createJob({
              type: "detect_viral_moments",
              episodeSourceId: source.id,
              pipelineStage: "INTEL",
              result: { episodeId: episode.id, ingestionRequestId },
            });
          }

          if (ingestionRequestId) {
            try {
              await storage.updateIngestionRequest(ingestionRequestId, {
                processingSteps: [
                  { step: "transcript", status: "complete", completedAt: new Date().toISOString(), provider: "zoom_vtt" },
                  ...(requestedAnalysis.includes("viral_moments") ? [{ step: "viral_moments", status: "processing" }] : []),
                ],
              });
            } catch (err) {
              console.error(`[JOB-WORKER] Failed to update ingestion request ${ingestionRequestId}:`, err);
            }
          }

          return {
            assemblyJobId: "zoom_vtt",
            segmentCount: savedCount,
            transcriptSource: "zoom_vtt" as const,
          };
        }
        console.warn(`[JOB-WORKER] Zoom VTT had 0 utterances, falling back to AssemblyAI via MP4...`);
      }

      if (info.mp4Url) {
        console.log(`[JOB-WORKER] No VTT available, downloading MP4 and uploading to AssemblyAI...`);
        onProgress?.("Downloading Zoom recording...", 10);
        const mp4Resp = await fetch(info.mp4Url, {
          headers: { Referer: audioUrl, "User-Agent": "Mozilla/5.0" },
        });
        if (!mp4Resp.ok || !mp4Resp.body) {
          throw new Error(`Failed to download Zoom MP4: HTTP ${mp4Resp.status}`);
        }
        const buffer = Buffer.from(await mp4Resp.arrayBuffer());
        console.log(`[JOB-WORKER] Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)}MB, uploading to AssemblyAI...`);
        onProgress?.("Uploading to AssemblyAI...", 15);
        const uploadResp = await fetch("https://api.assemblyai.com/v2/upload", {
          method: "POST",
          headers: {
            Authorization: process.env.ASSEMBLYAI_API_KEY || "",
            "Content-Type": "application/octet-stream",
          },
          body: buffer,
        });
        if (!uploadResp.ok) {
          throw new Error(`AssemblyAI upload failed: HTTP ${uploadResp.status}`);
        }
        const uploadData = await uploadResp.json() as { upload_url: string };
        audioUrl = uploadData.upload_url;
        console.log(`[JOB-WORKER] Uploaded to AssemblyAI, using upload URL for transcription`);
      } else {
        console.warn(`[JOB-WORKER] Zoom link resolved but no media URLs found`);
      }
    } catch (err: any) {
      console.error(`[JOB-WORKER] Failed to resolve Zoom shared link: ${err.message}, using original URL`);
    }
  }

  const podcast = await storage.getPodcast(episode.podcastId);

  onProgress?.("Submitting to AssemblyAI...", 10);

  const transcriptionOptions = {
    speakerLabels: true,
    knownSpeakers: podcast?.knownSpeakers || [],
    podcastTitle: podcast?.title,
    speakersExpected: 2,
    autoChapters: true,
    entityDetection: true,
    topicDetection: true,
    keyPhrases: true,
  };

  const { jobId: assemblyJobId } = await submitTranscriptionJob(audioUrl, transcriptionOptions);

  console.log(`[JOB-WORKER] AssemblyAI job submitted: ${assemblyJobId}`);
  onProgress?.(`AssemblyAI job started: ${assemblyJobId}`, 20);

  await storage.updateEpisode(episode.id, {
    assemblyJobId,
    transcriptStatus: "pending",
  });

  const transcript = await pollUntilComplete(assemblyJobId, (progress) => {
    onProgress?.(progress.message, progress.percentage);
  });

  onProgress?.("Processing transcript...", 90);

  const segments = await convertToSegmentsAsync(transcript, assemblyJobId);

  onProgress?.("Saving segments...", 95);

  await storage.deleteAllSegmentsForEpisode(episode.id);

  // Deduplicate segments with same start time by adding small offsets
  const usedStartTimes = new Set<number>();
  const deduplicatedSegments = segments.map(segment => {
    let startTime = segment.startTime;
    // If this start time is already used, add small increments until unique
    while (usedStartTimes.has(startTime)) {
      startTime += 0.001; // Add 1ms
    }
    usedStartTimes.add(startTime);
    return { ...segment, startTime };
  });

  let savedCount = 0;
  for (const segment of deduplicatedSegments) {
    await storage.createSegment({
      episodeId: episode.id,
      startTime: segment.startTime,
      endTime: segment.endTime,
      text: segment.text,
      type: segment.type,
      speaker: segment.speaker || null,
    });
    savedCount++;
  }

  await storage.updateEpisode(episode.id, {
    transcriptStatus: "ready",
    transcriptSource: "assembly",
  });

  console.log(`[JOB-WORKER] Transcribe job ${job.id} complete. ${savedCount} segments created.`);

  const jobResult = typeof job.result === "string" ? JSON.parse(job.result || "{}") : (job.result || {});
  const requestedAnalysis: string[] = (jobResult as any).analysisTypes || [];
  const ingestionRequestId = (jobResult as any).ingestionRequestId;

  if (requestedAnalysis.includes("viral_moments") && source) {
    console.log(`[JOB-WORKER] Chaining detect_viral_moments for ingestion ${ingestionRequestId}`);
    await storage.createJob({
      type: "detect_viral_moments",
      episodeSourceId: source.id,
      pipelineStage: "INTEL",
      result: { episodeId: episode.id, ingestionRequestId },
    });
  }

  if (ingestionRequestId) {
    try {
      await storage.updateIngestionRequest(ingestionRequestId, {
        processingSteps: [
          { step: "transcript", status: "complete", completedAt: new Date().toISOString(), provider: "assembly" },
          ...(requestedAnalysis.includes("viral_moments") ? [{ step: "viral_moments", status: "processing" }] : []),
        ],
      });
    } catch (err) {
      console.error(`[JOB-WORKER] Failed to update ingestion request ${ingestionRequestId}:`, err);
    }
  }

  return {
    assemblyJobId,
    segmentCount: savedCount,
    transcriptSource: "assembly",
  };
}
