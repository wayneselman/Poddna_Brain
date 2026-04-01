import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, index, uniqueIndex, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User roles for access control
export const userRoles = ["user", "contributor", "moderator", "admin"] as const;
export type UserRole = typeof userRoles[number];

// User certifications/badges
export const userCertifications = ["verified", "expert", "founding_member", "top_contributor"] as const;
export type UserCertification = typeof userCertifications[number];

// Episode identity resolution status for YouTube matching
// - unresolved: Initial state, YouTube matching in progress
// - awaiting_review: Low-confidence match found, needs admin review
// - resolved: YouTube source accepted (auto or manual)
// - fallback_pending: No YouTube source, awaiting admin decision for paid transcription
// - fallback_requested: Admin requested paid transcription (AssemblyAI)
// - fallback: Legacy state (deprecated - use fallback_pending/fallback_requested)
export const resolutionStatuses = ["unresolved", "awaiting_review", "resolved", "fallback_pending", "fallback_requested", "fallback"] as const;
export type ResolutionStatus = typeof resolutionStatuses[number];

// Episode visibility tiers for job prioritization
// - featured: Top-tier episodes, get full analysis (narrative + moments + claims)
// - supporting: Mid-tier episodes, get moments + claims but no narrative
// - backlog: Low-priority, only claims extraction
export const episodeVisibilities = ["featured", "supporting", "backlog"] as const;
export type EpisodeVisibility = typeof episodeVisibilities[number];

// User storage table (supports both Replit Auth and email/password)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("user"),
  certifications: text("certifications").array().notNull().default(sql`ARRAY[]::text[]`),
  isBanned: boolean("is_banned").notNull().default(false),
  banReason: text("ban_reason"),
  bannedAt: timestamp("banned_at"),
  bannedBy: varchar("banned_by"),
  // Auth fields for email/password login
  passwordHash: varchar("password_hash"),
  authProvider: varchar("auth_provider").notNull().default("local"), // 'local' or 'replit' or 'google'
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationToken: varchar("email_verification_token"),
  passwordResetToken: varchar("password_reset_token"),
  passwordResetExpires: timestamp("password_reset_expires"),
  // YouTube OAuth fields for clip generation
  youtubeAccessToken: text("youtube_access_token"),
  youtubeRefreshToken: text("youtube_refresh_token"),
  youtubeTokenExpires: timestamp("youtube_token_expires"),
  youtubeChannelId: varchar("youtube_channel_id"),
  youtubeChannelTitle: varchar("youtube_channel_title"),
  // Subscription tier for clip generation
  subscriptionTier: varchar("subscription_tier").notNull().default("free"), // 'free' | 'creator' | 'pro' | 'agency'
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  episodesProcessedThisMonth: integer("episodes_processed_this_month").notNull().default(0),
  lastEpisodeProcessedAt: timestamp("last_episode_processed_at"),
  // Stripe integration
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  // Creator clip counter (total clips downloaded, not per-month)
  clipsDownloaded: integer("clips_downloaded").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const podcasts = pgTable("podcasts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  host: text("host").notNull(),
  description: text("description"),
  artworkUrl: text("artwork_url"),
  podcastIndexFeedId: varchar("podcast_index_feed_id"),
  youtubeChannelId: text("youtube_channel_id"), // Anchored YouTube channel for identity resolution
  featuredLanding: boolean("featured_landing").notNull().default(false),
  featuredExplore: boolean("featured_explore").notNull().default(false),
  featuredAt: timestamp("featured_at"),
  knownSpeakers: text("known_speakers").array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  featuredLandingIdx: index("podcast_featured_landing_idx").on(table.featuredLanding, table.featuredAt),
  featuredExploreIdx: index("podcast_featured_explore_idx").on(table.featuredExplore, table.featuredAt),
}));

// Transcript source types
export const transcriptSources = ["host", "assembly", "youtube"] as const;
export type TranscriptSource = typeof transcriptSources[number];

// Transcript processing status
export const transcriptStatuses = ["none", "pending", "ready", "error"] as const;
export type TranscriptStatus = typeof transcriptStatuses[number];

// Episode processing status (pipeline state)
export const processingStatuses = ["new", "importing", "ready_for_analysis", "analyzing", "complete", "error"] as const;
export type ProcessingStatus = typeof processingStatuses[number];

// External source types for episode import
export const externalSources = ["podcastindex", "youtube", "manual", "zoom"] as const;
export type ExternalSource = typeof externalSources[number];

// Source type for episode analysis routing
// - podcast: Traditional podcast episode, uses podcast-focused analysis (themes, arguments, takeaways)
// - zoom: B2B sales/discovery call, uses Zoom-specific analysis (buyer claims, gate checks, decision signals)
export const episodeSourceTypes = ["podcast", "zoom"] as const;
export type EpisodeSourceType = typeof episodeSourceTypes[number];

// Episode Card Spine - Canonical derived summary for card rendering
// This object is derived once (post-analysis) and reused everywhere
export const insightLabels = ["Key Decision", "The Pattern", "The Tradeoff", "Core Insight", "The Bet"] as const;
export type InsightLabel = typeof insightLabels[number];

export interface EpisodeSummary {
  headline: string;                     // 8-14 words, neutral, no hype
  subheadline?: string;                 // Optional clarifier (role, context)
  primaryInsight: {
    label: InsightLabel;
    statement: string;                  // 1 sentence, editorial-quality
  };
  replayReason: string;                 // Why founders replay this (implication, NOT a repeat)
  evidence: {
    narrativeSegmentId?: string;
    keyMomentIds: string[];             // 1-2 max
    claimIds: string[];                 // 3-6 max
  };
  stats: {
    narrativeCount: number;
    keyMomentsCount: number;
    claimsCount: number;
  };
  tags: string[];                       // Product, Growth, Hiring, etc.
  playbookType?: string;                // Founder, Operator, Investor (later)
  generatedAt: string;                  // ISO timestamp
}

export const episodes = pgTable("episodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  podcastId: varchar("podcast_id").notNull().references(() => podcasts.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  episodeNumber: integer("episode_number"),
  publishedAt: timestamp("published_at").notNull(),
  duration: integer("duration").notNull(),
  type: text("type").notNull(),
  mediaUrl: text("media_url").notNull(),
  videoUrl: text("video_url"),
  spotifyUrl: text("spotify_url"),
  applePodcastsUrl: text("apple_podcasts_url"),
  description: text("description"),
  transcriptUrl: text("transcript_url"),
  transcriptType: text("transcript_type"),
  transcriptSource: text("transcript_source"), // "host" | "assembly" | "youtube" - where the transcript came from
  transcriptStatus: text("transcript_status").notNull().default("none"), // "none" | "pending" | "ready" | "error"
  assemblyJobId: text("assembly_job_id"), // AssemblyAI job ID for tracking async transcription
  chaptersUrl: text("chapters_url"),
  status: text("status").notNull().default("draft"),
  isCurated: boolean("is_curated").notNull().default(false),
  curatedAt: timestamp("curated_at"),
  // Pipeline status fields
  processingStatus: text("processing_status").notNull().default("new"), // 'new' | 'importing' | 'ready_for_analysis' | 'analyzing' | 'complete' | 'error'
  externalSource: text("external_source"), // 'podcastindex' | 'youtube' | 'manual' - where the episode was imported from
  externalEpisodeId: text("external_episode_id"), // PodcastIndex GUID or YouTube video ID
  lastError: text("last_error"), // Last error message for debugging
  // Episode identity resolution fields (for YouTube matching)
  resolutionStatus: text("resolution_status").notNull().default("resolved"), // 'unresolved' | 'awaiting_review' | 'resolved' | 'fallback'
  resolutionFallbackAt: timestamp("resolution_fallback_at"), // When to auto-trigger fallback if still unresolved
  // Visibility tier for job prioritization (featured > supporting > backlog)
  visibility: text("visibility").notNull().default("backlog"), // 'featured' | 'supporting' | 'backlog'
  // Source type for analysis routing (podcast vs zoom)
  sourceType: text("source_type").notNull().default("podcast"), // 'podcast' | 'zoom'
  // Episode Card Spine - derived summary for card rendering
  episodeSummary: jsonb("episode_summary"), // EpisodeSummary object with primaryInsight, replayReason, etc.
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  podcastIdIdx: index("episode_podcast_id_idx").on(table.podcastId),
  statusIdx: index("episode_status_idx").on(table.status),
  publishedAtIdx: index("episode_published_at_idx").on(table.publishedAt),
  transcriptStatusIdx: index("episode_transcript_status_idx").on(table.transcriptStatus),
  curatedIdx: index("episode_curated_idx").on(table.isCurated, table.curatedAt),
  processingStatusIdx: index("episode_processing_status_idx").on(table.processingStatus),
  externalSourceIdx: index("episode_external_source_idx").on(table.externalSource, table.externalEpisodeId),
  resolutionStatusIdx: index("episode_resolution_status_idx").on(table.resolutionStatus),
  visibilityIdx: index("episode_visibility_idx").on(table.visibility),
  sourceTypeIdx: index("episode_source_type_idx").on(table.sourceType),
}));

// ============ EPISODE CANDIDATES ============
// YouTube video candidates for episode identity resolution (dark launch staging table)
export const candidateStatuses = ["pending", "accepted", "rejected", "expired"] as const;
export type CandidateStatus = typeof candidateStatuses[number];

export const episodeCandidates = pgTable("episode_candidates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  youtubeVideoId: text("youtube_video_id").notNull(),
  youtubeVideoUrl: text("youtube_video_url").notNull(),
  youtubeChannelId: text("youtube_channel_id"),
  youtubeChannelName: text("youtube_channel_name"),
  videoTitle: text("video_title").notNull(),
  videoDurationSeconds: integer("video_duration_seconds"),
  videoPublishedAt: timestamp("video_published_at"),
  confidenceScore: real("confidence_score").notNull().default(0), // 0.0-1.0 confidence in match
  signals: jsonb("signals").notNull().default(sql`'{}'::jsonb`), // Signal breakdown: {titleMatch, durationDelta, channelMatch, dateMatch, etc.}
  status: text("status").notNull().default("pending"), // 'pending' | 'accepted' | 'rejected' | 'expired'
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeIdIdx: index("episode_candidate_episode_idx").on(table.episodeId),
  statusIdx: index("episode_candidate_status_idx").on(table.status),
  confidenceIdx: index("episode_candidate_confidence_idx").on(table.confidenceScore),
  uniqueEpisodeVideo: uniqueIndex("unique_episode_video_candidate").on(table.episodeId, table.youtubeVideoId),
}));

export const insertEpisodeCandidateSchema = createInsertSchema(episodeCandidates).omit({
  id: true,
  createdAt: true,
});
export type InsertEpisodeCandidate = z.infer<typeof insertEpisodeCandidateSchema>;
export type EpisodeCandidate = typeof episodeCandidates.$inferSelect;

// ============ EPISODE SOURCES ============
// Multiple sources (audio, video, upload) for the same episode
export const episodeSourceKinds = ["audio", "video", "upload"] as const;
export type EpisodeSourceKind = typeof episodeSourceKinds[number];

export const episodeSourcePlatforms = ["podcast_host", "spotify", "apple_podcasts", "youtube", "vimeo", "replit_storage", "other"] as const;
export type EpisodeSourcePlatform = typeof episodeSourcePlatforms[number];

export const episodeSources = pgTable("episode_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // 'audio' | 'video'
  platform: text("platform").notNull(), // 'rss', 'upload', 'youtube', etc.
  sourceUrl: text("source_url"), // Original URL (RSS, YouTube, etc.)
  storageUrl: text("storage_url"), // Internal object storage URL after download
  isCanonical: boolean("is_canonical").notNull().default(false), // Primary source for transcript alignment
  alignmentOffsetSeconds: integer("alignment_offset_seconds").notNull().default(0), // Video sync offset vs canonical audio
  manuallyEdited: boolean("manually_edited").notNull().default(false), // Protects from auto-sync overwrites
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeIdIdx: index("episode_source_episode_idx").on(table.episodeId),
  kindIdx: index("episode_source_kind_idx").on(table.kind),
  canonicalIdx: index("episode_source_canonical_idx").on(table.episodeId, table.isCanonical),
  uniqueEpisodeSourceUrl: uniqueIndex("unique_episode_source_url").on(table.episodeId, table.sourceUrl),
}));

// ============ GENERIC JOB SYSTEM ============
// Background jobs for transcription, video analysis, annotation generation, etc.
export const jobTypes = [
  // Core analysis jobs
  "transcribe", "video_analysis", "annotate", "youtube_transcript", "youtube_video_analysis", 
  "detect_music", "detect_sponsors", "detect_claims", "detect_viral_moments", "generate_key_moments", "extract_clip", "burn_captions", "optimize_clip", "run_clip_pipeline",
  // Zoom call analysis
  "analyze_zoom_call",
  // Pipeline jobs (Phase 1-4)
  "episode_import", "episode_transcript", "episode_annotate",
  "episode_comments_fetch", "episode_comments_map", "episode_vision_enrich",
  // Semantic Engine jobs (Phase 0-6)
  "extract_statements", "classify_statements", "link_entities", "integrity_score",
  // Affiliate Arbitrage Engine
  "extract_affiliate_entities",
  // Topics & Semantic Clusters (Phase 4)
  "topic_discovery", "assign_topics",
  // Statement Relations (Phase 5)
  "discover_relations_episode",
  // Semantic Search (Phase 8)
  "embed_statements",
  // Cross-Episode Recurrence Detection (Phase 9)
  "discover_relations_cross_episode",
  // Speaker Identity Resolution (Phase 10)
  "resolve_speakers",
  // Contradiction Detection (Phase 11)
  "detect_contradictions",
  // Episode Card Spine
  "generate_episode_summary",
  // Selman Deal Intelligence Pack
  "build_selman_pack"
] as const;
export type JobType = typeof jobTypes[number];

