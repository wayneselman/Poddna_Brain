import { storage } from "../storage";
import { callGeminiJson, GeminiError } from "../ai/geminiClient";
import { getEmbeddingForText } from "../ai/embeddings";
import { z } from "zod";
import type { Job, Statement, StatementClassification } from "@shared/schema";

export interface TopicDiscoveryJobResult {
  topicsCreated: number;
  topicsUpdated: number;
  statementsLinked: number;
  candidatesProcessed: number;
}

const CANDIDATE_LIMIT = 200;
const MIN_TEXT_LENGTH = 40;
const TOPICS_RANGE = { min: 5, max: 15 };

const TopicSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  statementIds: z.array(z.string()),
});

const TopicDiscoveryResponseSchema = z.object({
  topics: z.array(TopicSchema),
});

function buildPrompt(candidates: Array<{ id: string; text: string; episodeTitle: string }>): string {
  const statementsText = candidates.map((c, i) => 
    `[${c.id}] "${c.text}" (from: ${c.episodeTitle})`
  ).join("\n");

  return `You are a topic discovery API.
Input: a list of podcast statements with IDs.
Output: JSON ONLY, matching this TypeScript shape:

type Topic = {
  name: string;
  description?: string;
  statementIds: string[];
};

type TopicDiscoveryOutput = {
  topics: Topic[];
};

Field definitions:
- name: 2-5 word topic name (e.g., "Sleep anxiety", "Career burnout")
- description: 1-sentence summary of the theme
- statementIds: IDs of statements belonging to this topic

Rules:
- Create ${TOPICS_RANGE.min}-${TOPICS_RANGE.max} distinct topics
- Topics should be specific but general enough to span episodes
- A statement can belong to multiple topics
- Focus on meaning, not surface keywords
- Good: "Work-life boundaries", "Morning routines", "Imposter syndrome"
- Bad: "Things discussed", "Interesting points", "Episode topics"

JSON ONLY. No explanations. No markdown.

Statements:
${statementsText}`;
}

export async function handleTopicDiscoveryJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<TopicDiscoveryJobResult> {
  console.log(`[TOPIC-DISCOVERY] Starting job ${job.id}`);

  onProgress?.("Fetching candidate statements...", 5);

  let candidates: Array<{ id: string; text: string; episodeId: string; episodeTitle: string }> = [];
  
  try {
    const result = await storage.getCandidateStatementsForTopicDiscovery(CANDIDATE_LIMIT, MIN_TEXT_LENGTH);
    candidates = result;
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching candidates: ${err.message}`, true, "STORAGE_ERROR");
  }

  if (candidates.length === 0) {
    console.log("[TOPIC-DISCOVERY] No candidate statements found");
    return { topicsCreated: 0, topicsUpdated: 0, statementsLinked: 0, candidatesProcessed: 0 };
  }

  onProgress?.(`Processing ${candidates.length} candidate statements...`, 10);
  console.log(`[TOPIC-DISCOVERY] Found ${candidates.length} candidate statements`);

  const prompt = buildPrompt(candidates);
  
  onProgress?.("Calling Gemini to discover topics...", 30);

  let response: z.infer<typeof TopicDiscoveryResponseSchema>;
  try {
    response = await callGeminiJson(
      "gemini-2.5-flash",
      prompt,
      TopicDiscoveryResponseSchema,
      { temperature: 0.3, maxOutputTokens: 32768 }
    );
  } catch (err: any) {
    if (err instanceof GeminiError) throw err;
    throw new GeminiError(`Gemini API error: ${err.message}`, true, "GEMINI_ERROR");
  }

  if (!response.topics || response.topics.length === 0) {
    console.log("[TOPIC-DISCOVERY] Gemini returned no topics");
    return { topicsCreated: 0, topicsUpdated: 0, statementsLinked: 0, candidatesProcessed: candidates.length };
  }

  onProgress?.(`Processing ${response.topics.length} discovered topics...`, 60);
  console.log(`[TOPIC-DISCOVERY] Gemini discovered ${response.topics.length} topics`);

  let topicsCreated = 0;
  let topicsUpdated = 0;
  let statementsLinked = 0;

  const candidateIdSet = new Set(candidates.map(c => c.id));

  for (let i = 0; i < response.topics.length; i++) {
    const topicData = response.topics[i];
    const progress = 60 + Math.floor((i / response.topics.length) * 35);
    onProgress?.(`Processing topic: ${topicData.name}...`, progress);

    try {
      let topic = await storage.findTopicByName(topicData.name);
      
      const embeddingText = topicData.description 
        ? `${topicData.name}. ${topicData.description}`
        : topicData.name;
      
      let embedding: number[] | undefined;
      try {
        embedding = await getEmbeddingForText(embeddingText);
      } catch (embErr: any) {
        console.warn(`[TOPIC-DISCOVERY] Failed to generate embedding for topic "${topicData.name}": ${embErr.message}`);
      }

      if (topic) {
        await storage.updateTopic(topic.id, {
          description: topicData.description || topic.description,
          embedding: (embedding as any) || topic.embedding,
        });
        topicsUpdated++;
        console.log(`[TOPIC-DISCOVERY] Updated existing topic: ${topicData.name}`);
      } else {
        const slug = topicData.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        topic = await storage.createTopic({
          name: topicData.name,
          slug,
          description: topicData.description || null,
          embedding: (embedding as any) || null,
        });
        topicsCreated++;
        console.log(`[TOPIC-DISCOVERY] Created new topic: ${topicData.name}`);
      }

      const validStatementIds = topicData.statementIds.filter((id: string) => candidateIdSet.has(id));
      
      if (validStatementIds.length > 0 && topic) {
        const links = validStatementIds.map((statementId: string) => ({
          statementId,
          topicId: topic!.id,
          confidence: 0.9,
          isPrimary: true,
        }));

        const linked = await storage.linkStatementsToTopics(links);
        statementsLinked += linked.length;
        console.log(`[TOPIC-DISCOVERY] Linked ${linked.length} statements to topic "${topicData.name}"`);
      }
    } catch (err: any) {
      console.error(`[TOPIC-DISCOVERY] Error processing topic "${topicData.name}": ${err.message}`);
    }
  }

  onProgress?.("Topic discovery complete", 100);

  console.log(`[TOPIC-DISCOVERY] Complete: ${topicsCreated} created, ${topicsUpdated} updated, ${statementsLinked} linked`);

  return {
    topicsCreated,
    topicsUpdated,
    statementsLinked,
    candidatesProcessed: candidates.length,
  };
}
