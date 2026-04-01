import { z } from "zod";
import { callGeminiJson, GeminiError } from "../ai/geminiClient";
import type { TranscriptSegment, InsertViralMoment } from "@shared/schema";

const ViralMomentSchema = z.object({
  start_time: z.number(),
  end_time: z.number(),
  text: z.string(),
  hook_first_3_seconds: z.string().optional().default(""),
  virality_score: z.number().min(0).max(100).default(50),
  hook_reason: z.string().default("Valuable business insight"),
  suggested_title: z.string().default("Key Insight"),
  topics: z.array(z.string()).default([]),
  content_type: z.string().default("insight"),
  entities: z.array(z.string()).default([]),
});

const ViralMomentsResponseSchema = z.object({
  moments: z.array(ViralMomentSchema),
});

type ViralMomentRaw = z.infer<typeof ViralMomentSchema>;

interface EpisodeMetadata {
  title?: string;
  guest?: string;
  podcastTitle?: string;
}

const CHUNK_SIZE = 100;
const MAX_MOMENTS_PER_CHUNK = 5;
const MAX_TOTAL_MOMENTS = 10;

const MIN_CLIP_DURATION = 25;
const IDEAL_CLIP_DURATION_MIN = 35;
const IDEAL_CLIP_DURATION_MAX = 45;
const MAX_CLIP_DURATION = 60;
const MAX_WORD_COUNT = 120;
const WORDS_PER_SECOND = 2.5;
const INTRO_OUTRO_BUFFER = 90; // Skip first/last 90 seconds

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function buildViralPrompt(
  segments: TranscriptSegment[],
  metadata: EpisodeMetadata,
  chunkInfo: { chunkNum: number; totalChunks: number }
): string {
  const transcript = segments
    .map((s) => `[${formatTimestamp(s.startTime)}] ${s.text}`)
    .join("\n");

  const title = metadata.title || "Unknown";
  const podcastTitle = metadata.podcastTitle || "Unknown";
  const guest = metadata.guest;

  return `You are an expert at identifying valuable, substantive moments from business podcasts.

Episode: ${title}
Podcast: ${podcastTitle}
${guest ? `Guest: ${guest}` : ""}

This is chunk ${chunkInfo.chunkNum} of ${chunkInfo.totalChunks}.

CRITICAL: Find moments with SUBSTANCE, not just impressive-sounding facts or introductions.

⛔ NEVER SELECT (Auto-reject):
- First ${INTRO_OUTRO_BUFFER} seconds of any episode (always intro/teaser)
- Last ${INTRO_OUTRO_BUFFER} seconds of any episode (always outro/plugs)
- "Meet [person], they're [age] years old and [achievement]"
- Mentions of company valuations without explaining WHY/HOW
- Generic statements like "AI is changing everything"
- Teaser hooks without the actual content
- Sentences that start with "In this episode..." or "Today we're talking about..."

✅ WHAT MAKES A TRULY VALUABLE CLIP:

1. SPECIFIC TACTICAL ADVICE (Priority: HIGHEST)
   - Concrete steps: "First we did X, then Y, here's why"
   - Frameworks with details: "The 3 things we check are..."
   - Mistakes + lessons: "We tried X and it failed because..."
   - Numbers + context: "We spent $X on Y and got Z result"
   
2. COUNTERINTUITIVE INSIGHT
   - Challenges common advice with reasoning
   - "Everyone says X, but actually Y works better because..."
   - Must explain WHY the conventional wisdom is wrong

3. VULNERABLE/HONEST MOMENT
   - Real failure or struggle with specific details
   - "I felt like a fraud because [specific situation]"
   - Must include the resolution or learning

4. SURPRISING STORY WITH PAYOFF
   - Complete narrative arc (setup + surprise + lesson)
   - Not just "we had a 1.8 star rating" but "...and here's what we did"
   - The "why" must be clear

5. PHILOSOPHICAL REFRAME WITH APPLICATION
   - Changes how you think about something
   - Must include practical implications
   - Not just abstract wisdom

TECHNICAL REQUIREMENTS:

Duration:
- ${MIN_CLIP_DURATION}-${MAX_CLIP_DURATION} seconds (ideal: ${IDEAL_CLIP_DURATION_MIN}-${IDEAL_CLIP_DURATION_MAX}s)
- Under ${MIN_CLIP_DURATION}s: Only if EXCEPTIONALLY dense with value
- Over ${MAX_CLIP_DURATION}s: Only if telling a complete, compelling story
- MUST: end_time > start_time

Completeness Check:
- Does this make sense without watching the full episode? 
- Is there a clear beginning and end?
- Is the payoff/lesson included, not just the hook?
- Would someone learn something specific from this 30 seconds?

Content Depth Test (CRITICAL):
Ask yourself: "If I transcribed this clip word-for-word, would it be a tweet people save and reference?"

If the answer is "it sounds cool but doesn't teach anything" → REJECT IT

TRANSCRIPT:
${transcript}

Return ONLY valid JSON:
{
  "moments": [
    {
      "start_time": number,        // Must be >${INTRO_OUTRO_BUFFER} from episode start
      "end_time": number,          // Must be >start_time
      "text": string,              // Complete transcript
      "hook_first_3_seconds": string,
      "virality_score": number,    // 0-100, be HARSH
      "hook_reason": string,       // WHY is this valuable? (not just "interesting")
      "suggested_title": string,   // Specific, not generic
      "topics": string[],
      "content_type": "tactical" | "insight" | "story" | "confession" | "framework",
      "entities": string[]
    }
  ]
}

SCORING GUIDE (Be STRICT):
95-100: Will be referenced for years, teaches something you can DO tomorrow
85-94:  Clear tactical advice with specifics, immediately actionable
75-84:  Strong insight with reasoning, changes how you think
65-74:  Interesting but needs more context to be truly valuable
50-64:  Generic or intro material, skip it
<50:    Definitely skip

Return at most ${MAX_MOMENTS_PER_CHUNK} moments. Be ruthlessly selective.`;
}

