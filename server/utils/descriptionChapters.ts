interface ParsedChapter {
  startTime: number;
  title: string;
  rawMatch: string;
}

interface ParseResult {
  success: boolean;
  chapters: ParsedChapter[];
  errors: string[];
}

export function parseChaptersFromDescription(
  description: string,
  episodeDuration?: number
): ParseResult {
  if (!description || description.trim().length === 0) {
    return { success: false, chapters: [], errors: ["No description provided"] };
  }

  const chapters: ParsedChapter[] = [];
  const errors: string[] = [];

  // Clean HTML tags from description
  const cleanText = description
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');

  // Regex patterns for various timestamp formats:
  // (00:00) Title, (0:00) Title, (1:02:03) Title
  // 00:00 - Title, 0:00 – Title, 00:00: Title
  // [00:00] Title
  // 00:00 Title (when at start of line)
  const patterns = [
    // (HH:MM:SS) or (MM:SS) or (M:SS) followed by text
    /\((\d{1,2}):(\d{2}):(\d{2})\)\s*[-–:]?\s*(.+?)(?=\n|\(?\d{1,2}:\d{2}|$)/gm,
    /\((\d{1,2}):(\d{2})\)\s*[-–:]?\s*(.+?)(?=\n|\(?\d{1,2}:\d{2}|$)/gm,
    
    // [HH:MM:SS] or [MM:SS] followed by text
    /\[(\d{1,2}):(\d{2}):(\d{2})\]\s*[-–:]?\s*(.+?)(?=\n|\[?\d{1,2}:\d{2}|$)/gm,
    /\[(\d{1,2}):(\d{2})\]\s*[-–:]?\s*(.+?)(?=\n|\[?\d{1,2}:\d{2}|$)/gm,
    
    // HH:MM:SS or MM:SS at start of line, followed by separator and text
    /^(\d{1,2}):(\d{2}):(\d{2})\s*[-–:]\s*(.+?)$/gm,
    /^(\d{1,2}):(\d{2})\s*[-–:]\s*(.+?)$/gm,
    
    // HH:MM:SS or MM:SS followed directly by text (no separator)
    /^(\d{1,2}):(\d{2}):(\d{2})\s+(.+?)$/gm,
    /^(\d{1,2}):(\d{2})\s+(.+?)$/gm,
  ];

  // Try each pattern and collect matches
  const allMatches: { time: number; title: string; raw: string; index: number }[] = [];

  for (const pattern of patterns) {
    let match;
    const regex = new RegExp(pattern);
    
    while ((match = regex.exec(cleanText)) !== null) {
      let hours = 0, minutes = 0, seconds = 0;
      let title = "";

      if (match.length === 5) {
        // HH:MM:SS format
        hours = parseInt(match[1], 10);
        minutes = parseInt(match[2], 10);
        seconds = parseInt(match[3], 10);
        title = match[4].trim();
      } else if (match.length === 4) {
        // MM:SS format
        minutes = parseInt(match[1], 10);
        seconds = parseInt(match[2], 10);
        title = match[3].trim();
      }

      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      
      // Skip if title is empty or too short
      if (!title || title.length < 2) continue;
      
      // Clean up title
      title = title
        .replace(/\s+/g, " ")
        .replace(/^\s*[-–:]\s*/, "")
        .trim();

      // Skip duplicate timestamps (same time, same title)
      const isDuplicate = allMatches.some(
        m => m.time === totalSeconds && m.title.toLowerCase() === title.toLowerCase()
      );
      if (isDuplicate) continue;

      allMatches.push({
        time: totalSeconds,
        title,
        raw: match[0],
        index: match.index,
      });
    }
  }

  // Sort by time
  allMatches.sort((a, b) => a.time - b.time);

  // Remove duplicates with same time (keep first)
  const uniqueByTime = new Map<number, typeof allMatches[0]>();
  for (const m of allMatches) {
    if (!uniqueByTime.has(m.time)) {
      uniqueByTime.set(m.time, m);
    }
  }

  const sortedMatches = Array.from(uniqueByTime.values()).sort((a, b) => a.time - b.time);

  // Validate: need at least 2 chapters
  if (sortedMatches.length < 2) {
    return {
      success: false,
      chapters: [],
      errors: [`Found only ${sortedMatches.length} timestamp(s). Need at least 2 to create chapters.`],
    };
  }

  // Validate: timestamps should be monotonically increasing and within duration
  let prevTime = -1;
  for (const m of sortedMatches) {
    if (m.time < prevTime) {
      errors.push(`Timestamp ${formatSeconds(m.time)} appears out of order`);
    }
    if (episodeDuration && m.time > episodeDuration) {
      errors.push(`Timestamp ${formatSeconds(m.time)} exceeds episode duration ${formatSeconds(episodeDuration)}`);
    }
    prevTime = m.time;

    chapters.push({
      startTime: m.time,
      title: m.title,
      rawMatch: m.raw,
    });
  }

  return {
    success: chapters.length >= 2,
    chapters,
    errors,
  };
}

export function convertParsedChaptersToSegments(
  chapters: ParsedChapter[],
  episodeDuration: number
): Array<{
  startTime: number;
  endTime: number;
  label: string;
  segmentType: string;
}> {
  return chapters.map((chapter, index) => {
    const nextChapter = chapters[index + 1];
    const endTime = nextChapter ? nextChapter.startTime : episodeDuration;

    return {
      startTime: chapter.startTime,
      endTime,
      label: chapter.title,
      segmentType: "topic",
    };
  });
}

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}