export const jobStatuses = ["pending", "running", "done", "error"] as const;
export type JobStatus = typeof jobStatuses[number];

// Pipeline stages for queue isolation:
// INGEST: Content fetching jobs (transcripts, imports) - higher priority
// INTEL: AI analysis jobs (claims, entities, embeddings) - lower priority
export const pipelineStages = ["INGEST", "INTEL"] as const;
export type PipelineStage = typeof pipelineStages[number];

// Mapping of job types to pipeline stages
export const JOB_TYPE_PIPELINE: Record<string, PipelineStage> = {
  // INGEST: Content acquisition jobs (run first)
  episode_import: "INGEST",
  episode_transcript: "INGEST",
  transcribe: "INGEST",
  youtube_transcript: "INGEST",
  video_analysis: "INGEST",
  youtube_video_analysis: "INGEST",
  episode_comments_fetch: "INGEST",
  // INTEL: AI analysis jobs (run after content is ready)
  annotate: "INTEL",
  episode_annotate: "INTEL",
  episode_comments_map: "INTEL",
  episode_vision_enrich: "INTEL",
  detect_music: "INTEL",
  detect_sponsors: "INTEL",
  detect_claims: "INTEL",
  detect_viral_moments: "INTEL",
  generate_key_moments: "INTEL",
  extract_clip: "INTEL",
  burn_captions: "INTEL",
  optimize_clip: "INTEL",
  run_clip_pipeline: "INTEL",
  extract_statements: "INTEL",
  classify_statements: "INTEL",
  link_entities: "INTEL",
  integrity_score: "INTEL",
  extract_affiliate_entities: "INTEL",
  topic_discovery: "INTEL",
  assign_topics: "INTEL",
  discover_relations_episode: "INTEL",
  embed_statements: "INTEL",
  discover_relations_cross_episode: "INTEL",
  // Speaker Identity Resolution
  resolve_speakers: "INTEL",
  // Contradiction Detection
  detect_contradictions: "INTEL",
  // Zoom call analysis
  analyze_zoom_call: "INTEL",
  // Episode Card Spine
  generate_episode_summary: "INTEL",
  // Selman Deal Intelligence Pack
  build_selman_pack: "INTEL",
};

export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeSourceId: varchar("episode_source_id").references(() => episodeSources.id, { onDelete: "cascade" }), // Nullable for global jobs (e.g., topic_discovery)
  type: text("type").notNull(), // 'transcribe' | 'video_analysis' | 'annotate' | 'youtube_transcript' | 'topic_discovery' etc.
  status: text("status").notNull().default("pending"), // 'pending' | 'running' | 'done' | 'error'
  pipelineStage: text("pipeline_stage").default("INTEL"), // 'INGEST' | 'INTEL' - for queue isolation/priority
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  result: jsonb("result"), // For storing structured output (Gemini responses, debug data, etc.)
  nextRetryAt: timestamp("next_retry_at"), // When job can be retried (null = immediate, timestamp = wait until then)
  startedAt: timestamp("started_at"), // When job started running (for stuck job detection)
  lockedBy: text("locked_by"), // Worker ID that claimed this job (for distributed workers)
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeSourceIdIdx: index("job_episode_source_idx").on(table.episodeSourceId),
  typeIdx: index("job_type_idx").on(table.type),
  statusIdx: index("job_status_idx").on(table.status),
  pendingIdx: index("job_pending_idx").on(table.status, table.createdAt),
  retryIdx: index("job_retry_idx").on(table.status, table.nextRetryAt),
  startedAtIdx: index("job_started_at_idx").on(table.startedAt), // For stuck job queries
  pipelineStageIdx: index("job_pipeline_stage_idx").on(table.pipelineStage),
}));

// Job failures - persists permanent job failures for admin visibility
export const jobFailures = pgTable("job_failures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  jobType: text("job_type").notNull(),
  errorMessage: text("error_message").notNull(),
  errorStack: text("error_stack"),
  isTransient: boolean("is_transient").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  jobIdIdx: index("job_failures_job_id_idx").on(table.jobId),
  createdAtIdx: index("job_failures_created_at_idx").on(table.createdAt),
  typeIdx: index("job_failures_type_idx").on(table.jobType),
}));

export const transcriptSegments = pgTable("transcript_segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  startTime: integer("start_time").notNull(),
  endTime: integer("end_time").notNull(),
  text: text("text").notNull(),
  type: text("type").notNull(),
  speaker: text("speaker"),
  isStale: boolean("is_stale").notNull().default(false),
}, (table) => ({
  episodeIdIdx: index("segment_episode_id_idx").on(table.episodeId),
  startTimeIdx: index("segment_start_time_idx").on(table.startTime),
  uniqueEpisodeStartTime: uniqueIndex("unique_episode_start_time").on(table.episodeId, table.startTime),
}));

// ============ SEMANTIC ENGINE: STATEMENTS ============
// Atomic statements extracted from transcript segments for semantic analysis
// Embedding status values for statement embeddings
export const embeddingStatuses = ["pending", "done", "error"] as const;
export type EmbeddingStatus = typeof embeddingStatuses[number];

export const statements = pgTable("statements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  segmentId: varchar("segment_id").references(() => transcriptSegments.id, { onDelete: "set null" }),
  startTime: integer("start_time").notNull(), // milliseconds into episode
  endTime: integer("end_time").notNull(), // milliseconds into episode
  speaker: text("speaker"),
  text: text("text").notNull(), // cleaned atomic statement (max ~25 words)
  confidence: real("confidence").notNull().default(1.0), // 0-1 quality score
  embedding: jsonb("embedding"), // JSONB fallback for compatibility
  embeddingStatus: text("embedding_status").default("pending"), // 'pending' | 'done' | 'error'
  // Note: embedding_vector column (pgvector) is managed directly in DB, not through Drizzle ORM
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeIdIdx: index("statement_embedding_status_idx").on(table.embeddingStatus),
  segmentIdIdx: index("statement_segment_id_idx").on(table.segmentId),
  startTimeIdx: index("statement_start_time_idx").on(table.startTime),
  episodeIdIdx2: index("statement_episode_id_idx").on(table.episodeId),
}));

export const insertStatementSchema = createInsertSchema(statements).omit({ id: true, createdAt: true });
export type InsertStatement = z.infer<typeof insertStatementSchema>;
export type Statement = typeof statements.$inferSelect;

// ============ SEMANTIC ENGINE: STATEMENT CLASSIFICATIONS ============
// Classification of statements for semantic analysis (claims, opinions, etc.)
export const statementClaimTypes = ["fact", "opinion", "advice", "anecdote", "question"] as const;
export type StatementClaimType = typeof statementClaimTypes[number];

export const statementPolarityTypes = ["supportive", "skeptical", "neutral"] as const;
export type StatementPolarityType = typeof statementPolarityTypes[number];

export const statementModalityTypes = ["certain", "uncertain", "speculative"] as const;
export type StatementModalityType = typeof statementModalityTypes[number];

export const statementClassifications = pgTable("statement_classifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  statementId: varchar("statement_id").notNull().references(() => statements.id, { onDelete: "cascade" }),
  claimFlag: boolean("claim_flag").notNull(), // Is this a claim?
  claimType: text("claim_type").notNull(), // fact | opinion | advice | anecdote | question
  certainty: real("certainty").notNull(), // 0-1
  polarity: text("polarity").notNull(), // supportive | skeptical | neutral
  modality: text("modality").notNull(), // certain | uncertain | speculative
  sentiment: real("sentiment").notNull(), // -1 to 1
  emotionalTone: text("emotional_tone").notNull(), // free text label ("calm", "angry", etc.)
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  statementIdIdx: index("classification_statement_id_idx").on(table.statementId),
  claimFlagIdx: index("classification_claim_flag_idx").on(table.claimFlag),
  uniqueStatementId: uniqueIndex("classification_unique_statement").on(table.statementId),
}));

export const insertStatementClassificationSchema = createInsertSchema(statementClassifications).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStatementClassification = z.infer<typeof insertStatementClassificationSchema>;
export type StatementClassification = typeof statementClassifications.$inferSelect;

// ============ SEMANTIC ENGINE: TOPICS (Phase 4) ============
// Reusable named topics that group statements across episodes
export const topics = pgTable("topics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // Short human label ("Sleep anxiety")
  slug: text("slug"), // URL-safe unique key (optional, for future use)
  description: text("description"), // Optional AI-generated summary
  embedding: jsonb("embedding"), // Vector embedding (768 dimensions)
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  slugIdx: uniqueIndex("topic_slug_idx").on(table.slug),
  nameIdx: index("topic_name_idx").on(table.name),
}));

export const insertTopicSchema = createInsertSchema(topics).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTopic = z.infer<typeof insertTopicSchema>;
export type Topic = typeof topics.$inferSelect;

// ============ SEMANTIC ENGINE: STATEMENT-TOPIC LINKS (Phase 4) ============
// Junction table linking statements to topics with confidence scores
export const statementTopics = pgTable("statement_topics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  statementId: varchar("statement_id").notNull().references(() => statements.id, { onDelete: "cascade" }),
  topicId: varchar("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
  confidence: real("confidence").notNull().default(0.5), // 0-1, how strongly this statement belongs
  isPrimary: boolean("is_primary").notNull().default(false), // Is this the main topic for this statement?
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  statementIdIdx: index("statement_topic_statement_idx").on(table.statementId),
  topicIdIdx: index("statement_topic_topic_idx").on(table.topicId),
  uniqueStatementTopic: uniqueIndex("statement_topic_unique").on(table.statementId, table.topicId),
}));

export const insertStatementTopicSchema = createInsertSchema(statementTopics).omit({ id: true, createdAt: true });
export type InsertStatementTopic = z.infer<typeof insertStatementTopicSchema>;
export type StatementTopic = typeof statementTopics.$inferSelect;

// ============ SEMANTIC ENGINE: STATEMENT RELATIONS (Phase 5) ============
// Edges between statements: supports, contradicts, extends
export const relationTypes = ["supports", "contradicts", "extends", "recurrence"] as const;
export type RelationType = typeof relationTypes[number];

export const relationScopes = ["intra_episode", "cross_episode"] as const;
export type RelationScope = typeof relationScopes[number];

export const statementRelations = pgTable("statement_relations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  statementAId: varchar("statement_a_id").notNull().references(() => statements.id, { onDelete: "cascade" }),
  statementBId: varchar("statement_b_id").notNull().references(() => statements.id, { onDelete: "cascade" }),
  relation: text("relation").notNull(), // "supports" | "contradicts" | "extends"
  scope: text("scope").notNull().default("intra_episode"), // "intra_episode" | "cross_episode"
  confidence: real("confidence").notNull(), // 0-1
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeIdIdx: index("statement_relation_episode_idx").on(table.episodeId),
  relationIdx: index("statement_relation_type_idx").on(table.relation),
  statementAIdx: index("statement_relation_a_idx").on(table.statementAId),
  statementBIdx: index("statement_relation_b_idx").on(table.statementBId),
  uniqueRelation: uniqueIndex("statement_relation_unique").on(table.statementAId, table.statementBId, table.relation),
}));

export const insertStatementRelationSchema = createInsertSchema(statementRelations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStatementRelation = z.infer<typeof insertStatementRelationSchema>;
export type StatementRelation = typeof statementRelations.$inferSelect;

export const annotations = pgTable("annotations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  segmentId: varchar("segment_id").notNull().references(() => transcriptSegments.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  startOffset: integer("start_offset").notNull(),
  endOffset: integer("end_offset").notNull(),
  content: text("content").notNull(),
  timestamp: integer("timestamp"), // seconds into episode audio - calculated from segment position
  status: text("status").notNull().default("approved"), // 'pending' | 'approved' | 'rejected' | 'flagged'
  rejectionReason: text("rejection_reason"), // Reason for rejection, set by moderator
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  upvotes: integer("upvotes").notNull().default(0),
  downvotes: integer("downvotes").notNull().default(0),
  featured: boolean("featured").notNull().default(false),
  featuredAt: timestamp("featured_at"),
  isHero: boolean("is_hero").notNull().default(false),
  isAiGenerated: boolean("is_ai_generated").notNull().default(false), // AI-generated annotation suggestions
}, (table) => ({
  episodeIdIdx: index("annotation_episode_id_idx").on(table.episodeId),
  segmentIdIdx: index("annotation_segment_id_idx").on(table.segmentId),
  userIdIdx: index("annotation_user_id_idx").on(table.userId),
  votesIdx: index("annotation_votes_idx").on(table.upvotes, table.downvotes),
  featuredIdx: index("annotation_featured_idx").on(table.featured, table.featuredAt),
  heroIdx: index("annotation_hero_idx").on(table.isHero),
  statusIdx: index("annotation_status_idx").on(table.status),
  aiGeneratedIdx: index("annotation_ai_generated_idx").on(table.isAiGenerated),
}));

