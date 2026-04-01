import { z } from "zod";

export const AiAnnotationItemSchema = z.object({
  segmentIndex: z.number().int().nonnegative(),
  quote: z.string().min(1),
  content: z.string().min(1),
  category: z.string().min(1),
});

export const AiAnnotationsResponseSchema = z.array(AiAnnotationItemSchema);

export type AiAnnotationItem = z.infer<typeof AiAnnotationItemSchema>;
export type AiAnnotationsResponse = z.infer<typeof AiAnnotationsResponseSchema>;

export const AiEntitySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["product", "book", "restaurant", "venue", "service", "software", "other"]),
  description: z.string().default(""),
  mentionContext: z.string().default(""),
  confidence: z.number().min(0).max(1),
  suggestedAffiliateType: z.enum(["amazon", "opentable", "booking", "yelp", "custom"]).nullable().optional(),
});

export const AiEntitiesResponseSchema = z.array(AiEntitySchema);

export type AiEntity = z.infer<typeof AiEntitySchema>;
export type AiEntitiesResponse = z.infer<typeof AiEntitiesResponseSchema>;

// Enhanced entity extraction for affiliate arbitrage - includes speaker, quote, timestamp
export const AffiliateEntitySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["product", "book", "software", "service", "company", "tool", "framework", "platform", "app", "community", "newsletter", "podcast", "course", "other"]),
  category: z.string().default("other"), // productivity, ai, marketing, finance, etc.
  description: z.string().default(""),
  quote: z.string().min(1), // Exact quote where mentioned (8-15 words ideal)
  speaker: z.string().default(""), // Who mentioned it
  context: z.string().default(""), // Why/how they mentioned it (use case)
  sentiment: z.enum(["positive", "neutral", "negative"]).default("neutral"),
  confidence: z.number().min(0).max(1),
  segmentIndex: z.number().int().nonnegative().optional(), // Which segment it was found in
  hasAffiliateProgram: z.boolean().default(false), // AI's best guess if affiliate exists
});

export const AffiliateEntitiesResponseSchema = z.array(AffiliateEntitySchema);

export type AffiliateEntity = z.infer<typeof AffiliateEntitySchema>;
export type AffiliateEntitiesResponse = z.infer<typeof AffiliateEntitiesResponseSchema>;

export const AiSegmentLabelSchema = z.object({
  segment_id: z.string(),
  start_seconds: z.number().int().nonnegative(),
  end_seconds: z.number().int().nonnegative(),
  label: z.string().min(1),
  type: z.string().default("topic"),
  confidence: z.number().min(0).max(1).default(0.8),
});

export const AiSegmentLabelsResponseSchema = z.object({
  segments: z.array(AiSegmentLabelSchema),
});

export type AiSegmentLabel = z.infer<typeof AiSegmentLabelSchema>;
export type AiSegmentLabelsResponse = z.infer<typeof AiSegmentLabelsResponseSchema>;

export const AiChapterSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative(),
  tags: z.array(z.string()).optional(),
});

export const AiChaptersResponseSchema = z.object({
  chapters: z.array(AiChapterSchema),
});

export type AiChapter = z.infer<typeof AiChapterSchema>;
export type AiChaptersResponse = z.infer<typeof AiChaptersResponseSchema>;

export const AiVideoSceneSchema = z.object({
  startTime: z.number().nonnegative(),
  endTime: z.number().nonnegative(),
  description: z.string().min(1),
  sceneType: z.enum(["talking_head", "b_roll", "interview", "product_demo", "text_overlay", "animation", "other"]).default("other"),
  confidence: z.number().min(0).max(1).default(0.8),
});

export const AiVideoScenesResponseSchema = z.object({
  scenes: z.array(AiVideoSceneSchema),
});

export type AiVideoScene = z.infer<typeof AiVideoSceneSchema>;
export type AiVideoScenesResponse = z.infer<typeof AiVideoScenesResponseSchema>;

export const AiKeyMomentsSchema = z.object({
  moments: z.array(z.object({
    timestamp: z.number().nonnegative(),
    title: z.string().min(1),
    description: z.string(),
    type: z.enum(["highlight", "insight", "quote", "joke", "story", "fact"]).default("highlight"),
  })),
});

export type AiKeyMoments = z.infer<typeof AiKeyMomentsSchema>;

const ClaimTypeValues = ["financial", "medical", "sensitive", "other"] as const;
type ClaimType = typeof ClaimTypeValues[number];

function normalizeClaimType(val: string): ClaimType {
  const lower = val.toLowerCase().trim() as ClaimType;
  return ClaimTypeValues.includes(lower) ? lower : "other";
}

export const AiClaimSchema = z.object({
  segmentIndex: z.number().int().nonnegative(),
  claimText: z.string().min(1).max(2000),
  claimType: z.string().optional().default("other").transform(normalizeClaimType),
  confidence: z.number().min(0).max(1).optional().default(0.8),
});

export const AiClaimsResponseSchema = z.object({
  claims: z.array(AiClaimSchema),
});

export type AiClaim = z.infer<typeof AiClaimSchema>;
export type AiClaimsResponse = z.infer<typeof AiClaimsResponseSchema>;

// Atomic statement extraction for Semantic Engine
export const AiStatementSchema = z.object({
  segmentIndex: z.number().int().nonnegative(),
  text: z.string().min(1).max(200),
  speaker: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional().default(0.8),
});

export const AiStatementsResponseSchema = z.object({
  statements: z.array(AiStatementSchema),
});

export type AiStatement = z.infer<typeof AiStatementSchema>;
export type AiStatementsResponse = z.infer<typeof AiStatementsResponseSchema>;
