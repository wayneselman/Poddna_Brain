import { callClaudeJson, ClaudeError } from "../ai/claudeClient";
import { z } from "zod";

const RecommendationPostSchema = z.object({
  title: z.string(),
  hook: z.string(),
  body: z.string(),
  footer: z.string(),
  hashtags: z.array(z.string()),
  platforms: z.object({
    twitter: z.string(),
    linkedin: z.string(),
    newsletter: z.string(),
  }),
});

export type RecommendationPost = z.infer<typeof RecommendationPostSchema>;

export interface EntityForPost {
  name: string;
  type: string;
  description: string | null;
  mentionCount: number;
  episodeCount: number;
  speakers: string[];
  quotes: { text: string; episodeTitle: string; context?: string; sentiment?: string }[];
  affiliateUrl?: string | null;
}

export interface GeneratePostOptions {
  category: string;
  entities: EntityForPost[];
  maxEntities?: number;
  tone?: "professional" | "casual" | "data-driven";
}

export async function generateRecommendationPost(
  options: GeneratePostOptions
): Promise<RecommendationPost> {
  const { 
    category, 
    entities, 
    maxEntities = 10,
    tone = "data-driven"
  } = options;

  if (entities.length === 0) {
    throw new ClaudeError("No entities provided for post generation", false);
  }

  const topEntities = entities.slice(0, maxEntities);
  
  const entitiesWithValidQuotes = topEntities.filter(e => e.quotes.length > 0);
  
  if (entitiesWithValidQuotes.length === 0) {
    throw new ClaudeError("No entities with valid quotes found - cannot generate authentic post", false);
  }
  
  const entityData = entitiesWithValidQuotes.map((e, idx) => ({
    rank: idx + 1,
    name: e.name,
    type: e.type,
    description: e.description,
    mentions: e.mentionCount,
    episodes: e.episodeCount,
    speakers: e.speakers.slice(0, 3),
    quotes: e.quotes.slice(0, 3).map(q => ({
      text: q.text,
      source: q.episodeTitle,
      context: q.context,
      sentiment: q.sentiment,
    })),
    hasQuotes: true,
    affiliateUrl: e.affiliateUrl,
  }));

  const toneInstructions = {
    professional: "Use professional, business-focused language. Avoid casual phrases.",
    casual: "Use conversational, friendly language. Be approachable and engaging.",
    "data-driven": "Lead with data and specific numbers. Let the stats speak.",
  };

  const prompt = `You are a content strategist creating an affiliate recommendation post.

Generate a compelling recommendation post for the category: "${category}"

Based on analysis of real podcast transcripts, here are the top ${entitiesWithValidQuotes.length} products/tools mentioned by founders and CEOs:

${JSON.stringify(entityData, null, 2)}

Tone: ${toneInstructions[tone]}

Requirements:
1. Title: Create a compelling headline (e.g., "What 15 Top Founders Actually Use for ${category}")
2. Hook: 2-3 sentence intro that establishes authority (mention "analyzed X podcasts")
3. Body: Numbered list of tools with:
   - Tool name and mention count
   - Context from the quotes (how/why they use it)
   - Actual quote from the data (use ONLY provided quotes, never make them up)
4. Footer: Short call-to-action and source attribution
5. Hashtags: 3-5 relevant hashtags
6. Create platform-specific versions:
   - Twitter: Thread-ready format (max 280 chars per tweet, use numbered tweets)
   - LinkedIn: Single long-form post with professional tone
   - Newsletter: Email-friendly format with proper sections

CRITICAL RULES:
- ONLY include entities that have hasQuotes: true
- Use ONLY quotes that were actually provided in the quotes array
- DO NOT fabricate or paraphrase quotes - copy them verbatim
- Include the source (episode title) for each quote
- If an entity has no quotes (hasQuotes: false), skip the quote or use the description
- Be authoritative but not salesy
- Let the data speak - mention specific numbers
- If affiliateUrl exists, mention it naturally

Return as JSON matching this structure:
{
  "title": "string",
  "hook": "string",
  "body": "string (the main numbered list)",
  "footer": "string",
  "hashtags": ["string"],
  "platforms": {
    "twitter": "string (full thread with 1/, 2/, etc)",
    "linkedin": "string (full post)",
    "newsletter": "string (full email body)"
  }
}

JSON only. No markdown code blocks.`;

  try {
    const result = await callClaudeJson(prompt, RecommendationPostSchema, {
      model: "claude-sonnet-4-5",
      maxTokens: 4096,
      temperature: 0.7,
    });

    return result;
  } catch (error) {
    console.error("[POST GENERATOR] Error generating post:", error);
    if (error instanceof ClaudeError) {
      throw error;
    }
    throw new ClaudeError(
      `Failed to generate recommendation post: ${error instanceof Error ? error.message : String(error)}`,
      false
    );
  }
}

export async function generateQuickPost(
  category: string,
  entities: EntityForPost[]
): Promise<string> {
  if (entities.length === 0) {
    return `No ${category} tools found in the analyzed podcasts.`;
  }

  const topEntities = entities.slice(0, 5);
  
  let post = `🎧 What top founders actually use for ${category}:\n\n`;
  
  topEntities.forEach((entity, idx) => {
    const quote = entity.quotes[0]?.text;
    const speakers = entity.speakers.slice(0, 2).join(", ");
    
    post += `${idx + 1}. ${entity.name} (${entity.mentionCount} mentions)\n`;
    if (quote) {
      post += `   "${quote.slice(0, 80)}${quote.length > 80 ? '...' : ''}"\n`;
    }
    if (speakers) {
      post += `   Used by: ${speakers}\n`;
    }
    post += "\n";
  });

  post += `Based on analysis of ${new Set(entities.flatMap(e => e.quotes.map(q => q.episodeTitle))).size} podcast episodes with CEOs and founders.\n\n`;
  post += `#${category.replace(/\s+/g, '')} #Founders #Productivity #SaaS`;

  return post;
}
