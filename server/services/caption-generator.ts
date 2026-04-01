import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

const CAPTIONED_DIR = "/tmp/clips/captioned";
const FONT_DIR = "/tmp/fonts";
const FONT_URL = "https://github.com/google/fonts/raw/main/ofl/montserrat/static/Montserrat-ExtraBold.ttf";
const FONT_FILE = "Montserrat-ExtraBold.ttf";

let fontReady = false;

async function ensureFont(): Promise<string> {
  const fontPath = path.join(FONT_DIR, FONT_FILE);
  if (fontReady) return fontPath;
  try {
    await fs.access(fontPath);
    const stats = await fs.stat(fontPath);
    if (stats.size > 10000) {
      fontReady = true;
      return fontPath;
    }
  } catch {}
  console.log(`[CAPTION-GEN] Downloading Montserrat ExtraBold...`);
  await fs.mkdir(FONT_DIR, { recursive: true });
  await execAsync(`curl -sL "${FONT_URL}" -o "${fontPath}"`, { timeout: 30000 });
  const stats = await fs.stat(fontPath);
  if (stats.size < 10000) throw new Error("Font download failed");
  console.log(`[CAPTION-GEN] Font ready: ${fontPath} (${(stats.size / 1024).toFixed(0)} KB)`);
  fontReady = true;
  return fontPath;
}

export interface CaptionStyle {
  fontSize?: number;
  fontColor?: string;
  borderWidth?: number;
  borderColor?: string;
  wordsPerLine?: number;
  position?: "center" | "bottom";
  highlightColor?: string;
  forceRegenerate?: boolean;
}

export interface CaptionOptions {
  hookText?: string | null;
  hookEnabled?: boolean;
  addWatermark?: boolean;
}

export interface TranscriptSegment {
  text: string;
  startTime: number;
  endTime: number;
}

export interface CaptionResult {
  captionedPath: string;
  fileSize: number;
}

const DEFAULT_STYLE: Required<CaptionStyle> = {
  fontSize: 58,
  fontColor: "white",
  borderWidth: 4,
  borderColor: "black",
  wordsPerLine: 3,
  position: "center",
  highlightColor: "#F5C518",
  forceRegenerate: false,
};

