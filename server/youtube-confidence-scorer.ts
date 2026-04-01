import type { Episode, Podcast } from "@shared/schema";

export interface MatchSignals {
  titleMatch: number;
  durationDelta: number;
  channelMatch: number;
  dateMatch: number;
  fromChannel: boolean;
}

export interface ScoredCandidate {
  confidenceScore: number;
  signals: MatchSignals;
}

const AUTO_ACCEPT_THRESHOLD = 0.85;

export function computeConfidenceScore(
  episodeTitle: string,
  episodeDuration: number,
  episodePublishedAt: Date | null,
  podcast: Podcast | null,
  videoTitle: string,
  videoDurationSeconds: number | undefined,
  videoChannelId: string | undefined,
  videoPublishedAt: Date | undefined
): ScoredCandidate {
  const signals: MatchSignals = {
    titleMatch: 0,
    durationDelta: 0,
    channelMatch: 0,
    dateMatch: 0,
    fromChannel: false,
  };

  const titleScore = computeTitleSimilarity(episodeTitle, videoTitle);
  signals.titleMatch = titleScore;

  if (videoDurationSeconds !== undefined && episodeDuration > 0) {
    const durationDiffSeconds = Math.abs(videoDurationSeconds - episodeDuration);
    const tolerance = Math.max(episodeDuration * 0.15, 60);
    
    if (durationDiffSeconds <= tolerance) {
      signals.durationDelta = 1.0 - (durationDiffSeconds / tolerance) * 0.3;
    } else if (durationDiffSeconds <= episodeDuration * 0.3) {
      signals.durationDelta = 0.5;
    } else {
      signals.durationDelta = 0;
    }
  } else {
    signals.durationDelta = 0.5;
  }

  if (podcast?.youtubeChannelId && videoChannelId) {
    signals.channelMatch = podcast.youtubeChannelId === videoChannelId ? 1.0 : 0;
    signals.fromChannel = podcast.youtubeChannelId === videoChannelId;
  } else {
    signals.channelMatch = 0;
  }

  if (episodePublishedAt && videoPublishedAt) {
    const daysDiff = Math.abs(
      (episodePublishedAt.getTime() - videoPublishedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysDiff <= 3) {
      signals.dateMatch = 1.0;
    } else if (daysDiff <= 14) {
      signals.dateMatch = 0.7;
    } else if (daysDiff <= 60) {
      signals.dateMatch = 0.4;
    } else {
      signals.dateMatch = 0.1;
    }
  } else {
    signals.dateMatch = 0.3;
  }

  const weights = {
    title: 0.40,
    duration: 0.25,
    channel: 0.25,
    date: 0.10,
  };

  const rawScore = 
    signals.titleMatch * weights.title +
    signals.durationDelta * weights.duration +
    signals.channelMatch * weights.channel +
    signals.dateMatch * weights.date;

  const hasChannelMatch = signals.channelMatch > 0.9;
  const hasTitleMatch = signals.titleMatch > 0.5;
  const hasDurationMatch = signals.durationDelta > 0.7;

  let finalScore = rawScore;
  
  if (hasChannelMatch && hasTitleMatch && hasDurationMatch) {
    finalScore = Math.min(1.0, rawScore * 1.15);
  } else if (!hasChannelMatch && hasTitleMatch && hasDurationMatch) {
    finalScore = rawScore * 0.95;
  } else if (!hasChannelMatch && !hasDurationMatch) {
    finalScore = rawScore * 0.75;
  }

  return {
    confidenceScore: Math.round(finalScore * 1000) / 1000,
    signals,
  };
}

function computeTitleSimilarity(episodeTitle: string, videoTitle: string): number {
  const clean = (s: string) => s
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanEp = clean(episodeTitle);
  const cleanVid = clean(videoTitle);

  if (cleanEp === cleanVid) return 1.0;

  if (cleanVid.includes(cleanEp) || cleanEp.includes(cleanVid)) {
    return 0.9;
  }

  const epWords = cleanEp.split(' ').filter(w => w.length > 2);
  const vidWords = new Set(cleanVid.split(' ').filter(w => w.length > 2));

  if (epWords.length === 0) return 0;

  let matches = 0;
  for (const word of epWords) {
    if (vidWords.has(word)) {
      matches++;
    }
  }

  const wordMatchRatio = matches / epWords.length;

  const epNums: string[] = cleanEp.match(/\d+/g) || [];
  const vidNums: string[] = cleanVid.match(/\d+/g) || [];
  const numMatch = epNums.some(n => vidNums.includes(n)) ? 0.1 : 0;

  return Math.min(1.0, wordMatchRatio + numMatch);
}

export function shouldAutoAccept(score: number): boolean {
  return score >= AUTO_ACCEPT_THRESHOLD;
}

export function computeFallbackDeadline(hoursFromNow: number = 72): Date {
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + hoursFromNow);
  return deadline;
}
