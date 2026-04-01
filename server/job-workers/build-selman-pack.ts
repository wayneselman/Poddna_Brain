import { storage } from "../storage";
import { callClaudeJson } from "../ai/claudeClient";
import { db } from "../db";
import { eq, and, ilike, ne, asc } from "drizzle-orm";
import { z } from "zod";
import type { Job } from "@shared/schema";
import {
  zoomMeetings,
  episodes,
  episodeZoomAnalysis,
} from "@shared/schema";
import { runCrossEpisodeSynthesis } from "../services/cross-episode-synthesis";

export interface SelmanPackJobResult {
  packId: string;
  companyName: string;
  priorEpisodeCount: number;
  deliveryStatus: string;
}

const SYNTHESIS_QUERY = "Analyze the progression of this B2B sales relationship across all calls. Identify recurring buyer concerns, shifting priorities, unresolved objections, growing interest signals, and any patterns in the decision-making process. Track how the conversation has evolved from initial discovery to current state.";

const dealIntelligenceSchema = z.object({
  dealStage: z.string(),
  dealStageRationale: z.string(),
  momentum: z.enum(["accelerating", "steady", "stalling", "at_risk"]),
  momentumRationale: z.string(),
  keyOpenRisks: z.array(z.object({
    risk: z.string(),
    severity: z.enum(["low", "medium", "high"]),
    evidence: z.string(),
  })),
  buyerChampion: z.string().nullable(),
  blockers: z.array(z.string()),
  recommendedNextSteps: z.array(z.string()),
  winProbabilityEstimate: z.number().min(0).max(100).nullable(),
});

type DealIntelligence = z.infer<typeof dealIntelligenceSchema>;