// ============ ANNOTATION VOTES ============
// Track individual user votes on annotations for proper toggle behavior
export const annotationVotes = pgTable("annotation_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  annotationId: varchar("annotation_id").notNull().references(() => annotations.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'up' | 'down'
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  annotationIdIdx: index("annotation_vote_annotation_idx").on(table.annotationId),
  userIdIdx: index("annotation_vote_user_idx").on(table.userId),
  uniqueVote: uniqueIndex("annotation_votes_unique").on(table.annotationId, table.userId),
}));

// ============ ANNOTATION REPORTS ============
// User reports on annotations for moderation
export const reportReasons = ["spam", "harassment", "misinformation", "offtopic", "other"] as const;
export type ReportReason = typeof reportReasons[number];

export const reportStatuses = ["pending", "reviewed", "dismissed", "actioned"] as const;
export type ReportStatus = typeof reportStatuses[number];

export const annotationReports = pgTable("annotation_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  annotationId: varchar("annotation_id").notNull().references(() => annotations.id, { onDelete: "cascade" }),
  reporterId: varchar("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(), // 'spam' | 'harassment' | 'misinformation' | 'offtopic' | 'other'
  details: text("details"), // Optional additional context from reporter
  status: text("status").notNull().default("pending"), // 'pending' | 'reviewed' | 'dismissed' | 'actioned'
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  resolution: text("resolution"), // What action was taken (if any)
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  annotationIdIdx: index("report_annotation_idx").on(table.annotationId),
  reporterIdIdx: index("report_reporter_idx").on(table.reporterId),
  statusIdx: index("report_status_idx").on(table.status),
  createdAtIdx: index("report_created_at_idx").on(table.createdAt),
}));

// ============ EPISODE SEGMENTS (AI-generated topic/chapter markers) ============
// These are semantic segments with labels like "Collagen science explained"
// Different from transcriptSegments which are raw speech segments
export const episodeSegments = pgTable("episode_segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  startTime: integer("start_time").notNull(), // seconds into episode
  endTime: integer("end_time"), // optional end time in seconds
  label: text("label").notNull(), // e.g., "Setup", "Core Insight", "Deep Dive"
  title: text("title"), // 5-9 word neutral chapter-style title
  summary: text("summary"), // 2-3 sentences explaining what is discussed
  snippetText: text("snippet_text"), // Pre-generated ~250 char snippet from transcript
  segmentType: text("segment_type").notNull().default("topic"), // topic, intro, outro, ad, music, narrative
  displayOrder: integer("display_order").notNull().default(0),
  isAiGenerated: boolean("is_ai_generated").notNull().default(true),
  // Phase 3: Comments & Sentiment
  topics: text("topics").array(), // AI-extracted topic tags
  engagementScore: integer("engagement_score"), // 0-100 based on comment activity
  sentimentSummary: jsonb("sentiment_summary"), // { positive: 72, negative: 18, neutral: 10, topComments: [...] }
  // Phase 4: Vision enrichment
  visualTags: text("visual_tags").array(), // ['chart', 'tweet', 'product']
  visualCaption: text("visual_caption"), // "Host shows screenshot of Twitter post"
  // Narrative grounding evidence
  evidence: jsonb("evidence"), // [{ type: "quote"|"claim", text: string, timestamp: string }]
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeIdIdx: index("episode_segment_episode_idx").on(table.episodeId),
  startTimeIdx: index("episode_segment_start_idx").on(table.startTime),
  typeIdx: index("episode_segment_type_idx").on(table.segmentType),
  engagementIdx: index("episode_segment_engagement_idx").on(table.engagementScore),
}));

// ============ EPISODE SEMANTIC SEGMENTS (AI-classified topic/intent/scores) ============
// Stores semantic analysis results per episode time range
// Intent types for semantic segment classification
export const semanticIntents = ["story", "claim", "opinion", "question", "explanation", "debate", "humor", "callout", "tangent"] as const;
export type SemanticIntent = typeof semanticIntents[number];

export const episodeSemanticSegments = pgTable("episode_semantic_segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  segmentId: varchar("segment_id").references(() => episodeSegments.id, { onDelete: "set null" }),
  
  startTime: integer("start_time").notNull(), // seconds
  endTime: integer("end_time").notNull(), // seconds
  
  // Semantic classification
  topicCategory: text("topic_category"), // e.g., "Habits", "Finance", "Health"
  subTopic: text("sub_topic"), // e.g., "Identity-based habits", "Compound interest"
  intent: text("intent"), // 'story' | 'claim' | 'opinion' | 'question' | 'explanation' | 'debate' | 'humor' | 'callout' | 'tangent'
  
  // AI-computed scores (0-1 range)
  importanceScore: real("importance_score"), // How important is this segment to the overall content
  noveltyScore: real("novelty_score"), // How unique/new is the information
  emotionIntensity: real("emotion_intensity"), // Emotional intensity of the segment
  clipabilityScore: real("clipability_score"), // How suitable for creating a standalone clip
  
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeIdIdx: index("episode_semantic_segment_episode_idx").on(table.episodeId),
  segmentIdIdx: index("episode_semantic_segment_segment_idx").on(table.segmentId),
  startTimeIdx: index("episode_semantic_segment_start_idx").on(table.startTime),
  intentIdx: index("episode_semantic_segment_intent_idx").on(table.intent),
  topicIdx: index("episode_semantic_segment_topic_idx").on(table.topicCategory),
  importanceIdx: index("episode_semantic_segment_importance_idx").on(table.importanceScore),
  clipabilityIdx: index("episode_semantic_segment_clipability_idx").on(table.clipabilityScore),
}));

export const insertEpisodeSemanticSegmentSchema = createInsertSchema(episodeSemanticSegments).omit({ id: true, createdAt: true });
export type InsertEpisodeSemanticSegment = z.infer<typeof insertEpisodeSemanticSegmentSchema>;
export type EpisodeSemanticSegment = typeof episodeSemanticSegments.$inferSelect;

// ============ EPISODE COMMENTS (Phase 3: YouTube comments) ============
// Raw YouTube comments for sentiment analysis
export const episodeComments = pgTable("episode_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(), // YouTube comment ID
  parentId: text("parent_id"), // For replies (YouTube parent comment ID)
  authorName: text("author_name"),
  authorChannelId: text("author_channel_id"),
  text: text("text").notNull(),
  likeCount: integer("like_count").notNull().default(0),
  replyCount: integer("reply_count").notNull().default(0),
  rawTimestamp: text("raw_timestamp"), // If comment includes a timestamp reference
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeIdIdx: index("episode_comment_episode_idx").on(table.episodeId),
  externalIdIdx: uniqueIndex("episode_comment_external_idx").on(table.episodeId, table.externalId),
  likeCountIdx: index("episode_comment_likes_idx").on(table.likeCount),
}));

// Sentiment labels for comment-segment mappings
export const sentimentLabels = ["positive", "negative", "neutral", "debate", "confused", "funny"] as const;
export type SentimentLabel = typeof sentimentLabels[number];

// Links comments to segments with sentiment analysis
export const commentSegmentLinks = pgTable("comment_segment_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").notNull().references(() => episodeComments.id, { onDelete: "cascade" }),
  segmentId: varchar("segment_id").notNull().references(() => episodeSegments.id, { onDelete: "cascade" }),
  sentimentLabel: text("sentiment_label").notNull(), // 'positive' | 'negative' | 'neutral' | 'debate' | 'confused' | 'funny'
  confidence: integer("confidence").notNull().default(0), // 0-100 confidence score
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  commentIdIdx: index("comment_link_comment_idx").on(table.commentId),
  segmentIdIdx: index("comment_link_segment_idx").on(table.segmentId),
  sentimentIdx: index("comment_link_sentiment_idx").on(table.sentimentLabel),
}));

// ============ FEATURE FLAGS ============
// Runtime configuration for feature rollout and limits
export const featureFlags = pgTable("feature_flags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // e.g., "PUBLIC_FULL_TRANSCRIPTS_ENABLED"
  value: text("value").notNull(), // JSON string for flexibility
  description: text("description"),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
});

// Music detected in episodes via AudD API
export const musicDetections = pgTable("music_detections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  startTime: integer("start_time").notNull(), // seconds into episode
  endTime: integer("end_time"), // optional end time
  artist: text("artist").notNull(),
  title: text("title").notNull(),
  album: text("album"),
  releaseDate: text("release_date"),
  label: text("label"),
  spotifyUrl: text("spotify_url"),
  appleMusicUrl: text("apple_music_url"),
  songLink: text("song_link"), // generic link
  artworkUrl: text("artwork_url"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeIdIdx: index("music_episode_id_idx").on(table.episodeId),
  startTimeIdx: index("music_start_time_idx").on(table.startTime),
}));

// Sponsor segments detected in episodes via heuristic keyword matching
export const sponsorSegments = pgTable("sponsor_segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  startTime: integer("start_time").notNull(), // seconds into episode
  endTime: integer("end_time"), // optional end time
  brand: text("brand"), // extracted brand name if available
  confidence: integer("confidence").notNull(), // 0-100 confidence score
  excerpt: text("excerpt").notNull(), // transcript text around the sponsor mention
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeIdIdx: index("sponsor_episode_id_idx").on(table.episodeId),
  startTimeIdx: index("sponsor_start_time_idx").on(table.startTime),
}));

// ============ ANALYZER REQUESTS (PLG / Public Analysis) ============
// Track public podcast analysis requests without polluting main episodes
export const analyzerStatuses = ["pending", "processing", "ready", "failed"] as const;
export type AnalyzerStatus = typeof analyzerStatuses[number];

export const analyzerRequests = pgTable("analyzer_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").references(() => episodes.id, { onDelete: "cascade" }), // optional - null for PLG standalone analysis
  youtubeUrl: text("youtube_url").notNull(),
  email: text("email"), // optional, for follow-up / report delivery
  ipAddress: text("ip_address"), // for rate limiting
  status: text("status").notNull().default("pending"), // 'pending' | 'processing' | 'ready' | 'failed'
  errorMessage: text("error_message"),
  results: jsonb("results"), // stores analysis results as JSON
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  youtubeUrlIdx: index("analyzer_youtube_url_idx").on(table.youtubeUrl),
  statusIdx: index("analyzer_status_idx").on(table.status),
  createdAtIdx: index("analyzer_created_at_idx").on(table.createdAt),
}));

// Claim types for AI-extracted claims
export const claimTypes = ["financial", "medical", "sensitive", "other"] as const;
export type ClaimType = typeof claimTypes[number];

// Claims extracted from episodes via AI analysis
export const episodeClaims = pgTable("episode_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  startTime: integer("start_time").notNull(), // seconds into episode
  endTime: integer("end_time"), // optional end time
  claimText: text("claim_text").notNull(), // the extracted claim statement
  claimType: text("claim_type").notNull(), // 'financial' | 'medical' | 'sensitive' | 'other'
  confidence: integer("confidence").notNull(), // 0-100 confidence score
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeIdIdx: index("claim_episode_id_idx").on(table.episodeId),
  startTimeIdx: index("claim_start_time_idx").on(table.startTime),
  claimTypeIdx: index("claim_type_idx").on(table.claimType),
}));

// Video clips for sharing highlights from episodes
export const clips = pgTable("clips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  annotationId: varchar("annotation_id").references(() => annotations.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  startTime: integer("start_time").notNull(), // seconds into episode
  endTime: integer("end_time").notNull(), // seconds into episode
  transcriptText: text("transcript_text"), // text from transcript during clip
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeIdIdx: index("clip_episode_id_idx").on(table.episodeId),
  userIdIdx: index("clip_user_id_idx").on(table.userId),
  annotationIdIdx: index("clip_annotation_id_idx").on(table.annotationId),
}));

// ============ VIDEO EVENTS (AI-generated from video analysis) ============
// Scenes, products, logos, slides, etc. detected in video sources
export const videoEventTypes = ["scene", "product", "logo", "slide", "text", "person", "action"] as const;
export type VideoEventType = typeof videoEventTypes[number];

export const videoEvents = pgTable("video_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeSourceId: varchar("episode_source_id").notNull().references(() => episodeSources.id, { onDelete: "cascade" }),
  startTime: integer("start_time").notNull(), // seconds into video
  endTime: integer("end_time"), // seconds, or same as startTime for instant events
  eventType: text("event_type").notNull(), // 'scene' | 'product' | 'logo' | 'slide' etc.
  label: text("label").notNull(), // short description
  payload: jsonb("payload"), // raw/structured Gemini output (brand, colors, OCR, etc.)
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeSourceIdIdx: index("video_event_source_idx").on(table.episodeSourceId),
  startTimeIdx: index("video_event_start_idx").on(table.startTime),
  eventTypeIdx: index("video_event_type_idx").on(table.eventType),
}));

// ============ SOURCE TRANSCRIPTS (per-source transcripts for video/YouTube) ============
// Separate from episode-level transcripts - allows video sources to have their own captions
export const sourceTranscriptProviders = ["youtube", "assemblyai", "whisper", "manual"] as const;
export type SourceTranscriptProvider = typeof sourceTranscriptProviders[number];

export const sourceTranscripts = pgTable("source_transcripts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeSourceId: varchar("episode_source_id").notNull().references(() => episodeSources.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // 'youtube' | 'assemblyai' | 'whisper' | 'manual'
  language: text("language").default("en"), // ISO language code
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeSourceIdIdx: index("source_transcript_source_idx").on(table.episodeSourceId),
  providerIdx: index("source_transcript_provider_idx").on(table.provider),
}));

