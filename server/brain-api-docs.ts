import type { Express } from "express";

export function registerBrainApiDocs(app: Express): void {
  app.get("/api/brain/docs", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(generateDocsHtml());
  });
}

function generateDocsHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PODDNA Brain API Documentation</title>
<style>
  :root {
    --bg: #0f1117;
    --surface: #1a1d27;
    --surface2: #242834;
    --border: #2e3346;
    --text: #e4e6ef;
    --text2: #9ca0b5;
    --text3: #6b7089;
    --brand: #f5c542;
    --brand-dim: #c9a235;
    --green: #34d399;
    --blue: #60a5fa;
    --red: #f87171;
    --orange: #fb923c;
    --purple: #a78bfa;
    --code-bg: #151822;
    --radius: 8px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
  }
  a { color: var(--brand); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .layout {
    display: flex;
    min-height: 100vh;
  }

  /* Sidebar */
  .sidebar {
    width: 280px;
    background: var(--surface);
    border-right: 1px solid var(--border);
    position: fixed;
    top: 0; left: 0; bottom: 0;
    overflow-y: auto;
    padding: 24px 0;
    z-index: 10;
  }
  .sidebar-logo {
    padding: 0 20px 20px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 16px;
  }
  .sidebar-logo h1 {
    font-size: 20px;
    font-weight: 700;
    color: var(--brand);
  }
  .sidebar-logo p {
    font-size: 12px;
    color: var(--text3);
    margin-top: 4px;
  }
  .nav-section {
    padding: 8px 20px 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text3);
  }
  .nav-link {
    display: block;
    padding: 6px 20px;
    font-size: 14px;
    color: var(--text2);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .nav-link:hover {
    background: var(--surface2);
    color: var(--text);
    text-decoration: none;
  }
  .nav-link.active {
    color: var(--brand);
    background: rgba(245, 197, 66, 0.08);
  }

  /* Main content */
  .main {
    margin-left: 280px;
    flex: 1;
    padding: 40px 60px 100px;
    max-width: 960px;
  }

  h2 {
    font-size: 28px;
    font-weight: 700;
    margin: 48px 0 12px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
    color: var(--text);
  }
  h2:first-of-type { border-top: none; margin-top: 0; }
  h3 {
    font-size: 20px;
    font-weight: 600;
    margin: 32px 0 8px;
    color: var(--text);
  }
  p, li {
    color: var(--text2);
    font-size: 15px;
    margin-bottom: 8px;
  }
  ul { padding-left: 20px; }

  /* Method badges */
  .method {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
    margin-right: 8px;
    font-family: 'SF Mono', SFMono-Regular, Consolas, monospace;
    vertical-align: middle;
  }
  .method-get { background: rgba(96, 165, 250, 0.15); color: var(--blue); }
  .method-post { background: rgba(52, 211, 153, 0.15); color: var(--green); }
  .method-patch { background: rgba(251, 146, 60, 0.15); color: var(--orange); }
  .method-delete { background: rgba(248, 113, 113, 0.15); color: var(--red); }

  .endpoint-path {
    font-family: 'SF Mono', SFMono-Regular, Consolas, monospace;
    font-size: 14px;
    color: var(--text);
    font-weight: 500;
  }

  /* Endpoint card */
  .endpoint {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin: 16px 0;
    overflow: hidden;
  }
  .endpoint-header {
    padding: 14px 18px;
    display: flex;
    align-items: center;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
  }
  .endpoint-header:hover {
    background: var(--surface2);
  }
  .endpoint-body {
    padding: 0 18px 18px;
    display: none;
  }
  .endpoint.open .endpoint-body {
    display: block;
  }
  .endpoint-chevron {
    margin-left: auto;
    color: var(--text3);
    font-size: 12px;
    transition: transform 0.2s;
  }
  .endpoint.open .endpoint-chevron {
    transform: rotate(90deg);
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 14px;
  }
  th {
    text-align: left;
    padding: 8px 12px;
    background: var(--surface2);
    color: var(--text2);
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  td {
    padding: 8px 12px;
    border-top: 1px solid var(--border);
    color: var(--text2);
    vertical-align: top;
  }
  td code {
    background: var(--code-bg);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 13px;
    color: var(--blue);
  }

  /* Code blocks */
  pre {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    overflow-x: auto;
    margin: 12px 0;
    font-size: 13px;
    line-height: 1.5;
  }
  code {
    font-family: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', monospace;
    color: var(--text);
  }

  .label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 16px 0 6px;
  }

  .info-box {
    background: rgba(245, 197, 66, 0.08);
    border: 1px solid rgba(245, 197, 66, 0.2);
    border-radius: var(--radius);
    padding: 14px 18px;
    margin: 16px 0;
    font-size: 14px;
    color: var(--text2);
  }
  .info-box strong { color: var(--brand); }

  .warning-box {
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.2);
    border-radius: var(--radius);
    padding: 14px 18px;
    margin: 16px 0;
    font-size: 14px;
    color: var(--text2);
  }
  .warning-box strong { color: var(--red); }

  /* Try it */
  .try-it {
    margin-top: 16px;
    background: var(--surface2);
    border-radius: var(--radius);
    padding: 16px;
  }
  .try-it label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text3);
    display: block;
    margin-bottom: 6px;
  }
  .try-it input, .try-it textarea {
    width: 100%;
    padding: 8px 12px;
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-family: 'SF Mono', SFMono-Regular, Consolas, monospace;
    font-size: 13px;
    margin-bottom: 10px;
    outline: none;
  }
  .try-it input:focus, .try-it textarea:focus {
    border-color: var(--brand-dim);
  }
  .try-it textarea { min-height: 60px; resize: vertical; }
  .try-btn {
    background: var(--brand);
    color: #000;
    border: none;
    padding: 8px 20px;
    border-radius: 4px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .try-btn:hover { opacity: 0.85; }
  .try-result {
    margin-top: 12px;
    display: none;
  }
  .try-result pre {
    max-height: 400px;
    overflow-y: auto;
  }

  .status-row {
    display: flex;
    gap: 16px;
    margin: 16px 0;
  }
  .status-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    flex: 1;
    text-align: center;
  }
  .status-item .val {
    font-size: 24px;
    font-weight: 700;
    color: var(--brand);
  }
  .status-item .lbl {
    font-size: 12px;
    color: var(--text3);
    margin-top: 4px;
  }

  .copy-btn {
    background: var(--surface2);
    border: 1px solid var(--border);
    color: var(--text2);
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    float: right;
    margin: -4px 0 0;
  }
  .copy-btn:hover { color: var(--text); border-color: var(--text3); }

  @media (max-width: 860px) {
    .sidebar { display: none; }
    .main { margin-left: 0; padding: 24px 20px; }
  }