export async function handleBuildSelmanPackJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void,
): Promise<SelmanPackJobResult> {
  const LOG_PREFIX = "[BUILD-SELMAN-PACK]";

  onProgress?.("Loading episode and analysis data...", 5);

  const resultPayload = job.result ? (typeof job.result === "string" ? JSON.parse(job.result) : job.result) : {};
  const episodeId = resultPayload.episodeId as string | undefined;

  if (!episodeId) {
    throw new Error("build_selman_pack job requires episodeId in result payload");
  }

  const episode = await storage.getEpisode(episodeId);
  if (!episode) {
    throw new Error(`Episode not found: ${episodeId}`);
  }

  const analysis = await storage.getEpisodeZoomAnalysis(episodeId);
  if (!analysis) {
    throw new Error(`No zoom analysis found for episode ${episodeId}`);
  }

  const zoomMeetingId = episode.externalEpisodeId;
  if (!zoomMeetingId) {
    throw new Error(`Episode ${episodeId} has no externalEpisodeId (zoom meeting ID)`);
  }

  const [meetingRow] = await db
    .select({
      companyName: zoomMeetings.companyName,
      contactName: zoomMeetings.contactName,
    })
    .from(zoomMeetings)
    .where(eq(zoomMeetings.zoomMeetingId, zoomMeetingId))
    .limit(1);

  if (!meetingRow?.companyName) {
    throw new Error(`No company name found for zoom meeting ${zoomMeetingId} — cannot build selman pack without company context`);
  }

  const companyName = meetingRow.companyName;
  const contactName = meetingRow.contactName || null;

  console.log(`${LOG_PREFIX} Building pack for company "${companyName}", episode ${episodeId}`);

  onProgress?.("Loading current call signals...", 15);

  const currentClaims = await storage.getClaimInstancesByEpisode(episodeId);

  const currentCallSignals = {
    buyerClaims: currentClaims.filter(c => c.claimKind === "buyer_claim").map(c => ({
      text: c.claimText,
      startMs: c.startMs,
      speakerRole: c.speakerRole,
    })),
    gateChecks: currentClaims.filter(c => c.claimKind === "gate_check").map(c => ({
      text: c.claimText,
      startMs: c.startMs,
      meta: c.claimMeta,
    })),
    decisionSignals: currentClaims.filter(c => c.claimKind === "decision_signal").map(c => ({
      text: c.claimText,
      startMs: c.startMs,
      speakerRole: c.speakerRole,
      meta: c.claimMeta,
    })),
    riskFrames: currentClaims.filter(c => c.claimKind === "risk_frame").map(c => ({
      text: c.claimText,
      startMs: c.startMs,
      meta: c.claimMeta,
    })),
    sellerEmphasis: currentClaims.filter(c => c.claimKind === "seller_emphasis").map(c => ({
      text: c.claimText,
      meta: c.claimMeta,
    })),
    totalSignals: currentClaims.length,
  };

  onProgress?.("Finding prior company episodes...", 25);

  const priorMeetings = await db
    .select({
      zoomMeetingId: zoomMeetings.zoomMeetingId,
      topic: zoomMeetings.topic,
      startTime: zoomMeetings.startTime,
    })
    .from(zoomMeetings)
    .where(
      and(
        ilike(zoomMeetings.companyName, companyName),
        ne(zoomMeetings.zoomMeetingId, zoomMeetingId),
      )
    )
    .orderBy(asc(zoomMeetings.startTime));

  const zoomEpisodes = await db
    .select({ id: episodes.id, externalEpisodeId: episodes.externalEpisodeId })
    .from(episodes)
    .where(eq(episodes.sourceType, "zoom"));
  const episodeByMeetingId = new Map(zoomEpisodes.map(e => [e.externalEpisodeId, e.id]));

  const allAnalyses = await db
    .select({ episodeId: episodeZoomAnalysis.episodeId })
    .from(episodeZoomAnalysis);
  const analyzedSet = new Set(allAnalyses.map(a => a.episodeId));

  const priorEpisodeIds: string[] = [];
  for (const m of priorMeetings) {
    const epId = episodeByMeetingId.get(m.zoomMeetingId);
    if (epId && analyzedSet.has(epId)) {
      priorEpisodeIds.push(epId);
    }
  }

  const priorEpisodeCount = priorEpisodeIds.length;
  const allEpisodeIds = [...priorEpisodeIds, episodeId];

  console.log(`${LOG_PREFIX} Found ${priorEpisodeCount} prior analyzed episode(s) for "${companyName}"`);

  let longitudinal: any = null;

  if (priorEpisodeCount >= 1) {
    onProgress?.(`Running longitudinal synthesis across ${allEpisodeIds.length} episodes...`, 35);

    try {
      const { synthesis } = await runCrossEpisodeSynthesis(allEpisodeIds, {
        query: SYNTHESIS_QUERY,
        outputFormat: "structured",
        maxSegmentsPerEpisode: 60,
        systemContext: `You are a B2B sales deal intelligence analyst. You have data from sales calls with the same prospect company "${companyName}".`,
      });
      longitudinal = synthesis;
      console.log(`${LOG_PREFIX} Longitudinal synthesis complete: ${longitudinal?.themes?.length || 0} themes, ${longitudinal?.patterns?.length || 0} patterns`);
    } catch (synthErr: any) {
      console.error(`${LOG_PREFIX} Longitudinal synthesis failed (non-fatal): ${synthErr.message}`);
      longitudinal = { error: synthErr.message, themes: [], patterns: [], narrative: "Synthesis unavailable" };
    }
  } else {
    console.log(`${LOG_PREFIX} First call for "${companyName}" — skipping longitudinal synthesis`);
  }

  onProgress?.("Running deal intelligence reasoning...", 60);

  const dealIntelligence = await runDealIntelligenceReasoning(
    companyName,
    contactName,
    currentCallSignals,
    longitudinal,
    priorEpisodeCount,
    episode.title,
  );

  console.log(`${LOG_PREFIX} Deal intelligence: stage="${dealIntelligence.dealStage}", momentum="${dealIntelligence.momentum}", risks=${dealIntelligence.keyOpenRisks.length}`);

  onProgress?.("Storing selman pack...", 80);

  const pack = await storage.upsertSelmanPack({
    episodeId,
    companyName,
    contactName,
    priorEpisodeCount,
    currentCallSignals,
    longitudinal,
    dealIntelligence,
    allEpisodeIds,
    deliveryStatus: "pending",
    deliveredAt: null,
  });

  console.log(`${LOG_PREFIX} Pack stored: ${pack.id}`);

  onProgress?.("Delivering to Selman face app...", 90);

  let deliveryStatus = "no_url";
  const selmanFaceAppUrl = process.env.SELMAN_FACE_APP_URL;

  if (selmanFaceAppUrl) {
    try {
      const deliveryPayload = {
        packId: pack.id,
        episodeId,
        companyName,
        contactName,
        priorEpisodeCount,
        currentCallSignals,
        longitudinal,
        dealIntelligence,
        allEpisodeIds,
        createdAt: pack.createdAt,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(selmanFaceAppUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Brain-Agent": "build_selman_pack",
          },
          body: JSON.stringify(deliveryPayload),
          signal: controller.signal,
        });

        const responseBody = await response.text();
        console.log(`${LOG_PREFIX} Delivery response: HTTP ${response.status} — ${responseBody.substring(0, 200)}`);

        deliveryStatus = response.ok ? "delivered" : `failed_${response.status}`;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (deliveryErr: any) {
      console.error(`${LOG_PREFIX} Delivery failed (non-fatal): ${deliveryErr.message}`);
      deliveryStatus = `error_${deliveryErr.message.substring(0, 100)}`;
    }
  } else {
    console.log(`${LOG_PREFIX} SELMAN_FACE_APP_URL not set — skipping delivery`);
  }

  await storage.upsertSelmanPack({
    ...pack,
    deliveryStatus,
    deliveredAt: deliveryStatus === "delivered" ? new Date() : null,
  });

  onProgress?.("Selman pack complete!", 100);

  console.log(`${LOG_PREFIX} Complete: pack=${pack.id}, company="${companyName}", priorEps=${priorEpisodeCount}, delivery=${deliveryStatus}`);

  return {
    packId: pack.id,
    companyName,
    priorEpisodeCount,
    deliveryStatus,
  };
}

