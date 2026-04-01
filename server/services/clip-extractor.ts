import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import { createWriteStream } from "fs";
import * as path from "path";
import pLimit from "p-limit";
import { Innertube } from "youtubei.js";

const execAsync = promisify(exec);

const CLIPS_DIR = "/tmp/clips";
const MAX_CONCURRENT_EXTRACTIONS = 3;

export interface ClipExtractionResult {
  clipPath: string;
  duration: number;
  fileSize: number;
}

export interface ViralMomentClipInput {
  id: string;
  startTime: number;
  endTime: number;
  suggestedTitle?: string;
}

export interface ClipExtractionOptions {
  cookiesFile?: string;
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

let _rawCookies: string | undefined;
let _cookieHeader: string | undefined;
let _serviceCookiesLoaded = false;

function parseNetscapeCookiesToHeader(rawContent: string): string {
  const lines = rawContent.split('\n');
  const cookies: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue;
    const parts = line.split('\t');
    if (parts.length < 7) continue;

    const domain = parts[0];
    if (!domain.includes('youtube.com') && !domain.includes('google.com')) continue;

    const name = parts[5];
    const value = parts[6];
    if (!name || !value) continue;

    if (seen.has(name)) continue;
    seen.add(name);

    cookies.push(`${name}=${value}`);
  }

  return cookies.join('; ');
}

function loadServiceCookies(): { raw: string; header: string } | undefined {
  if (_serviceCookiesLoaded) {
    if (_rawCookies && _cookieHeader) return { raw: _rawCookies, header: _cookieHeader };
    return undefined;
  }
  _serviceCookiesLoaded = true;
  const content = process.env.YOUTUBE_COOKIES_CONTENT;
  if (content && content.trim().length > 0) {
    _rawCookies = content;
    _cookieHeader = parseNetscapeCookiesToHeader(content);
    console.log(`[CLIP-EXTRACTOR] Service cookies loaded (${content.length} bytes, ${_cookieHeader.split(';').length} cookies parsed)`);
    return { raw: _rawCookies, header: _cookieHeader };
  } else {
    console.log(`[CLIP-EXTRACTOR] No YOUTUBE_COOKIES_CONTENT set — running unauthenticated`);
  }
  return undefined;
}

let _serviceCookiesFilePath: string | undefined;

async function getServiceCookiesFile(): Promise<string | undefined> {
  const cookies = loadServiceCookies();
  if (!cookies) return undefined;

  if (_serviceCookiesFilePath) {
    try {
      await fs.access(_serviceCookiesFilePath);
      return _serviceCookiesFilePath;
    } catch {}
  }

  const cookiesPath = `/tmp/yt_service_cookies.txt`;
  await fs.writeFile(cookiesPath, cookies.raw);
  _serviceCookiesFilePath = cookiesPath;
  return cookiesPath;
}