export const sourceTranscriptSegments = pgTable("source_transcript_segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceTranscriptId: varchar("source_transcript_id").notNull().references(() => sourceTranscripts.id, { onDelete: "cascade" }),
  startTime: integer("start_time").notNull(), // milliseconds for precision (YouTube provides ms)
  endTime: integer("end_time").notNull(),
  text: text("text").notNull(),
  speaker: text("speaker"), // YouTube doesn't provide this, so NULL
}, (table) => ({
  sourceTranscriptIdIdx: index("source_segment_transcript_idx").on(table.sourceTranscriptId),
  startTimeIdx: index("source_segment_start_idx").on(table.startTime),
}));

export const insertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true
});
export const insertPodcastSchema = createInsertSchema(podcasts).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export const insertEpisodeSchema = createInsertSchema(episodes).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  status: true
});
export const insertTranscriptSegmentSchema = createInsertSchema(transcriptSegments).omit({ id: true });
export const insertAnnotationSchema = createInsertSchema(annotations).omit({ id: true, createdAt: true, upvotes: true, downvotes: true, featured: true, featuredAt: true });
export const insertAnnotationVoteSchema = createInsertSchema(annotationVotes).omit({ id: true, createdAt: true });
export const insertMusicDetectionSchema = createInsertSchema(musicDetections).omit({ id: true, createdAt: true });
export const insertSponsorSegmentSchema = createInsertSchema(sponsorSegments).omit({ id: true, createdAt: true });
export const insertEpisodeClaimSchema = createInsertSchema(episodeClaims).omit({ id: true, createdAt: true });
export const insertClipSchema = createInsertSchema(clips).omit({ id: true, createdAt: true });
export const insertEpisodeSegmentSchema = createInsertSchema(episodeSegments).omit({ id: true, createdAt: true });
export const insertFeatureFlagSchema = createInsertSchema(featureFlags).omit({ id: true, updatedAt: true });
export const insertEpisodeSourceSchema = createInsertSchema(episodeSources).omit({ id: true, createdAt: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVideoEventSchema = createInsertSchema(videoEvents).omit({ id: true, createdAt: true });
export const insertSourceTranscriptSchema = createInsertSchema(sourceTranscripts).omit({ id: true, createdAt: true });
export const insertSourceTranscriptSegmentSchema = createInsertSchema(sourceTranscriptSegments).omit({ id: true });
export const insertEpisodeCommentSchema = createInsertSchema(episodeComments).omit({ id: true, createdAt: true });
export const insertCommentSegmentLinkSchema = createInsertSchema(commentSegmentLinks).omit({ id: true, createdAt: true });

// Segment types for episode segments
export const segmentTypes = ["topic", "intro", "outro", "ad", "music", "qa", "story", "discussion"] as const;
export type SegmentType = typeof segmentTypes[number];

// ============ EPISODE CHAPTERS (curated navigation chapters, V1 spec) ============
// AI-generated topic-based navigation chapters (8-15 per episode, 4+ min spacing)
export const episodeChapters = pgTable("episode_chapters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  startTime: integer("start_time").notNull(),
  endTime: integer("end_time"),
  title: text("title").notNull(),
  summary: text("summary"),
  displayOrder: integer("display_order").notNull().default(0),
  confidence: real("confidence"),
  source: text("source").default("ai"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeIdIdx: index("episode_chapter_episode_idx").on(table.episodeId),
  startTimeIdx: index("episode_chapter_start_idx").on(table.startTime),
  orderIdx: index("episode_chapter_order_idx").on(table.displayOrder),
}));

export const insertEpisodeChapterSchema = createInsertSchema(episodeChapters).omit({ id: true, createdAt: true });
export type InsertEpisodeChapter = z.infer<typeof insertEpisodeChapterSchema>;
export type EpisodeChapter = typeof episodeChapters.$inferSelect;

// ============ EPISODE HIGHLIGHTS (shareable key moments, V1 spec) ============
// AI-generated highlight clips: quotable moments, key insights, viral-worthy segments
export const episodeHighlights = pgTable("episode_highlights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  startTime: integer("start_time").notNull(), // seconds into episode
  endTime: integer("end_time").notNull(), // seconds into episode
  title: text("title").notNull(), // short catchy title (e.g., "The $100M Lesson")
  quoteText: text("quote_text").notNull(), // exact quote or key phrase from transcript
  description: text("description"), // optional context/explanation
  highlightType: text("highlight_type").notNull().default("insight"), // 'insight' | 'quote' | 'story' | 'humor' | 'controversial' | 'actionable'
  confidence: real("confidence").notNull().default(0.8), // AI confidence score
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeIdIdx: index("episode_highlight_episode_idx").on(table.episodeId),
  startTimeIdx: index("episode_highlight_start_idx").on(table.startTime),
  typeIdx: index("episode_highlight_type_idx").on(table.highlightType),
  orderIdx: index("episode_highlight_order_idx").on(table.displayOrder),
}));

export const insertEpisodeHighlightSchema = createInsertSchema(episodeHighlights).omit({ id: true, createdAt: true });
export type InsertEpisodeHighlight = z.infer<typeof insertEpisodeHighlightSchema>;
export type EpisodeHighlight = typeof episodeHighlights.$inferSelect;

export const highlightTypes = ["insight", "quote", "quotable", "story", "humor", "controversial", "actionable"] as const;
export type HighlightType = typeof highlightTypes[number];

// ============ VIRAL MOMENTS (AI-detected TikTok/Reels-worthy clips) ============
// High-virality clips optimized for social media sharing (30-60 seconds)
export const viralMomentContentTypes = ["tactical", "insight", "story", "confession", "framework"] as const;
export type ViralMomentContentType = typeof viralMomentContentTypes[number];

export const viralMomentHookTypes = ["numerical_framework", "paradox", "underdog_story", "status_threat", "tactical_playbook", "vulnerable_confession"] as const;
export type ViralMomentHookType = typeof viralMomentHookTypes[number];

export const shareabilityFactors = ["contrarian", "quantified", "aspirational", "vulnerable", "actionable", "emotional"] as const;
export type ShareabilityFactor = typeof shareabilityFactors[number];

export const viralMomentClipStatuses = ["pending", "extracting", "ready", "failed"] as const;
export type ViralMomentClipStatus = typeof viralMomentClipStatuses[number];

export const viralMomentPostingStatuses = ["draft", "ready", "scheduled", "posted", "failed"] as const;
export type ViralMomentPostingStatus = typeof viralMomentPostingStatuses[number];

export const socialPlatforms = ["tiktok", "instagram", "youtube", "twitter"] as const;
export type SocialPlatform = typeof socialPlatforms[number];

export const momentKinds = ["key", "viral"] as const;
export type MomentKind = typeof momentKinds[number];

export const viralMoments = pgTable("viral_moments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  momentKind: text("moment_kind").default("viral"), // 'key' = curated highlights, 'viral' = TikTok-worthy clips
  startTime: integer("start_time").notNull(), // seconds into episode
  endTime: integer("end_time").notNull(), // seconds into episode
  text: text("text").notNull(), // exact transcript quote
  viralityScore: integer("virality_score"), // 0-100 virality potential (NULL for key moments)
  hookReason: text("hook_reason").notNull(), // why this will go viral
  suggestedTitle: text("suggested_title").notNull(), // TikTok-style clickbait title
  pullQuote: text("pull_quote"), // 8-12 word most shareable line from the moment
  hookType: text("hook_type"), // structured: 'numerical_framework' | 'paradox' | 'underdog_story' | etc.
  shareabilityFactors: text("shareability_factors").array(), // ['contrarian', 'quantified', 'aspirational', 'vulnerable', etc.]
  topics: text("topics").array(), // tag array for categorization
  contentType: text("content_type").notNull(), // 'tactical' | 'insight' | 'story' | 'confession' | 'framework'
  entities: text("entities").array(), // people, companies, products mentioned
  displayOrder: integer("display_order").notNull().default(0),
  // Clip extraction fields
  clipStatus: text("clip_status").default("pending"), // 'pending' | 'extracting' | 'ready' | 'failed'
  videoPath: text("video_path"), // local path to extracted raw clip
  captionedPath: text("captioned_path"), // local path to clip with burned-in captions
  optimizedPath: text("optimized_path"), // local path to platform-optimized clip
  clipError: text("clip_error"), // error message if extraction failed
  clipExtractedAt: timestamp("clip_extracted_at"), // when clip was last extracted
  // Posting workflow fields
  postingStatus: text("posting_status").default("draft"), // 'draft' | 'ready' | 'scheduled' | 'posted' | 'failed'
  platform: text("platform").default("tiktok"), // target platform for optimization
  description: text("description"), // social media post description
  hashtags: text("hashtags").array(), // hashtags for posting
  postedAt: timestamp("posted_at"), // when clip was posted to social
  postUrl: text("post_url"), // URL of the posted clip on social platform
  // Performance metrics
  views: integer("views").default(0),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  shares: integer("shares").default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
}, (table) => ({
  episodeIdIdx: index("viral_moment_episode_idx").on(table.episodeId),
  viralityScoreIdx: index("viral_moment_score_idx").on(table.viralityScore),
  contentTypeIdx: index("viral_moment_type_idx").on(table.contentType),
  startTimeIdx: index("viral_moment_start_idx").on(table.startTime),
  clipStatusIdx: index("viral_moment_clip_status_idx").on(table.clipStatus),
  postingStatusIdx: index("viral_moment_posting_status_idx").on(table.postingStatus),
}));

export const insertViralMomentSchema = createInsertSchema(viralMoments).omit({ id: true, createdAt: true });
export type InsertViralMoment = z.infer<typeof insertViralMomentSchema>;
export type ViralMoment = typeof viralMoments.$inferSelect;

// ============ CLIP GENERATION RUNS (batch processing history) ============
export const clipGenerationRunStatuses = ["running", "completed", "failed"] as const;
export type ClipGenerationRunStatus = typeof clipGenerationRunStatuses[number];

export const clipGenerationRuns = pgTable("clip_generation_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runDate: timestamp("run_date").notNull(),
  podcastsProcessed: integer("podcasts_processed").default(0),
  episodesProcessed: integer("episodes_processed").default(0),
  momentsDetected: integer("moments_detected").default(0),
  clipsExtracted: integer("clips_extracted").default(0),
  clipsCaptioned: integer("clips_captioned").default(0),
  clipsOptimized: integer("clips_optimized").default(0),
  clipsFailed: integer("clips_failed").default(0),
  status: text("status").default("running").notNull(),
  errorLog: text("error_log"),
  startedAt: timestamp("started_at").notNull().default(sql`now()`),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  runDateIdx: index("clip_gen_run_date_idx").on(table.runDate),
  statusIdx: index("clip_gen_run_status_idx").on(table.status),
}));

export const insertClipGenerationRunSchema = createInsertSchema(clipGenerationRuns).omit({ id: true, startedAt: true });
export type InsertClipGenerationRun = z.infer<typeof insertClipGenerationRunSchema>;
export type ClipGenerationRun = typeof clipGenerationRuns.$inferSelect;

export const episodeStatuses = ["draft", "processing", "ready", "failed"] as const;
export type EpisodeStatus = typeof episodeStatuses[number];

export const annotationStatuses = ["pending", "approved", "rejected", "flagged"] as const;
export type AnnotationStatus = typeof annotationStatuses[number];

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export type InsertPodcast = z.infer<typeof insertPodcastSchema>;
export type Podcast = typeof podcasts.$inferSelect;

export type InsertEpisode = z.infer<typeof insertEpisodeSchema>;
export type Episode = typeof episodes.$inferSelect;

export type InsertTranscriptSegment = z.infer<typeof insertTranscriptSegmentSchema>;
export type TranscriptSegment = typeof transcriptSegments.$inferSelect;

export type InsertAnnotation = z.infer<typeof insertAnnotationSchema>;
export type Annotation = typeof annotations.$inferSelect;

export type InsertAnnotationVote = z.infer<typeof insertAnnotationVoteSchema>;
export type AnnotationVote = typeof annotationVotes.$inferSelect;

export type InsertMusicDetection = z.infer<typeof insertMusicDetectionSchema>;
export type MusicDetection = typeof musicDetections.$inferSelect;

export type InsertSponsorSegment = z.infer<typeof insertSponsorSegmentSchema>;
export type SponsorSegment = typeof sponsorSegments.$inferSelect;

export type InsertEpisodeClaim = z.infer<typeof insertEpisodeClaimSchema>;
export type EpisodeClaim = typeof episodeClaims.$inferSelect;

export type InsertClip = z.infer<typeof insertClipSchema>;
export type Clip = typeof clips.$inferSelect;

export type InsertEpisodeSegment = z.infer<typeof insertEpisodeSegmentSchema>;
export type EpisodeSegment = typeof episodeSegments.$inferSelect;

export type InsertFeatureFlag = z.infer<typeof insertFeatureFlagSchema>;
export type FeatureFlag = typeof featureFlags.$inferSelect;

export type InsertEpisodeSource = z.infer<typeof insertEpisodeSourceSchema>;
export type EpisodeSource = typeof episodeSources.$inferSelect;

export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

