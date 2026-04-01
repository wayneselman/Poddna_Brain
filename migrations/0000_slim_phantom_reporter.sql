CREATE TABLE "admin_notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"episode_id" varchar,
	"job_type" text,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analyzer_leads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"company" text,
	"episode_url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analyzer_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar,
	"youtube_url" text NOT NULL,
	"email" text,
	"ip_address" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"results" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "annotation_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annotation_id" varchar NOT NULL,
	"reporter_id" varchar NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"resolution" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "annotation_votes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annotation_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "annotations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"segment_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"text" text NOT NULL,
	"start_offset" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"content" text NOT NULL,
	"timestamp" integer,
	"status" text DEFAULT 'approved' NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"downvotes" integer DEFAULT 0 NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"featured_at" timestamp,
	"is_hero" boolean DEFAULT false NOT NULL,
	"is_ai_generated" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_api_keys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"name" text NOT NULL,
	"owner_id" varchar,
	"scopes" text[] DEFAULT ARRAY['read']::text[] NOT NULL,
	"rate_limit_per_min" integer DEFAULT 60 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canonical_entities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"external_refs" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"icon_name" text,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "claim_instances" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"source_type" text NOT NULL,
	"speaker_role" text,
	"claim_text" text NOT NULL,
	"start_ms" integer,
	"end_ms" integer,
	"claim_kind" text NOT NULL,
	"claim_meta" jsonb,
	"cluster_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clip_generation_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_date" timestamp NOT NULL,
	"podcasts_processed" integer DEFAULT 0,
	"episodes_processed" integer DEFAULT 0,
	"moments_detected" integer DEFAULT 0,
	"clips_extracted" integer DEFAULT 0,
	"clips_captioned" integer DEFAULT 0,
	"clips_optimized" integer DEFAULT 0,
	"clips_failed" integer DEFAULT 0,
	"status" text DEFAULT 'running' NOT NULL,
	"error_log" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "clip_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"moment_id" varchar NOT NULL,
	"episode_id" varchar NOT NULL,
	"platform" varchar NOT NULL,
	"caption_style" varchar NOT NULL,
	"status" varchar DEFAULT 'queued' NOT NULL,
	"download_url" text,
	"download_url_expires_at" timestamp,
	"notify_email" varchar,
	"notify_sent" boolean DEFAULT false,
	"adjusted_start" integer,
	"adjusted_end" integer,
	"internal_job_id" varchar,
	"error" text,
	"workspace_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "clip_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"clip_request_id" varchar,
	"youtube_url" text NOT NULL,
	"youtube_video_id" text NOT NULL,
	"video_title" text,
	"customer_email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"amount_paid" integer,
	"currency" text DEFAULT 'usd',
	"fulfillment_notes" text,
	"deliverables_url" text,
	"clip_urls" text[] DEFAULT ARRAY[]::text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "clips" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"annotation_id" varchar,
	"title" text NOT NULL,
	"start_time" integer NOT NULL,
	"end_time" integer NOT NULL,
	"transcript_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_segment_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" varchar NOT NULL,
	"segment_id" varchar NOT NULL,
	"sentiment_label" text NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_leads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"episode_id" varchar,
	"ingestion_id" varchar,
	"source" text DEFAULT 'processing_page',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_processed_episodes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"episode_id" varchar NOT NULL,
	"youtube_video_id" varchar,
	"title" text,
	"thumbnail" text,
	"viral_moment_count" integer DEFAULT 0 NOT NULL,
	"workspace_id" varchar,
	"tags" text[] DEFAULT '{}'::text[],
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_leads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"company_size" text NOT NULL,
	"use_case" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"affiliate_network" text,
	"affiliate_url" text,
	"canonical_url" text,
	"brand" text,
	"author" text,
	"location" text,
	"price_text" text,
	"rating" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_clicks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" varchar NOT NULL,
	"episode_id" varchar,
	"user_id" varchar,
	"clicked_at" timestamp DEFAULT now() NOT NULL,
	"referrer" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "entity_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mention_id" varchar NOT NULL,
	"canonical_id" varchar NOT NULL,
	"method" text NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_mentions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" varchar NOT NULL,
	"episode_id" varchar NOT NULL,
	"segment_id" varchar,
	"mention_text" text,
	"timestamp" integer,
	"is_auto_extracted" boolean DEFAULT true NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_candidates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"youtube_video_id" text NOT NULL,
	"youtube_video_url" text NOT NULL,
	"youtube_channel_id" text,
	"youtube_channel_name" text,
	"video_title" text NOT NULL,
	"video_duration_seconds" integer,
	"video_published_at" timestamp,
	"confidence_score" real DEFAULT 0 NOT NULL,
	"signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_chapters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"start_time" integer NOT NULL,
	"end_time" integer,
	"title" text NOT NULL,
	"summary" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"confidence" real,
	"source" text DEFAULT 'ai',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_claims" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"start_time" integer NOT NULL,
	"end_time" integer,
	"claim_text" text NOT NULL,
	"claim_type" text NOT NULL,
	"confidence" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_comments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"external_id" text NOT NULL,
	"parent_id" text,
	"author_name" text,
	"author_channel_id" text,
	"text" text NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"raw_timestamp" text,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_diffs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"primary_source" text NOT NULL,
	"secondary_source" text NOT NULL,
	"summary" text,
	"metrics" jsonb NOT NULL,
	"samples" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_highlights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"start_time" integer NOT NULL,
	"end_time" integer NOT NULL,
	"title" text NOT NULL,
	"quote_text" text NOT NULL,
	"description" text,
	"highlight_type" text DEFAULT 'insight' NOT NULL,
	"confidence" real DEFAULT 0.8 NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_segments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"start_time" integer NOT NULL,
	"end_time" integer,
	"label" text NOT NULL,
	"title" text,
	"summary" text,
	"snippet_text" text,
	"segment_type" text DEFAULT 'topic' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_ai_generated" boolean DEFAULT true NOT NULL,
	"topics" text[],
	"engagement_score" integer,
	"sentiment_summary" jsonb,
	"visual_tags" text[],
	"visual_caption" text,
	"evidence" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_semantic_segments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"segment_id" varchar,
	"start_time" integer NOT NULL,
	"end_time" integer NOT NULL,
	"topic_category" text,
	"sub_topic" text,
	"intent" text,
	"importance_score" real,
	"novelty_score" real,
	"emotion_intensity" real,
	"clipability_score" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_sources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"kind" text NOT NULL,
	"platform" text NOT NULL,
	"source_url" text,
	"storage_url" text,
	"is_canonical" boolean DEFAULT false NOT NULL,
	"alignment_offset_seconds" integer DEFAULT 0 NOT NULL,
	"manually_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_zoom_analysis" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"analysis_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"podcast_id" varchar NOT NULL,
	"title" text NOT NULL,
	"episode_number" integer,
	"published_at" timestamp NOT NULL,
	"duration" integer NOT NULL,
	"type" text NOT NULL,
	"media_url" text NOT NULL,
	"video_url" text,
	"spotify_url" text,
	"apple_podcasts_url" text,
	"description" text,
	"transcript_url" text,
	"transcript_type" text,
	"transcript_source" text,
	"transcript_status" text DEFAULT 'none' NOT NULL,
	"assembly_job_id" text,
	"chapters_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_curated" boolean DEFAULT false NOT NULL,
	"curated_at" timestamp,
	"processing_status" text DEFAULT 'new' NOT NULL,
	"external_source" text,
	"external_episode_id" text,
	"last_error" text,
	"resolution_status" text DEFAULT 'resolved' NOT NULL,
	"resolution_fallback_at" timestamp,
	"visibility" text DEFAULT 'backlog' NOT NULL,
	"source_type" text DEFAULT 'podcast' NOT NULL,
	"episode_summary" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" varchar,
	CONSTRAINT "feature_flags_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "ingestion_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" varchar NOT NULL,
	"source_id" varchar,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"action_status" text DEFAULT 'pending' NOT NULL,
	"episode_id" varchar,
	"observed_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ingestion_recommendations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" varchar NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"action" text NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"estimated_cost" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" varchar,
	"approved_at" timestamp,
	"executed_at" timestamp,
	"agent_run_id" text,
	"model_info" jsonb DEFAULT '{}'::jsonb,
	"event_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"source_url" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" varchar,
	"api_key_id" text,
	"podcast_id" varchar,
	"episode_id" varchar,
	"job_ids" text[] DEFAULT ARRAY[]::text[],
	"processing_steps" jsonb DEFAULT '[]'::jsonb,
	"error_message" text,
	"callback_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "integrity_scores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"score" real NOT NULL,
	"band" text NOT NULL,
	"components" jsonb NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_failures" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"job_type" text NOT NULL,
	"error_message" text NOT NULL,
	"error_stack" text,
	"is_transient" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_source_id" varchar,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"pipeline_stage" text DEFAULT 'INTEL',
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"result" jsonb,
	"next_retry_at" timestamp,
	"started_at" timestamp,
	"locked_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "music_detections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"start_time" integer NOT NULL,
	"end_time" integer,
	"artist" text NOT NULL,
	"title" text NOT NULL,
	"album" text,
	"release_date" text,
	"label" text,
	"spotify_url" text,
	"apple_music_url" text,
	"song_link" text,
	"artwork_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "podcast_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"podcast_id" varchar NOT NULL,
	"category_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "podcasts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"host" text NOT NULL,
	"description" text,
	"artwork_url" text,
	"podcast_index_feed_id" varchar,
	"youtube_channel_id" text,
	"featured_landing" boolean DEFAULT false NOT NULL,
	"featured_explore" boolean DEFAULT false NOT NULL,
	"featured_at" timestamp,
	"known_speakers" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_sources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" varchar NOT NULL,
	"type" text NOT NULL,
	"value" text NOT NULL,
	"label" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_polled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"description" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" varchar,
	"last_agent_run" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "selman_packs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"company_name" text NOT NULL,
	"contact_name" text,
	"prior_episode_count" integer DEFAULT 0 NOT NULL,
	"current_call_signals" jsonb NOT NULL,
	"longitudinal" jsonb,
	"deal_intelligence" jsonb NOT NULL,
	"all_episode_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "show_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"podcast_id" varchar NOT NULL,
	"episode_count" integer NOT NULL,
	"total_statements" integer DEFAULT 0 NOT NULL,
	"total_claims" integer DEFAULT 0 NOT NULL,
	"top_themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"previous_top_themes" jsonb DEFAULT '[]'::jsonb,
	"top_recurrences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"top_contradictions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"polarity_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dominant_claim_type" varchar,
	"avg_certainty" real,
	"avg_sentiment" real,
	"workspace_id" varchar,
	"tag_filter" varchar,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_transcript_segments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_transcript_id" varchar NOT NULL,
	"start_time" integer NOT NULL,
	"end_time" integer NOT NULL,
	"text" text NOT NULL,
	"speaker" text
);
--> statement-breakpoint
CREATE TABLE "source_transcripts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_source_id" varchar NOT NULL,
	"provider" text NOT NULL,
	"language" text DEFAULT 'en',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speaker_appearances" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"speaker_id" varchar NOT NULL,
	"episode_id" varchar NOT NULL,
	"podcast_id" varchar NOT NULL,
	"role" text DEFAULT 'guest' NOT NULL,
	"speaker_label" text,
	"statement_count" integer DEFAULT 0 NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speakers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"bio" text,
	"image_url" text,
	"external_refs" jsonb,
	"total_appearances" integer DEFAULT 0 NOT NULL,
	"total_episodes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsor_segments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"start_time" integer NOT NULL,
	"end_time" integer,
	"brand" text,
	"confidence" integer NOT NULL,
	"excerpt" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statement_classifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement_id" varchar NOT NULL,
	"claim_flag" boolean NOT NULL,
	"claim_type" text NOT NULL,
	"certainty" real NOT NULL,
	"polarity" text NOT NULL,
	"modality" text NOT NULL,
	"sentiment" real NOT NULL,
	"emotional_tone" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statement_relations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"statement_a_id" varchar NOT NULL,
	"statement_b_id" varchar NOT NULL,
	"relation" text NOT NULL,
	"scope" text DEFAULT 'intra_episode' NOT NULL,
	"confidence" real NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statement_topics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement_id" varchar NOT NULL,
	"topic_id" varchar NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"segment_id" varchar,
	"start_time" integer NOT NULL,
	"end_time" integer NOT NULL,
	"speaker" text,
	"text" text NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"embedding" jsonb,
	"embedding_status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"description" text,
	"embedding" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"start_time" integer NOT NULL,
	"end_time" integer NOT NULL,
	"text" text NOT NULL,
	"type" text NOT NULL,
	"speaker" text,
	"is_stale" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_clip_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"youtube_video_id" text NOT NULL,
	"youtube_url" text NOT NULL,
	"video_title" text,
	"video_thumbnail" text,
	"video_duration" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"status_message" text,
	"moments_found" integer DEFAULT 0,
	"clips_ready" integer DEFAULT 0,
	"episode_id" varchar,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"role" varchar DEFAULT 'user' NOT NULL,
	"certifications" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"banned_at" timestamp,
	"banned_by" varchar,
	"password_hash" varchar,
	"auth_provider" varchar DEFAULT 'local' NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"email_verification_token" varchar,
	"password_reset_token" varchar,
	"password_reset_expires" timestamp,
	"youtube_access_token" text,
	"youtube_refresh_token" text,
	"youtube_token_expires" timestamp,
	"youtube_channel_id" varchar,
	"youtube_channel_title" varchar,
	"subscription_tier" varchar DEFAULT 'free' NOT NULL,
	"subscription_expires_at" timestamp,
	"episodes_processed_this_month" integer DEFAULT 0 NOT NULL,
	"last_episode_processed_at" timestamp,
	"stripe_customer_id" varchar,
	"stripe_subscription_id" varchar,
	"clips_downloaded" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "video_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_source_id" varchar NOT NULL,
	"start_time" integer NOT NULL,
	"end_time" integer,
	"event_type" text NOT NULL,
	"label" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "viral_moments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"moment_kind" text DEFAULT 'viral',
	"start_time" integer NOT NULL,
	"end_time" integer NOT NULL,
	"text" text NOT NULL,
	"virality_score" integer,
	"hook_reason" text NOT NULL,
	"suggested_title" text NOT NULL,
	"pull_quote" text,
	"hook_type" text,
	"shareability_factors" text[],
	"topics" text[],
	"content_type" text NOT NULL,
	"entities" text[],
	"display_order" integer DEFAULT 0 NOT NULL,
	"clip_status" text DEFAULT 'pending',
	"video_path" text,
	"captioned_path" text,
	"optimized_path" text,
	"clip_error" text,
	"clip_extracted_at" timestamp,
	"posting_status" text DEFAULT 'draft',
	"platform" text DEFAULT 'tiktok',
	"description" text,
	"hashtags" text[],
	"posted_at" timestamp,
	"post_url" text,
	"views" integer DEFAULT 0,
	"likes" integer DEFAULT 0,
	"comments" integer DEFAULT 0,
	"shares" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" varchar NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status_code" integer,
	"response_body" text,
	"success" boolean DEFAULT false NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"delivered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"last_delivered_at" timestamp,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zoom_meetings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zoom_meeting_id" text NOT NULL,
	"host_email" text NOT NULL,
	"topic" text,
	"start_time" timestamp,
	"duration_sec" integer,
	"year" integer NOT NULL,
	"raw_zoom_json" jsonb,
	"company_name" text,
	"contact_name" text,
	"meeting_date" timestamp,
	"notes" text,
	"tags" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "zoom_meetings_zoom_meeting_id_unique" UNIQUE("zoom_meeting_id")
);
--> statement-breakpoint
CREATE TABLE "zoom_transcripts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zoom_meeting_id" text NOT NULL,
	"transcript_vtt_path" text NOT NULL,
	"transcript_text" text,
	"utterances_json" jsonb NOT NULL,
	"has_speaker_labels" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_notifications" ADD CONSTRAINT "admin_notifications_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyzer_requests" ADD CONSTRAINT "analyzer_requests_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_reports" ADD CONSTRAINT "annotation_reports_annotation_id_annotations_id_fk" FOREIGN KEY ("annotation_id") REFERENCES "public"."annotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_reports" ADD CONSTRAINT "annotation_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_reports" ADD CONSTRAINT "annotation_reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_votes" ADD CONSTRAINT "annotation_votes_annotation_id_annotations_id_fk" FOREIGN KEY ("annotation_id") REFERENCES "public"."annotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_votes" ADD CONSTRAINT "annotation_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_segment_id_transcript_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."transcript_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_api_keys" ADD CONSTRAINT "brain_api_keys_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_instances" ADD CONSTRAINT "claim_instances_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_orders" ADD CONSTRAINT "clip_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_orders" ADD CONSTRAINT "clip_orders_clip_request_id_user_clip_requests_id_fk" FOREIGN KEY ("clip_request_id") REFERENCES "public"."user_clip_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clips" ADD CONSTRAINT "clips_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clips" ADD CONSTRAINT "clips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clips" ADD CONSTRAINT "clips_annotation_id_annotations_id_fk" FOREIGN KEY ("annotation_id") REFERENCES "public"."annotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_segment_links" ADD CONSTRAINT "comment_segment_links_comment_id_episode_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."episode_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_segment_links" ADD CONSTRAINT "comment_segment_links_segment_id_episode_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."episode_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_clicks" ADD CONSTRAINT "entity_clicks_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_clicks" ADD CONSTRAINT "entity_clicks_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_clicks" ADD CONSTRAINT "entity_clicks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_mention_id_entity_mentions_id_fk" FOREIGN KEY ("mention_id") REFERENCES "public"."entity_mentions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_canonical_id_canonical_entities_id_fk" FOREIGN KEY ("canonical_id") REFERENCES "public"."canonical_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_mentions" ADD CONSTRAINT "entity_mentions_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_mentions" ADD CONSTRAINT "entity_mentions_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_mentions" ADD CONSTRAINT "entity_mentions_segment_id_transcript_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."transcript_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_candidates" ADD CONSTRAINT "episode_candidates_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_candidates" ADD CONSTRAINT "episode_candidates_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_chapters" ADD CONSTRAINT "episode_chapters_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_claims" ADD CONSTRAINT "episode_claims_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_comments" ADD CONSTRAINT "episode_comments_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_diffs" ADD CONSTRAINT "episode_diffs_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_highlights" ADD CONSTRAINT "episode_highlights_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_segments" ADD CONSTRAINT "episode_segments_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_semantic_segments" ADD CONSTRAINT "episode_semantic_segments_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_semantic_segments" ADD CONSTRAINT "episode_semantic_segments_segment_id_episode_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."episode_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_sources" ADD CONSTRAINT "episode_sources_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_zoom_analysis" ADD CONSTRAINT "episode_zoom_analysis_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_podcast_id_podcasts_id_fk" FOREIGN KEY ("podcast_id") REFERENCES "public"."podcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_events" ADD CONSTRAINT "ingestion_events_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_events" ADD CONSTRAINT "ingestion_events_source_id_program_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."program_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_recommendations" ADD CONSTRAINT "ingestion_recommendations_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_recommendations" ADD CONSTRAINT "ingestion_recommendations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_recommendations" ADD CONSTRAINT "ingestion_recommendations_event_id_ingestion_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."ingestion_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_requests" ADD CONSTRAINT "ingestion_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_requests" ADD CONSTRAINT "ingestion_requests_podcast_id_podcasts_id_fk" FOREIGN KEY ("podcast_id") REFERENCES "public"."podcasts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_requests" ADD CONSTRAINT "ingestion_requests_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrity_scores" ADD CONSTRAINT "integrity_scores_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_episode_source_id_episode_sources_id_fk" FOREIGN KEY ("episode_source_id") REFERENCES "public"."episode_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_detections" ADD CONSTRAINT "music_detections_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcast_categories" ADD CONSTRAINT "podcast_categories_podcast_id_podcasts_id_fk" FOREIGN KEY ("podcast_id") REFERENCES "public"."podcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcast_categories" ADD CONSTRAINT "podcast_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_sources" ADD CONSTRAINT "program_sources_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selman_packs" ADD CONSTRAINT "selman_packs_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_transcript_segments" ADD CONSTRAINT "source_transcript_segments_source_transcript_id_source_transcripts_id_fk" FOREIGN KEY ("source_transcript_id") REFERENCES "public"."source_transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_transcripts" ADD CONSTRAINT "source_transcripts_episode_source_id_episode_sources_id_fk" FOREIGN KEY ("episode_source_id") REFERENCES "public"."episode_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_appearances" ADD CONSTRAINT "speaker_appearances_speaker_id_speakers_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."speakers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_appearances" ADD CONSTRAINT "speaker_appearances_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_appearances" ADD CONSTRAINT "speaker_appearances_podcast_id_podcasts_id_fk" FOREIGN KEY ("podcast_id") REFERENCES "public"."podcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_segments" ADD CONSTRAINT "sponsor_segments_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_classifications" ADD CONSTRAINT "statement_classifications_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_relations" ADD CONSTRAINT "statement_relations_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_relations" ADD CONSTRAINT "statement_relations_statement_a_id_statements_id_fk" FOREIGN KEY ("statement_a_id") REFERENCES "public"."statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_relations" ADD CONSTRAINT "statement_relations_statement_b_id_statements_id_fk" FOREIGN KEY ("statement_b_id") REFERENCES "public"."statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_topics" ADD CONSTRAINT "statement_topics_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_topics" ADD CONSTRAINT "statement_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_segment_id_transcript_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."transcript_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_clip_requests" ADD CONSTRAINT "user_clip_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_clip_requests" ADD CONSTRAINT "user_clip_requests_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_events" ADD CONSTRAINT "video_events_episode_source_id_episode_sources_id_fk" FOREIGN KEY ("episode_source_id") REFERENCES "public"."episode_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viral_moments" ADD CONSTRAINT "viral_moments_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zoom_transcripts" ADD CONSTRAINT "zoom_transcripts_zoom_meeting_id_zoom_meetings_zoom_meeting_id_fk" FOREIGN KEY ("zoom_meeting_id") REFERENCES "public"."zoom_meetings"("zoom_meeting_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_notification_type_idx" ON "admin_notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "admin_notification_is_read_idx" ON "admin_notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "admin_notification_created_at_idx" ON "admin_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_notification_episode_idx" ON "admin_notifications" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "analyzer_leads_email_idx" ON "analyzer_leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "analyzer_leads_created_at_idx" ON "analyzer_leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "analyzer_youtube_url_idx" ON "analyzer_requests" USING btree ("youtube_url");--> statement-breakpoint
CREATE INDEX "analyzer_status_idx" ON "analyzer_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "analyzer_created_at_idx" ON "analyzer_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "report_annotation_idx" ON "annotation_reports" USING btree ("annotation_id");--> statement-breakpoint
CREATE INDEX "report_reporter_idx" ON "annotation_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "report_status_idx" ON "annotation_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "report_created_at_idx" ON "annotation_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "annotation_vote_annotation_idx" ON "annotation_votes" USING btree ("annotation_id");--> statement-breakpoint
CREATE INDEX "annotation_vote_user_idx" ON "annotation_votes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "annotation_votes_unique" ON "annotation_votes" USING btree ("annotation_id","user_id");--> statement-breakpoint
CREATE INDEX "annotation_episode_id_idx" ON "annotations" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "annotation_segment_id_idx" ON "annotations" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "annotation_user_id_idx" ON "annotations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "annotation_votes_idx" ON "annotations" USING btree ("upvotes","downvotes");--> statement-breakpoint
CREATE INDEX "annotation_featured_idx" ON "annotations" USING btree ("featured","featured_at");--> statement-breakpoint
CREATE INDEX "annotation_hero_idx" ON "annotations" USING btree ("is_hero");--> statement-breakpoint
CREATE INDEX "annotation_status_idx" ON "annotations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "annotation_ai_generated_idx" ON "annotations" USING btree ("is_ai_generated");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_api_key_hash_idx" ON "brain_api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "brain_api_key_active_idx" ON "brain_api_keys" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "canonical_entity_type_idx" ON "canonical_entities" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "canonical_entity_name_type_idx" ON "canonical_entities" USING btree (lower("name"),"type");--> statement-breakpoint
CREATE INDEX "claim_instance_episode_idx" ON "claim_instances" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "claim_instance_source_type_idx" ON "claim_instances" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "claim_instance_claim_kind_idx" ON "claim_instances" USING btree ("claim_kind");--> statement-breakpoint
CREATE INDEX "claim_instance_cluster_idx" ON "claim_instances" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "clip_gen_run_date_idx" ON "clip_generation_runs" USING btree ("run_date");--> statement-breakpoint
CREATE INDEX "clip_gen_run_status_idx" ON "clip_generation_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clip_jobs_user_idx" ON "clip_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "clip_jobs_moment_idx" ON "clip_jobs" USING btree ("moment_id");--> statement-breakpoint
CREATE INDEX "clip_order_user_idx" ON "clip_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "clip_order_status_idx" ON "clip_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clip_order_created_idx" ON "clip_orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "clip_order_stripe_idx" ON "clip_orders" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE INDEX "clip_episode_id_idx" ON "clips" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "clip_user_id_idx" ON "clips" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "clip_annotation_id_idx" ON "clips" USING btree ("annotation_id");--> statement-breakpoint
CREATE INDEX "comment_link_comment_idx" ON "comment_segment_links" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "comment_link_segment_idx" ON "comment_segment_links" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "comment_link_sentiment_idx" ON "comment_segment_links" USING btree ("sentiment_label");--> statement-breakpoint
CREATE INDEX "creator_leads_email_idx" ON "creator_leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "creator_processed_episodes_user_idx" ON "creator_processed_episodes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "creator_processed_episodes_episode_idx" ON "creator_processed_episodes" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "demo_lead_email_idx" ON "demo_leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "demo_lead_status_idx" ON "demo_leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "demo_lead_created_idx" ON "demo_leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "entity_type_idx" ON "entities" USING btree ("type");--> statement-breakpoint
CREATE INDEX "entity_network_idx" ON "entities" USING btree ("affiliate_network");--> statement-breakpoint
CREATE INDEX "entity_name_idx" ON "entities" USING btree ("name");--> statement-breakpoint
CREATE INDEX "click_entity_idx" ON "entity_clicks" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "click_date_idx" ON "entity_clicks" USING btree ("clicked_at");--> statement-breakpoint
CREATE INDEX "entity_link_mention_idx" ON "entity_links" USING btree ("mention_id");--> statement-breakpoint
CREATE INDEX "entity_link_canonical_idx" ON "entity_links" USING btree ("canonical_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_link_unique_mention" ON "entity_links" USING btree ("mention_id");--> statement-breakpoint
CREATE INDEX "mention_entity_idx" ON "entity_mentions" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "mention_episode_idx" ON "entity_mentions" USING btree ("episode_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_entity_episode" ON "entity_mentions" USING btree ("entity_id","episode_id");--> statement-breakpoint
CREATE INDEX "episode_candidate_episode_idx" ON "episode_candidates" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "episode_candidate_status_idx" ON "episode_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "episode_candidate_confidence_idx" ON "episode_candidates" USING btree ("confidence_score");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_episode_video_candidate" ON "episode_candidates" USING btree ("episode_id","youtube_video_id");--> statement-breakpoint
CREATE INDEX "episode_chapter_episode_idx" ON "episode_chapters" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "episode_chapter_start_idx" ON "episode_chapters" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "episode_chapter_order_idx" ON "episode_chapters" USING btree ("display_order");--> statement-breakpoint
CREATE INDEX "claim_episode_id_idx" ON "episode_claims" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "claim_start_time_idx" ON "episode_claims" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "claim_type_idx" ON "episode_claims" USING btree ("claim_type");--> statement-breakpoint
CREATE INDEX "episode_comment_episode_idx" ON "episode_comments" USING btree ("episode_id");--> statement-breakpoint
CREATE UNIQUE INDEX "episode_comment_external_idx" ON "episode_comments" USING btree ("episode_id","external_id");--> statement-breakpoint
CREATE INDEX "episode_comment_likes_idx" ON "episode_comments" USING btree ("like_count");--> statement-breakpoint
CREATE INDEX "episode_diff_episode_idx" ON "episode_diffs" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "episode_diff_created_idx" ON "episode_diffs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "episode_highlight_episode_idx" ON "episode_highlights" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "episode_highlight_start_idx" ON "episode_highlights" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "episode_highlight_type_idx" ON "episode_highlights" USING btree ("highlight_type");--> statement-breakpoint
CREATE INDEX "episode_highlight_order_idx" ON "episode_highlights" USING btree ("display_order");--> statement-breakpoint
CREATE INDEX "episode_segment_episode_idx" ON "episode_segments" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "episode_segment_start_idx" ON "episode_segments" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "episode_segment_type_idx" ON "episode_segments" USING btree ("segment_type");--> statement-breakpoint
CREATE INDEX "episode_segment_engagement_idx" ON "episode_segments" USING btree ("engagement_score");--> statement-breakpoint
CREATE INDEX "episode_semantic_segment_episode_idx" ON "episode_semantic_segments" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "episode_semantic_segment_segment_idx" ON "episode_semantic_segments" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "episode_semantic_segment_start_idx" ON "episode_semantic_segments" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "episode_semantic_segment_intent_idx" ON "episode_semantic_segments" USING btree ("intent");--> statement-breakpoint
CREATE INDEX "episode_semantic_segment_topic_idx" ON "episode_semantic_segments" USING btree ("topic_category");--> statement-breakpoint
CREATE INDEX "episode_semantic_segment_importance_idx" ON "episode_semantic_segments" USING btree ("importance_score");--> statement-breakpoint
CREATE INDEX "episode_semantic_segment_clipability_idx" ON "episode_semantic_segments" USING btree ("clipability_score");--> statement-breakpoint
CREATE INDEX "episode_source_episode_idx" ON "episode_sources" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "episode_source_kind_idx" ON "episode_sources" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "episode_source_canonical_idx" ON "episode_sources" USING btree ("episode_id","is_canonical");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_episode_source_url" ON "episode_sources" USING btree ("episode_id","source_url");--> statement-breakpoint
CREATE UNIQUE INDEX "episode_zoom_analysis_episode_idx" ON "episode_zoom_analysis" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "episode_podcast_id_idx" ON "episodes" USING btree ("podcast_id");--> statement-breakpoint
CREATE INDEX "episode_status_idx" ON "episodes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "episode_published_at_idx" ON "episodes" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "episode_transcript_status_idx" ON "episodes" USING btree ("transcript_status");--> statement-breakpoint
CREATE INDEX "episode_curated_idx" ON "episodes" USING btree ("is_curated","curated_at");--> statement-breakpoint
CREATE INDEX "episode_processing_status_idx" ON "episodes" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "episode_external_source_idx" ON "episodes" USING btree ("external_source","external_episode_id");--> statement-breakpoint
CREATE INDEX "episode_resolution_status_idx" ON "episodes" USING btree ("resolution_status");--> statement-breakpoint
CREATE INDEX "episode_visibility_idx" ON "episodes" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "episode_source_type_idx" ON "episodes" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "ingestion_event_program_idx" ON "ingestion_events" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "ingestion_event_type_idx" ON "ingestion_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "ingestion_event_processed_idx" ON "ingestion_events" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "ingestion_event_action_status_idx" ON "ingestion_events" USING btree ("action_status");--> statement-breakpoint
CREATE INDEX "ingestion_event_observed_idx" ON "ingestion_events" USING btree ("observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_event_dedupe_idx" ON "ingestion_events" USING btree ("program_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "ingestion_rec_program_idx" ON "ingestion_recommendations" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "ingestion_rec_action_idx" ON "ingestion_recommendations" USING btree ("action");--> statement-breakpoint
CREATE INDEX "ingestion_rec_status_idx" ON "ingestion_recommendations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ingestion_rec_target_idx" ON "ingestion_recommendations" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "ingestion_rec_agent_run_idx" ON "ingestion_recommendations" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "ingestion_rec_created_idx" ON "ingestion_recommendations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ingestion_request_type_idx" ON "ingestion_requests" USING btree ("type");--> statement-breakpoint
CREATE INDEX "ingestion_request_status_idx" ON "ingestion_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ingestion_request_priority_idx" ON "ingestion_requests" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "ingestion_request_created_idx" ON "ingestion_requests" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integrity_score_episode_id_idx" ON "integrity_scores" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "integrity_score_version_idx" ON "integrity_scores" USING btree ("version");--> statement-breakpoint
CREATE INDEX "integrity_score_band_idx" ON "integrity_scores" USING btree ("band");--> statement-breakpoint
CREATE INDEX "job_failures_job_id_idx" ON "job_failures" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_failures_created_at_idx" ON "job_failures" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "job_failures_type_idx" ON "job_failures" USING btree ("job_type");--> statement-breakpoint
CREATE INDEX "job_episode_source_idx" ON "jobs" USING btree ("episode_source_id");--> statement-breakpoint
CREATE INDEX "job_type_idx" ON "jobs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "job_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_pending_idx" ON "jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "job_retry_idx" ON "jobs" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "job_started_at_idx" ON "jobs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "job_pipeline_stage_idx" ON "jobs" USING btree ("pipeline_stage");--> statement-breakpoint
CREATE INDEX "music_episode_id_idx" ON "music_detections" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "music_start_time_idx" ON "music_detections" USING btree ("start_time");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_podcast_category" ON "podcast_categories" USING btree ("podcast_id","category_id");--> statement-breakpoint
CREATE INDEX "podcast_category_podcast_idx" ON "podcast_categories" USING btree ("podcast_id");--> statement-breakpoint
CREATE INDEX "podcast_category_category_idx" ON "podcast_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "podcast_featured_landing_idx" ON "podcasts" USING btree ("featured_landing","featured_at");--> statement-breakpoint
CREATE INDEX "podcast_featured_explore_idx" ON "podcasts" USING btree ("featured_explore","featured_at");--> statement-breakpoint
CREATE INDEX "program_source_program_idx" ON "program_sources" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "program_source_type_idx" ON "program_sources" USING btree ("type");--> statement-breakpoint
CREATE INDEX "program_source_enabled_idx" ON "program_sources" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "program_status_idx" ON "programs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "program_name_idx" ON "programs" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "selman_pack_episode_idx" ON "selman_packs" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "selman_pack_company_idx" ON "selman_packs" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "show_profiles_podcast_idx" ON "show_profiles" USING btree ("podcast_id");--> statement-breakpoint
CREATE INDEX "show_profiles_status_idx" ON "show_profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "source_segment_transcript_idx" ON "source_transcript_segments" USING btree ("source_transcript_id");--> statement-breakpoint
CREATE INDEX "source_segment_start_idx" ON "source_transcript_segments" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "source_transcript_source_idx" ON "source_transcripts" USING btree ("episode_source_id");--> statement-breakpoint
CREATE INDEX "source_transcript_provider_idx" ON "source_transcripts" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "speaker_appearance_speaker_idx" ON "speaker_appearances" USING btree ("speaker_id");--> statement-breakpoint
CREATE INDEX "speaker_appearance_episode_idx" ON "speaker_appearances" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "speaker_appearance_podcast_idx" ON "speaker_appearances" USING btree ("podcast_id");--> statement-breakpoint
CREATE UNIQUE INDEX "speaker_appearance_unique" ON "speaker_appearances" USING btree ("speaker_id","episode_id");--> statement-breakpoint
CREATE INDEX "speaker_name_idx" ON "speakers" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "speaker_name_lower_idx" ON "speakers" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "sponsor_episode_id_idx" ON "sponsor_segments" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "sponsor_start_time_idx" ON "sponsor_segments" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "classification_statement_id_idx" ON "statement_classifications" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "classification_claim_flag_idx" ON "statement_classifications" USING btree ("claim_flag");--> statement-breakpoint
CREATE UNIQUE INDEX "classification_unique_statement" ON "statement_classifications" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "statement_relation_episode_idx" ON "statement_relations" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "statement_relation_type_idx" ON "statement_relations" USING btree ("relation");--> statement-breakpoint
CREATE INDEX "statement_relation_a_idx" ON "statement_relations" USING btree ("statement_a_id");--> statement-breakpoint
CREATE INDEX "statement_relation_b_idx" ON "statement_relations" USING btree ("statement_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statement_relation_unique" ON "statement_relations" USING btree ("statement_a_id","statement_b_id","relation");--> statement-breakpoint
CREATE INDEX "statement_topic_statement_idx" ON "statement_topics" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "statement_topic_topic_idx" ON "statement_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statement_topic_unique" ON "statement_topics" USING btree ("statement_id","topic_id");--> statement-breakpoint
CREATE INDEX "statement_embedding_status_idx" ON "statements" USING btree ("embedding_status");--> statement-breakpoint
CREATE INDEX "statement_segment_id_idx" ON "statements" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "statement_start_time_idx" ON "statements" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "statement_episode_id_idx" ON "statements" USING btree ("episode_id");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_slug_idx" ON "topics" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "topic_name_idx" ON "topics" USING btree ("name");--> statement-breakpoint
CREATE INDEX "segment_episode_id_idx" ON "transcript_segments" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "segment_start_time_idx" ON "transcript_segments" USING btree ("start_time");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_episode_start_time" ON "transcript_segments" USING btree ("episode_id","start_time");--> statement-breakpoint
CREATE INDEX "user_clip_req_user_idx" ON "user_clip_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_clip_req_status_idx" ON "user_clip_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_clip_req_created_idx" ON "user_clip_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_clip_req_youtube_idx" ON "user_clip_requests" USING btree ("youtube_video_id");--> statement-breakpoint
CREATE INDEX "video_event_source_idx" ON "video_events" USING btree ("episode_source_id");--> statement-breakpoint
CREATE INDEX "video_event_start_idx" ON "video_events" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "video_event_type_idx" ON "video_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "viral_moment_episode_idx" ON "viral_moments" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "viral_moment_score_idx" ON "viral_moments" USING btree ("virality_score");--> statement-breakpoint
CREATE INDEX "viral_moment_type_idx" ON "viral_moments" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "viral_moment_start_idx" ON "viral_moments" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "viral_moment_clip_status_idx" ON "viral_moments" USING btree ("clip_status");--> statement-breakpoint
CREATE INDEX "viral_moment_posting_status_idx" ON "viral_moments" USING btree ("posting_status");--> statement-breakpoint
CREATE INDEX "webhook_delivery_webhook_idx" ON "webhook_deliveries" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_event_idx" ON "webhook_deliveries" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "webhook_delivery_at_idx" ON "webhook_deliveries" USING btree ("delivered_at");--> statement-breakpoint
CREATE INDEX "webhook_active_idx" ON "webhooks" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "zoom_meeting_id_idx" ON "zoom_meetings" USING btree ("zoom_meeting_id");--> statement-breakpoint
CREATE INDEX "zoom_meeting_host_email_idx" ON "zoom_meetings" USING btree ("host_email");--> statement-breakpoint
CREATE INDEX "zoom_meeting_year_idx" ON "zoom_meetings" USING btree ("year");--> statement-breakpoint
CREATE INDEX "zoom_transcript_meeting_idx" ON "zoom_transcripts" USING btree ("zoom_meeting_id");