async function extractViaInnertube(
  videoId: string,
  startTime: number,
  endTime: number,
  outputPath: string
): Promise<ClipExtractionResult> {
  const duration = endTime - startTime;
  const cookies = loadServiceCookies();
  const authenticated = !!cookies;

  console.log(`[CLIP-INNERTUBE] Downloading via Innertube (authenticated: ${authenticated ? 'yes' : 'no'})...`);

  const innertubeOpts: any = {};
  if (cookies) {
    innertubeOpts.cookie = cookies.header;
  }

  const yt = await Innertube.create(innertubeOpts);

  const tempPath = outputPath.replace('.mp4', '_innertube_temp.mp4');

  const stream = await yt.download(videoId, {
    type: 'video+audio',
    quality: 'best',
    format: 'mp4',
  });

  const reader = stream.getReader();
  const fileStream = createWriteStream(tempPath);
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(value);
      totalBytes += value.length;
    }
    fileStream.end();

    await new Promise<void>((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });

    console.log(`[CLIP-INNERTUBE] Downloaded ${(totalBytes / 1024 / 1024).toFixed(1)} MB, trimming ${startTime}s-${endTime}s...`);

    const ffmpegCmd = `ffmpeg -ss ${startTime} -i "${tempPath}" -t ${duration} -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${outputPath}" -y`;

    await execAsync(ffmpegCmd, { timeout: 180000 });

    try { await fs.unlink(tempPath); } catch {}

    await fs.access(outputPath);
    const stats = await fs.stat(outputPath);

    if (stats.size < 1000) {
      throw new Error(`Output file too small: ${stats.size} bytes`);
    }

    console.log(`[CLIP-INNERTUBE] Clip ready (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

    return {
      clipPath: outputPath,
      duration,
      fileSize: stats.size,
    };
  } catch (err) {
    try { fileStream.end(); } catch {}
    try { await fs.unlink(tempPath); } catch {}
    throw err;
  }
}

async function extractViaYtDlp(
  youtubeUrl: string,
  startTime: number,
  endTime: number,
  outputPath: string,
  cookiesFile?: string,
  proxyUrl?: string
): Promise<ClipExtractionResult> {
  const duration = endTime - startTime;
  const cookiesFlag = cookiesFile ? `--cookies "${cookiesFile}"` : '';
  const proxyFlag = proxyUrl ? `--proxy "${proxyUrl}"` : '';
  const authLabel = cookiesFile ? 'with cookies' : 'no auth';
  const proxyLabel = proxyUrl ? ' via proxy' : '';

  const sitePackages = path.join(process.cwd(), '.pythonlibs', 'lib', 'python3.11', 'site-packages');
  let ytdlpBin = 'yt-dlp';
  try {
    await fs.access(path.join(sitePackages, 'yt_dlp', '__main__.py'));
    ytdlpBin = `PYTHONPATH="${sitePackages}" python3 -m yt_dlp`;
  } catch {
    try {
      await execAsync('python3 -m yt_dlp --version', { timeout: 5000 });
      ytdlpBin = 'python3 -m yt_dlp';
    } catch {}
  }

  console.log(`[CLIP-YTDLP] Downloading via ${ytdlpBin} (${authLabel}${proxyLabel})...`);

  const command = `${ytdlpBin} "${youtubeUrl}" \
    --download-sections "*${startTime}-${endTime}" \
    -f "best[height<=720]/bestvideo[height<=720]+bestaudio/best" \
    --merge-output-format mp4 \
    --no-playlist \
    --force-ipv4 \
    --retries 3 \
    --fragment-retries 3 \
    --js-runtimes node \
    ${cookiesFlag} \
    ${proxyFlag} \
    -o "${outputPath}"`;

  const timeout = proxyUrl ? 600000 : 300000;
  try {
    const { stdout, stderr } = await execAsync(command, { timeout });
    if (stderr) console.log(`[CLIP-YTDLP] stderr: ${stderr.substring(0, 500)}`);
  } catch (cmdErr: any) {
    const stderr = cmdErr.stderr || '';
    console.error(`[CLIP-YTDLP] Full error: ${stderr.substring(0, 1000)}`);
    throw cmdErr;
  }

  await fs.access(outputPath);
  const stats = await fs.stat(outputPath);

  if (stats.size < 1000) {
    throw new Error(`Output file too small: ${stats.size} bytes`);
  }

  console.log(`[CLIP-YTDLP] Clip ready (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  return {
    clipPath: outputPath,
    duration,
    fileSize: stats.size,
  };
}

export async function extractYouTubeClip(
  youtubeUrl: string,
  startTime: number,
  endTime: number,
  outputDir: string = CLIPS_DIR,
  options: ClipExtractionOptions = {}
): Promise<ClipExtractionResult> {
  await fs.mkdir(outputDir, { recursive: true });

  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) {
    throw new Error(`Invalid YouTube URL: ${youtubeUrl}`);
  }

  const duration = endTime - startTime;
  if (duration <= 0 || duration > 300) {
    throw new Error(`Invalid clip duration: ${duration}s (must be 1-300 seconds)`);
  }

  const outputPath = path.join(outputDir, `${videoId}_${startTime}_${endTime}.mp4`);

  try {
    await fs.access(outputPath);
    const stats = await fs.stat(outputPath);
    if (stats.size > 1000) {
      console.log(`[CLIP-EXTRACTOR] Clip already exists: ${outputPath}`);
      return {
        clipPath: outputPath,
        duration,
        fileSize: stats.size,
      };
    }
  } catch {}

  console.log(`[CLIP-EXTRACTOR] Extracting clip from ${startTime}s to ${endTime}s (video: ${videoId})...`);

  const cookiesFile = options.cookiesFile || await getServiceCookiesFile();
  const proxyUrl = process.env.RESIDENTIAL_PROXY_URL;
  const errors: string[] = [];

  // Stage 1: youtubei.js (primary — fastest)
  try {
    return await extractViaInnertube(videoId, startTime, endTime, outputPath);
  } catch (e: any) {
    errors.push(`Innertube: ${e.message?.substring(0, 100)}`);
    console.error(`[CLIP-EXTRACTOR] Innertube failed: ${e.message?.substring(0, 200)}`);
  }

  // Stage 2: yt-dlp with cookies, direct IP
  if (cookiesFile) {
    try {
      return await extractViaYtDlp(youtubeUrl, startTime, endTime, outputPath, cookiesFile);
    } catch (e: any) {
      errors.push(`yt-dlp+cookies: ${e.message?.substring(0, 100)}`);
      console.error(`[CLIP-EXTRACTOR] yt-dlp (cookies) failed: ${e.message?.substring(0, 200)}`);
    }
  }

  // Stage 3: yt-dlp WITHOUT cookies, direct IP (expired cookies can poison the request)
  try {
    console.log(`[CLIP-EXTRACTOR] Trying yt-dlp without cookies (no-auth)...`);
    return await extractViaYtDlp(youtubeUrl, startTime, endTime, outputPath, undefined);
  } catch (e: any) {
    errors.push(`yt-dlp no-auth: ${e.message?.substring(0, 100)}`);
    console.error(`[CLIP-EXTRACTOR] yt-dlp (no-auth) failed: ${e.message?.substring(0, 200)}`);
  }

  // Stage 4: yt-dlp WITHOUT cookies via residential proxy (different IP, clean session)
  if (proxyUrl) {
    try {
      console.log(`[CLIP-EXTRACTOR] Trying via residential proxy (no cookies)...`);
      return await extractViaYtDlp(youtubeUrl, startTime, endTime, outputPath, undefined, proxyUrl);
    } catch (e: any) {
      errors.push(`proxy no-auth: ${e.message?.substring(0, 100)}`);
      console.error(`[CLIP-EXTRACTOR] yt-dlp proxy (no-auth) failed: ${e.message?.substring(0, 200)}`);
    }

    // Stage 5: yt-dlp WITH cookies via residential proxy (cookies might work from different IP)
    if (cookiesFile) {
      try {
        console.log(`[CLIP-EXTRACTOR] Trying via residential proxy (with cookies)...`);
        return await extractViaYtDlp(youtubeUrl, startTime, endTime, outputPath, cookiesFile, proxyUrl);
      } catch (e: any) {
        errors.push(`proxy+cookies: ${e.message?.substring(0, 100)}`);
        console.error(`[CLIP-EXTRACTOR] yt-dlp proxy (cookies) failed: ${e.message?.substring(0, 200)}`);
      }
    }
  }

  console.error(`[CLIP-EXTRACTOR] All ${errors.length} extraction methods exhausted:`, errors.join(' | '));
  throw new Error(
    "YouTube is temporarily limiting downloads. Please try again in a few minutes."
  );
}