function escapeTextForFFmpeg(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function escapeTextForASS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

function hexToASSColor(hex: string): string {
  const clean = hex.replace("#", "").replace("0x", "");
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  return `&H00${b}${g}${r}`;
}

function buildASSHeader(
  style: Required<CaptionStyle>,
  fontPath: string,
  videoWidth: number,
  videoHeight: number
): string {
  const primaryColor = hexToASSColor(style.highlightColor);
  const secondaryColor = "&H00FFFFFF";
  const outlineColor = "&H00000000";
  const backColor = "&H80000000";

  const alignment = style.position === "bottom" ? 2 : 5;
  const marginV = style.position === "bottom" ? 120 : 0;

  const fontName = "Montserrat ExtraBold";

  return `[Script Info]
Title: PodDNA Captions
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,${fontName},${style.fontSize},${primaryColor},${secondaryColor},${outlineColor},${backColor},1,0,0,0,100,100,2,0,1,${style.borderWidth},2,${alignment},50,50,${marginV},1
Style: Hook,${fontName},${Math.round(style.fontSize * 0.7)},&H00FFFFFF,&H00FFFFFF,&H00000000,&HC0000000,1,0,0,0,100,100,1,0,3,${style.borderWidth},0,8,60,60,80,1
Style: Watermark,${fontName},${Math.round(style.fontSize * 0.4)},&H60FFFFFF,&H60FFFFFF,&H40000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,3,30,30,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

async function generateASSSubtitle(
  text: string,
  clipDuration: number,
  wordsPerLine: number,
  style: Required<CaptionStyle>,
  outputPath: string,
  fontPath: string,
  videoWidth: number = 1080,
  videoHeight: number = 1920,
  options: CaptionOptions = {}
): Promise<void> {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) throw new Error("No text for subtitles");

  const wordDuration = clipDuration / words.length;

  let ass = buildASSHeader(style, fontPath, videoWidth, videoHeight);

  if (options.hookEnabled !== false && options.hookText) {
    const hookEscaped = escapeTextForASS(options.hookText.toUpperCase());
    const hookEnd = Math.min(5, clipDuration);
    ass += `Dialogue: 1,${formatASSTime(0)},${formatASSTime(hookEnd)},Hook,,0,0,0,,{\\fad(300,800)}${hookEscaped}\n`;
  }

  if (options.addWatermark) {
    ass += `Dialogue: 0,${formatASSTime(0)},${formatASSTime(clipDuration)},Watermark,,0,0,0,,Made with PODDNA\n`;
  }

  const phrases: { words: string[]; startTime: number; endTime: number }[] = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    const phraseWords = words.slice(i, i + wordsPerLine);
    const startTime = i * wordDuration;
    const endTime = Math.min((i + wordsPerLine) * wordDuration, clipDuration);
    phrases.push({ words: phraseWords, startTime, endTime });
  }

  for (const phrase of phrases) {
    const start = formatASSTime(phrase.startTime);
    const end = formatASSTime(phrase.endTime);

    const phraseDuration = phrase.endTime - phrase.startTime;
    const wordDur = phraseDuration / phrase.words.length;
    const wordDurCs = Math.round(wordDur * 100);

    let karaokeText = "";
    for (let i = 0; i < phrase.words.length; i++) {
      const word = escapeTextForASS(phrase.words[i].toUpperCase());
      karaokeText += `{\\kf${wordDurCs}}${word}`;
      if (i < phrase.words.length - 1) {
        karaokeText += " ";
      }
    }

    ass += `Dialogue: 0,${start},${end},Karaoke,,0,0,0,,${karaokeText}\n`;
  }

  await fs.writeFile(outputPath, ass, "utf-8");
  console.log(`[CAPTION-GEN] Generated ASS subtitle: ${outputPath}`);
}

export async function addTikTokCaptions(
  videoPath: string,
  text: string,
  clipStartTime: number,
  clipEndTime: number,
  style: CaptionStyle = {},
  options: CaptionOptions = {}
): Promise<CaptionResult> {
  await fs.mkdir(CAPTIONED_DIR, { recursive: true });
  const fontPath = await ensureFont();

  const mergedStyle = { ...DEFAULT_STYLE, ...style };
  const { wordsPerLine, forceRegenerate } = mergedStyle;

  const baseName = path.basename(videoPath, ".mp4");
  const outputPath = path.join(CAPTIONED_DIR, `${baseName}_captioned.mp4`);
  const assPath = path.join(CAPTIONED_DIR, `${baseName}.ass`);

  if (forceRegenerate) {
    try { await fs.unlink(outputPath); } catch {}
    try { await fs.unlink(assPath); } catch {}
  } else {
    try {
      await fs.access(outputPath);
      const stats = await fs.stat(outputPath);
      console.log(`[CAPTION-GEN] Captioned video already exists: ${outputPath}`);
      return { captionedPath: outputPath, fileSize: stats.size };
    } catch {}
  }

  console.log(`[CAPTION-GEN] Adding TikTok karaoke-style captions with ASS subtitles to ${videoPath}...`);

  const clipDuration = clipEndTime - clipStartTime;

  let videoWidth = 1080;
  let videoHeight = 1920;
  try {
    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${videoPath}"`;
    const { stdout } = await execAsync(probeCmd);
    const [w, h] = stdout.trim().split(",").map(Number);
    if (w && h) {
      videoWidth = w;
      videoHeight = h;
    }
  } catch {
    console.log("[CAPTION-GEN] Could not probe video dimensions, using defaults");
  }

  await generateASSSubtitle(text, clipDuration, wordsPerLine, mergedStyle, assPath, fontPath, videoWidth, videoHeight, options);

  let hasAudio = false;
  try {
    const probeCmd = `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${videoPath}"`;
    const { stdout } = await execAsync(probeCmd);
    hasAudio = stdout.trim() === "audio";
  } catch {
    console.log("[CAPTION-GEN] Could not probe audio, assuming no audio stream");
  }

  const audioArgs = hasAudio ? "-c:a aac -b:a 192k" : "-an";
  const escapedAssPath = assPath.replace(/'/g, "'\\''").replace(/:/g, "\\:");
  const escapedFontDir = FONT_DIR.replace(/'/g, "'\\''").replace(/:/g, "\\:");

  const command = `ffmpeg -i "${videoPath}" \
    -vf "ass='${escapedAssPath}':fontsdir='${escapedFontDir}'" \
    -c:v libx264 -preset fast -crf 23 \
    ${audioArgs} \
    -movflags +faststart \
    "${outputPath}" -y`;

  console.log(`[CAPTION-GEN] Running FFmpeg with ASS karaoke subtitles`);

  try {
    await execAsync(command, { timeout: 180000 });

    const stats = await fs.stat(outputPath);
    console.log(`[CAPTION-GEN] Karaoke captions added (${(stats.size / 1024 / 1024).toFixed(2)} MB): ${outputPath}`);

    try { await fs.unlink(assPath); } catch {}

    return { captionedPath: outputPath, fileSize: stats.size };
  } catch (error: any) {
    console.error("[CAPTION-GEN] FFmpeg caption generation failed:", error.message);
    if (error.stderr) {
      console.error("[CAPTION-GEN] FFmpeg stderr:", error.stderr);
    }
    throw new Error(`Failed to add captions: ${error.message}`);
  }
}

export interface TimedTranscriptSegment {
  text: string;
  startTime: number;
  endTime: number;
}

async function generateASSSubtitleFromSegments(
  segments: TimedTranscriptSegment[],
  clipStartTime: number,
  wordsPerLine: number,
  style: Required<CaptionStyle>,
  outputPath: string,
  fontPath: string,
  clipDuration: number,
  videoWidth: number = 1080,
  videoHeight: number = 1920,
  options: CaptionOptions = {}
): Promise<void> {
  if (segments.length === 0) throw new Error("No segments for subtitles");

  let ass = buildASSHeader(style, fontPath, videoWidth, videoHeight);

  if (options.hookEnabled !== false && options.hookText) {
    const hookEscaped = escapeTextForASS(options.hookText.toUpperCase());
    const hookEnd = Math.min(5, clipDuration);
    ass += `Dialogue: 1,${formatASSTime(0)},${formatASSTime(hookEnd)},Hook,,0,0,0,,{\\fad(300,800)}${hookEscaped}\n`;
  }

  if (options.addWatermark) {
    ass += `Dialogue: 0,${formatASSTime(0)},${formatASSTime(clipDuration)},Watermark,,0,0,0,,Made with PODDNA\n`;
  }

  for (const segment of segments) {
    const relativeStart = Math.max(0, segment.startTime - clipStartTime);
    const relativeEnd = segment.endTime - clipStartTime;

    if (relativeEnd <= 0) continue;

    const start = formatASSTime(relativeStart);
    const end = formatASSTime(relativeEnd);

    const words = segment.text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) continue;

    const segmentDuration = relativeEnd - relativeStart;
    const wordDur = segmentDuration / words.length;
    const wordDurCs = Math.round(wordDur * 100);

    const allWords = words.map(w => ({ text: w, durCs: wordDurCs }));
    const phrases: { words: typeof allWords; startTime: number; endTime: number }[] = [];
    for (let i = 0; i < allWords.length; i += wordsPerLine) {
      const phraseWords = allWords.slice(i, i + wordsPerLine);
      const phraseStart = relativeStart + i * wordDur;
      const phraseEnd = Math.min(relativeStart + (i + wordsPerLine) * wordDur, relativeEnd);
      phrases.push({ words: phraseWords, startTime: phraseStart, endTime: phraseEnd });
    }

    for (const phrase of phrases) {
      const pStart = formatASSTime(phrase.startTime);
      const pEnd = formatASSTime(phrase.endTime);

      let karaokeText = "";
      for (let i = 0; i < phrase.words.length; i++) {
        const word = escapeTextForASS(phrase.words[i].text.toUpperCase());
        karaokeText += `{\\kf${phrase.words[i].durCs}}${word}`;
        if (i < phrase.words.length - 1) {
          karaokeText += " ";
        }
      }

      ass += `Dialogue: 0,${pStart},${pEnd},Karaoke,,0,0,0,,${karaokeText}\n`;
    }
  }

  await fs.writeFile(outputPath, ass, "utf-8");
  console.log(`[CAPTION-GEN] Generated ASS subtitle from ${segments.length} segments: ${outputPath}`);
}

export async function addTikTokCaptionsWithSegments(
  videoPath: string,
  segments: TimedTranscriptSegment[],
  clipStartTime: number,
  clipEndTime: number,
  style: CaptionStyle = {},
  options: CaptionOptions = {}
): Promise<CaptionResult> {
  await fs.mkdir(CAPTIONED_DIR, { recursive: true });
  const fontPath = await ensureFont();

  const mergedStyle = { ...DEFAULT_STYLE, ...style };
  const { wordsPerLine, forceRegenerate } = mergedStyle;

  const baseName = path.basename(videoPath, ".mp4");
  const outputPath = path.join(CAPTIONED_DIR, `${baseName}_captioned.mp4`);
  const assPath = path.join(CAPTIONED_DIR, `${baseName}.ass`);

  if (forceRegenerate) {
    try { await fs.unlink(outputPath); } catch {}
    try { await fs.unlink(assPath); } catch {}
  } else {
    try {
      await fs.access(outputPath);
      const stats = await fs.stat(outputPath);
      console.log(`[CAPTION-GEN] Captioned video already exists: ${outputPath}`);
      return { captionedPath: outputPath, fileSize: stats.size };
    } catch {}
  }

  console.log(`[CAPTION-GEN] Adding TikTok captions using ${segments.length} real transcript segments...`);

  const clipDuration = clipEndTime - clipStartTime;

  let videoWidth = 1080;
  let videoHeight = 1920;
  try {
    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${videoPath}"`;
    const { stdout } = await execAsync(probeCmd);
    const [w, h] = stdout.trim().split(",").map(Number);
    if (w && h) {
      videoWidth = w;
      videoHeight = h;
    }
  } catch {
    console.log("[CAPTION-GEN] Could not probe video dimensions, using defaults");
  }

  await generateASSSubtitleFromSegments(segments, clipStartTime, wordsPerLine, mergedStyle, assPath, fontPath, clipDuration, videoWidth, videoHeight, options);

  let hasAudio = false;
  try {
    const probeCmd = `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${videoPath}"`;
    const { stdout } = await execAsync(probeCmd);
    hasAudio = stdout.trim().includes("audio");
  } catch {
    console.log("[CAPTION-GEN] Could not probe audio, assuming no audio stream");
  }

  const audioArgs = hasAudio ? "-c:a aac -b:a 192k" : "-an";
  const escapedAssPath = assPath.replace(/'/g, "'\\''").replace(/:/g, "\\:");
  const escapedFontDir = FONT_DIR.replace(/'/g, "'\\''").replace(/:/g, "\\:");

  const command = `ffmpeg -i "${videoPath}" \
    -vf "ass='${escapedAssPath}':fontsdir='${escapedFontDir}'" \
    -c:v libx264 -preset fast -crf 23 \
    ${audioArgs} \
    -movflags +faststart \
    "${outputPath}" -y`;

  console.log(`[CAPTION-GEN] Running FFmpeg with real-timed ASS karaoke subtitles`);

  try {
    await execAsync(command, { timeout: 180000 });

    const stats = await fs.stat(outputPath);
    console.log(`[CAPTION-GEN] Karaoke captions added (${(stats.size / 1024 / 1024).toFixed(2)} MB): ${outputPath}`);

    try { await fs.unlink(assPath); } catch {}

    return { captionedPath: outputPath, fileSize: stats.size };
  } catch (error: any) {
    console.error("[CAPTION-GEN] FFmpeg caption generation failed:", error.message);
    if (error.stderr) {
      console.error("[CAPTION-GEN] FFmpeg stderr:", error.stderr);
    }
    throw new Error(`Failed to add captions: ${error.message}`);
  }
}

export async function addAnimatedCaptions(
  videoPath: string,
  segments: TranscriptSegment[],
  clipStartTime: number,
  style: CaptionStyle = {}
): Promise<CaptionResult> {
  await fs.mkdir(CAPTIONED_DIR, { recursive: true });

  const mergedStyle = { ...DEFAULT_STYLE, ...style };
  const { fontSize, fontColor, borderWidth, borderColor, position } = mergedStyle;

  const baseName = path.basename(videoPath, ".mp4");
  const outputPath = path.join(CAPTIONED_DIR, `${baseName}_animated.mp4`);

  try {
    await fs.access(outputPath);
    const stats = await fs.stat(outputPath);
    console.log(`[CAPTION-GEN] Animated caption video already exists: ${outputPath}`);
    return { captionedPath: outputPath, fileSize: stats.size };
  } catch {}

  console.log(`[CAPTION-GEN] Adding animated word-by-word captions...`);

  if (segments.length === 0) {
    throw new Error("No transcript segments provided for animated captions");
  }

  const yPosition = position === "bottom" ? "(h-text_h-80)" : "(h-text_h)/2";

  const textFilters = segments.map((seg) => {
    const escapedText = escapeTextForFFmpeg(seg.text);
    const relativeStart = seg.startTime - clipStartTime;
    const relativeEnd = seg.endTime - clipStartTime;

    return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:` +
      `borderw=${borderWidth}:bordercolor=${borderColor}:` +
      `x=(w-text_w)/2:y=${yPosition}:` +
      `enable='between(t\\,${relativeStart.toFixed(3)}\\,${relativeEnd.toFixed(3)})'`;
  });

  const filterComplex = textFilters.join(",");

  let hasAudio = false;
  try {
    const probeCmd = `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${videoPath}"`;
    const { stdout } = await execAsync(probeCmd);
    hasAudio = stdout.trim() === "audio";
  } catch {
    console.log("[CAPTION-GEN] Could not probe audio, assuming no audio stream");
  }

  const audioArgs = hasAudio ? "-c:a aac -b:a 192k" : "-an";

  const command = `ffmpeg -i "${videoPath}" \
    -vf "${filterComplex}" \
    -c:v libx264 -preset fast -crf 23 \
    ${audioArgs} \
    -movflags +faststart \
    "${outputPath}" -y`;

  try {
    await execAsync(command, { timeout: 120000 });

    const stats = await fs.stat(outputPath);
    console.log(`[CAPTION-GEN] Animated captions added (${(stats.size / 1024 / 1024).toFixed(2)} MB): ${outputPath}`);

    return { captionedPath: outputPath, fileSize: stats.size };
  } catch (error: any) {
    console.error("[CAPTION-GEN] Animated caption generation failed:", error.message);
    throw new Error(`Failed to add animated captions: ${error.message}`);
  }
}

export async function optimizeForSocial(
  videoPath: string,
  platform: "tiktok" | "instagram" | "youtube" = "tiktok"
): Promise<CaptionResult> {
  await fs.mkdir(CAPTIONED_DIR, { recursive: true });

  const settings = {
    tiktok: { resolution: "1080:1920", maxDuration: 180 },
    instagram: { resolution: "1080:1920", maxDuration: 90 },
    youtube: { resolution: "1080:1920", maxDuration: 60 },
  };

  const config = settings[platform];
  const baseName = path.basename(videoPath, ".mp4");
  const outputPath = path.join(CAPTIONED_DIR, `${baseName}_${platform}.mp4`);

  try {
    await fs.access(outputPath);
    const stats = await fs.stat(outputPath);
    console.log(`[CAPTION-GEN] Optimized video already exists: ${outputPath}`);
    return { captionedPath: outputPath, fileSize: stats.size };
  } catch {}

  console.log(`[CAPTION-GEN] Optimizing video for ${platform}...`);

  const command = `ffmpeg -i "${videoPath}" \
    -vf "scale=${config.resolution}:force_original_aspect_ratio=increase,crop=${config.resolution}" \
    -c:v libx264 -preset fast -crf 23 \
    -c:a aac -b:a 128k -ar 44100 \
    -movflags +faststart \
    -t ${config.maxDuration} \
    "${outputPath}" -y`;

  try {
    await execAsync(command, { timeout: 180000 });

    const stats = await fs.stat(outputPath);
    console.log(`[CAPTION-GEN] Video optimized for ${platform} (${(stats.size / 1024 / 1024).toFixed(2)} MB): ${outputPath}`);

    return { captionedPath: outputPath, fileSize: stats.size };
  } catch (error: any) {
    console.error(`[CAPTION-GEN] ${platform} optimization failed:`, error.message);
    throw new Error(`Failed to optimize for ${platform}: ${error.message}`);
  }
}

export async function cleanupCaptionedClips(maxAgeHours: number = 24): Promise<number> {
  try {
    const files = await fs.readdir(CAPTIONED_DIR);
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000;

    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(CAPTIONED_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs > maxAge) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      } catch {}
    }

    if (deletedCount > 0) {
      console.log(`[CAPTION-GEN] Cleaned up ${deletedCount} old captioned clips`);
    }

    return deletedCount;
  } catch (error) {
    console.error("[CAPTION-GEN] Cleanup failed:", error);
    return 0;
  }
}
