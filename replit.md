# PODDNA - Podcast Intelligence Platform

## Overview

PODDNA is a podcast intelligence platform that offers three main products: a consumer-facing app for podcast annotation and discovery, a **Creator Face App** at `/creator` for creators to identify viral moments and generate optimized clips, and a **Brain Intelligence API** for programmatic access to its AI analysis capabilities. The Creator Face App is crucial for growth, monetized through a $29/month Creator Plan via Stripe. The platform aims to be the "Genius for podcasts," providing advanced intelligence for content creators and consumers.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

PODDNA is built as an Express.js application with a Drizzle ORM for database interactions with Neon PostgreSQL. The application is structured around a core platform, a Creator Face App, and a Brain Intelligence API, each with dedicated routes and services.

**UI/UX Decisions:**
The frontend utilizes a modern design stack including Radix UI, shadcn/ui, Embla Carousel, Lucide React, and Tailwind CSS for a consistent and responsive user experience, particularly in the Creator Face App pages like `creator-analyze.tsx`, `creator-dashboard.tsx`, and `creator-landing.tsx`.

**Technical Implementations:**

*   **Backend:**
    *   **Monolithic `server/routes.ts`:** Handles core functionalities like authentication, podcasts, episodes, annotations, and admin tasks.
    *   **Creator Face App (`server/creator-routes.ts`):** Manages the creator workflow, including YouTube URL validation, analysis, status polling, clip processing, and Stripe integration for subscriptions.
    *   **Brain API (`server/brain-api-routes.ts`):** Provides endpoints for audio ingestion (YouTube or file upload), viral moment detection, contradiction analysis, narrative mapping, speaker and topic identification, and search, secured by API key authentication.
    *   **Job Runner (`server/job-runner.ts`):** Orchestrates background jobs with polling, concurrency limits, exponential backoff, and recovery mechanisms for stuck jobs.
    *   **Key Job Workers:** Includes `detect-viral-moments` (Claude 3-pass genre-aware detection), `extract-clip` (5-stage YouTube download fallback), `burn-captions` (FFmpeg caption burning), `transcribe` (AssemblyAI), `detect-claims` and `extract-highlights` (Gemini-powered), `build-selman-pack` (Claude-powered longitudinal synthesis for deal intelligence), and `compute-show-profile` (SQL aggregation for Show Intelligence).
    *   **Services:** `cross-episode-synthesis.ts` (Claude longitudinal analysis), `claude-viral-service.ts` (genre-aware viral moment detection), `timestamp-snapper.ts` (corrects AI timestamps), `caption-generator.ts` (ASS subtitle generation), `youtube-transcript-service.ts` (YouTube caption fetching).
*   **Frontend:**
    *   Uses TanStack Query for data fetching and state management.
    *   Organized into pages and reusable components, with a strong focus on creator-specific workflows.
*   **Schema:** Defined in `shared/schema.ts` using Drizzle ORM definitions and Zod insert schemas across 66 tables.

**Feature Specifications & System Design Choices:**

*   **Creator Face App Pipeline:** Users submit a YouTube URL, triggering a series of jobs: transcript fetching, transcription (if needed), viral moment detection, claim/statement extraction. Users can poll for status, view results, and process clips.
*   **Brain API Audio File Pipeline:** Supports direct audio file uploads or external URLs, followed by transcription and requested analysis types (viral moments, claims, etc.).
*   **Zoom Call Integration:** Processes Zoom webhook events (`recording.completed`, `recording.transcript_completed`) to import meeting recordings, transcripts, and initiate AI analysis (e.g., `analyze_zoom_call` for 5-dimension signal extraction) and subsequent deal intelligence pack generation (`build_selman_pack`). Also supports importing Zoom recordings via shared links without requiring Zoom API credentials.
*   **Transcript Submission (Brain API):** Allows direct submission of pre-made transcripts, bypassing the transcription step, suitable for integrations with other face apps.
*   **Cross-Episode Synthesis (Brain API):** Enables multi-episode analysis by accepting a list of episode IDs and a natural language query. It synthesizes themes, patterns, and narratives using Claude, providing structured or narrative outputs.
*   **Clip Processing Pipeline:** Involves a robust 5-stage YouTube download fallback, followed by burning captions (with customizable styles, hook overlays, and watermarks) using FFmpeg, and uploading to object storage.
*   **Show Intelligence Pipeline:** Automatically generates show profiles (recurring themes, belief patterns, stance shifts) based on episode count milestones using pure SQL aggregation.
*   **Monetization:** Implemented with Stripe, supporting a free tier with usage limits and a Creator tier ($29/month) for unlimited access and advanced features.
*   **Authentication:** Brain API uses SHA-256 hashed API keys. Google/YouTube OAuth for user authentication.

## External Dependencies

*   **Database:** Neon Database (serverless PostgreSQL), managed with Drizzle ORM.
*   **UI Libraries:** Radix UI, shadcn/ui, Embla Carousel, Lucide React, cmdk, Tailwind CSS.
*   **AI Services:** Gemini 2.5 Flash, Claude Sonnet 4.5 (via Replit AI Integrations), AssemblyAI for transcription.
*   **Media Processing:** FFmpeg, faster-whisper, yt-dlp, youtubei.js, YouTube IFrame API.
*   **Payments:** Stripe (via Replit Integration and `stripe-replit-sync`).
*   **Email:** Resend (via Replit Integration).
*   **Storage:** Replit Object Storage.
*   **Proxy:** Smartproxy (for residential proxy services, e.g., YouTube rate-limit bypass).
*   **Music Analysis:** AudD API.
*   **API Integrations:** Zoom API (for B2B analysis and webhooks).
*   **Session Management:** `connect-pg-simple`.