export type InsertVideoEvent = z.infer<typeof insertVideoEventSchema>;
export type VideoEvent = typeof videoEvents.$inferSelect;

export type InsertSourceTranscript = z.infer<typeof insertSourceTranscriptSchema>;
export type SourceTranscript = typeof sourceTranscripts.$inferSelect;

export type InsertSourceTranscriptSegment = z.infer<typeof insertSourceTranscriptSegmentSchema>;
export type SourceTranscriptSegment = typeof sourceTranscriptSegments.$inferSelect;

export type InsertEpisodeComment = z.infer<typeof insertEpisodeCommentSchema>;
export type EpisodeComment = typeof episodeComments.$inferSelect;

export type InsertCommentSegmentLink = z.infer<typeof insertCommentSegmentLinkSchema>;
export type CommentSegmentLink = typeof commentSegmentLinks.$inferSelect;

// Extended clip type with author info
export type ClipWithAuthor = Clip & {
  authorName?: string;
  authorAvatar?: string | null;
};

// Extended clip type with full metadata for sharing
export type ClipWithFullMetadata = ClipWithAuthor & {
  episodeTitle: string;
  podcastTitle: string;
  podcastArtworkUrl?: string | null;
  mediaUrl: string;
};

// Extended annotation type with joined user data
export type AnnotationWithAuthor = Annotation & {
  authorName?: string | null;
  authorAvatar?: string | null;
};

// Extended annotation type with full episode/podcast metadata for profile pages
export type AnnotationWithMetadata = AnnotationWithAuthor & {
  episodeTitle: string;
  podcastTitle: string;
  artworkUrl?: string | null;
  text: string; // The highlighted text extracted from the segment
};

// Pending annotation with full context for moderation queue
export type PendingAnnotationWithContext = {
  annotation: Annotation;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  episode: {
    id: string;
    title: string;
  };
  podcast: {
    id: string;
    title: string;
  };
};

// ============ CATEGORIES ============
// Categories/themes for organizing podcasts
export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  iconName: text("icon_name"), // Lucide icon name
  color: text("color"), // Hex color for theming
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Junction table for podcast-category relationships (many-to-many)
export const podcastCategories = pgTable("podcast_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  podcastId: varchar("podcast_id").notNull().references(() => podcasts.id, { onDelete: "cascade" }),
  categoryId: varchar("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
}, (table) => ({
  uniquePodcastCategory: uniqueIndex("unique_podcast_category").on(table.podcastId, table.categoryId),
  podcastIdIdx: index("podcast_category_podcast_idx").on(table.podcastId),
  categoryIdIdx: index("podcast_category_category_idx").on(table.categoryId),
}));

// ============ ENTITIES (Products, Books, Venues, Restaurants) ============
// Entity types for monetization
export const entityTypes = ["product", "book", "restaurant", "venue", "service", "app", "other"] as const;
export type EntityType = typeof entityTypes[number];

// Affiliate networks for monetization
export const affiliateNetworks = ["amazon", "bookshop", "opentable", "yelp", "booking", "tripadvisor", "custom"] as const;
export type AffiliateNetwork = typeof affiliateNetworks[number];

// Entities that can be monetized (products, books, restaurants, venues, etc.)
export const entities = pgTable("entities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // product, book, restaurant, venue, service, app, other
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  // Affiliate/monetization info
  affiliateNetwork: text("affiliate_network"), // amazon, bookshop, opentable, yelp, booking, tripadvisor, custom
  affiliateUrl: text("affiliate_url"),
  canonicalUrl: text("canonical_url"), // original product page without affiliate params
  // Additional metadata
  brand: text("brand"),
  author: text("author"), // for books
  location: text("location"), // for restaurants/venues
  priceText: text("price_text"), // e.g., "$29.99" or "$$$$"
  rating: text("rating"), // e.g., "4.5 stars"
  // Admin/tracking
  isVerified: boolean("is_verified").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  typeIdx: index("entity_type_idx").on(table.type),
  networkIdx: index("entity_network_idx").on(table.affiliateNetwork),
  nameIdx: index("entity_name_idx").on(table.name),
}));

// Entity mentions - links entities to specific moments in episodes (extracted from transcripts)
export const entityMentions = pgTable("entity_mentions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: varchar("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  segmentId: varchar("segment_id").references(() => transcriptSegments.id, { onDelete: "set null" }),
  // Context from transcript
  mentionText: text("mention_text"), // The exact text that mentioned this entity
  timestamp: integer("timestamp"), // seconds into episode where mentioned
  // Admin controls
  isAutoExtracted: boolean("is_auto_extracted").notNull().default(true), // AI extracted vs manually added
  isApproved: boolean("is_approved").notNull().default(false), // Admin approved for display
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  entityIdIdx: index("mention_entity_idx").on(table.entityId),
  episodeIdIdx: index("mention_episode_idx").on(table.episodeId),
  uniqueEntityEpisode: uniqueIndex("unique_entity_episode").on(table.entityId, table.episodeId),
}));

// Click tracking for affiliate links
export const entityClicks = pgTable("entity_clicks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: varchar("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  episodeId: varchar("episode_id").references(() => episodes.id, { onDelete: "set null" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  clickedAt: timestamp("clicked_at").notNull().default(sql`now()`),
  referrer: text("referrer"), // page they clicked from
  userAgent: text("user_agent"),
}, (table) => ({
  entityIdIdx: index("click_entity_idx").on(table.entityId),
  clickedAtIdx: index("click_date_idx").on(table.clickedAt),
}));

// ============ CANONICAL ENTITIES (Knowledge Graph for Cross-Episode Discovery) ============
// Types for canonical entities (distinct from monetization entity types)
export const canonicalEntityTypes = ["person", "product", "book", "company", "place", "concept", "other"] as const;
export type CanonicalEntityType = typeof canonicalEntityTypes[number];

// Linking methods for entity_links
export const entityLinkMethods = ["exact-match", "ai-assisted", "manual"] as const;
export type EntityLinkMethod = typeof entityLinkMethods[number];

// Canonical entities table - deduplicated entities for knowledge graph
export const canonicalEntities = pgTable("canonical_entities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // Canonical display name
  type: text("type").notNull(), // person, product, book, company, place, concept, other
  externalRefs: jsonb("external_refs"), // { wikipedia: "...", amazon: "...", etc }
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  typeIdx: index("canonical_entity_type_idx").on(table.type),
  nameTypeUnique: uniqueIndex("canonical_entity_name_type_idx").on(sql`lower(${table.name})`, table.type),
}));

// Entity links table - links entity mentions to canonical entities
export const entityLinks = pgTable("entity_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mentionId: varchar("mention_id").notNull().references(() => entityMentions.id, { onDelete: "cascade" }),
  canonicalId: varchar("canonical_id").notNull().references(() => canonicalEntities.id, { onDelete: "cascade" }),
  method: text("method").notNull(), // exact-match, ai-assisted, manual
  confidence: real("confidence").notNull().default(0.5), // 0-1
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  mentionIdIdx: index("entity_link_mention_idx").on(table.mentionId),
  canonicalIdIdx: index("entity_link_canonical_idx").on(table.canonicalId),
  uniqueMentionCanonical: uniqueIndex("entity_link_unique_mention").on(table.mentionId),
}));

// ============ EPISODE DIFFS (Integrity Engine - Cross-Platform Comparison) ============
// Store diff results comparing transcripts from different sources (youtube, rss, host)
export const diffSourceTypes = ["youtube", "rss", "host", "assembly"] as const;
export type DiffSourceType = typeof diffSourceTypes[number];

export const episodeDiffs = pgTable("episode_diffs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  primarySource: text("primary_source").notNull(), // 'youtube' | 'rss' | 'host' | 'assembly'
  secondarySource: text("secondary_source").notNull(),
  summary: text("summary"), // "13 segments changed between YouTube and RSS"
  metrics: jsonb("metrics").notNull(), // { similarity, addedCount, removedCount, modifiedCount, totalComparedChars, totalComparedSegments }
  samples: jsonb("samples"), // { added: [], removed: [], modified: [] } - top N examples with timestamps
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeIdIdx: index("episode_diff_episode_idx").on(table.episodeId),
  createdAtIdx: index("episode_diff_created_idx").on(table.createdAt),
}));

// ============ CATEGORY SCHEMAS ============
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true, createdAt: true });
export const insertPodcastCategorySchema = createInsertSchema(podcastCategories).omit({ id: true });

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;
export type PodcastCategory = typeof podcastCategories.$inferSelect;

// ============ ENTITY SCHEMAS ============
export const insertEntitySchema = createInsertSchema(entities).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEntityMentionSchema = createInsertSchema(entityMentions).omit({ id: true, createdAt: true });
export const insertEntityClickSchema = createInsertSchema(entityClicks).omit({ id: true, clickedAt: true });

export type InsertEntity = z.infer<typeof insertEntitySchema>;
export type Entity = typeof entities.$inferSelect;
export type InsertEntityMention = z.infer<typeof insertEntityMentionSchema>;
export type EntityMention = typeof entityMentions.$inferSelect;
export type InsertEntityClick = z.infer<typeof insertEntityClickSchema>;
export type EntityClick = typeof entityClicks.$inferSelect;

// Extended types with joins
export type EntityWithMentionCount = Entity & {
  mentionCount: number;
  clickCount: number;
};

export type EntityMentionWithDetails = EntityMention & {
  entity: Entity;
};

export type CategoryWithPodcastCount = Category & {
  podcastCount: number;
};

// ============ CANONICAL ENTITY SCHEMAS ============
export const insertCanonicalEntitySchema = createInsertSchema(canonicalEntities).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEntityLinkSchema = createInsertSchema(entityLinks).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertCanonicalEntity = z.infer<typeof insertCanonicalEntitySchema>;
export type CanonicalEntity = typeof canonicalEntities.$inferSelect;
export type InsertEntityLink = z.infer<typeof insertEntityLinkSchema>;
export type EntityLink = typeof entityLinks.$inferSelect;

// Extended types for canonical entities with mentions
export type CanonicalEntityWithMentions = CanonicalEntity & {
  mentions: Array<{
    mentionId: string;
    rawText: string | null;
    statementId: string | null;
    timestamp: number | null;
    episodeId: string;
    method: string;
    confidence: number;
  }>;
};

export type LinkedEntitiesResponse = {
  episodeId: string;
  entities: CanonicalEntityWithMentions[];
};

// ============ JOB FAILURE SCHEMAS ============
export const insertJobFailureSchema = createInsertSchema(jobFailures).omit({ id: true, createdAt: true });
export type InsertJobFailure = z.infer<typeof insertJobFailureSchema>;
export type JobFailure = typeof jobFailures.$inferSelect;

// ============ ANNOTATION REPORT SCHEMAS ============
export const insertAnnotationReportSchema = createInsertSchema(annotationReports).omit({ id: true, createdAt: true, reviewedAt: true });
export type InsertAnnotationReport = z.infer<typeof insertAnnotationReportSchema>;
export type AnnotationReport = typeof annotationReports.$inferSelect;

// Extended type with reporter and annotation info
export type AnnotationReportWithDetails = AnnotationReport & {
  reporter: { id: string; firstName: string | null; lastName: string | null; email: string | null };
  annotation: { id: string; text: string; content: string; userId: string };
  annotationAuthor: { id: string; firstName: string | null; lastName: string | null; email: string | null };
  reviewer?: { id: string; firstName: string | null; lastName: string | null } | null;
};

// ============ ANALYZER REQUEST SCHEMAS ============
export const insertAnalyzerRequestSchema = createInsertSchema(analyzerRequests).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAnalyzerRequest = z.infer<typeof insertAnalyzerRequestSchema>;
export type AnalyzerRequest = typeof analyzerRequests.$inferSelect;

// ============ EPISODE DIFF SCHEMAS ============
export const insertEpisodeDiffSchema = createInsertSchema(episodeDiffs).omit({ id: true, createdAt: true });
export type InsertEpisodeDiff = z.infer<typeof insertEpisodeDiffSchema>;
export type EpisodeDiff = typeof episodeDiffs.$inferSelect;

// Typed structures for metrics and samples JSONB columns
export type DiffMetrics = {
  similarity: number; // 0-1
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  totalComparedChars: number;
  totalComparedSegments: number;
};

export type DiffSampleAdded = {
  text: string;
  approxStartTime: number; // seconds
  approxEndTime: number;
};

export type DiffSampleRemoved = {
  text: string;
  approxStartTime: number;
  approxEndTime: number;
};

export type DiffSampleModified = {
  before: string;
  after: string;
  approxStartTime: number;
  approxEndTime: number;
};

export type DiffSamples = {
  added: DiffSampleAdded[];
  removed: DiffSampleRemoved[];
  modified: DiffSampleModified[];
};

// ============ ADMIN NOTIFICATIONS ============
// In-app notifications for admins (job failures, system events, etc.)
export const notificationSeverities = ["info", "warning", "error"] as const;
export type NotificationSeverity = typeof notificationSeverities[number];

export const notificationTypes = ["job_failure", "job_recovered", "system"] as const;
export type NotificationType = typeof notificationTypes[number];

