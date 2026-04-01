import { storage } from "../storage";
import { callGeminiJson, GeminiError } from "../ai/geminiClient";
import { z } from "zod";
import type { Job } from "@shared/schema";
import { db } from "../db";
import { sql } from "drizzle-orm";

export interface ResolveSpeakersJobResult {
  speakersResolved: number;
  speakersCreated: number;
  appearancesCreated: number;
}

const SpeakerResolutionSchema = z.object({
  speakers: z.array(z.object({
    label: z.string(),
    resolvedName: z.string(),
    role: z.enum(["host", "guest", "co-host", "unknown"]),
    confidence: z.number(),
    isNewSpeaker: z.boolean(),
  })),
});

type SpeakerResolution = z.infer<typeof SpeakerResolutionSchema>;

function buildPrompt(
  episodeTitle: string,
  podcastTitle: string,
  knownSpeakers: string[],
  existingSpeakers: Array<{ name: string; aliases: string[] }>,
  labels: string[],
): string {
  const knownList = knownSpeakers.length > 0
    ? knownSpeakers.join(", ")
    : "(none provided)";

  const existingList = existingSpeakers.length > 0
    ? existingSpeakers.map(s => {
        const aliasStr = s.aliases.length > 0 ? ` (aliases: ${s.aliases.join(", ")})` : "";
        return `- ${s.name}${aliasStr}`;
      }).join("\n")
    : "(no existing speakers on platform)";

  const labelList = labels.map(l => `- "${l}"`).join("\n");

  return `You are a speaker identity resolution API for a podcast analytics platform.

Context:
- Podcast: "${podcastTitle}"
- Episode: "${episodeTitle}"
- Known speakers for this podcast: ${knownList}

Existing speakers on the platform:
${existingList}

Diarization labels found in this episode's transcript:
${labelList}

Task: Match each diarization label to a real person name.

Rules:
- Use the podcast's known speakers list as the primary reference
- Check existing platform speakers for fuzzy matches (name or alias)
- If a label clearly matches a known speaker, set isNewSpeaker=false and use their exact name as resolvedName
- If a label cannot be matched to any known or existing speaker, set isNewSpeaker=true and provide your best guess for their real name based on context
- For labels like "Speaker 1", "SPEAKER_00", etc., try to infer who they are from context
- Set confidence (0-1) based on how certain the match is
- Assign role: "host" for podcast hosts, "co-host" for regular co-hosts, "guest" for guests, "unknown" if unsure
- If you truly cannot determine who a generic label refers to, use the label itself as resolvedName with low confidence

Output JSON matching this schema:
{
  "speakers": [
    {
      "label": "original diarization label",
      "resolvedName": "Real Person Name",
      "role": "host" | "guest" | "co-host" | "unknown",
      "confidence": 0.0-1.0,
      "isNewSpeaker": true/false
    }
  ]
}

JSON ONLY. No explanations. No markdown.`;
}

