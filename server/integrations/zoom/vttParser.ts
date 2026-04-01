import type { ZoomUtterance } from "@shared/schema";

function parseTimestamp(ts: string): number {
  const parts = ts.split(":");
  if (parts.length === 3) {
    const [hours, minutes, rest] = parts;
    const [seconds, ms] = rest.split(".");
    return (
      parseInt(hours, 10) * 3600000 +
      parseInt(minutes, 10) * 60000 +
      parseInt(seconds, 10) * 1000 +
      parseInt(ms || "0", 10)
    );
  } else if (parts.length === 2) {
    const [minutes, rest] = parts;
    const [seconds, ms] = rest.split(".");
    return (
      parseInt(minutes, 10) * 60000 +
      parseInt(seconds, 10) * 1000 +
      parseInt(ms || "0", 10)
    );
  }
  return 0;
}

export function parseVtt(vttContent: string): ZoomUtterance[] {
  const utterances: ZoomUtterance[] = [];
  const lines = vttContent.split("\n").map((l) => l.trim());

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const timestampMatch = line.match(
      /^(\d{2}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}[.,]\d{3})$/
    );

    if (timestampMatch) {
      const startMs = parseTimestamp(timestampMatch[1].replace(",", "."));
      const endMs = parseTimestamp(timestampMatch[2].replace(",", "."));

      i++;
      const textLines: string[] = [];
      while (i < lines.length && lines[i] !== "") {
        textLines.push(lines[i]);
        i++;
      }

      const fullText = textLines.join(" ").trim();
      if (fullText) {
        let speaker: string | null = null;
        let text = fullText;

        const speakerMatch = fullText.match(/^([^:]+):\s*(.*)$/);
        if (speakerMatch) {
          speaker = speakerMatch[1].trim();
          text = speakerMatch[2].trim();
        }

        utterances.push({ startMs, endMs, speaker, text });
      }
    } else {
      i++;
    }
  }

  return utterances;
}

export function hasSpeakerLabels(utterances: ZoomUtterance[]): boolean {
  return utterances.some((u) => u.speaker !== null);
}