export const adminNotifications = pgTable("admin_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // 'job_failure' | 'job_recovered' | 'system'
  severity: text("severity").notNull(), // 'info' | 'warning' | 'error'
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  episodeId: varchar("episode_id").references(() => episodes.id, { onDelete: "set null" }),
  jobType: text("job_type"), // 'transcript' | 'annotations' | 'entities' | 'diff' | 'music' etc
  payload: jsonb("payload"), // Extra details as JSON
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  typeIdx: index("admin_notification_type_idx").on(table.type),
  isReadIdx: index("admin_notification_is_read_idx").on(table.isRead),
  createdAtIdx: index("admin_notification_created_at_idx").on(table.createdAt),
  episodeIdIdx: index("admin_notification_episode_idx").on(table.episodeId),
}));

export const insertAdminNotificationSchema = createInsertSchema(adminNotifications).omit({ id: true, createdAt: true });
export type InsertAdminNotification = z.infer<typeof insertAdminNotificationSchema>;
export type AdminNotification = typeof adminNotifications.$inferSelect;

// ============ ANALYZER LEADS ============
// Captures leads from the PLG analyzer funnel
export const analyzerLeads = pgTable("analyzer_leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  company: text("company"), // nullable - optional "Podcast / Company" field
  episodeUrl: text("episode_url").notNull(), // the URL they analyzed
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  emailIdx: index("analyzer_leads_email_idx").on(table.email),
  createdAtIdx: index("analyzer_leads_created_at_idx").on(table.createdAt),
}));

export const insertAnalyzerLeadSchema = createInsertSchema(analyzerLeads).omit({ id: true, createdAt: true });
export type InsertAnalyzerLead = z.infer<typeof insertAnalyzerLeadSchema>;
export type AnalyzerLead = typeof analyzerLeads.$inferSelect;

// ============ INTEGRITY SCORES ============
// Episode integrity scores computed from statements and classifications
export const integrityBands = ["low", "medium", "high"] as const;
export type IntegrityBand = typeof integrityBands[number];

export const integrityScores = pgTable("integrity_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1), // Formula version
  score: real("score").notNull(), // 0-100
  band: text("band").notNull(), // 'low' | 'medium' | 'high'
  components: jsonb("components").notNull(), // { metrics: {...}, metricScores: {...} }
  summary: text("summary").notNull(), // Human-readable explanation
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`).$onUpdate(() => new Date()),
}, (table) => ({
  episodeIdIdx: uniqueIndex("integrity_score_episode_id_idx").on(table.episodeId),
  versionIdx: index("integrity_score_version_idx").on(table.version),
  bandIdx: index("integrity_score_band_idx").on(table.band),
}));

export const insertIntegrityScoreSchema = createInsertSchema(integrityScores).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIntegrityScore = z.infer<typeof insertIntegrityScoreSchema>;
export type IntegrityScore = typeof integrityScores.$inferSelect;

// ============ EPISODE INSIGHTS (Phase 7 - Public Aggregation Layer) ============
// Aggregated insights payload for public episode pages
export type EpisodeInsights = {
  integrity: {
    score: number;           // 0-100
    band: IntegrityBand;
    summary: string;         // 1-2 sentence AI summary
    metrics: {
      certainty: number;     // 0-1
      skepticism: number;    // 0-1
      sentiment: number;     // -1..1
      emotionalIntensity: number; // 0-1
      contradictionsCount?: number;
      supportsCount?: number;
    };
  } | null;

  topics: {
    id: string;
    name: string;
    statementCount: number;
  }[];

  entities: {
    id: string;
    name: string;
    type: CanonicalEntityType;
    mentionCount: number;
  }[];

  keyClaims: {
    statementId: string;
    startTime: number | null;
    text: string;
    certainty: number;
    polarity: StatementPolarityType | null;
  }[];

  contradictions: {
    statementAId: string;
    statementBId: string;
    statementAText: string;
    statementBText: string;
    statementAStartTime: number | null;
    statementBStartTime: number | null;
    confidence: number;
  }[];

  emotionalPeaks: {
    statementId: string;
    startTime: number | null;
    text: string;
    sentiment: number;    // -1..1
    intensity: number;    // 0-1 (derived from absolute sentiment or emotional tone)
  }[];
};

// ============ SEMANTIC SEARCH (Phase 8) ============
// Search query and result types for semantic search functionality

export type SearchQuery = {
  query: string;

  filters?: {
    topics?: string[];        // topic IDs
    entities?: string[];      // canonical entity IDs
    claimOnly?: boolean;
    polarity?: StatementPolarityType | null;
    certaintyMin?: number;    // 0-1
    sentimentMin?: number;    // abs(sentiment) threshold
    contradictionsOnly?: boolean;
    supportsOnly?: boolean;
    episodeIds?: string[];    // limit to specific episodes
  };

  limit?: number;             // default 20
};

export type SearchResult = {
  statementId: string;
  episodeId: string;
  episodeTitle: string;
  podcastTitle?: string;
  startTime: number | null;   // milliseconds
  text: string;

  score: number;              // final ranking score (0-1)
  similarity: number;         // vector cosine similarity

  topics: { id: string; name: string }[];
  entities: { id: string; name: string; type: CanonicalEntityType }[];

  claimFlag: boolean;
  certainty?: number;
  polarity?: StatementPolarityType | null;
  sentiment?: number | null;

  hasContradictions?: boolean;
  hasSupports?: boolean;
};

// ============ INGESTION PROGRAMS (Phase 9 - Ingestion Control Plane) ============

// Program status enum
export const programStatuses = ["active", "paused", "paused_due_to_config"] as const;
export type ProgramStatus = typeof programStatuses[number];

// Program source types
export const programSourceTypes = ["podcastindex_query", "podcastindex_feed", "rss_url", "youtube_channel", "imported_url"] as const;
export type ProgramSourceType = typeof programSourceTypes[number];

// Ingestion event types
export const ingestionEventTypes = ["new_episode_found", "feed_updated", "youtube_upload_found"] as const;
export type IngestionEventType = typeof ingestionEventTypes[number];

// Recommendation actions
export const recommendationActions = ["catalog", "resolve_sources", "tier1_skim", "review", "ignore"] as const;
export type RecommendationAction = typeof recommendationActions[number];

// Recommendation statuses
export const recommendationStatuses = ["pending", "approved", "rejected", "executed", "expired"] as const;
export type RecommendationStatus = typeof recommendationStatuses[number];

// Programs table - defines verticals/watchlists with seeds, filters, and caps
export const programs = pgTable("programs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"), // 'active' | 'paused' | 'archived'
  description: text("description"),
  config: jsonb("config").notNull().default(sql`'{}'::jsonb`), // filters, thresholds, budgets, transcriptPrefs
  createdBy: varchar("created_by"), // user ID who created the program
  lastAgentRun: timestamp("last_agent_run"), // when the AI agent last processed this program
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  statusIdx: index("program_status_idx").on(table.status),
  nameIdx: index("program_name_idx").on(table.name),
}));

// Zod schema for program config validation
export const programConfigSchema = z.object({
  filters: z.object({
    languages: z.array(z.string()).optional(),
    minDurationSec: z.number().optional(),
    maxDurationSec: z.number().optional(),
    recencyDays: z.number().optional(),
    includeKeywords: z.array(z.string()).optional(),
    excludeKeywords: z.array(z.string()).optional(),
  }).optional().default({}),
  transcriptPrefs: z.object({
    preferYoutubeCaptions: z.boolean().optional().default(true),
    preferRssTranscriptTags: z.boolean().optional().default(true),
  }).optional().default({}),
  thresholds: z.object({
    autoAcceptCandidate: z.number().min(0).max(1).optional().default(0.85),
    reviewMin: z.number().min(0).max(1).optional().default(0.55),
  }).optional().default({}),
  budgets: z.object({
    maxCatalogPerDay: z.number().optional().default(100),
    maxTier1PerDay: z.number().optional().default(10),
  }).optional().default({}),
});
export type ProgramConfig = z.infer<typeof programConfigSchema>;

export const insertProgramSchema = createInsertSchema(programs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProgram = z.infer<typeof insertProgramSchema>;
export type Program = typeof programs.$inferSelect;

// Program sources table - seeds for each program
export const programSources = pgTable("program_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  programId: varchar("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'podcastindex_query' | 'podcastindex_feed' | 'rss_url' | 'youtube_channel' | 'imported_url'
  value: text("value").notNull(), // query string, feedId, URL, channelId, etc.
  label: text("label"), // optional human-readable label
  enabled: boolean("enabled").notNull().default(true), // whether source is being monitored
  lastPolledAt: timestamp("last_polled_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  programIdIdx: index("program_source_program_idx").on(table.programId),
  typeIdx: index("program_source_type_idx").on(table.type),
  enabledIdx: index("program_source_enabled_idx").on(table.enabled),
}));

export const insertProgramSourceSchema = createInsertSchema(programSources).omit({ id: true, createdAt: true, lastPolledAt: true });
export type InsertProgramSource = z.infer<typeof insertProgramSourceSchema>;
export type ProgramSource = typeof programSources.$inferSelect;

// Event action statuses
export const eventActionStatuses = ["pending", "cataloged", "resolution_queued", "resolved", "ignored", "failed"] as const;
export type EventActionStatus = typeof eventActionStatuses[number];

// Ingestion events table - raw events from monitors
export const ingestionEvents = pgTable("ingestion_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  programId: varchar("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  sourceId: varchar("source_id").references(() => programSources.id, { onDelete: "set null" }),
  type: text("type").notNull(), // 'new_episode_found' | 'feed_updated' | 'youtube_upload_found'
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`), // episode metadata, feed info, etc.
  dedupeKey: text("dedupe_key"), // guid+pubDate+feedId for deduplication
  actionStatus: text("action_status").notNull().default("pending"), // 'pending' | 'cataloged' | 'resolution_queued' | 'resolved' | 'ignored' | 'failed'
  episodeId: varchar("episode_id"), // linked episode after cataloging
  observedAt: timestamp("observed_at").notNull().default(sql`now()`),
  processedAt: timestamp("processed_at"), // null until agent consumes it
}, (table) => ({
  programIdIdx: index("ingestion_event_program_idx").on(table.programId),
  typeIdx: index("ingestion_event_type_idx").on(table.type),
  processedIdx: index("ingestion_event_processed_idx").on(table.processedAt),
  actionStatusIdx: index("ingestion_event_action_status_idx").on(table.actionStatus),
  observedIdx: index("ingestion_event_observed_idx").on(table.observedAt),
  dedupeIdx: uniqueIndex("ingestion_event_dedupe_idx").on(table.programId, table.dedupeKey),
}));

export const insertIngestionEventSchema = createInsertSchema(ingestionEvents).omit({ id: true, observedAt: true, processedAt: true });
export type InsertIngestionEvent = z.infer<typeof insertIngestionEventSchema>;
export type IngestionEvent = typeof ingestionEvents.$inferSelect;

// Recommendation target types
export const recommendationTargetTypes = ["podcast", "episode", "candidate"] as const;
export type RecommendationTargetType = typeof recommendationTargetTypes[number];

// Ingestion recommendations table - agent-generated action plans
export const ingestionRecommendations = pgTable("ingestion_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  programId: varchar("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  targetType: text("target_type").notNull(), // 'podcast' | 'episode' | 'candidate'
  targetId: text("target_id").notNull(), // ID of the target entity
  action: text("action").notNull(), // 'catalog' | 'resolve_sources' | 'tier1_skim' | 'review' | 'ignore'
  confidence: real("confidence").notNull().default(0), // 0-1
  reason: text("reason").notNull(),
  estimatedCost: jsonb("estimated_cost").default(sql`'{}'::jsonb`), // can be empty for v1
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected' | 'executed' | 'expired'
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  executedAt: timestamp("executed_at"),
  agentRunId: text("agent_run_id"), // links recommendations from the same agent run
  modelInfo: jsonb("model_info").default(sql`'{}'::jsonb`), // provider, model, version
  eventId: varchar("event_id").references(() => ingestionEvents.id, { onDelete: "set null" }), // link back to source event
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  programIdIdx: index("ingestion_rec_program_idx").on(table.programId),
  actionIdx: index("ingestion_rec_action_idx").on(table.action),
  statusIdx: index("ingestion_rec_status_idx").on(table.status),
  targetIdx: index("ingestion_rec_target_idx").on(table.targetType, table.targetId),
  agentRunIdx: index("ingestion_rec_agent_run_idx").on(table.agentRunId),
  createdIdx: index("ingestion_rec_created_idx").on(table.createdAt),
}));

export const insertIngestionRecommendationSchema = createInsertSchema(ingestionRecommendations).omit({ 
  id: true, 
  createdAt: true, 
  approvedAt: true, 
  executedAt: true 
});
export type InsertIngestionRecommendation = z.infer<typeof insertIngestionRecommendationSchema>;
export type IngestionRecommendation = typeof ingestionRecommendations.$inferSelect;

// Demo leads table - stores B2B demo requests
export const demoLeads = pgTable("demo_leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company").notNull(),
  role: text("role").notNull(),
  companySize: text("company_size").notNull(),
  useCase: text("use_case").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("new"), // 'new' | 'contacted' | 'qualified' | 'converted' | 'closed'
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  emailIdx: index("demo_lead_email_idx").on(table.email),
  statusIdx: index("demo_lead_status_idx").on(table.status),
  createdIdx: index("demo_lead_created_idx").on(table.createdAt),
}));

export const insertDemoLeadSchema = createInsertSchema(demoLeads).omit({ id: true, status: true, createdAt: true });
export type InsertDemoLead = z.infer<typeof insertDemoLeadSchema>;
export type DemoLead = typeof demoLeads.$inferSelect;

