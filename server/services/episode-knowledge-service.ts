import { storage } from "../storage";
import type { EpisodeSemanticSegment, EpisodeSegment } from "@shared/schema";

export type EpisodeKeyIdea = {
  id: string;
  title: string;
  summary: string;
  startTime: number;
  endTime: number;
  topicCategory?: string | null;
  subTopic?: string | null;
  importanceScore?: number | null;
  segmentIds: string[];
};

export type EpisodeKnowledge = {
  episodeId: string;
  keyIdeas: EpisodeKeyIdea[];
  relatedEpisodes: Array<{
    episodeId: string;
    title: string;
    podcastTitle: string;
    overlapTopics: string[];
    overlapScore: number;
  }>;
  relatedClaims: Array<{
    claimId: string;
    text: string;
    confidenceScore?: number | null;
    episodesCount?: number | null;
  }>;
};

type Cluster = {
  topicCategory: string | null;
  subTopic: string | null;
  segments: EpisodeSemanticSegment[];
};

export class EpisodeKnowledgeService {
  private readonly minSegmentsPerIdea = 2;
  private readonly maxIdeasPerEpisode = 8;
  private readonly adjacencyGapSeconds = 15;

  async getEpisodeKnowledge(episodeId: string): Promise<EpisodeKnowledge> {
    const episode = await storage.getEpisode(episodeId);
    if (!episode) {
      throw new Error(`Episode ${episodeId} not found`);
    }

    const semanticSegments = await storage.getSemanticSegmentsByEpisode(episodeId);
    if (!semanticSegments.length) {
      return {
        episodeId,
        keyIdeas: [],
        relatedEpisodes: [],
        relatedClaims: [],
      };
    }

    const segmentTexts = await this.loadSegmentTexts(episodeId, semanticSegments);

    const sorted = [...semanticSegments].sort(
      (a, b) => a.startTime - b.startTime
    );

    const clusters = this.buildAdjacentClusters(sorted);

    const candidateIdeas = this.buildCandidateIdeas(clusters, segmentTexts);

    let filteredIdeas = candidateIdeas.filter(
      (idea) => idea.segmentIds.length >= this.minSegmentsPerIdea
    );

    if (!filteredIdeas.length && candidateIdeas.length) {
      filteredIdeas = [...candidateIdeas]
        .sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0))
        .slice(0, 3);
    }

    filteredIdeas.sort(
      (a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0)
    );
    const keyIdeas = filteredIdeas.slice(0, this.maxIdeasPerEpisode);

    return {
      episodeId,
      keyIdeas,
      relatedEpisodes: [],
      relatedClaims: [],
    };
  }

  private async loadSegmentTexts(
    episodeId: string,
    semanticSegments: EpisodeSemanticSegment[]
  ): Promise<Map<string, string>> {
    const textsMap = new Map<string, string>();

    const segmentIds = semanticSegments
      .map((s) => s.segmentId)
      .filter((id): id is string => id !== null);

    if (segmentIds.length === 0) {
      return textsMap;
    }

    try {
      const episodeSegments = await storage.getEpisodeSegmentsByEpisode(episodeId);
      for (const seg of episodeSegments) {
        const text = seg.snippetText || seg.label || seg.summary || "";
        if (text) {
          textsMap.set(seg.id, text);
        }
      }
    } catch {
    }

    return textsMap;
  }

  private buildAdjacentClusters(sorted: EpisodeSemanticSegment[]): Cluster[] {
    const clusters: Cluster[] = [];

    for (const seg of sorted) {
      const topicCategory = seg.topicCategory ?? "General";
      const subTopic = seg.subTopic ?? "";
      const key = `${topicCategory}::${subTopic}`;

      const lastCluster = clusters[clusters.length - 1];
      const lastKey = lastCluster
        ? `${lastCluster.topicCategory ?? "General"}::${lastCluster.subTopic ?? ""}`
        : null;

      const lastEnd =
        lastCluster?.segments[lastCluster.segments.length - 1]?.endTime ??
        lastCluster?.segments[lastCluster.segments.length - 1]?.startTime ??
        0;

      const canMerge =
        lastCluster &&
        lastKey === key &&
        seg.startTime <= lastEnd + this.adjacencyGapSeconds;

      if (canMerge) {
        lastCluster.segments.push(seg);
      } else {
        clusters.push({
          topicCategory: topicCategory === "General" ? null : topicCategory,
          subTopic: subTopic || null,
          segments: [seg],
        });
      }
    }

    return clusters;
  }

  private buildCandidateIdeas(
    clusters: Cluster[],
    segmentTexts: Map<string, string>
  ): EpisodeKeyIdea[] {
    const ideas: EpisodeKeyIdea[] = [];

    for (const cluster of clusters) {
      const { segments, topicCategory, subTopic } = cluster;
      if (!segments.length) continue;

      const sortedByImportance = [...segments].sort(
        (a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0)
      );
      const anchor = sortedByImportance[0];

      const importanceAvg =
        segments.reduce((sum, s) => sum + (s.importanceScore ?? 0), 0) /
        (segments.length || 1);

      const startTime = Math.min(...segments.map((s) => s.startTime));
      const endTime = Math.max(...segments.map((s) => s.endTime));

      const rawTitle = subTopic || topicCategory || "Key idea";
      const title = this.titleFromTopic(rawTitle);

      const anchorText = anchor.segmentId
        ? segmentTexts.get(anchor.segmentId) ?? ""
        : "";
      const summary = this.buildSummary(anchorText, rawTitle, anchor.intent);

      ideas.push({
        id: `idea_${anchor.id}`,
        title,
        summary,
        startTime,
        endTime,
        topicCategory,
        subTopic,
        importanceScore: importanceAvg,
        segmentIds: segments.map((s) => s.id),
      });
    }

    return ideas;
  }

  private titleFromTopic(rawTitle: string): string {
    const trimmed = rawTitle.trim();
    if (!trimmed) return "Key idea";
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }

  private buildSummary(
    text: string,
    topic: string,
    intent?: string | null
  ): string {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (cleaned && cleaned.length > 10) {
      if (cleaned.length <= 160) return cleaned;
      return cleaned.slice(0, 157) + "…";
    }

    if (intent === "claim") {
      return `Key claim about ${topic || "this topic"}.`;
    }
    if (intent === "story") {
      return `A story about ${topic || "this topic"}.`;
    }
    if (intent === "question") {
      return `Discussion exploring ${topic || "this topic"}.`;
    }
    return `Important discussion about ${topic || "this idea"}.`;
  }
}

export const episodeKnowledgeService = new EpisodeKnowledgeService();
