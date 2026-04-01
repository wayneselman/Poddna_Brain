import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const client = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY!,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL!,
  },
});

export type GeminiModelId = "gemini-1.5-flash" | "gemini-2.0-flash" | "gemini-2.5-flash" | string;

export class GeminiError extends Error {
  constructor(
    message: string,
    public readonly transient: boolean,
    public readonly code?: string | number,
  ) {
    super(message);
    this.name = "GeminiError";
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

function stripMarkdownCodeFences(text: string): string {
  let result = text.trim();
  
  // Remove ```json or ``` fences (case insensitive, handles newlines)
  result = result.replace(/^```(?:json)?\s*/i, "");
  result = result.replace(/\s*```\s*$/i, "");
  
  // Handle nested code fences or extra backticks
  while (result.startsWith("`") && result.endsWith("`")) {
    result = result.slice(1, -1).trim();
  }
  
  // Strip any leading/trailing text before/after JSON (common AI quirk)
  const jsonStartMatch = result.match(/^[^{\[]*?([\[{])/);
  if (jsonStartMatch && jsonStartMatch.index !== undefined) {
    const jsonStart = result.indexOf(jsonStartMatch[1]);
    if (jsonStart > 0) {
      result = result.slice(jsonStart);
    }
  }
  
  // Find the last closing bracket/brace
  const lastBrace = result.lastIndexOf("}");
  const lastBracket = result.lastIndexOf("]");
  const lastJson = Math.max(lastBrace, lastBracket);
  if (lastJson > 0 && lastJson < result.length - 1) {
    result = result.slice(0, lastJson + 1);
  }
  
  return result.trim();
}

export interface GeminiCallOptions {
  temperature?: number;
  maxOutputTokens?: number;
}

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function callGeminiJson<T>(
  model: GeminiModelId,
  prompt: string,
  schema: z.ZodSchema<T>,
  options: GeminiCallOptions = {}
): Promise<T> {
  const { temperature = 0.7, maxOutputTokens = 4096 } = options;
  
  let lastError: GeminiError | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[GEMINI] Calling ${model} with prompt length: ${prompt.length} chars (attempt ${attempt}/${MAX_RETRIES})`);
      
      const result = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature,
          maxOutputTokens,
          responseMimeType: "application/json",
        },
      });

      const responseText = result.text || "";
      console.log(`[GEMINI] Response length: ${responseText.length} chars`);
      
      const cleanedText = stripMarkdownCodeFences(responseText);
      
      let parsed: unknown;
      try {
        parsed = JSON.parse(cleanedText);
      } catch (parseError) {
        console.error(`[GEMINI] JSON parse error (attempt ${attempt}):`, parseError);
        console.error("[GEMINI] Raw text (first 500 chars):", cleanedText.slice(0, 500));
        
        // Try to extract JSON block from extra text
        const match = cleanedText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (match) {
          try {
            parsed = JSON.parse(match[1]);
            console.log("[GEMINI] Successfully extracted JSON block from response");
          } catch (_) {
            // Fall through to repair attempt
          }
        }
        
        // If still not parsed, try JSON repair with Gemini Flash
        if (!parsed) {
          console.log("[GEMINI] Attempting JSON repair with Gemini Flash...");
          try {
            const { repairJsonWithGemini } = await import("./json-repair");
            const schemaDescription = `Expected shape matches the Zod schema. Return a valid JSON object or array.`;
            const repaired = await repairJsonWithGemini(cleanedText, schemaDescription);
            if (repaired) {
              parsed = repaired;
              console.log("[GEMINI] JSON repair successful");
            }
          } catch (repairError: any) {
            console.error("[GEMINI] JSON repair failed:", repairError.message);
          }
        }
        
        // If still not parsed after all attempts, handle as error
        if (!parsed) {
          const truncatedError = new GeminiError(
            "Invalid JSON from Gemini - could not parse or repair response",
            false,
            "INVALID_JSON_UNREPAIRABLE"
          );
          
          if (attempt < MAX_RETRIES) {
            const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
            console.log(`[GEMINI] Retrying in ${backoffMs}ms due to invalid JSON...`);
            await sleep(backoffMs);
            lastError = truncatedError;
            continue;
          }
          
          throw truncatedError;
        }
      }

      let validated = schema.safeParse(parsed);
      
      // If validation failed and we got an array, try common wrapper patterns
      if (!validated.success && Array.isArray(parsed)) {
        console.log("[GEMINI] Got array but schema expects object, trying common wrappers...");
        const wrapperAttempts = [
          { buyerClaims: parsed },  // Zoom analysis
          { gateChecks: parsed },
          { decisionSignals: parsed },
          { riskFrames: parsed },
          { sellerEmphasis: parsed },
          { moments: parsed },
          { highlights: parsed },
          { claims: parsed },
          { chapters: parsed },
          { entities: parsed },
          { annotations: parsed },
          { sponsors: parsed },
          { statements: parsed },
          { topics: parsed },
          { items: parsed },
          { results: parsed },
          { data: parsed },
        ];
        
        for (const wrapper of wrapperAttempts) {
          const wrapperValidated = schema.safeParse(wrapper);
          if (wrapperValidated.success) {
            console.log(`[GEMINI] Successfully wrapped array in '${Object.keys(wrapper)[0]}' object`);
            validated = wrapperValidated;
            break;
          } else {
            console.log(`[GEMINI] Wrapper '${Object.keys(wrapper)[0]}' failed: ${wrapperValidated.error.errors[0]?.message}`);
          }
        }
      }
      
      if (!validated.success) {
        console.error("[GEMINI] Schema validation error:", validated.error.message);
        console.error("[GEMINI] Parsed data:", JSON.stringify(parsed).slice(0, 500));
        throw new GeminiError(
          `Gemini JSON failed schema validation: ${validated.error.message}`,
          false,
          "SCHEMA_VALIDATION_ERROR"
        );
      }

      console.log("[GEMINI] Successfully parsed and validated response");
      return validated.data;
      
    } catch (err: any) {
      if (err instanceof GeminiError) {
        if (err.code === "SCHEMA_VALIDATION_ERROR") {
          throw err;
        }
        
        if (err.transient && attempt < MAX_RETRIES) {
          const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
          console.log(`[GEMINI] Transient error, retrying in ${backoffMs}ms...`);
          await sleep(backoffMs);
          lastError = err;
          continue;
        }
        
        throw err;
      }
      
      const transient = isTransientError(err);
      const code = err.code ?? err.status ?? err.name ?? "UNKNOWN";

      console.error("[GEMINI] API error:", {
        transient,
        code,
        message: err.message,
        type: err.constructor?.name,
      });

      const geminiErr = new GeminiError(
        err.message || "Gemini API call failed",
        transient,
        code
      );
      
      if (transient && attempt < MAX_RETRIES) {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
        console.log(`[GEMINI] Transient error, retrying in ${backoffMs}ms...`);
        await sleep(backoffMs);
        lastError = geminiErr;
        continue;
      }

      throw geminiErr;
    }
  }
  
  throw lastError || new GeminiError("Max retries exceeded", true, "MAX_RETRIES_EXCEEDED");
}

export async function callGeminiText(
  model: GeminiModelId,
  prompt: string,
  options: GeminiCallOptions = {}
): Promise<string> {
  const { temperature = 0.7, maxOutputTokens = 4096 } = options;
  
  try {
    console.log(`[GEMINI] Calling ${model} (text mode) with prompt length: ${prompt.length} chars`);
    
    const result = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature,
        maxOutputTokens,
        responseMimeType: "application/json",
      },
    });

    // Concatenate ALL text parts from ALL candidates to avoid truncation
    // Gemini can return multi-part responses especially for longer outputs
    let responseText = "";
    if (result.candidates && result.candidates.length > 0) {
      for (const candidate of result.candidates) {
        if (candidate.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.text) {
              responseText += part.text;
            }
          }
        }
      }
    }
    
    // Fallback to result.text if parts extraction failed
    if (!responseText && result.text) {
      responseText = result.text;
    }
    
    console.log(`[GEMINI] Response length: ${responseText.length} chars`);
    
    return responseText;
    
  } catch (err: any) {
    const transient = isTransientError(err);
    const code = err.code ?? err.status ?? err.name ?? "UNKNOWN";

    console.error("[GEMINI] API error:", {
      transient,
      code,
      message: err.message,
      type: err.constructor?.name,
    });

    throw new GeminiError(
      err.message || "Gemini API call failed",
      transient,
      code
    );
  }
}

export function classifyGenericError(err: any): boolean {
  if (err instanceof GeminiError) {
    return err.transient;
  }
  
  // Check for errors that explicitly mark themselves as transient
  // (e.g., YouTubeTransientError from youtube-transcript worker)
  if (err?.transient === true) {
    return true;
  }
  
  const msg = String(err?.message || "").toLowerCase();
  
  if (msg.includes("network") || msg.includes("connection")) return true;
  if (msg.includes("timeout") || msg.includes("deadline")) return true;
  if (msg.includes("unavailable") || msg.includes("service")) return true;
  if (msg.includes("429") || msg.includes("rate limit")) return true;
  if (msg.includes("500") || msg.includes("502") || msg.includes("503")) return true;
  if (msg.includes("temporarily limiting") || msg.includes("try again")) return true;
  if (msg.includes("no such file") || msg.includes("enoent")) return true;
  
  if (msg.includes("invalid") || msg.includes("schema")) return false;
  if (msg.includes("bad request") || msg.includes("400")) return false;
  if (msg.includes("unauthorized") || msg.includes("401")) return false;
  if (msg.includes("forbidden") || msg.includes("403")) return false;
  if (msg.includes("not found") || msg.includes("404")) return false;
  
  return false;
}

export { client as geminiClient };