function validateAndTrimMoments(
  moments: ViralMomentRaw[],
  episodeStart: number = 0,
  episodeEnd: number = Infinity
): ViralMomentRaw[] {
  const validated: ViralMomentRaw[] = [];
  const introEnd = episodeStart + INTRO_OUTRO_BUFFER;
  const outroStart = episodeEnd - INTRO_OUTRO_BUFFER;

  for (const m of moments) {
    let duration = m.end_time - m.start_time;

    if (duration <= 0) {
      console.warn(`[VIRAL] Skipping broken clip: end (${m.end_time}) before start (${m.start_time})`);
      continue;
    }

    // Skip intro moments (first 90 seconds)
    if (m.start_time < introEnd) {
      console.warn(`[VIRAL] Skipping intro clip: starts at ${m.start_time}s (intro ends at ${introEnd}s)`);
      continue;
    }

    // Skip outro moments (last 90 seconds)
    if (m.start_time > outroStart && outroStart > introEnd) {
      console.warn(`[VIRAL] Skipping outro clip: starts at ${m.start_time}s (outro starts at ${outroStart}s)`);
      continue;
    }

    if (duration < MIN_CLIP_DURATION - 5) {
      console.warn(`[VIRAL] Skipping too-short clip: ${duration}s (min ${MIN_CLIP_DURATION}s)`);
      continue;
    }

    if (duration > MAX_CLIP_DURATION) {
      console.log(`[VIRAL] Trimming long clip from ${duration}s to ${MAX_CLIP_DURATION}s`);
      m.end_time = m.start_time + MAX_CLIP_DURATION;
      duration = MAX_CLIP_DURATION;
    }

    const wordCount = m.text.split(/\s+/).length;
    const wordsPerSecond = wordCount / duration;

    if (wordsPerSecond > 4) {
      console.warn(`[VIRAL] Clip has ${wordCount} words in ${duration}s (${wordsPerSecond.toFixed(1)} wps) - text may be wrong`);
    }

    if (wordCount > MAX_WORD_COUNT + 30) {
      console.log(`[VIRAL] Trimming text from ${wordCount} to ~${MAX_WORD_COUNT} words`);
      const sentences = m.text.match(/[^.!?]+[.!?]+/g) || [m.text];
      let trimmedText = "";
      let trimmedWords = 0;
      
      for (const sentence of sentences) {
        const sentenceWords = sentence.split(/\s+/).length;
        if (trimmedWords + sentenceWords <= MAX_WORD_COUNT) {
          trimmedText += sentence + " ";
          trimmedWords += sentenceWords;
        } else {
          break;
        }
      }
      
      m.text = trimmedText.trim() || sentences[0];
    }

    validated.push(m);
  }

  return validated;
}

