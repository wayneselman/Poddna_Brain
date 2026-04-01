import { storage } from "../storage";
import type { UserClipRequest } from "@shared/schema";

const USER_SUBMISSIONS_PODCAST_TITLE = "User Submissions";
const STALE_REQUEST_TIMEOUT_MINUTES = 30;

async function getOrCreateUserSubmissionsPodcast(): Promise<string> {
  const existing = await storage.getPodcastByTitle(USER_SUBMISSIONS_PODCAST_TITLE);
  if (existing) {
    return existing.id;
  }
  
  const podcast = await storage.createPodcast({
    title: USER_SUBMISSIONS_PODCAST_TITLE,
    host: "Community",
    description: "User-submitted YouTube videos for clip generation",
  });
  
  console.log(`[USER-CLIP] Created user submissions podcast: ${podcast.id}`);
  return podcast.id;
}

export async function processUserClipRequest(request: UserClipRequest): Promise<void> {
  console.log(`[USER-CLIP] Processing request ${request.id} for video ${request.youtubeVideoId}`);

  try {
    await storage.updateUserClipRequest(request.id, {
      status: "analyzing",
      statusMessage: "Setting up video for analysis...",
    });

    let episodeId = request.episodeId;
    let episodeSourceId: string | null = null;

    if (!episodeId) {
      const existingSource = await storage.getEpisodeSourceByYouTubeId(request.youtubeVideoId);

      if (existingSource) {
        episodeId = existingSource.episodeId;
        episodeSourceId = existingSource.id;
        console.log(`[USER-CLIP] Found existing episode ${episodeId} for video ${request.youtubeVideoId}`);
      } else {
        const userSubmissionsPodcastId = await getOrCreateUserSubmissionsPodcast();
        
        const episode = await storage.createEpisode({
          title: `YouTube Video ${request.youtubeVideoId}`,
          podcastId: userSubmissionsPodcastId,
          publishedAt: new Date(),
          duration: 0,
          type: "video",
          mediaUrl: request.youtubeUrl,
        });
        episodeId = episode.id;
        console.log(`[USER-CLIP] Created new episode ${episodeId}`);

        const source = await storage.createEpisodeSource({
          episodeId: episodeId,
          kind: "video",
          platform: "youtube",
          sourceUrl: request.youtubeUrl,
          isCanonical: true,
        });
        episodeSourceId = source.id;
        console.log(`[USER-CLIP] Created episode source ${episodeSourceId}`);
      }

      await storage.updateUserClipRequest(request.id, {
        episodeId: episodeId,
      });
    } else {
      const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
      const youtubeSource = sources.find((s: any) => s.platform === "youtube");
      if (youtubeSource) {
        episodeSourceId = youtubeSource.id;
      }
    }

    const existingMoments = await storage.getViralMomentsByEpisode(episodeId!);
    
    if (existingMoments.length > 0) {
      console.log(`[USER-CLIP] Found ${existingMoments.length} existing viral moments for episode ${episodeId}`);
      
      await storage.updateUserClipRequest(request.id, {
        status: "complete",
        statusMessage: `Found ${existingMoments.length} viral clips ready to view!`,
        completedAt: new Date(),
      });
      return;
    }

    const existingSegments = await storage.getSegmentsByEpisode(episodeId!);
    
    if (existingSegments.length === 0) {
      await storage.updateUserClipRequest(request.id, {
        status: "analyzing",
        statusMessage: "Fetching video transcript...",
      });

      await storage.createJob({
        type: "youtube_transcript",
        episodeSourceId: episodeSourceId,
        pipelineStage: "INGEST",
        result: { 
          episodeId: episodeId,
          userClipRequestId: request.id,
        },
      });

      console.log(`[USER-CLIP] Created youtube_transcript job for request ${request.id}`);
    } else {
      await storage.updateUserClipRequest(request.id, {
        status: "analyzing",
        statusMessage: "Detecting viral moments using AI...",
      });

      await storage.createJob({
        type: "detect_viral_moments",
        episodeSourceId: episodeSourceId,
        pipelineStage: "INTEL",
        result: { 
          episodeId: episodeId,
          userClipRequestId: request.id,
        },
      });

      console.log(`[USER-CLIP] Created detect_viral_moments job for request ${request.id}`);
    }

  } catch (error: any) {
    console.error(`[USER-CLIP] Error processing request ${request.id}:`, error.message);
    
    await storage.updateUserClipRequest(request.id, {
      status: "failed",
      statusMessage: `Error: ${error.message}`,
    });
  }
}