</style>
</head>
<body>
<div class="layout">
<nav class="sidebar">
  <div class="sidebar-logo">
    <h1>PODDNA Brain API</h1>
    <p>Intelligence Layer v1</p>
  </div>

  <div class="nav-section">Getting Started</div>
  <a class="nav-link" href="#overview">Overview</a>
  <a class="nav-link" href="#authentication">Authentication</a>
  <a class="nav-link" href="#rate-limits">Rate Limits</a>
  <a class="nav-link" href="#errors">Error Handling</a>

  <div class="nav-section">Catalog</div>
  <a class="nav-link" href="#catalog-podcasts">List Podcasts</a>
  <a class="nav-link" href="#catalog-episodes">List Episodes</a>
  <a class="nav-link" href="#catalog-episode-status">Episode Status</a>

  <div class="nav-section">Creator Pipeline</div>
  <a class="nav-link" href="#validate-youtube">Validate YouTube</a>
  <a class="nav-link" href="#viral-moments">Viral Moments</a>
  <a class="nav-link" href="#processing-status">Processing Status</a>

  <div class="nav-section">Episodes</div>
  <a class="nav-link" href="#episode-detail">Episode Detail</a>
  <a class="nav-link" href="#episode-statements">Statements</a>
  <a class="nav-link" href="#episode-entities">Entities</a>
  <a class="nav-link" href="#episode-patterns">Patterns</a>
  <a class="nav-link" href="#episode-narrative">Narrative</a>
  <a class="nav-link" href="#episode-transcript">Transcript</a>

  <div class="nav-section">Intelligence</div>
  <a class="nav-link" href="#search">Semantic Search</a>
  <a class="nav-link" href="#speakers">Speakers</a>
  <a class="nav-link" href="#contradictions">Contradictions</a>
  <a class="nav-link" href="#topics">Topics</a>

  <div class="nav-section">Zoom Meetings</div>
  <a class="nav-link" href="#zoom-import-shared">Import Shared Link</a>
  <a class="nav-link" href="#zoom-meetings">List Meetings</a>
  <a class="nav-link" href="#zoom-meeting-detail">Meeting Detail</a>

  <div class="nav-section">Automation</div>
  <a class="nav-link" href="#ingestion">Ingestion</a>
  <a class="nav-link" href="#webhooks">Webhooks</a>

  <div class="nav-section">Admin</div>
  <a class="nav-link" href="#api-keys">API Key Management</a>
</nav>

<main class="main">

<!-- ===== OVERVIEW ===== -->
<h2 id="overview">Overview</h2>
<p>The PODDNA Brain API exposes a spoken-word intelligence layer as a reusable REST API. It powers transcript extraction, semantic analysis (entity detection, pattern recognition, claims tracking, speaker identification, contradiction detection), and automated content production.</p>
<p>Base URL for all endpoints:</p>
<pre><code>https://&lt;your-domain&gt;/api/brain/</code></pre>

<div class="status-row">
  <div class="status-item"><div class="val">30+</div><div class="lbl">Endpoints</div></div>
  <div class="status-item"><div class="val">REST</div><div class="lbl">Protocol</div></div>
  <div class="status-item"><div class="val">JSON</div><div class="lbl">Format</div></div>
</div>