async function runDealIntelligenceReasoning(
  companyName: string,
  contactName: string | null,
  currentCallSignals: any,
  longitudinal: any,
  priorEpisodeCount: number,
  callTitle: string,
): Promise<DealIntelligence> {
  const signalsSummary = [
    `Buyer Claims (${currentCallSignals.buyerClaims.length}): ${currentCallSignals.buyerClaims.slice(0, 5).map((c: any) => c.text).join("; ")}`,
    `Gate Checks (${currentCallSignals.gateChecks.length}): ${currentCallSignals.gateChecks.slice(0, 5).map((c: any) => c.text).join("; ")}`,
    `Decision Signals (${currentCallSignals.decisionSignals.length}): ${currentCallSignals.decisionSignals.slice(0, 5).map((c: any) => c.text).join("; ")}`,
    `Risk Frames (${currentCallSignals.riskFrames.length}): ${currentCallSignals.riskFrames.slice(0, 5).map((c: any) => c.text).join("; ")}`,
    `Seller Emphasis (${currentCallSignals.sellerEmphasis.length}): ${currentCallSignals.sellerEmphasis.slice(0, 3).map((c: any) => c.text).join("; ")}`,
  ].join("\n");

  let longitudinalContext = "";
  if (longitudinal && !longitudinal.error) {
    longitudinalContext = `
LONGITUDINAL CONTEXT (${priorEpisodeCount} prior call(s)):
Narrative: ${longitudinal.narrative || "N/A"}
Themes: ${(longitudinal.themes || []).map((t: any) => `${t.theme}: ${t.description}`).join("; ")}
Patterns: ${(longitudinal.patterns || []).map((p: any) => `${p.pattern}: ${p.description}`).join("; ")}`;
  }

  const prompt = `You are a senior B2B deal intelligence analyst. Assess this deal based on the latest sales call and any longitudinal context.

COMPANY: ${companyName}
CONTACT: ${contactName || "Unknown"}
CALL TITLE: ${callTitle}
PRIOR CALLS: ${priorEpisodeCount}

CURRENT CALL SIGNALS:
${signalsSummary}
${longitudinalContext}

Produce a JSON assessment with:
- "dealStage": Current stage (e.g., "Discovery", "Technical Evaluation", "Proposal/Negotiation", "Closing", "Stalled", "Lost")
- "dealStageRationale": 1-2 sentences explaining why this stage
- "momentum": One of "accelerating", "steady", "stalling", "at_risk"
- "momentumRationale": 1-2 sentences explaining the momentum assessment
- "keyOpenRisks": Array of { "risk", "severity" ("low"/"medium"/"high"), "evidence" }
- "buyerChampion": Name of the likely internal champion (null if unclear)
- "blockers": Array of strings — active deal blockers
- "recommendedNextSteps": Array of 3-5 specific actionable next steps for the seller
- "winProbabilityEstimate": 0-100 estimated win probability (null if insufficient data)

Be specific and evidence-based. Reference actual quotes and signals from the call data.

Return ONLY valid JSON matching this structure.`;

  const result = await callClaudeJson(prompt, dealIntelligenceSchema, {
    maxTokens: 4096,
    temperature: 0.3,
  });

  return result;
}
