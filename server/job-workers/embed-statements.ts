import { storage } from "../storage";
import { getEmbeddingForText, EmbeddingError } from "../ai/embeddings";
import { GeminiError } from "../ai/geminiClient";
import type { Job } from "@shared/schema";
import { db } from "../db";
import { sql } from "drizzle-orm";

const BATCH_SIZE = 50;

interface EmbedStatementsPayload {
  episodeId?: string;
}

export async function handleEmbedStatementsJob(
  job: Job, 
  progressCallback: (message: string, percentage: number) => void
): Promise<{ embedded: number; skipped: number; errors: number }> {
  const payload: EmbedStatementsPayload = (job.result as EmbedStatementsPayload) ?? {};
  const episodeId = payload.episodeId;
  
  progressCallback("Fetching statements needing embeddings...", 0);
  
  let statementsToEmbed;
  
  if (episodeId) {
    statementsToEmbed = await db.execute(sql`
      SELECT id, text 
      FROM statements 
      WHERE episode_id = ${episodeId} 
        AND (embedding IS NULL OR embedding_status = 'pending')
      LIMIT ${BATCH_SIZE}
    `);
  } else {
    statementsToEmbed = await db.execute(sql`
      SELECT id, text 
      FROM statements 
      WHERE embedding IS NULL OR embedding_status = 'pending'
      LIMIT ${BATCH_SIZE}
    `);
  }
  
  const rows = statementsToEmbed.rows as Array<{ id: string; text: string }>;
  const total = rows.length;
  
  if (total === 0) {
    progressCallback("No statements need embeddings", 100);
    return { embedded: 0, skipped: 0, errors: 0 };
  }
  
  progressCallback(`Processing ${total} statements...`, 5);
  
  let embedded = 0;
  let skipped = 0;
  let errors = 0;
  
  for (let i = 0; i < rows.length; i++) {
    const statement = rows[i];
    const progress = Math.round(5 + (90 * (i + 1) / total));
    
    try {
      if (!statement.text || statement.text.trim().length === 0) {
        skipped++;
        await db.execute(sql`
          UPDATE statements 
          SET embedding_status = 'error' 
          WHERE id = ${statement.id}
        `);
        continue;
      }
      
      const embedding = await getEmbeddingForText(statement.text);
      
      if (!embedding || embedding.length !== 768) {
        throw new Error(`Invalid embedding dimension: ${embedding?.length || 0}`);
      }
      
      await db.execute(sql`
        UPDATE statements 
        SET embedding = ${JSON.stringify(embedding)}::jsonb,
            embedding_status = 'done'
        WHERE id = ${statement.id}
      `);
      
      embedded++;
      progressCallback(`Embedded ${embedded}/${total} statements`, progress);
      
    } catch (err: any) {
      console.error(`[EMBED-STATEMENTS] Error embedding statement ${statement.id}:`, err.message);
      
      const isPermanent = err instanceof EmbeddingError && !err.transient;
      
      if (isPermanent) {
        await db.execute(sql`
          UPDATE statements 
          SET embedding_status = 'error' 
          WHERE id = ${statement.id}
        `);
        errors++;
      } else {
        throw new GeminiError(
          `Failed to embed statement ${statement.id}: ${err.message}`,
          true,
          "EMBEDDING_ERROR"
        );
      }
    }
  }
  
  progressCallback(`Completed: ${embedded} embedded, ${skipped} skipped, ${errors} errors`, 100);
  
  return { embedded, skipped, errors };
}
