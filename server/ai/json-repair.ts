import { GoogleGenAI } from "@google/genai";
import { safeJsonParseNullable } from "./chunking";

const repairClient = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "",
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com",
  },
});

/**
 * Attempts to fix truncated JSON by balancing brackets.
 * Gemini sometimes returns incomplete responses - this handles common truncation cases.
 */
function tryBracketBalancing(invalidJson: string): string | null {
  let json = invalidJson.trim();
  
  // Count opening and closing brackets
  const openBraces = (json.match(/{/g) || []).length;
  const closeBraces = (json.match(/}/g) || []).length;
  const openBrackets = (json.match(/\[/g) || []).length;
  const closeBrackets = (json.match(/]/g) || []).length;
  
  console.log(`[JSON_REPAIR] Bracket counts: { ${openBraces}/${closeBraces} } [ ${openBrackets}/${closeBrackets} ]`);
  
  // If we have more opening than closing, try to close them
  if (openBraces > closeBraces || openBrackets > closeBrackets) {
    const originalLen = json.length;
    
    // First, try to clean up any incomplete property at the end
    // Remove trailing incomplete strings like: "claimType": "fi
    json = json.replace(/,?\s*"[^"]*":\s*"[^"]*$/m, "");
    // Remove trailing incomplete objects like: { or , {
    json = json.replace(/,?\s*\{\s*$/m, "");
    // Remove trailing incomplete numbers like: "confidence": 0.
    json = json.replace(/,?\s*"[^"]*":\s*[\d.]*$/m, "");
    // Remove trailing incomplete object starts within an array like: }, {
    json = json.replace(/,?\s*\}\s*,?\s*\{?\s*$/m, "}");
    
    console.log(`[JSON_REPAIR] Cleanup removed ${originalLen - json.length} chars`);
    console.log(`[JSON_REPAIR] Last 100 chars after cleanup: ${json.slice(-100)}`);
    
    // Recount after cleanup
    const newOpenBrackets = (json.match(/\[/g) || []).length;
    const newCloseBrackets = (json.match(/]/g) || []).length;
    const newOpenBraces = (json.match(/{/g) || []).length;
    const newCloseBraces = (json.match(/}/g) || []).length;
    
    // Add missing closing brackets/braces in correct order
    // Arrays first (they're usually inside objects), then braces
    const missingBrackets = newOpenBrackets - newCloseBrackets;
    const missingBraces = newOpenBraces - newCloseBraces;
    
    console.log(`[JSON_REPAIR] Adding ${missingBrackets} ] and ${missingBraces} }`);
    
    for (let i = 0; i < missingBrackets; i++) json += "]";
    for (let i = 0; i < missingBraces; i++) json += "}";
    
    console.log(`[JSON_REPAIR] Repaired JSON (last 200 chars): ${json.slice(-200)}`);
    
    return json;
  }
  
  return null;
}

export async function repairJsonWithGemini<T = any>(
  invalidJson: string,
  schemaHint: string
): Promise<T | null> {
  if (!invalidJson || invalidJson.trim().length === 0) {
    return null;
  }

  console.log("[JSON_REPAIR] Attempting to repair invalid JSON with Gemini Flash");

  // First try simple bracket balancing (free, no API call)
  const bracketFixed = tryBracketBalancing(invalidJson);
  if (bracketFixed) {
    const parsed = safeJsonParseNullable<T>(bracketFixed);
    if (parsed) {
      console.log("[JSON_REPAIR] Successfully repaired JSON via bracket balancing");
      return parsed;
    }
  }

  try {
    const prompt = `You are a JSON repair system. 
You will be given invalid JSON that is supposed to match this TypeScript shape:

${schemaHint}

Fix ONLY syntax and formatting issues so that the result is valid JSON compatible with this type.
Do not change the semantics unless necessary to produce valid JSON.
Return JSON ONLY. No explanations, no markdown.

Invalid JSON:
${invalidJson}`.trim();

    const result = await repairClient.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const repairedRaw = result.text || "";

    const parsed = safeJsonParseNullable<T>(repairedRaw);
    
    if (parsed) {
      console.log("[JSON_REPAIR] Successfully repaired JSON via Gemini");
    } else {
      console.error("[JSON_REPAIR] Repair attempt also produced invalid JSON");
    }

    return parsed;
  } catch (error: any) {
    console.error("[JSON_REPAIR] Gemini repair call failed:", error.message);
    return null;
  }
}

export const CLAIM_SCHEMA_HINT = `
type Claim = {
  id: string;
  text: string;
  speaker?: string | null;
  startTimeSec?: number | null;
  endTimeSec?: number | null;
  claimType?: 'financial' | 'medical' | 'sensitive' | 'other' | null;
  confidence?: number | null;
};
type ClaimOutput = {
  claims: Claim[];
};
`.trim();

export const INTEGRITY_SCHEMA_HINT = `
type IntegrityStatement = {
  id: string;
  text: string;
  speaker?: string | null;
  startTimeSec?: number | null;
  polarity: 'positive' | 'negative' | 'neutral';
  certainty: number;
  sentiment: number;
};
type IntegrityOutput = {
  statements: IntegrityStatement[];
};
`.trim();

export const CHAPTERS_SCHEMA_HINT = `
type Chapter = {
  title: string;
  startTimeSec: number;
  endTimeSec?: number | null;
  summary?: string | null;
};
type ChaptersOutput = {
  chapters: Chapter[];
};
`.trim();

export const KEY_IDEAS_SCHEMA_HINT = `
type KeyIdea = {
  id: string;
  text: string;
  startTimeSec?: number | null;
};
type KeyIdeasOutput = {
  keyIdeas: KeyIdea[];
};
`.trim();

export const HIGHLIGHTS_SCHEMA_HINT = `
type Highlight = {
  id: string;
  text: string;
  startTimeSec?: number | null;
  endTimeSec?: number | null;
  rank?: number | null;
};
type HighlightsOutput = {
  highlights: Highlight[];
};
`.trim();

export const SPONSORS_SCHEMA_HINT = `
type SponsorSegment = {
  startTimeSec: number;
  endTimeSec: number;
  brand?: string | null;
  confidence: number;
  text?: string | null;
};
type SponsorsOutput = {
  sponsors: SponsorSegment[];
};
`.trim();