// ============ USER CLIP REQUESTS (user-initiated clip generation) ============
export const userClipRequestStatuses = ["pending", "analyzing", "extracting", "captioning", "complete", "failed"] as const;
export type UserClipRequestStatus = typeof userClipRequestStatuses[number];

export const userClipRequests = pgTable("user_clip_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  youtubeVideoId: text("youtube_video_id").notNull(),
  youtubeUrl: text("youtube_url").notNull(),
  videoTitle: text("video_title"),
  videoThumbnail: text("video_thumbnail"),
  videoDuration: integer("video_duration"), // seconds
  status: text("status").notNull().default("pending"),
  statusMessage: text("status_message"),
  momentsFound: integer("moments_found").default(0),
  clipsReady: integer("clips_ready").default(0),
  episodeId: varchar("episode_id").references(() => episodes.id, { onDelete: "set null" }),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  userIdx: index("user_clip_req_user_idx").on(table.userId),
  statusIdx: index("user_clip_req_status_idx").on(table.status),
  createdIdx: index("user_clip_req_created_idx").on(table.createdAt),
  youtubeIdx: index("user_clip_req_youtube_idx").on(table.youtubeVideoId),
}));

export const insertUserClipRequestSchema = createInsertSchema(userClipRequests).omit({ id: true, createdAt: true, updatedAt: true, completedAt: true });
export type InsertUserClipRequest = z.infer<typeof insertUserClipRequestSchema>;
export type UserClipRequest = typeof userClipRequests.$inferSelect;

// ============ CLIP ORDERS (paid clip generation orders) ============
export const clipOrderStatuses = ["pending", "paid", "processing", "completed", "failed", "refunded"] as const;
export type ClipOrderStatus = typeof clipOrderStatuses[number];

export const clipOrders = pgTable("clip_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clipRequestId: varchar("clip_request_id").references(() => userClipRequests.id, { onDelete: "set null" }),
  youtubeUrl: text("youtube_url").notNull(),
  youtubeVideoId: text("youtube_video_id").notNull(),
  videoTitle: text("video_title"),
  customerEmail: text("customer_email").notNull(),
  status: text("status").notNull().default("pending"),
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  amountPaid: integer("amount_paid"), // in cents
  currency: text("currency").default("usd"),
  fulfillmentNotes: text("fulfillment_notes"),
  deliverablesUrl: text("deliverables_url"), // S3 folder or zip URL
  clipUrls: text("clip_urls").array().default(sql`ARRAY[]::text[]`), // Individual clip download URLs
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  userIdx: index("clip_order_user_idx").on(table.userId),
  statusIdx: index("clip_order_status_idx").on(table.status),
  createdIdx: index("clip_order_created_idx").on(table.createdAt),
  stripeIdx: index("clip_order_stripe_idx").on(table.stripeSessionId),
}));

export const insertClipOrderSchema = createInsertSchema(clipOrders).omit({ id: true, createdAt: true, updatedAt: true, completedAt: true });
export type InsertClipOrder = z.infer<typeof insertClipOrderSchema>;
export type ClipOrder = typeof clipOrders.$inferSelect;

// ============ ZOOM TRANSCRIPT INGESTION ============
// Stores Zoom meeting metadata for transcript ingestion pipeline
export const zoomMeetings = pgTable("zoom_meetings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  zoomMeetingId: text("zoom_meeting_id").notNull().unique(),
  hostEmail: text("host_email").notNull(),
  topic: text("topic"),
  startTime: timestamp("start_time"),
  durationSec: integer("duration_sec"),
  year: integer("year").notNull(),
  rawZoomJson: jsonb("raw_zoom_json"),
  companyName: text("company_name"),
  contactName: text("contact_name"),
  meetingDate: timestamp("meeting_date"),
  notes: text("notes"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  zoomMeetingIdIdx: uniqueIndex("zoom_meeting_id_idx").on(table.zoomMeetingId),
  hostEmailIdx: index("zoom_meeting_host_email_idx").on(table.hostEmail),
  yearIdx: index("zoom_meeting_year_idx").on(table.year),
}));

export const insertZoomMeetingSchema = createInsertSchema(zoomMeetings).omit({ id: true, createdAt: true });
export type InsertZoomMeeting = z.infer<typeof insertZoomMeetingSchema>;
export type ZoomMeeting = typeof zoomMeetings.$inferSelect;

// Stores Zoom transcript data with parsed utterances
export const zoomTranscripts = pgTable("zoom_transcripts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  zoomMeetingId: text("zoom_meeting_id").notNull().references(() => zoomMeetings.zoomMeetingId, { onDelete: "cascade" }),
  transcriptVttPath: text("transcript_vtt_path").notNull(),
  transcriptText: text("transcript_text"), // Optional full text (private)
  utterancesJson: jsonb("utterances_json").notNull(), // Parsed utterances array
  hasSpeakerLabels: boolean("has_speaker_labels").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  zoomMeetingIdIdx: index("zoom_transcript_meeting_idx").on(table.zoomMeetingId),
}));

export const insertZoomTranscriptSchema = createInsertSchema(zoomTranscripts).omit({ id: true, createdAt: true });
export type InsertZoomTranscript = z.infer<typeof insertZoomTranscriptSchema>;
export type ZoomTranscript = typeof zoomTranscripts.$inferSelect;

// Utterance type for VTT parsing
export const zoomUtteranceSchema = z.object({
  startMs: z.number(),
  endMs: z.number(),
  speaker: z.string().nullable(),
  text: z.string(),
});
export type ZoomUtterance = z.infer<typeof zoomUtteranceSchema>;

// ============ ZOOM CALL ANALYSIS ============
// Stores structured analysis output for Zoom calls (JSONB for flexible iteration)
export const episodeZoomAnalysis = pgTable("episode_zoom_analysis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  analysisVersion: integer("analysis_version").notNull().default(1),
  payload: jsonb("payload").notNull(), // Full 5-dimension analysis output
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeIdIdx: uniqueIndex("episode_zoom_analysis_episode_idx").on(table.episodeId),
}));

export const insertEpisodeZoomAnalysisSchema = createInsertSchema(episodeZoomAnalysis).omit({ id: true, createdAt: true });
export type InsertEpisodeZoomAnalysis = z.infer<typeof insertEpisodeZoomAnalysisSchema>;
export type EpisodeZoomAnalysis = typeof episodeZoomAnalysis.$inferSelect;

// Zoom analysis payload schema (for validation)
export const zoomAnalysisPayloadSchema = z.object({
  buyerClaims: z.array(z.object({
    quote: z.string(),
    startMs: z.number().optional(),
    endMs: z.number().optional(),
    speakerRole: z.string().optional(),
  })),
  gateChecks: z.array(z.object({
    quote: z.string(),
    startMs: z.number().optional(),
    classification: z.enum(["gate_check", "persistent_concern", "escalation_trigger"]),
  })),
  decisionSignals: z.array(z.object({
    quote: z.string(),
    startMs: z.number().optional(),
    signalType: z.enum(["owner", "validator", "blocker", "approver"]),
    speakerRole: z.string().optional(),
  })),
  riskFrames: z.array(z.object({
    quote: z.string(),
    startMs: z.number().optional(),
    riskType: z.enum(["cost", "change", "vendor", "security", "operational", "reputational", "other"]),
  })),
  sellerEmphasis: z.array(z.object({
    phrase: z.string(),
    frequencyEstimate: z.number().optional(),
    timestamps: z.array(z.number()).optional(),
  })),
});
export type ZoomAnalysisPayload = z.infer<typeof zoomAnalysisPayloadSchema>;

// ============ CLAIM INSTANCES ============
// Shared primitive for cross-episode rollups and clustering
export const claimKinds = ["buyer_claim", "gate_check", "risk_frame", "decision_signal", "seller_emphasis"] as const;
export type ClaimKind = typeof claimKinds[number];

export const speakerRoles = ["buyer_ops", "buyer_it", "buyer_exec", "buyer_finance", "buyer_unknown", "seller", "unknown"] as const;
export type SpeakerRole = typeof speakerRoles[number];

export const claimInstances = pgTable("claim_instances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(), // 'podcast' | 'zoom'
  speakerRole: text("speaker_role"), // 'buyer_ops' | 'buyer_it' | 'seller' | 'unknown' etc.
  claimText: text("claim_text").notNull(),
  startMs: integer("start_ms"),
  endMs: integer("end_ms"),
  claimKind: text("claim_kind").notNull(), // 'buyer_claim' | 'gate_check' | 'risk_frame' | 'decision_signal' | 'seller_emphasis'
  claimMeta: jsonb("claim_meta"), // Additional metadata (risk_type, signal_type, classification, etc.)
  clusterId: varchar("cluster_id"), // For future clustering
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeIdIdx: index("claim_instance_episode_idx").on(table.episodeId),
  sourceTypeIdx: index("claim_instance_source_type_idx").on(table.sourceType),
  claimKindIdx: index("claim_instance_claim_kind_idx").on(table.claimKind),
  clusterIdIdx: index("claim_instance_cluster_idx").on(table.clusterId),
}));

export const insertClaimInstanceSchema = createInsertSchema(claimInstances).omit({ id: true, createdAt: true });
export type InsertClaimInstance = z.infer<typeof insertClaimInstanceSchema>;
export type ClaimInstance = typeof claimInstances.$inferSelect;

// ============ SPEAKER IDENTITY GRAPH (Phase 10) ============
// Canonical speaker identities across the platform
export const speakerRoleTypes = ["host", "guest", "co-host", "unknown"] as const;
export type SpeakerRoleType = typeof speakerRoleTypes[number];

export const speakers = pgTable("speakers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  aliases: text("aliases").array().notNull().default(sql`ARRAY[]::text[]`),
  bio: text("bio"),
  imageUrl: text("image_url"),
  externalRefs: jsonb("external_refs"), // { twitter, linkedin, website, wikipedia }
  totalAppearances: integer("total_appearances").notNull().default(0),
  totalEpisodes: integer("total_episodes").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  nameIdx: index("speaker_name_idx").on(table.name),
  nameUniqueIdx: uniqueIndex("speaker_name_lower_idx").on(sql`lower(${table.name})`),
}));

export const insertSpeakerSchema = createInsertSchema(speakers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSpeaker = z.infer<typeof insertSpeakerSchema>;
export type Speaker = typeof speakers.$inferSelect;

// Speaker appearances - links speakers to episodes with their role
export const speakerAppearances = pgTable("speaker_appearances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  speakerId: varchar("speaker_id").notNull().references(() => speakers.id, { onDelete: "cascade" }),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  podcastId: varchar("podcast_id").notNull().references(() => podcasts.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("guest"), // host, guest, co-host, unknown
  speakerLabel: text("speaker_label"), // Original diarization label (e.g., "Speaker 1")
  statementCount: integer("statement_count").notNull().default(0),
  confidence: real("confidence").notNull().default(1.0), // 0-1, how confident we are in this identity match
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  speakerIdIdx: index("speaker_appearance_speaker_idx").on(table.speakerId),
  episodeIdIdx: index("speaker_appearance_episode_idx").on(table.episodeId),
  podcastIdIdx: index("speaker_appearance_podcast_idx").on(table.podcastId),
  uniqueAppearance: uniqueIndex("speaker_appearance_unique").on(table.speakerId, table.episodeId),
}));

export const insertSpeakerAppearanceSchema = createInsertSchema(speakerAppearances).omit({ id: true, createdAt: true });
export type InsertSpeakerAppearance = z.infer<typeof insertSpeakerAppearanceSchema>;
export type SpeakerAppearance = typeof speakerAppearances.$inferSelect;

// Extended speaker type with appearances
export type SpeakerWithAppearances = Speaker & {
  appearances: Array<{
    episodeId: string;
    episodeTitle: string;
    podcastId: string;
    podcastTitle: string;
    role: string;
    statementCount: number;
    publishedAt: string;
  }>;
};

// ============ BRAIN API KEYS (Phase 13) ============
export const brainApiKeys = pgTable("brain_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  name: text("name").notNull(),
  ownerId: varchar("owner_id").references(() => users.id, { onDelete: "set null" }),
  scopes: text("scopes").array().notNull().default(sql`ARRAY['read']::text[]`),
  rateLimitPerMin: integer("rate_limit_per_min").notNull().default(60),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  keyHashIdx: uniqueIndex("brain_api_key_hash_idx").on(table.keyHash),
  isActiveIdx: index("brain_api_key_active_idx").on(table.isActive),
}));

export const insertBrainApiKeySchema = createInsertSchema(brainApiKeys).omit({ id: true, createdAt: true, lastUsedAt: true });
export type InsertBrainApiKey = z.infer<typeof insertBrainApiKeySchema>;
export type BrainApiKey = typeof brainApiKeys.$inferSelect;

// ============ WEBHOOK SYSTEM (Phase 12) ============
// Webhook subscriptions for external apps
export const webhookEventTypes = [
  "episode.analyzed", "episode.transcribed", "episode.ingested",
  "entities.extracted", "patterns.detected", "contradictions.detected",
  "speakers.resolved", "topics.updated"
] as const;
export type WebhookEventType = typeof webhookEventTypes[number];

export const webhooks = pgTable("webhooks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events").array().notNull(), // Which event types to subscribe to
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
  lastDeliveredAt: timestamp("last_delivered_at"),
  failureCount: integer("failure_count").notNull().default(0),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  isActiveIdx: index("webhook_active_idx").on(table.isActive),
}));