export async function runUserClipRequestProcessor(): Promise<number> {
  const pendingRequests = await storage.getPendingUserClipRequests();
  const analyzingRequests = await storage.getAnalyzingUserClipRequests();
  
  let processed = 0;
  
  if (pendingRequests.length > 0) {
    console.log(`[USER-CLIP] Found ${pendingRequests.length} pending clip request(s)`);
    for (const request of pendingRequests) {
      await processUserClipRequest(request);
      processed++;
    }
  }
  
  for (const request of analyzingRequests) {
    const requestAgeMinutes = (Date.now() - new Date(request.createdAt).getTime()) / (1000 * 60);
    if (requestAgeMinutes > STALE_REQUEST_TIMEOUT_MINUTES) {
      await storage.updateUserClipRequest(request.id, {
        status: "failed",
        statusMessage: "Request timed out after 30 minutes. The video may be too long or the analysis encountered an issue. Please try again.",
        error: "Processing timed out — no results were returned within the allowed time window.",
      });
      console.log(`[USER-CLIP] Timed out request ${request.id} after ${Math.round(requestAgeMinutes)} minutes`);
      processed++;
      continue;
    }

    if (!request.episodeId) continue;
    
    const moments = await storage.getViralMomentsByEpisode(request.episodeId);
    if (moments.length > 0) {
      await storage.updateUserClipRequest(request.id, {
        status: "complete",
        statusMessage: `Found ${moments.length} viral clips ready to view!`,
        momentsFound: moments.length,
        clipsReady: moments.length,
        completedAt: new Date(),
      });
      console.log(`[USER-CLIP] Completed request ${request.id} with ${moments.length} moments`);
      processed++;
      continue;
    }
    
    const sources = await storage.getEpisodeSourcesByEpisode(request.episodeId);
    const youtubeSource = sources.find((s: any) => s.platform === "youtube");
    
    const transcriptJob = youtubeSource ? await storage.getJobByTypeAndSource("youtube_transcript", youtubeSource.id) : null;
    const viralJob = youtubeSource ? await storage.getJobByTypeAndSource("detect_viral_moments", youtubeSource.id) : null;

    if (transcriptJob?.status === "error" && transcriptJob.lastError) {
      const errorMsg = transcriptJob.lastError.includes("captions")
        ? "No captions available for this video. Try a video with auto-generated or manual captions."
        : `Transcript extraction failed: ${transcriptJob.lastError}`;
      await storage.updateUserClipRequest(request.id, {
        status: "failed",
        statusMessage: errorMsg,
        error: transcriptJob.lastError,
      });
      console.log(`[USER-CLIP] Failed request ${request.id} — transcript job error: ${transcriptJob.lastError}`);
      processed++;
      continue;
    }

    if (viralJob?.status === "error" && viralJob.lastError) {
      await storage.updateUserClipRequest(request.id, {
        status: "failed",
        statusMessage: `AI analysis failed: ${viralJob.lastError}`,
        error: viralJob.lastError,
      });
      console.log(`[USER-CLIP] Failed request ${request.id} — viral moments job error: ${viralJob.lastError}`);
      processed++;
      continue;
    }

    const segments = await storage.getSegmentsByEpisode(request.episodeId);
    if (segments.length > 0) {
      if (viralJob?.status === "done") {
        await storage.updateUserClipRequest(request.id, {
          status: "complete",
          statusMessage: "No viral clips found for this video. Try a different video with more engaging content.",
          completedAt: new Date(),
        });
        console.log(`[USER-CLIP] Completed request ${request.id} - no viral moments found`);
        processed++;
      } else if (viralJob?.status === "processing") {
        await storage.updateUserClipRequest(request.id, {
          statusMessage: "Detecting viral moments using AI...",
        });
      } else if (!viralJob) {
        await storage.updateUserClipRequest(request.id, {
          statusMessage: "Detecting viral moments using AI...",
        });

        await storage.createJob({
          type: "detect_viral_moments",
          episodeSourceId: youtubeSource?.id,
          pipelineStage: "INTEL",
          result: { 
            episodeId: request.episodeId,
            userClipRequestId: request.id,
          },
        });

        console.log(`[USER-CLIP] Created detect_viral_moments job for analyzing request ${request.id}`);
        processed++;
      }
    } else {
      if (transcriptJob?.status === "processing") {
        await storage.updateUserClipRequest(request.id, {
          statusMessage: "Fetching video transcript...",
        });
      } else if (!transcriptJob || transcriptJob.status === "done") {
        await storage.updateUserClipRequest(request.id, {
          statusMessage: "Fetching video transcript...",
        });

        await storage.createJob({
          type: "youtube_transcript",
          episodeSourceId: youtubeSource?.id,
          pipelineStage: "INGEST",
          result: { 
            episodeId: request.episodeId,
            userClipRequestId: request.id,
          },
        });

        console.log(`[USER-CLIP] Created youtube_transcript job for analyzing request ${request.id}`);
        processed++;
      }
    }
  }

  return processed;
}
