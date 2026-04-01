# PODDNA Technical Architecture Documentation

**Version:** 1.0  
**Last Updated:** November 2025  
**Purpose:** IP Preservation, Migration Planning, Due Diligence

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture Overview](#system-architecture-overview)
3. [Technology Stack](#technology-stack)
4. [Data Models & Database Schema](#data-models--database-schema)
5. [API Specification](#api-specification)
6. [Authentication & Authorization](#authentication--authorization)
7. [External Service Integrations](#external-service-integrations)
8. [Frontend Architecture](#frontend-architecture)
9. [Core Business Logic & Workflows](#core-business-logic--workflows)
10. [Deployment & Infrastructure](#deployment--infrastructure)
11. [Environment Variables](#environment-variables)
12. [Migration Guide](#migration-guide)

---

## Executive Summary

PODDNA is a **podcast annotation platform** that enables users to create, share, and discover insights within podcast transcripts. The platform functions similarly to Genius.com for music lyrics but applied to podcast content.

### Core Capabilities

- **Transcript Management:** AI-powered transcription (Gemini), YouTube transcript import, manual upload
- **Annotation System:** User-created annotations on transcript segments with voting and featuring
- **Music Detection:** AudD API integration to identify songs played in podcasts
- **Content Discovery:** Podcast Index API integration for podcast/episode import
- **User Management:** Role-based access control (user, contributor, moderator, admin)
- **Media Playback:** YouTube video player integration with transcript synchronization

### Business Value

- Collaborative podcast annotation platform
- AI-powered content analysis
- Music discovery (PodTap feature)
- Embeddable widget for third-party integration
- Admin content curation tools

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     React 18 + TypeScript                            │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │    │
│  │  │  Landing │ │  Episode │ │  Profile │ │  Admin   │ │  Widget  │  │    │
│  │  │   Page   │ │   Page   │ │   Page   │ │Dashboard │ │   Page   │  │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │    │
│  │                                                                      │    │
│  │  ┌────────────────────────────────────────────────────────────────┐ │    │
│  │  │            TanStack Query (Server State) + Wouter (Routing)    │ │    │
│  │  └────────────────────────────────────────────────────────────────┘ │    │
│  │  ┌────────────────────────────────────────────────────────────────┐ │    │
│  │  │            shadcn/ui + Tailwind CSS + Radix Primitives         │ │    │
│  │  └────────────────────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTP/REST + SSE
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SERVER LAYER                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                   Express.js + Node.js (TypeScript)                  │    │
│  │                                                                      │    │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐       │    │
│  │  │   Routes   │ │   Auth     │ │  Storage   │ │ Middleware │       │    │
│  │  │  (REST)    │ │ (OIDC)     │ │ Interface  │ │ (Sessions) │       │    │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘       │    │
│  │                                                                      │    │
│  │  ┌────────────────────────────────────────────────────────────────┐ │    │
│  │  │               Service Modules                                   │ │    │
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐   │ │    │
│  │  │  │Transcription │ │   Music      │ │   Annotation         │   │ │    │
│  │  │  │  (Gemini)    │ │  Detector    │ │   Generator          │   │ │    │
│  │  │  └──────────────┘ └──────────────┘ └──────────────────────┘   │ │    │
│  │  │  ┌──────────────┐ ┌──────────────────────────────────────┐    │ │    │
│  │  │  │   Object     │ │        Podcast Index Client          │    │ │    │
│  │  │  │   Storage    │ │                                      │    │ │    │
│  │  │  └──────────────┘ └──────────────────────────────────────┘    │ │    │
│  │  └────────────────────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ SQL (Drizzle ORM)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    PostgreSQL (Neon Serverless)                        │  │
│  │  ┌───────┐ ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌───────────────┐   │  │
│  │  │ users │ │podcasts │ │ episodes │ │ segments  │ │  annotations  │   │  │
│  │  └───────┘ └─────────┘ └──────────┘ └───────────┘ └───────────────┘   │  │
│  │  ┌─────────────────┐ ┌──────────┐                                      │  │
│  │  │ music_detections│ │ sessions │                                      │  │
│  │  └─────────────────┘ └──────────┘                                      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL SERVICES                                   │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐  │
│  │   Gemini   │ │   AudD    │ │  Podcast   │ │  YouTube   │ │  Google  │  │
│  │     AI     │ │    API    │ │   Index    │ │Transcript  │ │  Cloud   │  │
│  │            │ │           │ │    API     │ │    API     │ │ Storage  │  │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Request Flow

1. **Client Request** → React app makes API call via TanStack Query
2. **Authentication** → Express middleware validates session (OpenID Connect)
3. **Route Handler** → Validates input with Zod, calls storage interface
4. **Storage Layer** → Drizzle ORM executes PostgreSQL queries
5. **Response** → JSON returned to client, TanStack Query caches result

---

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI framework |
| TypeScript | 5.x | Type safety |
| Vite | 5.x | Build tool & dev server |
| Wouter | 3.x | Client-side routing |
| TanStack Query | 5.x | Server state management |
| shadcn/ui | Latest | UI component library |
| Radix UI | Latest | Accessible primitives |
| Tailwind CSS | 3.x | Utility-first CSS |
| Lucide React | Latest | Icon library |
| React Hook Form | 7.x | Form handling |
| Zod | 3.x | Schema validation |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20.x | Runtime |
| Express.js | 4.x | Web framework |
| TypeScript | 5.x | Type safety |
| Drizzle ORM | Latest | Database ORM |
| PostgreSQL | 15.x | Database (via Neon) |
| Passport.js | Latest | Authentication |
| openid-client | Latest | OIDC implementation |
| express-session | Latest | Session management |
| connect-pg-simple | Latest | PostgreSQL session store |
| Zod | 3.x | Request validation |

### External APIs

| Service | Purpose |
|---------|---------|
| Google Gemini AI | Audio transcription, annotation generation |
| AudD | Music recognition/detection |
| Podcast Index | Podcast discovery & episode import |
| YouTube Transcript API | YouTube caption import |
| Google Cloud Storage | Object storage for uploads |

---

## Data Models & Database Schema

### Entity Relationship Diagram

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────────┐
│      users       │       │     podcasts     │       │      episodes        │
├──────────────────┤       ├──────────────────┤       ├──────────────────────┤
│ id (PK, UUID)    │       │ id (PK, UUID)    │◄──────│ id (PK, UUID)        │
│ email            │       │ title            │       │ podcastId (FK)       │
│ firstName        │       │ host             │       │ title                │
│ lastName         │       │ description      │       │ episodeNumber        │
│ profileImageUrl  │       │ artworkUrl       │       │ publishedAt          │
│ role             │       │ podcastIndexFeed │       │ duration             │
│ certifications[] │       │ createdAt        │       │ type                 │
│ isBanned         │       │ updatedAt        │       │ mediaUrl             │
│ banReason        │       └──────────────────┘       │ videoUrl             │
│ bannedAt         │                                  │ description          │
│ bannedBy         │                                  │ status               │
│ createdAt        │                                  │ createdAt            │
│ updatedAt        │                                  │ updatedAt            │
└──────────────────┘                                  └──────────────────────┘
         │                                                       │
         │                                                       │
         ▼                                                       ▼
┌──────────────────┐       ┌──────────────────────┐     ┌────────────────────┐
│   annotations    │       │  transcript_segments │     │  music_detections  │
├──────────────────┤       ├──────────────────────┤     ├────────────────────┤
│ id (PK, UUID)    │       │ id (PK, UUID)        │     │ id (PK, UUID)      │
│ episodeId (FK)   │       │ episodeId (FK)       │     │ episodeId (FK)     │
│ segmentId (FK)   │◄──────│ startTime            │     │ startTime          │
│ userId (FK)      │       │ endTime              │     │ endTime            │
│ text             │       │ text                 │     │ artist             │
│ startOffset      │       │ type                 │     │ title              │
│ endOffset        │       │ speaker              │     │ album              │
│ content          │       │ isStale              │     │ releaseDate        │
│ upvotes          │       └──────────────────────┘     │ label              │
│ downvotes        │                                    │ spotifyUrl         │
│ featured         │                                    │ appleMusicUrl      │
│ featuredAt       │                                    │ songLink           │
│ createdAt        │                                    │ artworkUrl         │
└──────────────────┘                                    │ createdAt          │
                                                        └────────────────────┘

┌──────────────────┐
│     sessions     │
├──────────────────┤
│ sid (PK)         │
│ sess (JSONB)     │
│ expire           │
└──────────────────┘
```

### Table Definitions

#### users
```sql
CREATE TABLE users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR UNIQUE,
  first_name VARCHAR,
  last_name VARCHAR,
  profile_image_url VARCHAR,
  role VARCHAR NOT NULL DEFAULT 'user',
  certifications TEXT[] NOT NULL DEFAULT '{}',
  is_banned BOOLEAN NOT NULL DEFAULT false,
  ban_reason TEXT,
  banned_at TIMESTAMP,
  banned_by VARCHAR,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

**Role Values:** `user`, `contributor`, `moderator`, `admin`  
**Certification Values:** `verified`, `expert`, `founding_member`, `top_contributor`

#### podcasts
```sql
CREATE TABLE podcasts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  host TEXT NOT NULL,
  description TEXT,
  artwork_url TEXT,
  podcast_index_feed_id VARCHAR,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
```

#### episodes
```sql
CREATE TABLE episodes (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  podcast_id VARCHAR NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  episode_number INTEGER,
  published_at TIMESTAMP NOT NULL,
  duration INTEGER NOT NULL,
  type TEXT NOT NULL,
  media_url TEXT NOT NULL,
  video_url TEXT,
  spotify_url TEXT,
  apple_podcasts_url TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX episode_podcast_id_idx ON episodes(podcast_id);
CREATE INDEX episode_status_idx ON episodes(status);
CREATE INDEX episode_published_at_idx ON episodes(published_at);
```

**Type Values:** `audio`, `video`  
**Status Values:** `draft`, `processing`, `ready`, `failed`

#### transcript_segments
```sql
CREATE TABLE transcript_segments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id VARCHAR NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  text TEXT NOT NULL,
  type TEXT NOT NULL,
  speaker TEXT,
  is_stale BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX segment_episode_id_idx ON transcript_segments(episode_id);
CREATE INDEX segment_start_time_idx ON transcript_segments(start_time);
CREATE UNIQUE INDEX unique_episode_start_time ON transcript_segments(episode_id, start_time);
```

**Type Values:** `speech`, `music`, `media`

#### annotations
```sql
CREATE TABLE annotations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id VARCHAR NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  segment_id VARCHAR NOT NULL REFERENCES transcript_segments(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  upvotes INTEGER NOT NULL DEFAULT 0,
  downvotes INTEGER NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT false,
  featured_at TIMESTAMP
);

CREATE INDEX annotation_episode_id_idx ON annotations(episode_id);
CREATE INDEX annotation_segment_id_idx ON annotations(segment_id);
CREATE INDEX annotation_user_id_idx ON annotations(user_id);
CREATE INDEX annotation_votes_idx ON annotations(upvotes, downvotes);
CREATE INDEX annotation_featured_idx ON annotations(featured, featured_at);
```

#### music_detections
```sql
CREATE TABLE music_detections (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id VARCHAR NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  album TEXT,
  release_date TEXT,
  label TEXT,
  spotify_url TEXT,
  apple_music_url TEXT,
  song_link TEXT,
  artwork_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX music_episode_id_idx ON music_detections(episode_id);
CREATE INDEX music_start_time_idx ON music_detections(start_time);
```

#### sessions
```sql
CREATE TABLE sessions (
  sid VARCHAR PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMP NOT NULL
);

CREATE INDEX IDX_session_expire ON sessions(expire);
```

---

## API Specification

### Authentication Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/login` | No | Initiates OIDC login flow |
| GET | `/api/callback` | No | OIDC callback handler |
| GET | `/api/logout` | No | Logs out user |
| GET | `/api/auth/user` | Yes | Returns current authenticated user |

### Podcast Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/podcasts` | No | List all podcasts |
| GET | `/api/podcasts/:id` | No | Get podcast by ID |
| POST | `/api/podcasts` | No | Create podcast |
| PATCH | `/api/podcasts/:id` | Yes | Update podcast |
| DELETE | `/api/podcasts/:id` | Yes | Delete podcast |

### Episode Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/episodes` | No | List all episodes (with hasTranscript) |
| GET | `/api/episodes/enriched` | No | Episodes with counts & metadata |
| GET | `/api/podcasts/:id/episodes` | No | Episodes by podcast |
| GET | `/api/episodes/:id` | No | Get episode by ID |
| POST | `/api/episodes` | No | Create episode |
| PATCH | `/api/episodes/:id` | Yes | Update episode |
| DELETE | `/api/episodes/:id` | Yes | Delete episode |

### Transcript Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/episodes/:id/segments` | No | Get transcript segments |
| POST | `/api/episodes/:id/transcript` | No | Upload transcript JSON |
| POST | `/api/episodes/:id/transcript/youtube` | No | Transcribe YouTube via Gemini |
| POST | `/api/episodes/:id/transcript/custom-url` | No | Transcribe from audio URL |
| GET | `/api/episodes/:id/transcript/progress` | No | SSE progress stream |
| DELETE | `/api/episodes/:id/transcript` | No | Delete transcript |
| GET | `/api/episodes/:id/speakers` | No | Get speakers list |
| PATCH | `/api/episodes/:id/speakers/rename` | No | Rename speaker |

### Annotation Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/episodes/:id/annotations` | No | Get episode annotations |
| GET | `/api/annotations/featured` | No | Get featured annotations |
| GET | `/api/annotations/trending` | No | Get trending annotations |
| GET | `/api/profile/annotations` | Yes | Get user's annotations |
| POST | `/api/annotations` | Yes | Create annotation |
| PATCH | `/api/annotations/:id` | Yes | Update annotation (owner only) |
| DELETE | `/api/annotations/:id` | Yes | Delete annotation (owner only) |
| POST | `/api/annotations/:id/vote` | No | Vote on annotation |
| PATCH | `/api/annotations/:id/featured` | Yes (Admin) | Set featured status |
| POST | `/api/episodes/:id/generate-annotations` | Yes | AI-generate annotations |

### Music Detection Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/episodes/:id/music` | No | Get music detections |
| GET | `/api/music/trending` | No | Get trending music |
| POST | `/api/episodes/:id/detect-music` | Yes | Run AudD detection |
| DELETE | `/api/episodes/:id/music` | Yes | Clear music detections |

### User Management Endpoints (Admin)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/users` | Admin | List all users |
| PATCH | `/api/admin/users/:id/role` | Admin | Update user role |
| PATCH | `/api/admin/users/:id/certifications` | Admin | Update certifications |
| POST | `/api/admin/users/:id/ban` | Admin | Ban user |
| POST | `/api/admin/users/:id/unban` | Admin | Unban user |
| POST | `/api/admin/users/bulk-delete` | Admin | Bulk delete users |

### Podcast Index Endpoints (Admin)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/podcast-index/search?q=` | Admin | Search Podcast Index |
| GET | `/api/admin/podcast-index/episodes/:feedId` | Admin | Get feed episodes |
| POST | `/api/admin/podcast-index/import` | Admin | Import podcast & episodes |

### Profile Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| PATCH | `/api/profile` | Yes | Update profile |
| POST | `/api/profile/upload-url` | Yes | Get presigned upload URL |
| PUT | `/api/profile/image` | Yes | Confirm image upload |

### Upload Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/upload/image` | Yes | Get presigned upload URL |
| POST | `/api/upload/confirm` | Yes | Confirm upload & set ACL |
| GET | `/objects/:objectPath(*)` | No | Serve uploaded objects |

### Search Endpoint

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/search?q=` | No | Search podcasts & episodes |

---

## Authentication & Authorization

### Authentication Flow (OpenID Connect)

```
┌────────┐     ┌─────────┐     ┌─────────────┐     ┌──────────┐
│ Client │     │ Express │     │ Replit OIDC │     │ Database │
└───┬────┘     └────┬────┘     └──────┬──────┘     └────┬─────┘
    │               │                 │                 │
    │ GET /api/login│                 │                 │
    │──────────────►│                 │                 │
    │               │ Redirect to     │                 │
    │               │ authorize       │                 │
    │◄──────────────┤────────────────►│                 │
    │               │                 │                 │
    │ User authenticates with Replit  │                 │
    │◄────────────────────────────────┤                 │
    │               │                 │                 │
    │ GET /api/callback?code=xxx      │                 │
    │──────────────►│                 │                 │
    │               │ Exchange code   │                 │
    │               │────────────────►│                 │
    │               │     tokens      │                 │
    │               │◄────────────────┤                 │
    │               │                 │                 │
    │               │ Upsert user     │                 │
    │               │─────────────────┼────────────────►│
    │               │                 │                 │
    │               │ Create session  │                 │
    │               │─────────────────┼────────────────►│
    │               │                 │                 │
    │ Set-Cookie: session=xxx         │                 │
    │◄──────────────┤                 │                 │
    │ Redirect /    │                 │                 │
    │◄──────────────┤                 │                 │
```

### Session Configuration

```typescript
{
  secret: process.env.SESSION_SECRET,
  store: PostgresStore (connect-pg-simple),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 1 week
  }
}
```

### Authorization Middleware

```typescript
// isAuthenticated middleware
export const isAuthenticated: RequestHandler = async (req, res, next) => {
  // Check if authenticated
  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  // Check token expiration
  if (now <= user.expires_at) {
    return next();
  }
  
  // Attempt token refresh
  const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
  updateUserSession(user, tokenResponse);
  return next();
};
```

### Role-Based Access Control

| Role | Permissions |
|------|-------------|
| `user` | Create/edit own annotations, vote, view content |
| `contributor` | Same as user + additional contribution features |
| `moderator` | Same as contributor + moderation capabilities |
| `admin` | Full access: user management, content management, Podcast Index, featured curation |

---

## External Service Integrations

### 1. Google Gemini AI (Transcription & Annotation Generation)

**File:** `server/transcription.ts`, `server/annotation-generator.ts`

**Purpose:** AI-powered audio transcription with speaker diarization, annotation generation

**Configuration:**
```typescript
const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});
```

**Transcription Process:**
1. Download audio from URL or YouTube
2. Split into chunks (7MB max per chunk)
3. Send each chunk to Gemini with speaker diarization prompt
4. Parse JSON response, merge consecutive speaker segments
5. Save segments to database

**Environment Variables:**
- `AI_INTEGRATIONS_GEMINI_API_KEY`
- `AI_INTEGRATIONS_GEMINI_BASE_URL`

### 2. AudD API (Music Detection)

**File:** `server/music-detector.ts`

**Purpose:** Identify songs played within podcast episodes

**Process:**
1. Download episode audio
2. Extract 15-second samples every 60 seconds
3. Send samples to AudD API
4. Deduplicate results
5. Store detections with Spotify/Apple Music links

**Environment Variables:**
- `AUDD_API_TOKEN`

### 3. Podcast Index API

**File:** `server/routes.ts` (inline)

**Purpose:** Discover and import podcasts/episodes

**Configuration:**
```typescript
const PodcastIndexApi = require("podcast-index-api");
const client = PodcastIndexApi(apiKey, apiSecret, "PODDNA/1.0");
```

**Environment Variables:**
- `PODCAST_INDEX_API_KEY`
- `PODCAST_INDEX_API_SECRET`

### 4. YouTube Transcript API

**File:** `server/routes.ts`

**Purpose:** Import captions from YouTube videos

**Configuration:**
```typescript
const options = {
  hostname: 'www.youtube-transcript.io',
  path: '/api/transcripts',
  method: 'POST',
  headers: {
    'Authorization': `Basic ${apiToken}`,
    'Content-Type': 'application/json'
  }
};
```

**Environment Variables:**
- `YOUTUBE_TRANSCRIPT_API_TOKEN`

### 5. Google Cloud Storage

**File:** `server/objectStorage.ts`, `server/objectAcl.ts`

**Purpose:** Store user-uploaded images (profile pictures, artwork)

**Configuration:**
```typescript
const objectStorageClient = new Storage({
  credentials: {
    type: "external_account",
    token_url: "http://127.0.0.1:1106/token",
    // Replit sidecar handles authentication
  }
});
```

**Environment Variables:**
- `PRIVATE_OBJECT_DIR`
- `PUBLIC_OBJECT_SEARCH_PATHS`

---

## Frontend Architecture

### Directory Structure

```
client/
├── src/
│   ├── App.tsx              # Root component with routing
│   ├── main.tsx             # Entry point
│   ├── index.css            # Global styles & CSS variables
│   ├── components/
│   │   ├── ui/              # shadcn/ui components
│   │   ├── header.tsx       # Main navigation header
│   │   ├── admin-layout.tsx # Admin sidebar layout
│   │   ├── podcast-card.tsx # Podcast display card
│   │   ├── episode-card.tsx # Episode display card
│   │   ├── transcript-viewer.tsx
│   │   ├── annotation-card.tsx
│   │   └── ...
│   ├── pages/
│   │   ├── landing.tsx      # Home page
│   │   ├── explore.tsx      # Content discovery
│   │   ├── episode.tsx      # Episode detail with transcript
│   │   ├── podcast.tsx      # Podcast detail
│   │   ├── profile.tsx      # User profile
│   │   ├── trending.tsx     # Trending annotations
│   │   ├── podtap.tsx       # Music discovery
│   │   ├── widget.tsx       # Embeddable widget
│   │   ├── how-it-works.tsx # Platform explainer
│   │   └── admin/
│   │       ├── index.tsx    # Admin dashboard
│   │       ├── discover.tsx # Podcast Index search
│   │       ├── episodes.tsx # Episode library
│   │       ├── episode-detail.tsx
│   │       ├── transcripts.tsx
│   │       ├── annotations.tsx
│   │       └── users.tsx
│   ├── hooks/
│   │   ├── useAuth.ts       # Authentication state
│   │   └── use-toast.ts     # Toast notifications
│   └── lib/
│       ├── queryClient.ts   # TanStack Query setup
│       ├── utils.ts         # Utility functions
│       └── authUtils.ts     # Auth helpers
```

### Routing Configuration

```typescript
// Public routes
<Route path="/" component={LandingPage} />
<Route path="/explore" component={ExplorePage} />
<Route path="/podcast/:id" component={PodcastPage} />
<Route path="/episode/:id" component={EpisodePage} />
<Route path="/trending" component={TrendingPage} />
<Route path="/podtap" component={PodTapPage} />
<Route path="/how-it-works" component={HowItWorksPage} />
<Route path="/profile" component={ProfilePage} />

// Widget route (no header)
<Route path="/widget" component={WidgetPage} />

// Admin routes (sidebar layout)
<Route path="/admin" component={AdminDashboard} />
<Route path="/admin/discover" component={AdminDiscoverPage} />
<Route path="/admin/episodes" component={AdminEpisodesPage} />
<Route path="/admin/episodes/:id" component={AdminEpisodeDetailPage} />
<Route path="/admin/transcripts" component={AdminTranscriptsPage} />
<Route path="/admin/annotations" component={AdminAnnotationsPage} />
<Route path="/admin/users" component={AdminUsersPage} />
```

### State Management

**TanStack Query Configuration:**
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const res = await fetch(queryKey[0] as string, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
        return res.json();
      },
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
```

---

## Core Business Logic & Workflows

### 1. Transcript Processing Pipeline

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  Audio Source   │     │   Processing     │     │    Database        │
│                 │     │                  │     │                    │
│ ┌─────────────┐ │     │  ┌────────────┐  │     │  ┌──────────────┐ │
│ │YouTube Video│─┼────►│  │ Download   │  │     │  │ transcript_  │ │
│ └─────────────┘ │     │  │ Audio      │  │     │  │ segments     │ │
│                 │     │  └─────┬──────┘  │     │  └──────────────┘ │
│ ┌─────────────┐ │     │        ▼         │     │         ▲         │
│ │ Audio URL   │─┼────►│  ┌────────────┐  │     │         │         │
│ └─────────────┘ │     │  │ Chunk      │  │     │         │         │
│                 │     │  │ (7MB each) │  │     │         │         │
│ ┌─────────────┐ │     │  └─────┬──────┘  │     │         │         │
│ │Manual JSON  │─┼──┐  │        ▼         │     │         │         │
│ └─────────────┘ │  │  │  ┌────────────┐  │     │         │         │
│                 │  │  │  │ Gemini AI  │──┼─────┼────────►│         │
│ ┌─────────────┐ │  │  │  │ Transcribe │  │     │         │         │
│ │YouTube API  │─┼──┼──┼─►│ + Diarize  │  │     │         │         │
│ │ (captions)  │ │  │  │  └────────────┘  │     │         │         │
│ └─────────────┘ │  │  │                  │     │         │         │
└─────────────────┘  │  │  ┌────────────┐  │     │         │         │
                     └──┼─►│ Parse &    │──┼─────┼─────────┘         │
                        │  │ Validate   │  │     │                   │
                        │  └────────────┘  │     │                   │
                        └──────────────────┘     └───────────────────┘
```

### 2. Annotation Lifecycle

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Annotation Creation                           │
│                                                                       │
│  User highlights text → Creates annotation → Saves to database       │
│                                                                       │
│  AI Generation (Admin): Transcript → Gemini → Parse → Create batch   │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Annotation Display                            │
│                                                                       │
│  Episode page loads → Fetch annotations by episodeId → Render        │
│  with author info, vote counts, featured status                      │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Annotation Interaction                        │
│                                                                       │
│  Vote: POST /api/annotations/:id/vote { type: "up" | "down" }        │
│  Edit: PATCH /api/annotations/:id { content: "..." } (owner only)    │
│  Delete: DELETE /api/annotations/:id (owner only)                    │
│  Feature: PATCH /api/annotations/:id/featured { featured: true }     │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Content Curation                              │
│                                                                       │
│  Admin features annotations → Displayed on homepage                  │
│  Trending: Sorted by upvote count                                    │
└──────────────────────────────────────────────────────────────────────┘
```

### 3. Music Detection Workflow

```
1. Admin triggers detection: POST /api/episodes/:id/detect-music
2. Download episode audio (supports YouTube and direct URLs)
3. Get audio duration via ffprobe
4. Split into 15-second segments every 60 seconds
5. Send segments to AudD API (3 concurrent requests)
6. Deduplicate songs by artist+title
7. Save to music_detections table with streaming links
8. Display in PodTap discovery page
```

---

## Deployment & Infrastructure

### Current Deployment (Replit)

```
┌────────────────────────────────────────────────────────────────────┐
│                          Replit Platform                            │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      Replit Deployment                       │   │
│  │                                                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │   │
│  │  │   Vite Dev   │  │   Express    │  │  Static Assets   │   │   │
│  │  │   Server     │  │   Server     │  │  (Production)    │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘   │   │
│  │           │               │                   │              │   │
│  │           └───────────────┴───────────────────┘              │   │
│  │                           │                                   │   │
│  │                    Port 5000 (0.0.0.0)                       │   │
│  └───────────────────────────┼──────────────────────────────────┘   │
│                              │                                       │
│  ┌───────────────────────────┼──────────────────────────────────┐   │
│  │                    Replit Services                            │   │
│  │                                                               │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │   │
│  │  │  Neon Database │  │ Object Storage │  │  Replit Auth   │  │   │
│  │  │  (PostgreSQL)  │  │(Google Cloud)  │  │    (OIDC)      │  │   │
│  │  └────────────────┘  └────────────────┘  └────────────────┘  │   │
│  └───────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

### Build Commands

```bash
# Development
npm run dev          # Starts Express + Vite dev server

# Production build
npm run build        # Builds frontend with Vite
npm run start        # Runs production server

# Database
npm run db:push      # Push schema changes to database
npm run db:push --force  # Force push (with data loss warning)
```

### Server Entry Points

**Development:** `server/index-dev.ts`
```typescript
runApp(async (app: Express, server: Server) => {
  await setupVite(app, server);
});
```

**Production:** `server/index-prod.ts`
```typescript
runApp(async (app: Express, server: Server) => {
  await serveStatic(app);
});
```

---

## Environment Variables

### Required Secrets

| Variable | Description | Required For |
|----------|-------------|--------------|
| `DATABASE_URL` | PostgreSQL connection string | Database |
| `SESSION_SECRET` | Express session encryption | Auth |
| `PGHOST` | PostgreSQL host | Database |
| `PGPORT` | PostgreSQL port | Database |
| `PGUSER` | PostgreSQL user | Database |
| `PGPASSWORD` | PostgreSQL password | Database |
| `PGDATABASE` | PostgreSQL database name | Database |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Gemini API key | Transcription |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Gemini API base URL | Transcription |
| `AUDD_API_TOKEN` | AudD music detection API | Music detection |
| `PODCAST_INDEX_API_KEY` | Podcast Index API key | Podcast import |
| `PODCAST_INDEX_API_SECRET` | Podcast Index API secret | Podcast import |
| `YOUTUBE_TRANSCRIPT_API_TOKEN` | YouTube transcript API | YouTube captions |

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PRIVATE_OBJECT_DIR` | Object storage private path | `/bucket-id/.private` |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Public object paths | `/bucket-id/public` |
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Environment | `development` / `production` |

### Replit-Managed Variables

| Variable | Description |
|----------|-------------|
| `REPL_ID` | Replit project ID (used for OIDC) |
| `REPLIT_DOMAINS` | Replit deployment domains |
| `REPLIT_DEV_DOMAIN` | Development domain |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Object storage bucket |

---

## Migration Guide

### Migrating to Self-Hosted Infrastructure

This guide provides step-by-step instructions for migrating PODDNA from Replit to any self-hosted infrastructure (AWS, GCP, DigitalOcean, Railway, Render, etc.).

---

### Step 1: Database Migration

**Current Setup:** Neon Serverless PostgreSQL via `@neondatabase/serverless`

**Export Database:**
```bash
# Export from Neon (get connection string from Replit Secrets)
pg_dump $DATABASE_URL > poddna_backup.sql

# Or use pg_dump with individual credentials
pg_dump -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE > poddna_backup.sql
```

**Import to New PostgreSQL:**
```bash
# Create database on new host
createdb -h <new-host> -U <user> poddna

# Import data
psql -h <new-host> -U <user> -d poddna < poddna_backup.sql
```

**Code Changes Required:**

Replace `server/db.ts`:
```typescript
// BEFORE: Neon Serverless
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "@shared/schema";

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });

// AFTER: Standard PostgreSQL (node-postgres)
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});
export const db = drizzle(pool, { schema });
```

**Install Dependencies:**
```bash
npm uninstall @neondatabase/serverless
npm install pg drizzle-orm/node-postgres
npm install -D @types/pg
```

---

### Step 2: Authentication Migration (Replace Replit Auth)

**Current Setup:** Replit OpenID Connect via `server/replitAuth.ts`

The current auth uses these Replit-specific components:
- OIDC discovery URL: `https://replit.com/oidc`
- Client ID: `REPL_ID` environment variable
- Callback URL: Dynamic based on `req.hostname`

**Option A: Auth0 (Recommended)**

```typescript
// server/auth.ts - Replace replitAuth.ts
import { auth, requiresAuth } from 'express-openid-connect';
import { storage } from './storage';

const authConfig = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.SESSION_SECRET,
  baseURL: process.env.BASE_URL,        // e.g., https://poddna.io
  clientID: process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: process.env.AUTH0_ISSUER_URL,  // e.g., https://your-tenant.auth0.com
  routes: {
    login: '/api/login',
    logout: '/api/logout',
    callback: '/api/callback',
  },
};

export async function setupAuth(app: Express) {
  app.use(auth(authConfig));
  
  // User sync middleware
  app.use(async (req, res, next) => {
    if (req.oidc?.isAuthenticated() && req.oidc.user) {
      await storage.upsertUser({
        id: req.oidc.user.sub,
        email: req.oidc.user.email,
        firstName: req.oidc.user.given_name,
        lastName: req.oidc.user.family_name,
        profileImageUrl: req.oidc.user.picture,
      });
    }
    next();
  });
}

export const isAuthenticated = requiresAuth();
```

**Option B: Clerk (Fastest Setup)**

```bash
# Install: npm install @clerk/clerk-sdk-node
# Sign up: https://dashboard.clerk.com/
# Get keys from: Dashboard > API Keys
```

```typescript
// server/auth.ts - Complete Clerk implementation
import { ClerkExpressRequireAuth, clerkClient } from '@clerk/clerk-sdk-node';
import { storage } from './storage';

// Middleware to require authentication
export const isAuthenticated = ClerkExpressRequireAuth({
  signInUrl: '/sign-in',  // Redirect if not authenticated
});

// User sync middleware
export async function syncClerkUser(req: any, res: any, next: any) {
  if (req.auth?.userId) {
    try {
      const clerkUser = await clerkClient.users.getUser(req.auth.userId);
      await storage.upsertUser({
        id: req.auth.userId,
        email: clerkUser.emailAddresses[0]?.emailAddress,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        profileImageUrl: clerkUser.imageUrl,
      });
    } catch (err) {
      console.error('Failed to sync Clerk user:', err);
    }
  }
  next();
}

// Setup in app.ts
export async function setupAuth(app: Express) {
  app.use(syncClerkUser);
  
  // Auth endpoints handled by Clerk
  app.get('/api/auth/user', isAuthenticated, (req: any, res) => {
    res.json({ id: req.auth.userId });
  });
}
```

Environment variables:
```bash
CLERK_SECRET_KEY=sk_live_xxx  # From Clerk Dashboard
CLERK_PUBLISHABLE_KEY=pk_live_xxx
```

**Option C: Passport.js with Google OAuth (Self-managed)**

```bash
# Install: npm install passport passport-google-oauth20
# Setup OAuth: https://console.cloud.google.com/apis/credentials
# Create OAuth 2.0 Client ID > Web application
# Authorized redirect URIs: https://your-domain.com/api/callback/google
```

```typescript
// server/auth.ts - Complete Passport.js implementation
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import { storage } from './storage';

export async function setupAuth(app: Express) {
  // Session configuration
  const PgSession = connectPg(session);
  app.use(session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: 'sessions',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  // Google OAuth Strategy
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.BASE_URL + '/api/callback/google',
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const user = await storage.upsertUser({
        id: profile.id,
        email: profile.emails?.[0]?.value,
        firstName: profile.name?.givenName,
        lastName: profile.name?.familyName,
        profileImageUrl: profile.photos?.[0]?.value,
      });
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  }));

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  // Auth routes
  app.get('/api/login', passport.authenticate('google', {
    scope: ['profile', 'email'],
  }));

  app.get('/api/callback/google', 
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => res.redirect('/')
  );

  app.get('/api/logout', (req, res) => {
    req.logout(() => res.redirect('/'));
  });

  app.get('/api/auth/user', (req, res) => {
    if (req.isAuthenticated()) {
      res.json(req.user);
    } else {
      res.status(401).json({ message: 'Not authenticated' });
    }
  });
}

export const isAuthenticated = (req: any, res: any, next: any) => {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: 'Unauthorized' });
};
```

Environment variables:
```bash
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
BASE_URL=https://your-domain.com
```

**Session Store Migration:**

Replace Replit's PostgreSQL session store:
```typescript
// Current: connect-pg-simple (keep this, just update config)
import session from 'express-session';
import connectPg from 'connect-pg-simple';

const PgSession = connectPg(session);

app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'sessions',
    createTableIfMissing: true,  // Auto-create if needed
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));
```

---

### Step 3: Object Storage Migration (Replace Replit Object Storage)

**Current Setup:** Google Cloud Storage via Replit sidecar (`127.0.0.1:1106`)

**Option A: AWS S3**

Replace `server/objectStorage.ts`:
```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export class ObjectStorageService {
  private bucket = process.env.S3_BUCKET_NAME;

  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    const key = `uploads/${objectId}`;
    
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    
    return getSignedUrl(s3, command, { expiresIn: 900 });
  }

  async downloadObject(key: string, res: Response) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    
    const response = await s3.send(command);
    res.set('Content-Type', response.ContentType);
    response.Body.pipe(res);
  }
}
```

**Option B: Cloudflare R2 (S3-compatible)**

```typescript
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,  // https://<account>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
```

**Option C: MinIO (Self-hosted S3-compatible)**

MinIO is a self-hosted object storage solution that's fully S3-compatible.

```bash
# Docker Compose for MinIO
# Add to your docker-compose.yml:
```

```yaml
  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"  # Console
    volumes:
      - minio_data:/data
    environment:
      - MINIO_ROOT_USER=admin
      - MINIO_ROOT_PASSWORD=your_secure_password
    command: server /data --console-address ":9001"
```

```typescript
// server/objectStorage.ts - MinIO implementation
import { S3Client, PutObjectCommand, GetObjectCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const s3 = new S3Client({
  region: "us-east-1",
  endpoint: process.env.MINIO_ENDPOINT,  // http://minio:9000
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,  // Required for MinIO
});

export class ObjectStorageService {
  private bucket = process.env.MINIO_BUCKET_NAME || 'poddna-uploads';

  async ensureBucket() {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (err: any) {
      if (err.name !== 'BucketAlreadyOwnedByYou') throw err;
    }
  }

  async getObjectEntityUploadURL(): Promise<{ url: string; objectPath: string }> {
    const objectId = randomUUID();
    const key = `uploads/${objectId}`;
    
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    
    const url = await getSignedUrl(s3, command, { expiresIn: 900 });
    return { url, objectPath: key };
  }

  async downloadObject(key: string, res: Response) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    
    const response = await s3.send(command);
    res.set('Content-Type', response.ContentType || 'application/octet-stream');
    (response.Body as any).pipe(res);
  }
}
```

Environment variables:
```bash
MINIO_ENDPOINT=http://minio:9000  # Or your MinIO host
MINIO_ACCESS_KEY=admin
MINIO_SECRET_KEY=your_secure_password
MINIO_BUCKET_NAME=poddna-uploads
```

---

### Step 4: External Services Onboarding

All external APIs used by PODDNA work identically outside Replit. Use this onboarding table:

| Service | Purpose | Sign-up URL | Console/Dashboard | Required Credentials |
|---------|---------|-------------|-------------------|---------------------|
| **Google Gemini AI** | Audio transcription, AI annotations | https://aistudio.google.com/ | https://aistudio.google.com/app/apikey | `GEMINI_API_KEY` |
| **AudD** | Music detection/recognition | https://audd.io/register | https://dashboard.audd.io/ | `AUDD_API_TOKEN` |
| **Podcast Index** | Podcast discovery & import | https://api.podcastindex.org/signup | https://api.podcastindex.org/developer | `PODCAST_INDEX_API_KEY`, `PODCAST_INDEX_API_SECRET` |
| **YouTube Transcript** | YouTube caption import | https://www.youtube-transcript.io/ | https://www.youtube-transcript.io/dashboard | `YOUTUBE_TRANSCRIPT_API_TOKEN` |
| **Auth0** (if chosen) | Authentication | https://auth0.com/signup | https://manage.auth0.com/ | `AUTH0_CLIENT_ID`, `AUTH0_ISSUER_URL` |
| **Clerk** (if chosen) | Authentication | https://clerk.com/sign-up | https://dashboard.clerk.com/ | `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` |
| **Google Cloud** (OAuth) | Authentication | https://console.cloud.google.com/ | APIs & Services > Credentials | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| **AWS S3** (if chosen) | Object storage | https://aws.amazon.com/ | https://console.aws.amazon.com/s3 | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| **Cloudflare R2** (if chosen) | Object storage | https://dash.cloudflare.com/ | R2 > Overview | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` |

**Gemini AI Setup:**

1. Go to https://aistudio.google.com/app/apikey
2. Click "Create API key" (or use existing)
3. Copy the key and set in environment:

```bash
GEMINI_API_KEY=AIza...your-key
```

Update code references (rename from Replit integration):
```typescript
// server/transcription.ts and server/annotation-generator.ts
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,  // Was: AI_INTEGRATIONS_GEMINI_API_KEY
});
```

**AudD Music Detection Setup:**

1. Register at https://audd.io/register
2. Go to https://dashboard.audd.io/
3. Copy API token from dashboard
4. Note: Free tier = 300 requests/day

```bash
AUDD_API_TOKEN=your-token
```

**Podcast Index Setup:**

1. Go to https://api.podcastindex.org/signup
2. Fill out form (free API access)
3. Credentials emailed within 24 hours
4. Or use developer portal: https://api.podcastindex.org/developer

```bash
PODCAST_INDEX_API_KEY=your-key
PODCAST_INDEX_API_SECRET=your-secret
```

**YouTube Transcript API Setup:**

1. Go to https://www.youtube-transcript.io/
2. Sign up and subscribe
3. Get token from dashboard

```bash
YOUTUBE_TRANSCRIPT_API_TOKEN=your-token
```

---

### Step 5: System Dependencies

Install required binaries for media processing:

**Ubuntu/Debian:**
```bash
apt-get update
apt-get install -y ffmpeg python3 python3-pip
pip3 install yt-dlp
```

**Alpine Linux (Docker):**
```dockerfile
FROM node:20-alpine

RUN apk add --no-cache ffmpeg python3 py3-pip
RUN pip3 install yt-dlp

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

EXPOSE 5000
CMD ["npm", "start"]
```

**macOS (local development):**
```bash
brew install ffmpeg
pip3 install yt-dlp
```

---

### Step 6: Deployment Options

**Docker Compose (Recommended):**

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://user:pass@db:5432/poddna
      - SESSION_SECRET=${SESSION_SECRET}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - AUDD_API_TOKEN=${AUDD_API_TOKEN}
      - AWS_REGION=${AWS_REGION}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - S3_BUCKET_NAME=${S3_BUCKET_NAME}
    depends_on:
      - db

  db:
    image: postgres:15
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=poddna
      - POSTGRES_PASSWORD=secure_password
      - POSTGRES_DB=poddna

volumes:
  postgres_data:
```

**Railway:**
1. Connect GitHub repository
2. Add PostgreSQL addon
3. Set environment variables
4. Deploy

**Render:**
1. Create Web Service from repo
2. Add PostgreSQL database
3. Configure environment variables
4. Set build command: `npm install && npm run build`
5. Set start command: `npm start`

**AWS (EC2 + RDS):**
1. Create RDS PostgreSQL instance
2. Launch EC2 instance with Docker
3. Configure security groups for ports 5000 and 5432
4. Use ALB for SSL termination

---

### Step 7: Environment Variables Mapping

| Replit Variable | Self-Hosted Variable | Notes |
|-----------------|---------------------|-------|
| `DATABASE_URL` | `DATABASE_URL` | Update connection string |
| `SESSION_SECRET` | `SESSION_SECRET` | Keep existing |
| `REPL_ID` | N/A | Remove (used for Replit Auth) |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | `GEMINI_API_KEY` | Rename |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | `GEMINI_BASE_URL` | Optional |
| `AUDD_API_TOKEN` | `AUDD_API_TOKEN` | Keep existing |
| `PODCAST_INDEX_API_KEY` | `PODCAST_INDEX_API_KEY` | Keep existing |
| `PODCAST_INDEX_API_SECRET` | `PODCAST_INDEX_API_SECRET` | Keep existing |
| `YOUTUBE_TRANSCRIPT_API_TOKEN` | `YOUTUBE_TRANSCRIPT_API_TOKEN` | Keep existing |
| `PRIVATE_OBJECT_DIR` | N/A | Replace with S3 config |
| `PUBLIC_OBJECT_SEARCH_PATHS` | N/A | Replace with S3 config |

**New Variables Required:**
```bash
# Auth (choose one provider)
AUTH0_CLIENT_ID=
AUTH0_ISSUER_URL=
BASE_URL=https://your-domain.com

# Object Storage (choose one)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=poddna-uploads

# Or for R2
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
```

---

### Post-Migration Checklist

**Database:**
- [ ] Database connection verified (`npm run db:push`)
- [ ] All tables exist with correct schema
- [ ] Data imported successfully
- [ ] Indexes created

**Authentication:**
- [ ] Login flow working
- [ ] Logout flow working
- [ ] Session persistence working
- [ ] User sync to database working

**Object Storage:**
- [ ] Presigned URL generation working
- [ ] File uploads successful
- [ ] Files accessible via `/objects/*` route
- [ ] ACL/permissions configured

**Media Processing:**
- [ ] ffmpeg installed and accessible
- [ ] yt-dlp installed and accessible
- [ ] Transcription pipeline working (test with audio URL)
- [ ] Music detection working (test with episode)

**External APIs:**
- [ ] Gemini AI responding
- [ ] AudD API responding
- [ ] Podcast Index API responding
- [ ] YouTube Transcript API responding

**Application:**
- [ ] Frontend builds successfully
- [ ] All API endpoints responding
- [ ] Admin dashboard accessible
- [ ] Widget page working
- [ ] SSL/TLS configured
- [ ] Health checks passing

---

## Appendix: File Reference

### Key Server Files

| File | Purpose |
|------|---------|
| `server/app.ts` | Express app setup, middleware |
| `server/routes.ts` | All API endpoints |
| `server/storage.ts` | Database interface (IStorage) |
| `server/db.ts` | Drizzle ORM setup |
| `server/replitAuth.ts` | OIDC authentication |
| `server/transcription.ts` | Gemini transcription |
| `server/music-detector.ts` | AudD music detection |
| `server/annotation-generator.ts` | AI annotation generation |
| `server/objectStorage.ts` | File uploads |
| `shared/schema.ts` | Database models |

### Key Frontend Files

| File | Purpose |
|------|---------|
| `client/src/App.tsx` | Root component, routing |
| `client/src/lib/queryClient.ts` | TanStack Query setup |
| `client/src/hooks/useAuth.ts` | Auth state management |
| `client/src/pages/episode.tsx` | Main annotation interface |
| `client/src/components/transcript-viewer.tsx` | Transcript display |

---

*This document serves as the authoritative technical reference for the PODDNA platform. For questions or clarifications, refer to the source code in the referenced files.*
