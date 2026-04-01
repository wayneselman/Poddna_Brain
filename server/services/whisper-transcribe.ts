import { spawn } from "child_process";
import path from "path";
import fs from "fs";

interface WhisperSegment {
  text: string;
  start: number;
  end: number;
}

interface WhisperResult {
  segments: WhisperSegment[];
  language: string;
  duration: number;
}

export async function transcribeWithWhisper(audioPath: string, modelSize: string = "small"): Promise<WhisperResult> {
  const pythonScript = `
import sys
import json
from faster_whisper import WhisperModel

audio_path = sys.argv[1]
model_size = sys.argv[2]

model = WhisperModel(model_size, device="cpu", compute_type="int8")
segments_gen, info = model.transcribe(audio_path, beam_size=5, word_timestamps=False)

segments = []
for segment in segments_gen:
    segments.append({
        "text": segment.text.strip(),
        "start": round(segment.start, 3),
        "end": round(segment.end, 3)
    })

result = {
    "segments": segments,
    "language": info.language,
    "duration": round(info.duration, 3)
}

print(json.dumps(result))
`;

  return new Promise((resolve, reject) => {
    const tmpScript = path.join("/tmp", `whisper_transcribe_${Date.now()}.py`);
    fs.writeFileSync(tmpScript, pythonScript);

    const proc = spawn("python3", [tmpScript, audioPath, modelSize], {
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      try { fs.unlinkSync(tmpScript); } catch {}

      if (code !== 0) {
        console.error(`[WHISPER] Process exited with code ${code}`);
        console.error(`[WHISPER] stderr: ${stderr}`);
        reject(new Error(`Whisper transcription failed: ${stderr.slice(-500)}`));
        return;
      }

      try {
        const lines = stdout.trim().split("\n");
        const jsonLine = lines[lines.length - 1];
        const result: WhisperResult = JSON.parse(jsonLine);

        if (!result.segments || result.segments.length === 0) {
          reject(new Error("Whisper produced no transcript segments"));
          return;
        }

        console.log(`[WHISPER] Transcribed ${result.segments.length} segments, language: ${result.language}, duration: ${result.duration}s`);
        resolve(result);
      } catch (parseErr) {
        reject(new Error(`Failed to parse Whisper output: ${parseErr}`));
      }
    });

    proc.on("error", (err) => {
      try { fs.unlinkSync(tmpScript); } catch {}
      reject(new Error(`Failed to spawn Whisper process: ${err.message}`));
    });
  });
}

export async function downloadAudioFromYouTube(videoId: string): Promise<string> {
  const outputPath = path.join("/tmp", `yt_audio_${videoId}_${Date.now()}.mp3`);
  const proxyUrl = process.env.RESIDENTIAL_PROXY_URL;

  const args = [
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "5",
    "-o", outputPath,
    "--no-playlist",
    "--no-warnings",
  ];

  if (proxyUrl) {
    args.push("--proxy", proxyUrl);
    console.log(`[YT-DLP] Using residential proxy for audio download`);
  }

  args.push(`https://www.youtube.com/watch?v=${videoId}`);

  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    proc.stderr.on("data", (data) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      if (code !== 0) {
        console.error(`[YT-DLP] Audio download failed: ${stderr}`);
        reject(new Error(`Failed to download audio: ${stderr.slice(-300)}`));
        return;
      }

      const possiblePaths = [outputPath, outputPath.replace(".mp3", ".mp3.mp3")];
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          console.log(`[YT-DLP] Downloaded audio to ${p}`);
          resolve(p);
          return;
        }
      }

      const dir = path.dirname(outputPath);
      const files = fs.readdirSync(dir).filter(f => f.includes(videoId));
      if (files.length > 0) {
        const found = path.join(dir, files[0]);
        console.log(`[YT-DLP] Downloaded audio to ${found}`);
        resolve(found);
        return;
      }

      reject(new Error("Audio download completed but file not found"));
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}