export const insertWebhookSchema = createInsertSchema(webhooks).omit({ id: true, createdAt: true, updatedAt: true, lastDeliveredAt: true, failureCount: true });
export type InsertWebhook = z.infer<typeof insertWebhookSchema>;
export type Webhook = typeof webhooks.$inferSelect;

// Webhook delivery log
export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  webhookId: varchar("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  statusCode: integer("status_code"),
  responseBody: text("response_body"),
  success: boolean("success").notNull().default(false),
  attemptCount: integer("attempt_count").notNull().default(1),
  deliveredAt: timestamp("delivered_at").notNull().default(sql`now()`),
}, (table) => ({
  webhookIdIdx: index("webhook_delivery_webhook_idx").on(table.webhookId),
  eventTypeIdx: index("webhook_delivery_event_idx").on(table.eventType),
  deliveredAtIdx: index("webhook_delivery_at_idx").on(table.deliveredAt),
}));

export const insertWebhookDeliverySchema = createInsertSchema(webhookDeliveries).omit({ id: true, deliveredAt: true });
export type InsertWebhookDelivery = z.infer<typeof insertWebhookDeliverySchema>;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;

// ============ INGESTION REQUESTS (On-Demand Ingestion API) ============
// External apps can submit content for processing
export const ingestionRequestPriorities = ["immediate", "normal", "low"] as const;
export type IngestionRequestPriority = typeof ingestionRequestPriorities[number];

export const ingestionRequestStatuses = ["pending", "processing", "complete", "error"] as const;
export type IngestionRequestStatus = typeof ingestionRequestStatuses[number];

export const ingestionRequestTypes = ["rss_feed", "youtube_url", "audio_file"] as const;
export type IngestionRequestType = typeof ingestionRequestTypes[number];

export const ingestionRequests = pgTable("ingestion_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // rss_feed, youtube_url, audio_file
  sourceUrl: text("source_url").notNull(),
  priority: text("priority").notNull().default("normal"), // immediate, normal, low
  status: text("status").notNull().default("pending"), // pending, processing, complete, error
  requestedBy: varchar("requested_by").references(() => users.id, { onDelete: "set null" }),
  apiKeyId: text("api_key_id"), // For future API key auth
  podcastId: varchar("podcast_id").references(() => podcasts.id, { onDelete: "set null" }),
  episodeId: varchar("episode_id").references(() => episodes.id, { onDelete: "set null" }),
  jobIds: text("job_ids").array().default(sql`ARRAY[]::text[]`),
  processingSteps: jsonb("processing_steps").default(sql`'[]'::jsonb`), // Array of {step, status, completedAt}
  errorMessage: text("error_message"),
  callbackUrl: text("callback_url"), // Optional URL to POST results to
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`), // Caller-provided context
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  typeIdx: index("ingestion_request_type_idx").on(table.type),
  statusIdx: index("ingestion_request_status_idx").on(table.status),
  priorityIdx: index("ingestion_request_priority_idx").on(table.priority),
  createdAtIdx: index("ingestion_request_created_idx").on(table.createdAt),
}));

export const insertIngestionRequestSchema = createInsertSchema(ingestionRequests).omit({ id: true, createdAt: true, updatedAt: true, completedAt: true });
export type InsertIngestionRequest = z.infer<typeof insertIngestionRequestSchema>;
export type IngestionRequest = typeof ingestionRequests.$inferSelect;

export const creatorLeads = pgTable("creator_leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  episodeId: varchar("episode_id"),
  ingestionId: varchar("ingestion_id"),
  source: text("source").default("processing_page"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  emailIdx: index("creator_leads_email_idx").on(table.email),
}));

export const insertCreatorLeadSchema = createInsertSchema(creatorLeads).omit({ id: true, createdAt: true });
export type InsertCreatorLead = z.infer<typeof insertCreatorLeadSchema>;
export type CreatorLead = typeof creatorLeads.$inferSelect;

export const creatorProcessedEpisodes = pgTable("creator_processed_episodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  episodeId: varchar("episode_id").notNull(),
  youtubeVideoId: varchar("youtube_video_id"),
  title: text("title"),
  thumbnail: text("thumbnail"),
  viralMomentCount: integer("viral_moment_count").notNull().default(0),
  workspaceId: varchar("workspace_id"),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  userIdx: index("creator_processed_episodes_user_idx").on(table.userId),
  episodeIdx: index("creator_processed_episodes_episode_idx").on(table.episodeId),
}));

export const insertCreatorProcessedEpisodeSchema = createInsertSchema(creatorProcessedEpisodes).omit({ id: true, createdAt: true });
export type InsertCreatorProcessedEpisode = z.infer<typeof insertCreatorProcessedEpisodeSchema>;
export type CreatorProcessedEpisode = typeof creatorProcessedEpisodes.$inferSelect;

export const clipJobs = pgTable("clip_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  momentId: varchar("moment_id").notNull(),
  episodeId: varchar("episode_id").notNull(),
  platform: varchar("platform").notNull(),
  captionStyle: varchar("caption_style").notNull(),
  status: varchar("status").notNull().default("queued"),
  downloadUrl: text("download_url"),
  downloadUrlExpiresAt: timestamp("download_url_expires_at"),
  notifyEmail: varchar("notify_email"),
  notifySent: boolean("notify_sent").default(false),
  adjustedStart: integer("adjusted_start"),
  adjustedEnd: integer("adjusted_end"),
  internalJobId: varchar("internal_job_id"),
  error: text("error"),
  workspaceId: varchar("workspace_id"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  userIdx: index("clip_jobs_user_idx").on(table.userId),
  momentIdx: index("clip_jobs_moment_idx").on(table.momentId),
}));

export const insertClipJobSchema = createInsertSchema(clipJobs).omit({ id: true, createdAt: true });
export type InsertClipJob = z.infer<typeof insertClipJobSchema>;
export type ClipJob = typeof clipJobs.$inferSelect;

export const showProfiles = pgTable("show_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  podcastId: varchar("podcast_id").notNull(),
  episodeCount: integer("episode_count").notNull(),
  totalStatements: integer("total_statements").notNull().default(0),
  totalClaims: integer("total_claims").notNull().default(0),
  topThemes: jsonb("top_themes").notNull().default(sql`'[]'::jsonb`),
  previousTopThemes: jsonb("previous_top_themes").default(sql`'[]'::jsonb`),
  topRecurrences: jsonb("top_recurrences").notNull().default(sql`'[]'::jsonb`),
  topContradictions: jsonb("top_contradictions").notNull().default(sql`'[]'::jsonb`),
  polarityBreakdown: jsonb("polarity_breakdown").notNull().default(sql`'{}'::jsonb`),
  dominantClaimType: varchar("dominant_claim_type"),
  avgCertainty: real("avg_certainty"),
  avgSentiment: real("avg_sentiment"),
  workspaceId: varchar("workspace_id"),
  tagFilter: varchar("tag_filter"),
  computedAt: timestamp("computed_at").notNull().default(sql`now()`),
  status: varchar("status").notNull().default("pending"),
}, (table) => ({
  podcastIdx: index("show_profiles_podcast_idx").on(table.podcastId),
  statusIdx: index("show_profiles_status_idx").on(table.status),
}));

export const insertShowProfileSchema = createInsertSchema(showProfiles).omit({ id: true, computedAt: true });
export type InsertShowProfile = z.infer<typeof insertShowProfileSchema>;
export type ShowProfile = typeof showProfiles.$inferSelect;

// ============ SELMAN PACKS (Deal Intelligence) ============
// Enriched deal intelligence packs produced by the build_selman_pack agent
export const selmanPacks = pgTable("selman_packs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  episodeId: varchar("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name"),
  priorEpisodeCount: integer("prior_episode_count").notNull().default(0),
  currentCallSignals: jsonb("current_call_signals").notNull(),
  longitudinal: jsonb("longitudinal"),
  dealIntelligence: jsonb("deal_intelligence").notNull(),
  allEpisodeIds: text("all_episode_ids").array().notNull().default(sql`ARRAY[]::text[]`),
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  episodeIdIdx: uniqueIndex("selman_pack_episode_idx").on(table.episodeId),
  companyIdx: index("selman_pack_company_idx").on(table.companyName),
}));

export const insertSelmanPackSchema = createInsertSchema(selmanPacks).omit({ id: true, createdAt: true });
export type InsertSelmanPack = z.infer<typeof insertSelmanPackSchema>;
export type SelmanPack = typeof selmanPacks.$inferSelect;

// ============ FINANCIAL CREDIBILITY ENGINE ============
// Stage 1: Claude enriches raw financial claims with ticker/direction/horizon metadata
export const claimEnrichments = pgTable("claim_enrichments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull().references(() => episodeClaims.id, { onDelete: "cascade" }),
  tickers: text("tickers").array().notNull().default(sql`ARRAY[]::text[]`),
  direction: text("direction").notNull(), // bullish | bearish | neutral | price_target | none
  timeHorizon: text("time_horizon").notNull(), // short | medium | long | unspecified
  priceTarget: real("price_target"),
  confidence: real("confidence").notNull(), // 0-1
  skip: boolean("skip").notNull().default(false),
  enrichedAt: timestamp("enriched_at").notNull().default(sql`now()`),
}, (table) => ({
  claimIdIdx: uniqueIndex("claim_enrichments_claim_id_idx").on(table.claimId),
  directionIdx: index("claim_enrichments_direction_idx").on(table.direction),
  skipIdx: index("claim_enrichments_skip_idx").on(table.skip),
}));

export const insertClaimEnrichmentSchema = createInsertSchema(claimEnrichments).omit({ id: true, enrichedAt: true });
export type InsertClaimEnrichment = z.infer<typeof insertClaimEnrichmentSchema>;
export type ClaimEnrichment = typeof claimEnrichments.$inferSelect;

// Stage 2: Polygon.io price resolution for enriched claims
export const claimPrices = pgTable("claim_prices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull().references(() => episodeClaims.id, { onDelete: "cascade" }),
  ticker: text("ticker").notNull(),
  claimDate: text("claim_date").notNull(), // YYYY-MM-DD — episode publish date
  claimDatePrice: real("claim_date_price").notNull(),
  currentPrice: real("current_price").notNull(),
  priceDeltaPct: real("price_delta_pct").notNull(), // positive = up, negative = down
  resolvedAt: timestamp("resolved_at").notNull().default(sql`now()`),
}, (table) => ({
  claimIdTickerIdx: uniqueIndex("claim_prices_claim_ticker_idx").on(table.claimId, table.ticker),
  tickerIdx: index("claim_prices_ticker_idx").on(table.ticker),
}));

export const insertClaimPriceSchema = createInsertSchema(claimPrices).omit({ id: true, resolvedAt: true });
export type InsertClaimPrice = z.infer<typeof insertClaimPriceSchema>;
export type ClaimPrice = typeof claimPrices.$inferSelect;

// Stage 3: Outcome scoring — HIT / MISS / EXCLUDED per claim per ticker
export const claimOutcomes = pgTable("claim_outcomes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull().references(() => episodeClaims.id, { onDelete: "cascade" }),
  ticker: text("ticker").notNull(),
  expectedDirection: text("expected_direction").notNull(), // bullish | bearish | price_target
  actualDirection: text("actual_direction").notNull(), // up | down | flat
  result: text("result").notNull(), // hit | miss | excluded
  priceAtClaim: real("price_at_claim"),
  priceAtScoring: real("price_at_scoring"),
  priceDeltaPct: real("price_delta_pct"),
  scoredAt: timestamp("scored_at").notNull().default(sql`now()`),
}, (table) => ({
  claimIdTickerIdx: uniqueIndex("claim_outcomes_claim_ticker_idx").on(table.claimId, table.ticker),
  resultIdx: index("claim_outcomes_result_idx").on(table.result),
  scoredAtIdx: index("claim_outcomes_scored_at_idx").on(table.scoredAt),
}));

export const insertClaimOutcomeSchema = createInsertSchema(claimOutcomes).omit({ id: true, scoredAt: true });
export type InsertClaimOutcome = z.infer<typeof insertClaimOutcomeSchema>;
export type ClaimOutcome = typeof claimOutcomes.$inferSelect;

// Stage 4: Source credibility accumulated per show (and optionally per host entity)
export const sourceCredibility = pgTable("source_credibility", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  showId: varchar("show_id").notNull(), // podcast_id from episodes table
  hostEntity: text("host_entity"), // nullable — host name if resolvable
  hitRate: real("hit_rate").notNull().default(0),
  weightedHitRate: real("weighted_hit_rate").notNull().default(0),
  sampleSize: integer("sample_size").notNull().default(0),
  credibilityBand: text("credibility_band").notNull().default("insufficient_data"), // insufficient_data | low | medium | high
  computedAt: timestamp("computed_at").notNull().default(sql`now()`),
}, (table) => ({
  showIdIdx: uniqueIndex("source_credibility_show_id_idx").on(table.showId),
  bandIdx: index("source_credibility_band_idx").on(table.credibilityBand),
}));

export const insertSourceCredibilitySchema = createInsertSchema(sourceCredibility).omit({ id: true, computedAt: true });
export type InsertSourceCredibility = z.infer<typeof insertSourceCredibilitySchema>;
export type SourceCredibility = typeof sourceCredibility.$inferSelect;
