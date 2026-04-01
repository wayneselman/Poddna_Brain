import type { ZoomUtterance } from "@shared/schema";

interface MeetJamieParseResult {
  title: string | null;
  executiveSummary: string | null;
  fullSummary: string | null;
  utterances: ZoomUtterance[];
}

function parseTimestamp(timeStr: string): number {
  const parts = timeStr.trim().split(":");
  if (parts.length === 2) {
    const [min, sec] = parts.map(Number);
    return (min * 60 + sec) * 1000;
  } else if (parts.length === 3) {
    const [hr, min, sec] = parts.map(Number);
    return (hr * 3600 + min * 60 + sec) * 1000;
  }
  return 0;
}

export function parseMeetJamieTranscript(content: string): MeetJamieParseResult {
  const lines = content.split("\n");
  const result: MeetJamieParseResult = {
    title: null,
    executiveSummary: null,
    fullSummary: null,
    utterances: [],
  };

  let currentSection: "header" | "exec" | "full" | "transcript" = "header";
  let execLines: string[] = [];
  let fullLines: string[] = [];

  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i].trim();
    
    if (i === 0 || (i === 1 && !result.title)) {
      const cleanLine = line.replace(/^\uFEFF/, "").trim();
      if (cleanLine && cleanLine !== "Executive Summary" && cleanLine !== "Full Summary" && cleanLine !== "Transcript") {
        result.title = cleanLine;
      }
    }

    if (line === "Executive Summary") {
      currentSection = "exec";
      i++;
      continue;
    }
    if (line === "Full Summary") {
      currentSection = "full";
      i++;
      continue;
    }
    if (line === "Transcript") {
      currentSection = "transcript";
      i++;
      continue;
    }
    if (line.startsWith("________________")) {
      i++;
      continue;
    }

    if (currentSection === "exec") {
      execLines.push(lines[i]);
    } else if (currentSection === "full") {
      fullLines.push(lines[i]);
    } else if (currentSection === "transcript") {
      const speakerMatch = line.match(/^(Speaker \d+|[A-Za-z]+ ?[A-Za-z]*):?\s*$/);
      if (speakerMatch) {
        const speaker = speakerMatch[1].replace(/:$/, "").trim();
        i++;
        
        if (i < lines.length) {
          const timestampLine = lines[i].trim();
          const tsMatch = timestampLine.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
          
          if (tsMatch) {
            const startMs = parseTimestamp(tsMatch[1]);
            const endMs = parseTimestamp(tsMatch[2]);
            i++;
            
            let textLines: string[] = [];
            while (i < lines.length) {
              const nextLine = lines[i].trim();
              if (nextLine.match(/^(Speaker \d+|[A-Za-z]+ ?[A-Za-z]*):?\s*$/) && 
                  i + 1 < lines.length && 
                  lines[i + 1].trim().match(/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/)) {
                break;
              }
              if (nextLine) {
                textLines.push(nextLine);
              }
              i++;
            }
            
            if (textLines.length > 0) {
              let text = textLines.join(" ").trim();
              text = text.replace(/\s*\.\.\.\[Truncated\]/g, "");
              
              result.utterances.push({
                speaker,
                startMs,
                endMs,
                text,
              });
            }
            continue;
          }
        }
      }
    }
    
    i++;
  }

  result.executiveSummary = execLines.join("\n").trim() || null;
  result.fullSummary = fullLines.join("\n").trim() || null;

  return result;
}

export function hasSpeakerLabels(utterances: ZoomUtterance[]): boolean {
  if (utterances.length === 0) return false;
  const uniqueSpeakers = new Set(utterances.map((u) => u.speaker));
  return uniqueSpeakers.size > 1 || !utterances[0].speaker?.startsWith("Speaker ");
}