export async function extractMultipleClips(
  youtubeUrl: string,
  moments: ViralMomentClipInput[],
  outputDir: string = CLIPS_DIR,
  onProgress?: (completed: number, total: number) => void,
  options: ClipExtractionOptions = {}
): Promise<Array<ViralMomentClipInput & { clipPath?: string; error?: string }>> {
  console.log(`[CLIP-EXTRACTOR] Extracting ${moments.length} clips from video...`);

  const limit = pLimit(MAX_CONCURRENT_EXTRACTIONS);
  const results: Array<ViralMomentClipInput & { clipPath?: string; error?: string }> = [];
  let completed = 0;

  const promises = moments.map((moment) =>
    limit(async () => {
      try {
        const result = await extractYouTubeClip(
          youtubeUrl,
          moment.startTime,
          moment.endTime,
          outputDir,
          options
        );
        completed++;
        onProgress?.(completed, moments.length);
        return { ...moment, clipPath: result.clipPath };
      } catch (error: any) {
        completed++;
        onProgress?.(completed, moments.length);
        console.error(`[CLIP-EXTRACTOR] Failed to extract clip ${moment.id}:`, error.message);
        return { ...moment, error: error.message };
      }
    })
  );

  const settledResults = await Promise.all(promises);
  results.push(...settledResults);

  const successCount = results.filter((r) => r.clipPath).length;
  console.log(`[CLIP-EXTRACTOR] Extracted ${successCount}/${moments.length} clips`);

  return results;
}

export async function cleanupOldClips(outputDir: string = CLIPS_DIR, maxAgeHours: number = 24): Promise<number> {
  try {
    const files = await fs.readdir(outputDir);
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000;

    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(outputDir, file);
      try {
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs > maxAge) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      } catch {}
    }

    if (deletedCount > 0) {
      console.log(`[CLIP-EXTRACTOR] Cleaned up ${deletedCount} old clips`);
    }

    return deletedCount;
  } catch (error) {
    console.error("[CLIP-EXTRACTOR] Cleanup failed:", error);
    return 0;
  }
}

export async function getClipInfo(clipPath: string): Promise<{ duration: number; width: number; height: number } | null> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration -of json "${clipPath}"`
    );
    const data = JSON.parse(stdout);
    const stream = data.streams?.[0];
    if (stream) {
      return {
        duration: parseFloat(stream.duration) || 0,
        width: stream.width || 0,
        height: stream.height || 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}
