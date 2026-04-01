import { storage } from "../storage";
import { getEmbeddingForText } from "../ai/embeddings";
import { GeminiError } from "../ai/geminiClient";
import type { Job, Topic } from "@shared/schema";

export interface TopicAssignmentJobResult {
  statementsProcessed: number;
  statementsLinked: number;
  embeddingsGenerated: number;
  topicsAvailable: number;
}

const STATEMENT_LIMIT = 500;
const MIN_SIMILARITY_THRESHOLD = 0.3;
const SECONDARY_TOPIC_THRESHOLD = 0.5;

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  
  return dotProduct / denominator;
}

export async function handleTopicAssignmentJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<TopicAssignmentJobResult> {
  console.log(`[TOPIC-ASSIGNMENT] Starting job ${job.id}`);

  onProgress?.("Fetching topics with embeddings...", 5);

  let topicsWithEmbeddings: Topic[];
  try {
    topicsWithEmbeddings = await storage.getAllTopicsWithEmbeddings();
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching topics: ${err.message}`, true, "STORAGE_ERROR");
  }

  if (topicsWithEmbeddings.length === 0) {
    console.log("[TOPIC-ASSIGNMENT] No topics with embeddings found. Run topic_discovery first.");
    return { statementsProcessed: 0, statementsLinked: 0, embeddingsGenerated: 0, topicsAvailable: 0 };
  }

  console.log(`[TOPIC-ASSIGNMENT] Found ${topicsWithEmbeddings.length} topics with embeddings`);
  onProgress?.(`Found ${topicsWithEmbeddings.length} topics`, 10);

  let statementsNeedingTopics: Array<{ id: string; text: string; embedding: any }>;
  try {
    statementsNeedingTopics = await storage.getStatementsWithoutTopics(STATEMENT_LIMIT);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching statements: ${err.message}`, true, "STORAGE_ERROR");
  }

  if (statementsNeedingTopics.length === 0) {
    console.log("[TOPIC-ASSIGNMENT] No statements need topic assignment");
    return { statementsProcessed: 0, statementsLinked: 0, embeddingsGenerated: 0, topicsAvailable: topicsWithEmbeddings.length };
  }

  console.log(`[TOPIC-ASSIGNMENT] Processing ${statementsNeedingTopics.length} statements`);
  onProgress?.(`Processing ${statementsNeedingTopics.length} statements...`, 15);

  let statementsLinked = 0;
  let embeddingsGenerated = 0;
  const linksToCreate: Array<{ statementId: string; topicId: string; confidence: number; isPrimary: boolean }> = [];

  for (let i = 0; i < statementsNeedingTopics.length; i++) {
    const statement = statementsNeedingTopics[i];
    const progress = 15 + Math.floor((i / statementsNeedingTopics.length) * 80);
    
    if (i % 50 === 0) {
      onProgress?.(`Processing statement ${i + 1}/${statementsNeedingTopics.length}...`, progress);
    }

    let statementEmbedding: number[] | null = null;

    if (statement.embedding && Array.isArray(statement.embedding) && statement.embedding.length > 0) {
      statementEmbedding = statement.embedding as number[];
    } else {
      try {
        statementEmbedding = await getEmbeddingForText(statement.text);
        embeddingsGenerated++;
      } catch (err: any) {
        console.warn(`[TOPIC-ASSIGNMENT] Failed to generate embedding for statement ${statement.id}: ${err.message}`);
        continue;
      }
    }

    if (!statementEmbedding) continue;

    const topicScores: Array<{ topicId: string; similarity: number }> = [];

    for (const topic of topicsWithEmbeddings) {
      if (!topic.embedding || !Array.isArray(topic.embedding)) continue;
      
      const similarity = cosineSimilarity(statementEmbedding, topic.embedding as number[]);
      if (similarity >= MIN_SIMILARITY_THRESHOLD) {
        topicScores.push({ topicId: topic.id, similarity });
      }
    }

    topicScores.sort((a, b) => b.similarity - a.similarity);

    if (topicScores.length > 0) {
      linksToCreate.push({
        statementId: statement.id,
        topicId: topicScores[0].topicId,
        confidence: topicScores[0].similarity,
        isPrimary: true,
      });
      statementsLinked++;

      for (let j = 1; j < Math.min(topicScores.length, 3); j++) {
        if (topicScores[j].similarity >= SECONDARY_TOPIC_THRESHOLD) {
          linksToCreate.push({
            statementId: statement.id,
            topicId: topicScores[j].topicId,
            confidence: topicScores[j].similarity,
            isPrimary: false,
          });
        }
      }
    }
  }

  onProgress?.("Saving topic links...", 95);

  if (linksToCreate.length > 0) {
    try {
      await storage.linkStatementsToTopics(linksToCreate);
      console.log(`[TOPIC-ASSIGNMENT] Created ${linksToCreate.length} statement-topic links`);
    } catch (err: any) {
      throw new GeminiError(`Storage error saving links: ${err.message}`, true, "STORAGE_ERROR");
    }
  }

  onProgress?.("Topic assignment complete", 100);

  console.log(`[TOPIC-ASSIGNMENT] Complete: ${statementsNeedingTopics.length} processed, ${statementsLinked} linked, ${embeddingsGenerated} embeddings generated`);

  return {
    statementsProcessed: statementsNeedingTopics.length,
    statementsLinked,
    embeddingsGenerated,
    topicsAvailable: topicsWithEmbeddings.length,
  };
}
