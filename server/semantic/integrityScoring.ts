import type { StatementClassification, Statement } from "@shared/schema";

export interface IntegrityMetrics {
  claimDensity: number;
  avgCertainty: number;
  skepticalRatio: number;
  avgSentiment: number;
  emotionVariety: number;
  coverage: number;
}

export interface IntegrityComponents {
  claimDensityScore: number;
  certaintyScore: number;
  skepticScore: number;
  sentimentScore: number;
  emotionScore: number;
  coverageScore: number;
}

export interface IntegrityResult {
  score: number;
  band: "low" | "medium" | "high";
  metrics: IntegrityMetrics;
  components: IntegrityComponents;
  summary: string;
}

export function computeIntegrityScore(
  statements: Statement[],
  classifications: StatementClassification[],
  durationSeconds: number
): IntegrityResult {
  const stmtCount = statements.length;
  const classCount = classifications.length;
  
  if (stmtCount === 0 || durationSeconds <= 0) {
    return {
      score: 0,
      band: "low",
      metrics: { claimDensity: 0, avgCertainty: 0, skepticalRatio: 0, avgSentiment: 0, emotionVariety: 0, coverage: 0 },
      components: { claimDensityScore: 0, certaintyScore: 0, skepticScore: 0, sentimentScore: 0, emotionScore: 0, coverageScore: 0 },
      summary: "Insufficient data to calculate integrity score.",
    };
  }
  
  const durationMinutes = durationSeconds / 60;
  
  const claimClassifications = classifications.filter(c => c.claimFlag);
  const claimsPerMinute = claimClassifications.length / durationMinutes;
  const claimDensity = Math.min(claimsPerMinute / 3, 1);
  
  const avgCertainty = classCount > 0
    ? classifications.reduce((sum, c) => sum + c.certainty, 0) / classCount
    : 0;
  
  const skepticalCount = classifications.filter(c => c.polarity === "skeptical").length;
  const skepticalRatio = classCount > 0 ? skepticalCount / classCount : 0;
  
  const avgSentiment = classCount > 0
    ? classifications.reduce((sum, c) => sum + c.sentiment, 0) / classCount
    : 0;
  
  const emotionSet = new Set(classifications.map(c => c.emotionalTone.toLowerCase()));
  const emotionVariety = classCount > 0 ? emotionSet.size / classCount : 0;
  
  const coverage = stmtCount > 0 ? classCount / stmtCount : 0;
  
  const claimDensityScore = claimDensity * 20;
  
  const certaintyDeviation = Math.abs(avgCertainty - 0.65);
  const certaintyScore = (1 - Math.min(certaintyDeviation / 0.35, 1)) * 20;
  
  const skepticIdeal = Math.min(skepticalRatio / 0.3, 1);
  const skepticScore = skepticIdeal * 15;
  
  const sentimentNormalized = (avgSentiment + 1) / 2;
  const sentimentScore = sentimentNormalized * 10;
  
  const emotionIdeal = Math.min(emotionVariety / 0.2, 1);
  const emotionScore = emotionIdeal * 10;
  
  const coverageScore = coverage * 25;
  
  const totalScore = Math.round(
    claimDensityScore + certaintyScore + skepticScore + sentimentScore + emotionScore + coverageScore
  );
  
  const band: "low" | "medium" | "high" = totalScore < 40 ? "low" : totalScore <= 70 ? "medium" : "high";
  
  const metrics: IntegrityMetrics = {
    claimDensity: Math.round(claimsPerMinute * 100) / 100,
    avgCertainty: Math.round(avgCertainty * 100) / 100,
    skepticalRatio: Math.round(skepticalRatio * 100) / 100,
    avgSentiment: Math.round(avgSentiment * 100) / 100,
    emotionVariety: Math.round(emotionVariety * 100) / 100,
    coverage: Math.round(coverage * 100) / 100,
  };
  
  const components: IntegrityComponents = {
    claimDensityScore: Math.round(claimDensityScore * 10) / 10,
    certaintyScore: Math.round(certaintyScore * 10) / 10,
    skepticScore: Math.round(skepticScore * 10) / 10,
    sentimentScore: Math.round(sentimentScore * 10) / 10,
    emotionScore: Math.round(emotionScore * 10) / 10,
    coverageScore: Math.round(coverageScore * 10) / 10,
  };
  
  const summary = generateSummary(totalScore, band, metrics, components);
  
  return { score: totalScore, band, metrics, components, summary };
}

function generateSummary(
  score: number,
  band: "low" | "medium" | "high",
  metrics: IntegrityMetrics,
  components: IntegrityComponents
): string {
  const parts: string[] = [];
  
  if (band === "high") {
    parts.push(`This episode demonstrates strong content integrity with a score of ${score}/100.`);
  } else if (band === "medium") {
    parts.push(`This episode shows moderate content integrity with a score of ${score}/100.`);
  } else {
    parts.push(`This episode has limited integrity indicators with a score of ${score}/100.`);
  }
  
  if (metrics.claimDensity >= 2) {
    parts.push("The content is claim-rich, making frequent assertions.");
  } else if (metrics.claimDensity < 0.5) {
    parts.push("Claims are sparse; the episode is primarily conversational.");
  }
  
  if (metrics.avgCertainty > 0.8) {
    parts.push("Speakers express high certainty in their statements.");
  } else if (metrics.avgCertainty < 0.5) {
    parts.push("There is notable uncertainty or speculation in the discourse.");
  }
  
  if (metrics.skepticalRatio > 0.2) {
    parts.push("The content includes healthy skepticism and questioning.");
  }
  
  if (metrics.coverage < 0.5) {
    parts.push("Note: Classification coverage is partial; score may improve with more analysis.");
  }
  
  return parts.join(" ");
}