function deduplicateAndRank(moments: ViralMomentRaw[]): ViralMomentRaw[] {
  const seen = new Set<string>();
  const deduped: ViralMomentRaw[] = [];

  for (const m of moments) {
    const key = `${Math.round(m.start_time / 10)}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(m);
    }
  }

  return deduped
    .sort((a, b) => b.virality_score - a.virality_score)
    .slice(0, MAX_TOTAL_MOMENTS);
}

export async function findViralMoments(
  segments: TranscriptSegment[],
  metadata: EpisodeMetadata = {}
): Promise<ViralMomentRaw[]> {
  if (!segments || segments.length === 0) {
    return [];
  }

  const sortedSegments = [...segments].sort((a, b) => a.startTime - b.startTime);
  const totalChunks = Math.ceil(sortedSegments.length / CHUNK_SIZE);
  const allMoments: ViralMomentRaw[] = [];

  // Calculate episode boundaries for intro/outro filtering
  const episodeStart = sortedSegments[0]?.startTime || 0;
  const lastSegment = sortedSegments[sortedSegments.length - 1];
  const episodeEnd = lastSegment ? lastSegment.startTime + (lastSegment.endTime || 5) : 0;

  console.log(`[VIRAL] Processing ${sortedSegments.length} segments in ${totalChunks} chunks`);
  console.log(`[VIRAL] Episode range: ${episodeStart}s - ${episodeEnd}s (intro ends at ${episodeStart + INTRO_OUTRO_BUFFER}s, outro starts at ${episodeEnd - INTRO_OUTRO_BUFFER}s)`);

  for (let i = 0; i < sortedSegments.length; i += CHUNK_SIZE) {
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const chunkSegments = sortedSegments.slice(i, i + CHUNK_SIZE);

    console.log(`[VIRAL] Processing chunk ${chunkNum}/${totalChunks} (${chunkSegments.length} segments)`);

    const prompt = buildViralPrompt(chunkSegments, metadata, { chunkNum, totalChunks });

    try {
      const result = await callGeminiJson(
        "gemini-2.5-flash",
        prompt,
        ViralMomentsResponseSchema,
        { temperature: 0.7, maxOutputTokens: 4096 }
      );

      const validMoments = validateAndTrimMoments(
        result.moments
          .filter((m) => m.start_time !== undefined && m.end_time !== undefined)
          .map((m) => ({
            start_time: m.start_time,
            end_time: m.end_time,
            text: m.text,
            hook_first_3_seconds: m.hook_first_3_seconds || "",
            virality_score: m.virality_score ?? 50,
            hook_reason: m.hook_reason || "High engagement potential",
            suggested_title: m.suggested_title || "Must Watch Moment",
            topics: m.topics || [],
            content_type: m.content_type || "insight",
            entities: m.entities || [],
          })),
        episodeStart,
        episodeEnd
      );

      console.log(`[VIRAL] Chunk ${chunkNum}: found ${validMoments.length} valid moments`);
      allMoments.push(...validMoments);
    } catch (error) {
      console.error(`[VIRAL] Chunk ${chunkNum} failed:`, error);
      if (error instanceof GeminiError && !error.transient) {
        throw error;
      }
    }
  }

  console.log(`[VIRAL] Total moments found: ${allMoments.length}, deduplicating and ranking...`);
  return deduplicateAndRank(allMoments);
}

export function calculateViralityScore(moment: ViralMomentRaw): number {
  let score = moment.virality_score || 50;
  
  const text = moment.text.toLowerCase();
  const duration = moment.end_time - moment.start_time;
  const wordCount = moment.text.split(/\s+/).length;
  
  // Counterintuitive language bonus
  const counterintuitive = [
    'actually', 'but', 'however', 'contrary', 'surprisingly',
    'most people think', 'everyone says', 'conventional wisdom'
  ];
  if (counterintuitive.some(phrase => text.includes(phrase))) {
    score += 15;
  }
  
  // Concrete numbers/data bonus
  const hasNumbers = /\$\d+|\d+%|\d+x|\d+ million|\d+ billion/.test(text);
  if (hasNumbers) {
    score += 12;
  }
  
  // Vulnerable language bonus
  const vulnerable = [
    'i felt like', 'i was afraid', 'honestly', 'to be honest',
    'i failed', 'i screwed up', 'i had no idea'
  ];
  if (vulnerable.some(phrase => text.includes(phrase))) {
    score += 10;
  }
  
  // Tactical language bonus
  const tactical = [
    "here's how", 'the way i did it', 'step one', 'the framework',
    'specifically', 'exactly', 'the process'
  ];
  if (tactical.some(phrase => text.includes(phrase))) {
    score += 10;
  }
  
  // Question/curiosity bonus
  if (text.includes('?') || text.includes('why') || text.includes('how')) {
    score += 8;
  }
  
  // Optimal duration (30-45s = sweet spot)
  if (duration >= IDEAL_CLIP_DURATION_MIN && duration <= IDEAL_CLIP_DURATION_MAX) {
    score += 10;
  } else if (duration >= 20 && duration <= 60) {
    score += 5;
  }
  
  // Word count (45-70 words is ideal for comprehension + shareability)
  if (wordCount >= 45 && wordCount <= 70) {
    score += 8;
  } else if (wordCount >= 30 && wordCount <= 90) {
    score += 4;
  }
  
  // Strong opening (first 10 words)
  const firstTenWords = moment.text.split(/\s+/).slice(0, 10).join(' ').toLowerCase();
  const strongOpeners = [
    'the biggest mistake', "here's the thing", 'let me tell you',
    'the truth is', 'nobody talks about', 'the secret'
  ];
  if (strongOpeners.some(opener => firstTenWords.includes(opener))) {
    score += 7;
  }

  // Entity mentions bonus
  if (moment.entities && moment.entities.length > 2) score += 5;

  // Content type bonuses
  if (moment.content_type === "tactical") score += 8;
  if (moment.content_type === "confession") score += 7;
  if (moment.content_type === "insight") score += 5;

  return Math.min(100, Math.round(score));
}

export function convertToInsertViralMoment(
  episodeId: string,
  moment: ViralMomentRaw,
  displayOrder: number
): InsertViralMoment {
  const validContentTypes = ["insight", "tactical", "story", "confession", "emotional_moment"];
  const contentType = validContentTypes.includes(moment.content_type)
    ? moment.content_type
    : "insight";

  return {
    episodeId,
    momentKind: "viral" as const,
    startTime: Math.round(moment.start_time),
    endTime: Math.round(moment.end_time),
    text: moment.text,
    viralityScore: calculateViralityScore(moment),
    hookReason: moment.hook_reason,
    suggestedTitle: moment.suggested_title,
    topics: moment.topics || [],
    contentType,
    entities: moment.entities || [],
    displayOrder,
  };
}
