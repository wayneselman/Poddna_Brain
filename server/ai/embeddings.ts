import { GoogleGenAI } from "@google/genai";

// Use direct Gemini API for embeddings - requires GOOGLE_AI_API_KEY
// The Replit AI integration proxy (AI_INTEGRATIONS_GEMINI_BASE_URL) doesn't support embeddings
// so we use the user's own API key for embedding calls
const client = new GoogleGenAI({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
  httpOptions: {
    apiVersion: "v1beta",
  },
});

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSION = 768;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

export class EmbeddingError extends Error {
  constructor(
    message: string,
    public readonly transient: boolean,
    public readonly code?: string | number,
  ) {
    super(message);
    this.name = "EmbeddingError";
  }
}

function isTransientError(err: any): boolean {
  if (!err) return false;
  
  const status = err.status || err.code || err.httpStatusCode;
  const msg = String(err.message || "").toLowerCase();

  if (typeof status === "number") {
    if (status >= 500) return true;
    if (status === 429) return true;
  }
  
  if (status === "429" || status === "RESOURCE_EXHAUSTED") return true;
  if (status === "UNAVAILABLE" || status === "DEADLINE_EXCEEDED") return true;
  
  if (msg.includes("deadline") || msg.includes("timeout")) return true;
  if (msg.includes("unavailable") || msg.includes("overloaded")) return true;
  if (msg.includes("rate limit") || msg.includes("quota")) return true;
  if (msg.includes("temporarily") || msg.includes("try again")) return true;
  if (msg.includes("connection") || msg.includes("network")) return true;

  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getEmbeddingForText(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new EmbeddingError("Cannot generate embedding for empty text", false, "EMPTY_INPUT");
  }

  let lastError: EmbeddingError | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[EMBEDDING] Generating embedding for text (${text.length} chars), attempt ${attempt}/${MAX_RETRIES}`);
      
      const result = await client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
        config: {
          outputDimensionality: EMBEDDING_DIMENSION,
        },
      });

      const embedding = result.embeddings?.[0]?.values;
      
      if (!embedding || embedding.length === 0) {
        throw new EmbeddingError("No embedding returned from API", true, "EMPTY_RESPONSE");
      }

      console.log(`[EMBEDDING] Generated embedding with ${embedding.length} dimensions`);
      return embedding;

    } catch (err: any) {
      if (err instanceof EmbeddingError) {
        if (!err.transient || attempt >= MAX_RETRIES) {
          throw err;
        }
        lastError = err;
      } else {
        const transient = isTransientError(err);
        const code = err.code ?? err.status ?? err.name ?? "UNKNOWN";
        
        console.error("[EMBEDDING] API error:", {
          transient,
          code,
          message: err.message,
          attempt,
        });

        const embeddingErr = new EmbeddingError(
          err.message || "Embedding API call failed",
          transient,
          code
        );

        if (!transient || attempt >= MAX_RETRIES) {
          throw embeddingErr;
        }
        lastError = embeddingErr;
      }

      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      console.log(`[EMBEDDING] Retrying in ${backoffMs}ms...`);
      await sleep(backoffMs);
    }
  }

  throw lastError || new EmbeddingError("Max retries exceeded", true, "MAX_RETRIES_EXCEEDED");
}

export async function getEmbeddingsForTexts(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    if (!text || text.trim().length === 0) {
      embeddings.push([]);
      continue;
    }
    
    try {
      const embedding = await getEmbeddingForText(text);
      embeddings.push(embedding);
    } catch (err) {
      console.error(`[EMBEDDING] Failed to generate embedding for text ${i}:`, err);
      embeddings.push([]);
    }
    
    if (i < texts.length - 1 && texts.length > 5) {
      await sleep(100);
    }
  }
  
  return embeddings;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

export { EMBEDDING_DIMENSION };