<!-- ===== AUTHENTICATION ===== -->
<h2 id="authentication">Authentication</h2>
<p>All <code>/api/brain/*</code> endpoints require a valid API key sent via the <code>Authorization</code> header using the Bearer scheme.</p>
<pre><code>Authorization: Bearer pk_brain_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</code></pre>

<div class="info-box">
  <strong>Getting a key:</strong> API keys are created by administrators via the <a href="#api-keys">Admin API Key Management</a> endpoints. Keys are shown only once upon creation &mdash; store them securely.
</div>

<p>Keys are SHA-256 hashed before storage, so the raw key cannot be recovered. Each key has:</p>
<ul>
  <li><strong>Scopes</strong> &mdash; what operations the key can perform (default: <code>["read"]</code>)</li>
  <li><strong>Rate limit</strong> &mdash; requests per minute (default: 60)</li>
  <li><strong>Active flag</strong> &mdash; can be revoked at any time</li>
</ul>

<!-- ===== RATE LIMITS ===== -->
<h2 id="rate-limits">Rate Limits</h2>
<p>Each API key has a per-minute rate limit. The current state is returned via response headers:</p>
<table>
  <tr><th>Header</th><th>Description</th></tr>
  <tr><td><code>X-RateLimit-Limit</code></td><td>Maximum requests per minute for this key</td></tr>
  <tr><td><code>X-RateLimit-Remaining</code></td><td>Requests remaining in current window</td></tr>
  <tr><td><code>Retry-After</code></td><td>Seconds until rate limit resets (only on 429)</td></tr>
</table>
<p>When the limit is exceeded, the API returns HTTP <code>429 Too Many Requests</code> with a <code>Retry-After</code> header.</p>

<!-- ===== ERRORS ===== -->
<h2 id="errors">Error Handling</h2>
<p>All errors return JSON with an <code>error</code> field:</p>
<pre><code>{
  "error": "Description of what went wrong"
}</code></pre>
<table>
  <tr><th>Code</th><th>Meaning</th></tr>
  <tr><td><code>400</code></td><td>Bad request &mdash; missing or invalid parameters</td></tr>
  <tr><td><code>401</code></td><td>Unauthorized &mdash; missing or invalid API key</td></tr>
  <tr><td><code>403</code></td><td>Forbidden &mdash; key revoked or insufficient scope</td></tr>
  <tr><td><code>404</code></td><td>Resource not found</td></tr>
  <tr><td><code>429</code></td><td>Rate limit exceeded</td></tr>
  <tr><td><code>500</code></td><td>Internal server error</td></tr>
</table>

<!-- ===== CATALOG ===== -->
<h2 id="catalog-podcasts">List Podcasts</h2>
${endpointCard("GET", "/api/brain/catalog/podcasts", "Browse all processed podcasts with episode and speaker counts.", "", `[
  {
    "id": "uuid",
    "title": "My First Million",
    "image_url": "https://...",
    "episode_count": "24",
    "speaker_count": "5"
  }
]`, [], true)}

<h2 id="catalog-episodes">List Episodes</h2>
${endpointCard("GET", "/api/brain/catalog/episodes", "Browse analyzed episodes with intelligence metrics.", "", `[
  {
    "id": "uuid",
    "title": "How I Built a $10M Business",
    "published_at": "2025-01-15T00:00:00Z",
    "podcast_title": "My First Million",
    "podcast_id": "uuid",
    "statement_count": "150",
    "classification_count": "145",
    "relation_count": "12",
    "speaker_count": "3",
    "has_integrity_score": true
  }
]`, [
  { name: "limit", type: "integer", desc: "Max results (default: 50)" },
  { name: "offset", type: "integer", desc: "Pagination offset (default: 0)" },
  { name: "podcastId", type: "string", desc: "Filter by podcast UUID" },
  { name: "q", type: "string", desc: "Search episode titles" }
], true)}

<h2 id="catalog-episode-status">Episode Processing Status</h2>
${endpointCard("GET", "/api/brain/catalog/episodes/:episodeId/status", "Check which analysis steps have completed for an episode.", "", `{
  "episodeId": "uuid",
  "episodeTitle": "How I Built a $10M Business",
  "podcastTitle": "My First Million",
  "processing": {
    "transcribed": true,
    "statementsExtracted": true,
    "classified": true,
    "entitiesLinked": true,
    "topicsAssigned": true,
    "embedded": true,
    "relationsDiscovered": true,
    "speakersResolved": false,
    "contradictionsDetected": false,
    "integrityScored": false
  }
}`, [], true)}

<!-- ===== CREATOR PIPELINE ===== -->
<h2 id="validate-youtube">Validate YouTube Video</h2>
<p>Pre-check a YouTube video before submitting it for processing. Returns video metadata, caption availability, duration checks, and whether it has already been processed.</p>

${endpointCard("POST", "/api/brain/validate-youtube", "Validate a YouTube video URL before ingestion. Checks: accessibility, age-restriction, live status, duration limit (3 hours), caption availability, and duplicate detection.", `{
  "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}`, `{
  "valid": true,
  "youtubeVideoId": "dQw4w9WgXcQ",
  "title": "Rick Astley - Never Gonna Give You Up",
  "durationSeconds": 212,
  "thumbnail": "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
  "hasCaptions": true,
  "estimatedProcessingMinutes": 2,
  "captionNote": null,
  "alreadyProcessed": false,
  "existingEpisodeId": null
}`, [
  { name: "youtubeUrl", type: "string", desc: "Full YouTube URL (required). Supports youtube.com/watch, youtu.be, and /shorts/ formats." }
], false)}

<div class="info-box">
  <strong>Rejection reasons:</strong> Private videos, age-restricted content, live streams, videos over 3 hours, and unavailable/removed videos are all rejected with a clear error message. If <code>alreadyProcessed</code> is true, you can skip ingestion and fetch results directly using the returned <code>existingEpisodeId</code>.
</div>

<h2 id="viral-moments">Viral Moments</h2>
<h3>Get Viral Moments</h3>
${endpointCard("GET", "/api/brain/episodes/:episodeId/viral-moments", "Get all AI-detected viral moments for an episode. Each moment includes a virality score, suggested TikTok-style title, shareability factors, and platform recommendations.", "", `{
  "episodeId": "uuid",
  "episodeTitle": "How I Built a $10M Business",
  "count": 8,
  "moments": [
    {
      "id": "uuid",
      "momentKind": "viral",
      "startTime": 245,
      "endTime": 278,
      "durationSeconds": 33,
      "text": "I literally built the entire company from a $500 laptop...",
      "viralityScore": 92,
      "hookReason": "Rags-to-riches origin story with specific dollar amount creates aspirational content",
      "suggestedTitle": "He Built a $10M Company From a $500 Laptop",
      "pullQuote": "Built the entire company from a $500 laptop",
      "hookType": "underdog_story",
      "shareabilityFactors": ["aspirational", "quantified", "underdog"],
      "contentType": "story",
      "topics": ["entrepreneurship", "bootstrapping"],
      "entities": ["Stripe"],
      "platform": "tiktok",
      "displayOrder": 1
    }
  ]
}`, [], true)}

<h3>Detect Viral Moments (Trigger Job)</h3>
${endpointCard("POST", "/api/brain/episodes/:episodeId/detect-viral-moments", "Queue an AI-powered viral moment detection job using Claude's agentic 3-pass approach. The episode must have a transcript. Returns a job ID for status tracking.", "", `{
  "jobId": "uuid",
  "status": "queued",
  "episodeId": "uuid"
}`, [], false)}

<div class="info-box">
  <strong>Detection approach:</strong> Uses Claude Sonnet 4.5 with a 3-pass agentic analysis: (1) initial scan for high-potential segments, (2) deep scoring of candidates, (3) final selection with virality scores 0-100. Typically finds 5-12 moments per episode. Requires 5-15 minutes for long episodes.
</div>

<h2 id="processing-status">Processing Status</h2>
${endpointCard("GET", "/api/brain/episodes/:episodeId/processing-status", "Detailed step-by-step processing status for an episode. Shows transcription and viral moment detection progress, providers used, error details, and overall status.", "", `{
  "episodeId": "uuid",
  "episodeTitle": "How I Built a $10M Business",
  "podcastTitle": "My First Million",
  "overallStatus": "processing",
  "steps": {
    "transcription": {
      "status": "ready",
      "provider": "youtube",
      "segmentCount": 342
    },
    "viralMoments": {
      "status": "processing",
      "count": 0
    }
  },
  "errors": []
}`, [], true)}

<div class="info-box">
  <strong>Status values:</strong> <code>not_started</code> &rarr; <code>pending</code> &rarr; <code>processing</code> &rarr; <code>ready</code> (or <code>failed</code>). The <code>overallStatus</code> is <code>complete</code> when all requested analysis steps are ready, <code>failed</code> if any step failed, or <code>processing</code> while work is in progress.
</div>

<!-- ===== EPISODES ===== -->
<h2 id="episode-detail">Episode Detail</h2>
${endpointCard("GET", "/api/brain/episodes/:episodeId", "Full aggregated intelligence payload for an episode. Use the <code>include</code> parameter to select which sections to load. Without it, all sections except transcript are returned.", "", `{
  "id": "uuid",
  "title": "How I Built a $10M Business",
  "publishedAt": "2025-01-15T00:00:00Z",
  "podcastId": "uuid",
  "podcastTitle": "My First Million",
  "duration": 3600,
  "statements": [...],
  "entities": [...],
  "speakers": [...],
  "contradictions": [...],
  "patterns": [...],
  "narrative": { "chapters": [...], "segments": [...] }
}`, [
  { name: "include", type: "string", desc: "Comma-separated: statements, entities, speakers, contradictions, patterns, narrative, viral_moments, transcript. Transcript excluded by default (large payload)." }
], true)}

<h2 id="episode-statements">Episode Statements</h2>
${endpointCard("GET", "/api/brain/episodes/:episodeId/statements", "All extracted statements for an episode, optionally with classifications (claim flags, sentiment, certainty).", "", `[
  {
    "id": "uuid",
    "text": "Revenue grew 40% year over year",
    "speaker": "Speaker 1",
    "start_time": 120,
    "end_time": 125,
    "claim_flag": true,
    "certainty": "high",
    "polarity": "positive",
    "sentiment": "confident"
  }
]`, [
  { name: "include_classifications", type: "boolean", desc: "Set to 'false' to omit classifications (default: true)" }
], true)}

<h2 id="episode-entities">Episode Entities</h2>
${endpointCard("GET", "/api/brain/episodes/:episodeId/entities", "Canonical entities mentioned in an episode (people, companies, products, etc.).", "", `[
  {
    "id": "uuid",
    "name": "Stripe",
    "type": "company",
    "external_refs": { "wikipedia": "..." },
    "mention_id": "uuid",
    "link_confidence": 0.95
  }
]`, [], true)}

<h2 id="episode-patterns">Episode Patterns</h2>
${endpointCard("GET", "/api/brain/episodes/:episodeId/patterns", "Discovered relations between statements &mdash; supports, contradicts, reiterates, etc.", "", `[
  {
    "id": "uuid",
    "statementAId": "uuid",
    "statementBId": "uuid",
    "relation": "supports",
    "confidence": 0.87,
    "episodeId": "uuid"
  }
]`, [], true)}

<h2 id="episode-narrative">Episode Narrative</h2>
${endpointCard("GET", "/api/brain/episodes/:episodeId/narrative", "AI-generated chapter structure and semantic segments for an episode.", "", `{
  "chapters": [
    {
      "id": "uuid",
      "title": "Opening - Background Story",
      "summary": "Host introduces the guest...",
      "start_time": 0,
      "end_time": 480,
      "display_order": 1,
      "confidence": 0.92
    }
  ],
  "segments": [
    {
      "id": "uuid",
      "topic_category": "business_strategy",
      "sub_topic": "growth_metrics",
      "intent": "inform",
      "start_time": 120,
      "end_time": 300,
      "importance_score": 0.85,
      "novelty_score": 0.7,
      "clipability_score": 0.6
    }
  ]
}`, [], true)}

<h2 id="episode-transcript">Episode Transcript</h2>
${endpointCard("GET", "/api/brain/episodes/:episodeId/transcript", "Raw transcript segments with speaker labels and timestamps.", "", `[
  {
    "id": "uuid",
    "text": "So tell me about your journey...",
    "start_time": 0.5,
    "end_time": 3.2,
    "speaker": "Speaker 1",
    "type": "speech"
  }
]`, [], true)}

<!-- ===== INTELLIGENCE ===== -->
<h2 id="search">Semantic Search</h2>
${endpointCard("GET", "/api/brain/search", "Natural language search across all analyzed statements using vector embeddings and cosine similarity.", "", `[
  {
    "statementId": "uuid",
    "episodeId": "uuid",
    "episodeTitle": "Every Business I Tried",
    "podcastTitle": "My First Million",
    "startTime": 120,
    "text": "Building the restaurant cost half a million dollars.",
    "score": 0.68,
    "similarity": 0.68,
    "topics": [],
    "entities": [],
    "claimFlag": false
  }
]`, [
  { name: "q", type: "string", desc: "Search query (required)" },
  { name: "limit", type: "integer", desc: "Max results (default: 20)" },
  { name: "episodeId", type: "string", desc: "Restrict search to one episode" },
  { name: "claimOnly", type: "boolean", desc: "Only return flagged claims" }
], true)}

<h2 id="speakers">Speakers</h2>
<h3>List All Speakers</h3>
${endpointCard("GET", "/api/brain/speakers", "Browse the canonical speaker identity graph.", "", `[
  {
    "id": "uuid",
    "name": "Sam Parr",
    "aliases": ["sam", "Sam"],
    "podcastCount": 1,
    "episodeCount": 12
  }
]`, [
  { name: "limit", type: "integer", desc: "Max results (default: 100)" },
  { name: "offset", type: "integer", desc: "Pagination offset (default: 0)" },
  { name: "q", type: "string", desc: "Search speakers by name" }
], true)}

<h3>Get Speaker</h3>
${endpointCard("GET", "/api/brain/speakers/:id", "Get a single speaker with their cross-episode appearances.", "", `{
  "id": "uuid",
  "name": "Sam Parr",
  "aliases": ["sam"],
  "appearances": [
    {
      "episodeId": "uuid",
      "episodeTitle": "How I Built...",
      "speakerLabel": "Speaker 1",
      "podcastId": "uuid"
    }
  ]
}`, [], true)}

<h3>Episode Speakers</h3>
${endpointCard("GET", "/api/brain/episodes/:episodeId/speakers", "Get all resolved speakers for a specific episode.", "", `[
  { "id": "uuid", "name": "Sam Parr", "speakerLabel": "Speaker 1" }
]`, [], true)}

<h3>Resolve Speakers (Trigger Job)</h3>
${endpointCard("POST", "/api/brain/episodes/:episodeId/resolve-speakers", "Queue an AI-powered speaker resolution job for an episode. Uses Gemini to match speaker labels to canonical identities.", "", `{
  "jobId": "uuid",
  "status": "queued"
}`, [], false)}

<h2 id="contradictions">Contradictions</h2>
<h3>Get Contradictions</h3>
${endpointCard("GET", "/api/brain/episodes/:episodeId/contradictions", "Get all detected contradictions within an episode.", "", `[
  {
    "id": "uuid",
    "statement_a_id": "uuid",
    "statement_b_id": "uuid",
    "relation": "contradicts",
    "confidence": 0.89,
    "statement_a_text": "We never raised any money",
    "statement_a_start_time": 120,
    "statement_b_text": "Our seed round was $2M",
    "statement_b_start_time": 845
  }
]`, [], true)}

<h3>Detect Contradictions (Trigger Job)</h3>
${endpointCard("POST", "/api/brain/episodes/:episodeId/detect-contradictions", "Queue an AI-powered contradiction detection job using Claude.", "", `{
  "jobId": "uuid",
  "status": "queued"
}`, [], false)}

<h2 id="topics">Topics</h2>
<h3>List Topics</h3>
${endpointCard("GET", "/api/brain/topics", "Browse the hierarchical topic taxonomy with statement counts.", "", `[
  {
    "id": "uuid",
    "name": "Business Strategy",
    "slug": "business-strategy",
    "statement_count": "42"
  }
]`, [], true)}

<h3>Topic Statements</h3>
${endpointCard("GET", "/api/brain/topics/:topicId/statements", "Get statements associated with a specific topic.", "", `[
  {
    "id": "uuid",
    "text": "We focused on product-market fit",
    "start_time": 320,
    "episode_id": "uuid",
    "episode_title": "How I Built...",
    "relevance": 0.95
  }
]`, [
  { name: "limit", type: "integer", desc: "Max results (default: 50)" }
], true)}

<!-- ===== AUTOMATION ===== -->
<h2 id="ingestion">On-Demand Ingestion</h2>

<h3>Upload Audio File</h3>
${endpointCard("POST", "/api/brain/upload", "Upload an audio file directly via multipart form data. Returns a <code>storageUrl</code> that you can then pass to <code>/api/brain/ingest</code> with type <code>audio_file</code>. Max file size: 500 MB. Accepted formats: mp3, wav, ogg, flac, aac, m4a, webm, wma, amr.", `// multipart/form-data
// Field: file (binary audio file)

curl -X POST https://poddna.io/api/brain/upload \\
  -H "Authorization: Bearer pk_brain_..." \\
  -F "file=@/path/to/episode.mp3"`, `{
  "storageUrl": "https://storage.googleapis.com/bucket/audio-uploads/uuid.mp3",
  "objectPath": "audio-uploads/uuid.mp3",
  "size": 15728640,
  "mimeType": "audio/mpeg",
  "originalName": "episode.mp3"
}`, [
  { name: "file", type: "binary", desc: "Audio file (multipart form field, required). Max 500 MB." }
], false)}

<div class="info-box">
  <strong>Two-step upload flow:</strong> (1) Upload the file to <code>/api/brain/upload</code> to get a <code>storageUrl</code>, then (2) pass that URL to <code>/api/brain/ingest</code> with <code>"type": "audio_file"</code>. Alternatively, if your audio is already hosted publicly, skip step 1 and pass the URL directly.
</div>

<h3>Submit Content</h3>
${endpointCard("POST", "/api/brain/ingest", "Submit YouTube URLs, RSS feeds, or audio files for processing. The system automatically creates an episode, transcribes the content, and chains any requested analysis. Use <code>analysisTypes</code> to request specific intelligence pipelines.", `// YouTube URL
{
  "type": "youtube_url",
  "sourceUrl": "https://youtube.com/watch?v=VIDEO_ID",
  "analysisTypes": ["viral_moments"],
  "callbackUrl": "https://your-app.com/webhook"
}

// Audio file (after uploading via /api/brain/upload)
{
  "type": "audio_file",
  "sourceUrl": "https://storage.googleapis.com/bucket/audio-uploads/uuid.mp3",
  "analysisTypes": ["viral_moments"],
  "metadata": { "title": "My Episode", "durationSeconds": 3600 }
}

// Audio file (hosted externally)
{
  "type": "audio_file",
  "sourceUrl": "https://example.com/audio/episode.mp3",
  "analysisTypes": ["viral_moments"]
}`, `{
  "id": "uuid",
  "status": "processing",
  "episodeId": "uuid"
}`, [
  { name: "type", type: "string", desc: "One of: rss_feed, youtube_url, audio_file (required)" },
  { name: "sourceUrl", type: "string", desc: "URL to ingest — for audio_file, use the storageUrl from /api/brain/upload or any publicly accessible audio URL (required)" },
  { name: "priority", type: "string", desc: "normal or high (default: normal)" },
  { name: "analysisTypes", type: "string[]", desc: "Analysis pipelines to run after transcription. Options: viral_moments, narrative, entities, speakers, contradictions" },
  { name: "callbackUrl", type: "string", desc: "URL to notify when complete" },
  { name: "metadata", type: "object", desc: "Arbitrary metadata. For audio_file: title, durationSeconds, originalName are used if provided" }
], false)}

<div class="info-box">
  <strong>YouTube pipeline:</strong> When type is <code>youtube_url</code>, the system: (1) creates an episode and source record, (2) queues transcript extraction (YouTube captions &rarr; Whisper &rarr; AssemblyAI fallback), (3) automatically chains requested <code>analysisTypes</code> after transcription completes. The <code>episodeId</code> is returned immediately so you can poll processing status.
</div>

<div class="info-box">
  <strong>Audio file pipeline:</strong> When type is <code>audio_file</code>, the system: (1) creates an episode and source record, (2) sends the audio to AssemblyAI for transcription (with speaker diarization, chapters, entity detection, topics, and key phrases), (3) automatically chains requested <code>analysisTypes</code> after transcription completes. Poll status via <code>GET /api/brain/ingest/:id</code>.
</div>

<h3>Get Ingestion Status</h3>
${endpointCard("GET", "/api/brain/ingest/:id", "Check the status of a specific ingestion request. For YouTube URLs, includes real-time progress on transcript and analysis steps.", "", `{
  "id": "uuid",
  "type": "youtube_url",
  "sourceUrl": "https://youtube.com/watch?v=VIDEO_ID",
  "status": "processing",
  "episodeId": "uuid",
  "priority": "high",
  "processingSteps": [
    { "step": "transcript", "status": "complete", "completedAt": "..." },
    { "step": "viral_moments", "status": "processing" }
  ],
  "progress": {
    "transcriptReady": true,
    "transcriptSegments": 342,
    "viralMomentsReady": false,
    "viralMomentsCount": 0
  },
  "createdAt": "2025-01-15T00:00:00Z"
}`, [], true)}

<h3>List Ingestion Requests</h3>
${endpointCard("GET", "/api/brain/ingest", "List all ingestion requests, optionally filtered by status.", "", `[...]`, [
  { name: "status", type: "string", desc: "Filter by status (pending, processing, completed, failed)" },
  { name: "limit", type: "integer", desc: "Max results (default: 50)" }
], true)}

<h2 id="webhooks">Webhooks</h2>
<p>Receive HMAC-SHA256 signed event notifications when intelligence jobs complete. Events are delivered via HTTP POST to your registered URL. Webhooks auto-disable after 10 consecutive delivery failures.</p>

<div class="info-box">
  <strong>Available events:</strong> episode.analyzed, episode.transcribed, episode.ingested, entities.extracted, patterns.detected, contradictions.detected, speakers.resolved, topics.updated
</div>

<h3>List Webhooks</h3>
${endpointCard("GET", "/api/brain/webhooks", "List all registered webhooks.", "", `[
  {
    "id": "uuid",
    "url": "https://your-app.com/webhook",
    "events": ["episode.analyzed", "entities.extracted"],
    "isActive": true,
    "description": "Main integration"
  }
]`, [], true)}

<h3>Create Webhook</h3>
${endpointCard("POST", "/api/brain/webhooks", "Register a new webhook endpoint.", `{
  "url": "https://your-app.com/webhook",
  "secret": "your-webhook-signing-secret",
  "events": ["episode.analyzed", "entities.extracted"],
  "description": "My app integration"
}`, `{
  "id": "uuid",
  "url": "https://your-app.com/webhook",
  "events": ["episode.analyzed", "entities.extracted"],
  "isActive": true
}`, [
  { name: "url", type: "string", desc: "Delivery URL (required)" },
  { name: "secret", type: "string", desc: "HMAC-SHA256 signing secret (required)" },
  { name: "events", type: "string[]", desc: "Event types to subscribe to (required)" },
  { name: "description", type: "string", desc: "Human-readable description" }
], false)}

<h3>Update Webhook</h3>
${endpointCard("PATCH", "/api/brain/webhooks/:id", "Update an existing webhook.", `{
  "events": ["episode.analyzed"],
  "isActive": false
}`, `{ ... }`, [], false)}

<h3>Delete Webhook</h3>
${endpointCard("DELETE", "/api/brain/webhooks/:id", "Delete a webhook.", "", `{ "success": true }`, [], false)}

<h3>Test Webhook</h3>
${endpointCard("POST", "/api/brain/webhooks/:id/test", "Send a test delivery to a webhook endpoint.", "", `{ "success": true }`, [], false)}

<!-- ===== TRANSCRIPT SUBMISSION ===== -->
<h2 id="ingest-transcript">Submit Pre-Made Transcript</h2>
<p>Submit a pre-made transcript directly — skip the transcription step entirely. The Brain API creates an episode, stores all segments immediately, marks the transcript as ready, and optionally queues analysis jobs (claims, viral moments, statements). This is the fastest way to get content into the intelligence layer when you've already transcribed the audio yourself (e.g., via Gemini Flash, Whisper, etc.).</p>

${endpointCard("POST", "/api/brain/ingest/transcript", "Submit a pre-made transcript with segments. Episode is ready immediately — no transcription wait.", `{
  "title": "Lecture 12 - Cell Biology",
  "sourceUrl": "https://example.com/audio/lecture12.webm",
  "segments": [
    { "startMs": 0, "endMs": 4500, "text": "Welcome to today's lecture on cell biology.", "speaker": "Professor Smith" },
    { "startMs": 4500, "endMs": 12000, "text": "We'll be covering mitochondrial function and ATP synthesis.", "speaker": "Professor Smith" },
    { "startMs": 12000, "endMs": 18000, "text": "Can you remind us what we covered last week?", "speaker": "Student" }
  ],
  "metadata": {
    "platform": "crambo",
    "type": "audio",
    "recordedAt": "2026-03-10T14:00:00Z",
    "courseId": "BIO-201",
    "courseName": "Cell Biology"
  },
  "analysisTypes": ["claims"]
}`, `{
  "id": "ing-request-uuid",
  "episodeId": "episode-uuid",
  "status": "complete",
  "segmentCount": 3,
  "queuedAnalysis": ["claims"]
}`, [
  { name: "title", desc: "Episode title (falls back to metadata.title, then 'Untitled Transcript')", optional: true },
  { name: "sourceUrl", desc: "Optional URL to the original audio/video file", optional: true },
  { name: "segments", desc: "Array of transcript segments. Each must have: startMs (number), endMs (number), text (string). Optional: speaker (string), type (string, default 'dialogue'). Max 10,000 segments." },
  { name: "metadata", desc: "Optional metadata object. Supports: platform, type ('audio'/'video'), recordedAt (ISO date), plus any custom fields", optional: true },
  { name: "analysisTypes", desc: "Optional array of analysis jobs to queue after import. Valid: 'viral_moments', 'claims', 'statements'", optional: true },
], false)}

<!-- ===== CROSS-EPISODE INTELLIGENCE ===== -->
<h2 id="cross-episode">Cross-Episode Intelligence</h2>
<p>Synthesize insights across multiple episodes using AI. Send a list of episode IDs and a natural language query — the engine pulls transcript segments, claims, and chapter data from all specified episodes, then generates a structured cross-episode analysis. Works for any use case: sales call pattern analysis, lecture theme extraction, podcast series summaries, etc.</p>

${endpointCard("POST", "/api/brain/episodes/synthesize", "AI-powered cross-episode synthesis. Analyzes up to 50 episodes and returns themes, patterns, per-episode summaries, and a narrative that answers your query.", `{
  "episodeIds": ["ep-id-1", "ep-id-2", "ep-id-3"],
  "query": "What are the recurring themes and how do they evolve across these episodes?",
  "outputFormat": "structured"  // or "narrative" for longer prose
}`, `{
  "synthesis": {
    "themes": [
      {
        "theme": "Pricing Transparency",
        "description": "Prospects consistently ask about pricing structure...",
        "episodeEvidence": [
          { "episodeId": "ep-id-1", "episodeTitle": "Demo Call - Acme", "evidence": "Prospect asked about per-user pricing..." }
        ],
        "frequency": 3
      }
    ],
    "patterns": [
      {
        "pattern": "Demo-First Strategy",
        "description": "The seller consistently demonstrates the product before addressing pricing...",
        "episodeIds": ["ep-id-1", "ep-id-2"]
      }
    ],
    "narrative": "Across these 3 episodes, the most common theme is...",
    "episodeSummaries": [
      { "episodeId": "ep-id-1", "title": "Demo Call - Acme", "keyContribution": "Introduced the pricing objection pattern..." }
    ]
  },
  "meta": {
    "episodesRequested": 3,
    "episodesAnalyzed": 3,
    "episodesSkipped": 0,
    "totalSegments": 1200,
    "totalClaims": 85,
    "query": "What are the recurring themes...",
    "outputFormat": "structured"
  }
}`, [
  { name: "episodeIds", desc: "Array of episode IDs to synthesize across (min 2, max 50)" },
  { name: "query", desc: "Natural language question to answer using cross-episode data" },
  { name: "outputFormat", desc: "Optional. 'structured' (default) for concise narrative, 'narrative' for longer prose", optional: true },
], false)}

<!-- ===== ZOOM MEETINGS ===== -->
<h2 id="zoom-import-shared">Import from Shared Zoom Link</h2>
<p>Import a Zoom cloud recording from a shared link. No Zoom API credentials required — works with any publicly shared Zoom recording URL from any Zoom domain (zoom.us, company.zoom.us, etc.). The system extracts the recording metadata, downloads the VTT transcript, stores the meeting, and optionally converts it to an episode with AI analysis queued automatically.</p>

${endpointCard("POST", "/api/brain/zoom/import-shared-link", "Import a Zoom recording from a shared link URL.", `{
  "url": "https://zoom.us/rec/play/aBcDeFgHiJkLmNoPqRsTuVwXyZ...",
  "autoConvert": true,
  "autoAnalyze": true
}`, `{
  "success": true,
  "meetingId": "shared_1773101117985",
  "topic": "Product Demo - Acme Corp",
  "duration": 1800,
  "startTime": "2026-03-06T14:43:26.000Z",
  "transcriptFound": true,
  "utteranceCount": 538,
  "hasSpeakers": true,
  "episodeId": "9cec763f-f854-496c-b4db-5c4ce6ae9e76",
  "analysisJobId": "d26b3356-4a85-4855-b797-388afff8c49e"
}`, [
  { name: "url", type: "string", desc: "Required. Shared Zoom recording URL (/rec/play/... or /rec/share/...)" },
  { name: "autoConvert", type: "boolean", desc: "Auto-convert to episode for analysis (default: true)" },
  { name: "autoAnalyze", type: "boolean", desc: "Auto-queue AI analysis after conversion (default: true)" }
], false)}

<div class="info-box" style="background: var(--surface2); border-left: 3px solid var(--blue); padding: 1rem; border-radius: var(--radius); margin-bottom: 1.5rem;">
  <strong>Supported URL formats:</strong>
  <ul style="margin-top: 0.5rem; padding-left: 1.5rem;">
    <li><code>https://zoom.us/rec/play/abc123...</code></li>
    <li><code>https://company-name.zoom.us/rec/play/abc123...</code></li>
    <li><code>https://zoom.us/rec/share/abc123...</code></li>
  </ul>
  <p style="margin-top: 0.5rem; color: var(--text2);">The recording must be publicly shared (no passcode). Imported meetings get IDs prefixed with <code>shared_</code>. Once imported, use the <a href="#zoom-meetings">List Meetings</a> and <a href="#zoom-meeting-detail">Meeting Detail</a> endpoints to access the data. Analysis results are available once the queued job completes (typically 1-2 minutes).</p>
</div>

<h2 id="zoom-meetings">List Zoom Meetings</h2>
<p>Retrieve Zoom meeting records with metadata, filterable by company name and date range. Meetings include editable fields (company, contact, notes, tags) that can be populated manually or auto-extracted by AI during analysis.</p>

${endpointCard("GET", "/api/brain/zoom/meetings", "List Zoom meetings with metadata and analysis status.", "", `{
  "total": 85,
  "offset": 0,
  "limit": 50,
  "meetings": [
    {
      "zoomMeetingId": "85412367890",
      "topic": "SignWell Demo - Acme Corp",
      "startTime": "2026-02-15T14:00:00.000Z",
      "durationSec": 1800,
      "hostEmail": "wayne@signwell.com",
      "companyName": "Acme Corp",
      "contactName": "Jane Smith",
      "meetingDate": "2026-02-15T14:00:00.000Z",
      "notes": "Initial discovery call",
      "tags": ["discovery", "enterprise"],
      "hasTranscript": true,
      "episodeId": "uuid",
      "hasAnalysis": true
    }
  ]
}`, [
  { name: "company", type: "string", desc: "Filter by company name (case-insensitive partial match)" },
  { name: "after", type: "ISO date", desc: "Only meetings after this date" },
  { name: "before", type: "ISO date", desc: "Only meetings before this date" },
  { name: "limit", type: "integer", desc: "Max results (default: 50, max: 200)" },
  { name: "offset", type: "integer", desc: "Pagination offset (default: 0)" }
], true)}

<h2 id="zoom-meeting-detail">Zoom Meeting Detail</h2>
<p>Get a single Zoom meeting with full metadata, transcript status, and analysis summary including claim counts by type.</p>

${endpointCard("GET", "/api/brain/zoom/meetings/:meetingId", "Get detailed meeting information including analysis summary.", "", `{
  "zoomMeetingId": "85412367890",
  "topic": "SignWell Demo - Acme Corp",
  "startTime": "2026-02-15T14:00:00.000Z",
  "durationSec": 1800,
  "hostEmail": "wayne@signwell.com",
  "companyName": "Acme Corp",
  "contactName": "Jane Smith",
  "meetingDate": "2026-02-15T14:00:00.000Z",
  "notes": "Initial discovery call",
  "tags": ["discovery", "enterprise"],
  "year": 2026,
  "hasTranscript": true,
  "hasSpeakerLabels": true,
  "episodeId": "uuid",
  "analysis": {
    "analysisVersion": 2,
    "analyzedAt": "2026-02-16T10:00:00.000Z",
    "claimCounts": {
      "buyer_claim": 8,
      "gate_check": 3,
      "decision_signal": 4,
      "risk_frame": 2,
      "seller_emphasis": 5
    }
  }
}`, [
  { name: "meetingId", type: "string", desc: "Zoom meeting ID (path parameter)" }
], true)}

<!-- ===== ADMIN ===== -->
<h2 id="api-keys">API Key Management</h2>
<div class="warning-box">
  <strong>Admin only.</strong> These endpoints require admin session authentication (not Brain API key auth). They are used to create and manage API keys for external consumers.
</div>

<h3>Create API Key</h3>
${endpointCard("POST", "/api/admin/brain-keys", "Create a new Brain API key. The raw key is returned only once.", `{
  "name": "Production App",
  "scopes": ["read"],
  "rateLimitPerMin": 120
}`, `{
  "id": "uuid",
  "name": "Production App",
  "keyPrefix": "pk_brain_40782a",
  "scopes": ["read"],
  "rateLimitPerMin": 120,
  "isActive": true,
  "rawKey": "pk_brain_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "note": "Save this key now. It will not be shown again."
}`, [
  { name: "name", type: "string", desc: "Key name/label (required)" },
  { name: "scopes", type: "string[]", desc: "Permissions (default: [\"read\"])" },
  { name: "rateLimitPerMin", type: "integer", desc: "Rate limit (default: 60)" }
], false)}

<h3>List API Keys</h3>
${endpointCard("GET", "/api/admin/brain-keys", "List all API keys (hashes are not returned).", "", `[
  {
    "id": "uuid",
    "name": "Production App",
    "keyPrefix": "pk_brain_40782a",
    "scopes": ["read"],
    "rateLimitPerMin": 120,
    "isActive": true,
    "lastUsedAt": "2025-01-15T10:30:00Z"
  }
]`, [], true)}

<h3>Update API Key</h3>
${endpointCard("PATCH", "/api/admin/brain-keys/:id", "Update key properties (name, scopes, rate limit, active status).", `{
  "rateLimitPerMin": 200,
  "isActive": true
}`, `{ ... }`, [], false)}

<h3>Revoke API Key</h3>
${endpointCard("DELETE", "/api/admin/brain-keys/:id", "Permanently revoke an API key.", "", `{ "success": true }`, [], false)}

</main>
</div>

<script>
// Toggle endpoint cards
document.querySelectorAll('.endpoint-header').forEach(header => {
  header.addEventListener('click', () => {
    header.closest('.endpoint').classList.toggle('open');
  });
});

// Active nav link tracking
const sections = document.querySelectorAll('h2[id], h3[id]');
const navLinks = document.querySelectorAll('.nav-link');

function updateActiveLink() {
  let current = '';
  sections.forEach(section => {
    const rect = section.getBoundingClientRect();
    if (rect.top <= 100) current = section.id;
  });
  navLinks.forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === '#' + current);
  });
}
window.addEventListener('scroll', updateActiveLink);
updateActiveLink();

// Try-it functionality
document.querySelectorAll('.try-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const tryBox = btn.closest('.try-it');
    const method = tryBox.dataset.method;
    const pathInput = tryBox.querySelector('.try-path');
    const keyInput = tryBox.querySelector('.try-key');
    const bodyInput = tryBox.querySelector('.try-body');
    const resultBox = tryBox.querySelector('.try-result');
    const resultPre = resultBox.querySelector('pre');

    const url = pathInput.value;
    const key = keyInput.value;

    btn.textContent = 'Sending...';
    btn.disabled = true;

    try {
      const opts = {
        method: method,
        headers: {
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json'
        }
      };
      if (bodyInput && bodyInput.value.trim()) {
        opts.body = bodyInput.value;
      }
      const resp = await fetch(url, opts);
      const data = await resp.json();
      resultPre.textContent = JSON.stringify(data, null, 2);
      resultBox.style.display = 'block';
    } catch (e) {
      resultPre.textContent = 'Error: ' + e.message;
      resultBox.style.display = 'block';
    }
    btn.textContent = 'Send Request';
    btn.disabled = false;
  });
});

// Copy buttons
document.querySelectorAll('.copy-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const pre = btn.closest('pre') || btn.parentElement.querySelector('pre');
    if (pre) {
      navigator.clipboard.writeText(pre.textContent);
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 1500);
    }
  });
});
</script>
</body>
</html>`;
}

interface Param {
  name: string;
  type: string;
  desc: string;
}

function endpointCard(
  method: string,
  path: string,
  description: string,
  requestBody: string,
  responseExample: string,
  queryParams: Param[],
  isGet: boolean
): string {
  const methodClass = `method-${method.toLowerCase()}`;
  const tryId = path.replace(/[/:]/g, '-').replace(/^-+|-+$/g, '');

  let paramsHtml = '';
  if (queryParams.length > 0) {
    paramsHtml = `
      <div class="label">Query Parameters</div>
      <table>
        <tr><th>Name</th><th>Type</th><th>Description</th></tr>
        ${queryParams.map(p => `<tr><td><code>${p.name}</code></td><td>${p.type}</td><td>${p.desc}</td></tr>`).join('')}
      </table>`;
  }

  let bodyHtml = '';
  if (requestBody) {
    bodyHtml = `
      <div class="label">Request Body</div>
      <pre><code>${escapeHtml(requestBody)}</code></pre>`;
  }

  const tryItHtml = `
    <div class="try-it" data-method="${method}">
      <label>Try it</label>
      <input class="try-key" type="text" placeholder="API Key (pk_brain_...)" />
      <input class="try-path" type="text" value="${path}" />
      ${!isGet ? '<textarea class="try-body" placeholder=\'{"key": "value"}\'>' + escapeHtml(requestBody) + '</textarea>' : ''}
      <button class="try-btn">Send Request</button>
      <div class="try-result"><pre><code></code></pre></div>
    </div>`;

  return `
  <div class="endpoint">
    <div class="endpoint-header">
      <span class="method ${methodClass}">${method}</span>
      <span class="endpoint-path">${path}</span>
      <span class="endpoint-chevron">&#9654;</span>
    </div>
    <div class="endpoint-body">
      <p>${description}</p>
      ${paramsHtml}
      ${bodyHtml}
      <div class="label">Response Example</div>
      <pre><code>${escapeHtml(responseExample)}</code></pre>
      ${tryItHtml}
    </div>
  </div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