export async function handleResolveSpeakersJob(
  job: Job,
  onProgress: (message: string, percentage: number) => void,
): Promise<ResolveSpeakersJobResult> {
  console.log(`[RESOLVE-SPEAKERS] Starting job ${job.id}`);

  const jobResult = job.result as Record<string, unknown> | null;
  const episodeId = jobResult?.episodeId as string | undefined;

  if (!episodeId) {
    throw new GeminiError("Missing episodeId in job result", false, "INVALID_INPUT");
  }

  onProgress("Looking up episode and podcast...", 5);

  const episode = await storage.getEpisode(episodeId);
  if (!episode) {
    throw new GeminiError(`Episode not found: ${episodeId}`, false, "NOT_FOUND");
  }

  const podcast = await storage.getPodcast(episode.podcastId);
  if (!podcast) {
    throw new GeminiError(`Podcast not found: ${episode.podcastId}`, false, "NOT_FOUND");
  }

  onProgress("Gathering speaker data...", 10);

  const knownSpeakers: string[] = Array.isArray(podcast.knownSpeakers)
    ? podcast.knownSpeakers
    : [];

  let transcriptLabels: string[] = [];
  let statementLabels: string[] = [];

  try {
    const segmentRows = await db.execute(
      sql`SELECT DISTINCT speaker FROM transcript_segments WHERE episode_id = ${episodeId} AND speaker IS NOT NULL`
    );
    transcriptLabels = (segmentRows.rows as Array<{ speaker: string }>).map(r => r.speaker);
  } catch (err: any) {
    console.warn(`[RESOLVE-SPEAKERS] Error fetching transcript speaker labels: ${err.message}`);
  }

  try {
    const statementRows = await db.execute(
      sql`SELECT DISTINCT speaker FROM statements WHERE episode_id = ${episodeId} AND speaker IS NOT NULL`
    );
    statementLabels = (statementRows.rows as Array<{ speaker: string }>).map(r => r.speaker);
  } catch (err: any) {
    console.warn(`[RESOLVE-SPEAKERS] Error fetching statement speaker labels: ${err.message}`);
  }

  const labelSet = new Set([...transcriptLabels, ...statementLabels]);
  const allLabels = Array.from(labelSet);

  if (allLabels.length === 0) {
    console.log("[RESOLVE-SPEAKERS] No speaker labels found in episode");
    return { speakersResolved: 0, speakersCreated: 0, appearancesCreated: 0 };
  }

  console.log(`[RESOLVE-SPEAKERS] Found ${allLabels.length} distinct speaker labels: ${allLabels.join(", ")}`);

  onProgress("Fetching existing speakers...", 20);

  let existingSpeakers;
  try {
    existingSpeakers = await storage.getAllSpeakers(500);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching speakers: ${err.message}`, true, "STORAGE_ERROR");
  }

  const existingSpeakerList = existingSpeakers.map(s => ({
    name: s.name,
    aliases: Array.isArray(s.aliases) ? s.aliases : [],
  }));

  onProgress("Calling Gemini to resolve speaker identities...", 30);

  const prompt = buildPrompt(
    episode.title,
    podcast.title,
    knownSpeakers,
    existingSpeakerList,
    allLabels,
  );

  let response: SpeakerResolution;
  try {
    response = await callGeminiJson(
      "gemini-2.5-flash",
      prompt,
      SpeakerResolutionSchema,
      { temperature: 0.3, maxOutputTokens: 8192 },
    );
  } catch (err: any) {
    if (err instanceof GeminiError) throw err;
    throw new GeminiError(`Gemini API error: ${err.message}`, true, "GEMINI_ERROR");
  }

  if (!response.speakers || response.speakers.length === 0) {
    console.log("[RESOLVE-SPEAKERS] Gemini returned no speaker resolutions");
    return { speakersResolved: 0, speakersCreated: 0, appearancesCreated: 0 };
  }

  onProgress(`Processing ${response.speakers.length} resolved speakers...`, 50);
  console.log(`[RESOLVE-SPEAKERS] Gemini resolved ${response.speakers.length} speakers`);

  let speakersResolved = 0;
  let speakersCreated = 0;
  let appearancesCreated = 0;

  for (let i = 0; i < response.speakers.length; i++) {
    const resolved = response.speakers[i];
    const progress = 50 + Math.floor((i / response.speakers.length) * 40);
    onProgress(`Processing speaker: ${resolved.resolvedName}...`, progress);

    try {
      let speakerId: string;

      if (resolved.isNewSpeaker && resolved.confidence >= 0.7) {
        try {
          const newSpeaker = await storage.createSpeaker({
            name: resolved.resolvedName,
            aliases: [resolved.label],
          });
          speakerId = newSpeaker.id;
          speakersCreated++;
          console.log(`[RESOLVE-SPEAKERS] Created new speaker: ${resolved.resolvedName}`);
        } catch (createErr: any) {
          if (createErr.message?.includes("unique") || createErr.code === "23505") {
            const existing = await storage.getSpeakerByName(resolved.resolvedName);
            if (existing) {
              speakerId = existing.id;
              const currentAliases = Array.isArray(existing.aliases) ? existing.aliases : [];
              if (!currentAliases.includes(resolved.label)) {
                await storage.updateSpeaker(existing.id, {
                  aliases: [...currentAliases, resolved.label],
                });
              }
              console.log(`[RESOLVE-SPEAKERS] Speaker already existed, updated aliases: ${resolved.resolvedName}`);
            } else {
              console.error(`[RESOLVE-SPEAKERS] Unique constraint but speaker not found: ${resolved.resolvedName}`);
              continue;
            }
          } else {
            throw createErr;
          }
        }
      } else {
        const existing = await storage.getSpeakerByName(resolved.resolvedName);
        if (existing) {
          speakerId = existing.id;
          const currentAliases = Array.isArray(existing.aliases) ? existing.aliases : [];
          if (!currentAliases.includes(resolved.label)) {
            await storage.updateSpeaker(existing.id, {
              aliases: [...currentAliases, resolved.label],
            });
          }
          console.log(`[RESOLVE-SPEAKERS] Matched existing speaker: ${resolved.resolvedName}`);
        } else if (resolved.confidence >= 0.7) {
          const newSpeaker = await storage.createSpeaker({
            name: resolved.resolvedName,
            aliases: [resolved.label],
          });
          speakerId = newSpeaker.id;
          speakersCreated++;
          console.log(`[RESOLVE-SPEAKERS] Created speaker (not flagged as new but not found): ${resolved.resolvedName}`);
        } else {
          console.log(`[RESOLVE-SPEAKERS] Skipping low-confidence unmatched speaker: ${resolved.resolvedName} (${resolved.confidence})`);
          continue;
        }
      }

      let stmtCount = 0;
      try {
        const countResult = await db.execute(
          sql`SELECT COUNT(*) as cnt FROM statements WHERE episode_id = ${episodeId} AND speaker = ${resolved.label}`
        );
        stmtCount = Number((countResult.rows as Array<{ cnt: string }>)[0]?.cnt ?? 0);
      } catch (err: any) {
        console.warn(`[RESOLVE-SPEAKERS] Error counting statements for label "${resolved.label}": ${err.message}`);
      }

      const appearance = await storage.createSpeakerAppearance({
        speakerId,
        episodeId,
        podcastId: episode.podcastId,
        role: resolved.role,
        speakerLabel: resolved.label,
        confidence: resolved.confidence,
        statementCount: stmtCount,
      });

      if (appearance) {
        appearancesCreated++;
      }

      speakersResolved++;
    } catch (err: any) {
      console.error(`[RESOLVE-SPEAKERS] Error processing speaker "${resolved.resolvedName}": ${err.message}`);
    }
  }

  onProgress("Updating speaker aggregate counts...", 95);

  const processedSpeakerIds = new Set<string>();
  for (const resolved of response.speakers) {
    try {
      const speaker = await storage.getSpeakerByName(resolved.resolvedName);
      if (speaker && !processedSpeakerIds.has(speaker.id)) {
        processedSpeakerIds.add(speaker.id);
        const appearances = await storage.getSpeakerAppearances(speaker.id);
        const uniqueEpisodes = new Set(appearances.map(a => a.episodeId));
        await storage.updateSpeaker(speaker.id, {
          totalAppearances: appearances.length,
          totalEpisodes: uniqueEpisodes.size,
        });
      }
    } catch (err: any) {
      console.warn(`[RESOLVE-SPEAKERS] Error updating aggregate counts for "${resolved.resolvedName}": ${err.message}`);
    }
  }

  onProgress("Speaker identity resolution complete", 100);

  console.log(`[RESOLVE-SPEAKERS] Complete: ${speakersResolved} resolved, ${speakersCreated} created, ${appearancesCreated} appearances`);

  return {
    speakersResolved,
    speakersCreated,
    appearancesCreated,
  };
}
