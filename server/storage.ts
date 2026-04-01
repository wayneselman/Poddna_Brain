import {
  type Podcast,
  type Episode,
  type TranscriptSegment,
  type Annotation,
  type AnnotationWithAuthor,
  type AnnotationWithMetadata,
  type AnnotationVote,
  type PendingAnnotationWithContext,
  type User,
  type MusicDetection,
  type SponsorSegment,
  type EpisodeClaim,
  type Category,
  type CategoryWithPodcastCount,
  type Entity,
  type EntityWithMentionCount,
  type EntityMention,
  type EntityMentionWithDetails,
  type EntityClick,
  type Clip,
  type ClipWithAuthor,
  type ClipWithFullMetadata,
  type EpisodeSegment,
  type FeatureFlag,
  type EpisodeSource,
  type Job,
  type JobFailure,
  type VideoEvent,
  type SourceTranscript,
  type SourceTranscriptSegment,
  type AnnotationReport,
  type AnnotationReportWithDetails,
  type EpisodeDiff,
  type AnalyzerRequest,
  type AnalyzerLead,
  type AdminNotification,
  type InsertAdminNotification,
  type EpisodeComment,
  type CommentSegmentLink,
  type EpisodeSemanticSegment,
  type InsertEpisodeSemanticSegment,
  type EpisodeCandidate,
  type InsertEpisodeCandidate,
  type InsertEpisodeComment,
  type InsertCommentSegmentLink,
  type InsertPodcast,
  type InsertEpisode,
  type InsertTranscriptSegment,
  type InsertAnnotation,
  type InsertMusicDetection,
  type InsertSponsorSegment,
  type InsertEpisodeClaim,
  type InsertCategory,
  type InsertEntity,
  type InsertEntityMention,
  type InsertEntityClick,
  type InsertClip,
  type InsertEpisodeSegment,
  type InsertFeatureFlag,
  type InsertEpisodeSource,
  type InsertJob,
  type InsertJobFailure,
  type InsertVideoEvent,
  type InsertSourceTranscript,
  type InsertSourceTranscriptSegment,
  type InsertAnnotationReport,
  type InsertEpisodeDiff,
  type InsertAnalyzerRequest,
  type InsertAnalyzerLead,
  type UpsertUser,
  type Statement,
  type InsertStatement,
  type StatementClassification,
  type InsertStatementClassification,
  type CanonicalEntity,
  type InsertCanonicalEntity,
  type EntityLink,
  type InsertEntityLink,
  type CanonicalEntityWithMentions,
  type Topic,
  type InsertTopic,
  type StatementTopic,
  type InsertStatementTopic,
  type StatementRelation,
  type InsertStatementRelation,
  type RelationScope,
  type EpisodeChapter,
  type InsertEpisodeChapter,
  type EpisodeHighlight,
  type InsertEpisodeHighlight,
  type ViralMoment,
  type InsertViralMoment,
  type ClipGenerationRun,
  type InsertClipGenerationRun,
  podcasts,
  episodes,
  transcriptSegments,
  annotations,
  annotationVotes,
  annotationReports,
  users,
  musicDetections,
  sponsorSegments,
  episodeClaims,
  episodeCandidates,
  categories,
  podcastCategories,
  entities,
  entityMentions,
  entityClicks,
  clips,
  statements,
  statementClassifications,
  episodeSegments,
  episodeChapters,
  episodeHighlights,
  viralMoments,
  clipGenerationRuns,
  featureFlags,
  episodeSources,
  jobs,
  jobFailures,
  videoEvents,
  sourceTranscripts,
  sourceTranscriptSegments,
  episodeComments,
  commentSegmentLinks,
  episodeDiffs,
  analyzerRequests,
  analyzerLeads,
  demoLeads,
  type DemoLead,
  type InsertDemoLead,
  adminNotifications,
  episodeSemanticSegments,
  canonicalEntities,
  entityLinks,
  integrityScores,
  topics,
  statementTopics,
  statementRelations,
  programs,
  programSources,
  ingestionEvents,
  ingestionRecommendations,
  userClipRequests,
  type UserClipRequest,
  type InsertUserClipRequest,
  clipOrders,
  type ClipOrder,
  type InsertClipOrder,
  type IntegrityScore,
  type InsertIntegrityScore,
  type EpisodeInsights,
  type IntegrityBand,
  type StatementPolarityType,
  type CanonicalEntityType,
  type Program,
  type InsertProgram,
  type ProgramSource,
  type InsertProgramSource,
  type IngestionEvent,
  type InsertIngestionEvent,
  type IngestionRecommendation,
  type InsertIngestionRecommendation,
  type ProgramConfig,
  episodeZoomAnalysis,
  type EpisodeZoomAnalysis,
  type InsertEpisodeZoomAnalysis,
  claimInstances,
  type ClaimInstance,
  type InsertClaimInstance,
  speakers,
  speakerAppearances,
  type Speaker,
  type InsertSpeaker,
  type SpeakerAppearance,
  type InsertSpeakerAppearance,
  type SpeakerWithAppearances,
  webhooks,
  webhookDeliveries,
  type Webhook,
  type InsertWebhook,
  type WebhookDelivery,
  type InsertWebhookDelivery,
  ingestionRequests,
  type IngestionRequest,
  type InsertIngestionRequest,
  brainApiKeys,
  type BrainApiKey,
  type InsertBrainApiKey,
  creatorLeads,
  type CreatorLead,
  type InsertCreatorLead,
  creatorProcessedEpisodes,
  type CreatorProcessedEpisode,
  type InsertCreatorProcessedEpisode,
  clipJobs,
  type ClipJob,
  type InsertClipJob,
  showProfiles,
  type ShowProfile,
  type InsertShowProfile,
  selmanPacks,
  type SelmanPack,
  type InsertSelmanPack,
  claimEnrichments,
  type ClaimEnrichment,
  type InsertClaimEnrichment,
  claimPrices,
  type ClaimPrice,
  type InsertClaimPrice,
  claimOutcomes,
  type ClaimOutcome,
  type InsertClaimOutcome,
  sourceCredibility,
  type SourceCredibility,
  type InsertSourceCredibility,
} from "@shared/schema";
import { db } from "./db";
import { eq, sql, and, not, notInArray, inArray, desc, asc, like, ilike, or, gte, lte, lt, ne, isNull, count, type SQL } from "drizzle-orm";

// Statement with optional classification data
export interface StatementWithClassification extends Statement {
  classification?: StatementClassification;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  createLocalUser(data: { email: string; passwordHash: string; firstName?: string; lastName?: string }): Promise<User>;
  updateUserProfile(id: string, data: { firstName?: string; lastName?: string; profileImageUrl?: string }): Promise<User | undefined>;
  updateUserPassword(id: string, passwordHash: string): Promise<User | undefined>;
  setPasswordResetToken(email: string, token: string, expires: Date): Promise<boolean>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  clearPasswordResetToken(id: string): Promise<void>;
  verifyUserEmail(id: string): Promise<User | undefined>;
  
  // User management methods
  getAllUsers(): Promise<User[]>;
  updateUserRole(id: string, role: string): Promise<User | undefined>;
  updateUserCertifications(id: string, certifications: string[]): Promise<User | undefined>;
  banUser(id: string, reason: string, bannedBy: string): Promise<User | undefined>;
  unbanUser(id: string): Promise<User | undefined>;
  bulkDeleteUsers(userIds: string[]): Promise<number>;
  updateUserYouTubeTokens(id: string, data: { accessToken: string; refreshToken: string; expiresAt: Date; channelId?: string; channelTitle?: string }): Promise<User | undefined>;
  getUsersWithYouTube(): Promise<User[]>;
  
  getAllPodcasts(): Promise<Podcast[]>;
  getPodcast(id: string): Promise<Podcast | undefined>;
  getPodcastByTitle(title: string): Promise<Podcast | undefined>;
  createPodcast(podcast: InsertPodcast): Promise<Podcast>;
  updatePodcast(id: string, data: Partial<InsertPodcast>): Promise<Podcast | undefined>;
  deletePodcast(id: string): Promise<boolean>;
  getFeaturedLandingPodcasts(): Promise<Podcast[]>;
  getFeaturedExplorePodcasts(): Promise<Podcast[]>;
  setPodcastFeaturedLanding(id: string, featured: boolean): Promise<Podcast | undefined>;
  setPodcastFeaturedExplore(id: string, featured: boolean): Promise<Podcast | undefined>;
  
  getAllEpisodes(): Promise<Episode[]>;
  getCuratedEpisodes(): Promise<Episode[]>;
  getEpisodesByPodcast(podcastId: string): Promise<Episode[]>;
  getEpisode(id: string): Promise<Episode | undefined>;
  createEpisode(episode: InsertEpisode): Promise<Episode>;
  updateEpisode(id: string, data: Partial<InsertEpisode>): Promise<Episode | undefined>;
  deleteEpisode(id: string): Promise<boolean>;
  updateEpisodeVisibility(id: string, visibility: string): Promise<Episode | undefined>;
  updateEpisodeSummary(id: string, summary: any): Promise<Episode | undefined>;
  getEpisodeInventory(): Promise<Array<{ id: string; title: string; podcastName: string; transcriptStatus: string; claimCount: number; momentCount: number; narrativeCount: number; visibility: string; publishedAt: Date | null; hasSummary: boolean; summaryUpdatedAt: string | null }>>;
  getEpisodesForKeyMoments(visibility?: string, limit?: number): Promise<Episode[]>;
  getEpisodesForNarratives(limit: number, minClaims: number): Promise<Episode[]>;
  
  getSegment(id: string): Promise<TranscriptSegment | undefined>;
  getSegmentsByEpisode(episodeId: string): Promise<TranscriptSegment[]>;
  getTranscriptSegmentsByTimeRange(episodeId: string, startTime: number, endTime: number): Promise<TranscriptSegment[]>;
  createSegment(segment: InsertTranscriptSegment): Promise<TranscriptSegment>;
  createTranscriptSegments(episodeId: string, segments: any[]): Promise<void>;
  updateTranscriptSegment(id: string, data: { startTime?: number; endTime?: number; text?: string; speaker?: string }): Promise<TranscriptSegment | undefined>;
  deleteAllSegmentsForEpisode(episodeId: string): Promise<number>;
  renameSpeaker(episodeId: string, oldName: string, newName: string): Promise<number>;
  
  getAnnotationsByEpisode(episodeId: string, options?: { userId?: string; sort?: "top" | "new" | "ai"; aiOnly?: boolean }): Promise<AnnotationWithAuthor[]>;
  getAnnotationsByUser(userId: string): Promise<AnnotationWithMetadata[]>;
  getAllAnnotations(): Promise<AnnotationWithAuthor[]>;
  getAnnotation(id: string): Promise<AnnotationWithAuthor | undefined>;
  createAnnotation(annotation: InsertAnnotation): Promise<Annotation>;
  updateAnnotation(id: string, content: string): Promise<Annotation | undefined>;
  deleteAnnotation(id: string): Promise<boolean>;
  getUserVote(userId: string, annotationId: string): Promise<AnnotationVote | undefined>;
  insertVote(userId: string, annotationId: string, type: "up" | "down"): Promise<Annotation>;
  updateVote(userId: string, annotationId: string, type: "up" | "down"): Promise<Annotation>;
  deleteVote(userId: string, annotationId: string): Promise<Annotation>;
  getAnnotationWithUserVote(annotationId: string, userId?: string): Promise<AnnotationWithAuthor & { userVote: "up" | "down" | null } | undefined>;
  getFeaturedAnnotations(): Promise<AnnotationWithMetadata[]>;
  setAnnotationFeatured(id: string, featured: boolean): Promise<Annotation | undefined>;
  setAnnotationHero(id: string, isHero: boolean): Promise<Annotation | undefined>;
  getHeroAnnotation(): Promise<AnnotationWithMetadata | undefined>;
  
  // Moderation queue methods
  getPendingAnnotations(opts: { limit: number; offset: number }): Promise<PendingAnnotationWithContext[]>;
  updateAnnotationStatus(id: string, input: { status: "pending" | "approved" | "rejected"; rejectionReason?: string | null }): Promise<Annotation | undefined>;
  promoteAiAnnotation(id: string): Promise<Annotation | undefined>;
  
  // Discovery methods
  getMostAnnotatedEpisodes(opts: { page: number; pageSize: number }): Promise<{
    episodes: {
      id: string;
      title: string;
      description: string | null;
      podcastId: string;
      podcastTitle: string;
      artworkUrl: string | null;
      audioUrl: string | null;
      pubDate: Date | null;
      annotationCount: number;
    }[];
    totalCount: number;
  }>;
  
  getMusicDetectionsByEpisode(episodeId: string): Promise<MusicDetection[]>;
  getTrendingMusic(limit?: number): Promise<(MusicDetection & { episodeTitle: string; podcastTitle: string; podcastArtworkUrl: string | null })[]>;
  createMusicDetection(detection: InsertMusicDetection): Promise<MusicDetection>;
  createMusicDetections(detections: InsertMusicDetection[]): Promise<MusicDetection[]>;
  deleteMusicDetectionsForEpisode(episodeId: string): Promise<number>;
  replaceMusicDetectionsForEpisode(episodeId: string, detections: InsertMusicDetection[]): Promise<MusicDetection[]>;

  // Sponsor segment methods
  getSponsorSegmentsByEpisode(episodeId: string): Promise<SponsorSegment[]>;
  replaceSponsorSegmentsForEpisode(episodeId: string, segments: InsertSponsorSegment[]): Promise<SponsorSegment[]>;

  // Semantic segment methods
  getSemanticSegmentsByEpisode(episodeId: string): Promise<EpisodeSemanticSegment[]>;
  insertSemanticSegments(segments: InsertEpisodeSemanticSegment[]): Promise<EpisodeSemanticSegment[]>;
  deleteSemanticSegmentsByEpisode(episodeId: string): Promise<void>;

  // Episode claim methods (AI-extracted claims)
  getClaimsByEpisodeId(episodeId: string): Promise<EpisodeClaim[]>;
  replaceClaimsForEpisode(episodeId: string, claims: InsertEpisodeClaim[]): Promise<EpisodeClaim[]>;
  
  // Episode candidate methods (YouTube identity resolution)
  getEpisodeCandidatesByEpisode(episodeId: string): Promise<EpisodeCandidate[]>;
  getEpisodeCandidate(id: string): Promise<EpisodeCandidate | undefined>;
  createEpisodeCandidate(candidate: InsertEpisodeCandidate): Promise<EpisodeCandidate>;
  updateEpisodeCandidate(id: string, data: Partial<InsertEpisodeCandidate>): Promise<EpisodeCandidate | undefined>;
  getPendingCandidates(limit?: number): Promise<EpisodeCandidate[]>;
  acceptCandidate(id: string, reviewedBy: string): Promise<EpisodeCandidate | undefined>;
  rejectCandidate(id: string, reviewedBy: string, reason?: string): Promise<EpisodeCandidate | undefined>;
  getEpisodesAwaitingReview(limit?: number): Promise<Episode[]>;
  getEpisodesPastFallback(): Promise<Episode[]>;

  // Category methods
  getAllCategories(): Promise<Category[]>;
  getCategoriesWithCounts(): Promise<CategoryWithPodcastCount[]>;
  getCategory(id: string): Promise<Category | undefined>;
  getCategoryBySlug(slug: string): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: string, data: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: string): Promise<boolean>;
  getPodcastsByCategory(categoryId: string): Promise<Podcast[]>;
  getCategoriesForPodcast(podcastId: string): Promise<Category[]>;
  assignCategoryToPodcast(podcastId: string, categoryId: string): Promise<void>;
  removeCategoryFromPodcast(podcastId: string, categoryId: string): Promise<void>;

  // Entity methods (products, books, restaurants, venues, etc.)
  getAllEntities(): Promise<Entity[]>;
  getEntitiesWithStats(): Promise<EntityWithMentionCount[]>;
  getEntity(id: string): Promise<Entity | undefined>;
  getEntityByName(name: string): Promise<Entity | undefined>;
  searchEntities(query: string, type?: string): Promise<Entity[]>;
  createEntity(entity: InsertEntity): Promise<Entity>;
  updateEntity(id: string, data: Partial<InsertEntity>): Promise<Entity | undefined>;
  deleteEntity(id: string): Promise<boolean>;

  // Entity mention methods
  getEntityMentionsByEpisode(episodeId: string): Promise<EntityMentionWithDetails[]>;
  getApprovedEntityMentionsByEpisode(episodeId: string): Promise<EntityMentionWithDetails[]>;
  getEntityMentionByEpisodeAndEntity(episodeId: string, entityId: string): Promise<EntityMention | undefined>;
  getEpisodesByEntity(entityId: string): Promise<{ episodeId: string; episodeTitle: string; podcastTitle: string; mentionCount: number; mentionId: string; isApproved: boolean }[]>;
  createEntityMention(mention: InsertEntityMention): Promise<EntityMention>;
  approveEntityMention(id: string): Promise<EntityMention | undefined>;
  unapproveEntityMention(id: string): Promise<EntityMention | undefined>;
  deleteEntityMention(id: string): Promise<boolean>;
  
  // Entity click tracking
  logEntityClick(data: InsertEntityClick): Promise<EntityClick>;
  getEntityClickStats(entityId: string): Promise<{ totalClicks: number; last30Days: number }>;

  // Affiliate aggregation methods
  getTopEntitiesWithMentions(options?: { 
    type?: string; 
    minMentions?: number; 
    limit?: number 
  }): Promise<{
    id: string;
    name: string;
    type: string;
    description: string | null;
    affiliateNetwork: string | null;
    affiliateUrl: string | null;
    mentionCount: number;
    episodeCount: number;
    speakers: string[];
    quotes: { text: string; episodeId: string; episodeTitle: string; timestamp: number | null }[];
  }[]>;

  // Clips methods
  getAllClipsWithMetadata(): Promise<ClipWithFullMetadata[]>;
  getClipsByEpisode(episodeId: string): Promise<ClipWithAuthor[]>;
  getClipsByUser(userId: string): Promise<Clip[]>;
  getClip(id: string): Promise<ClipWithAuthor | undefined>;
  getClipWithMetadata(id: string): Promise<ClipWithFullMetadata | undefined>;
  createClip(clip: InsertClip): Promise<Clip>;
  deleteClip(id: string): Promise<boolean>;

  // Episode Segments methods (AI-generated topic/chapter markers)
  getEpisodeSegmentsByEpisode(episodeId: string): Promise<EpisodeSegment[]>;
  getEpisodeSegment(id: string): Promise<EpisodeSegment | undefined>;
  createEpisodeSegment(segment: InsertEpisodeSegment): Promise<EpisodeSegment>;
  createEpisodeSegments(segments: InsertEpisodeSegment[]): Promise<EpisodeSegment[]>;
  updateEpisodeSegment(id: string, data: Partial<InsertEpisodeSegment>): Promise<EpisodeSegment | undefined>;
  deleteEpisodeSegment(id: string): Promise<boolean>;
  deleteEpisodeSegmentsByEpisode(episodeId: string): Promise<number>;

  // Episode Chapters methods (curated navigation chapters, V1 spec)
  getEpisodeChaptersByEpisode(episodeId: string): Promise<EpisodeChapter[]>;
  createEpisodeChapter(chapter: InsertEpisodeChapter): Promise<EpisodeChapter>;
  createEpisodeChapters(chapters: InsertEpisodeChapter[]): Promise<EpisodeChapter[]>;
  deleteEpisodeChaptersByEpisode(episodeId: string): Promise<number>;

  // Episode Highlights methods (shareable key moments)
  getEpisodeHighlightsByEpisode(episodeId: string): Promise<EpisodeHighlight[]>;
  createEpisodeHighlights(highlights: InsertEpisodeHighlight[]): Promise<EpisodeHighlight[]>;
  deleteEpisodeHighlightsByEpisode(episodeId: string): Promise<number>;

  // Viral Moments methods (TikTok/Reels-worthy clips)
  getViralMomentsByEpisode(episodeId: string): Promise<ViralMoment[]>;
  createViralMoments(moments: InsertViralMoment[]): Promise<ViralMoment[]>;
  deleteViralMoment(id: string): Promise<boolean>;
  deleteViralMomentsByEpisode(episodeId: string): Promise<number>;
  getTopViralMoments(limit?: number): Promise<ViralMoment[]>;
  getViralMoment(id: string): Promise<ViralMoment | undefined>;
  updateViralMomentClipStatus(id: string, status: string, videoPath?: string | null, error?: string | null): Promise<ViralMoment | undefined>;
  updateViralMomentCaptionedPath(id: string, captionedPath: string): Promise<ViralMoment | undefined>;
  updateViralMomentOptimizedPath(id: string, optimizedPath: string, platform?: string): Promise<ViralMoment | undefined>;
  updateViralMomentPosting(id: string, updates: { postingStatus?: string; description?: string; hashtags?: string[]; postedAt?: Date; postUrl?: string }): Promise<ViralMoment | undefined>;
  updateViralMomentMetrics(id: string, metrics: { views?: number; likes?: number; comments?: number; shares?: number }): Promise<ViralMoment | undefined>;
  getViralMomentsPendingExtraction(limit?: number): Promise<ViralMoment[]>;
  getAllViralMomentsNeedingClips(limit?: number): Promise<ViralMoment[]>;
  getViralMomentsPendingCaptions(limit?: number): Promise<ViralMoment[]>;
  getViralMomentsReadyForPosting(limit?: number): Promise<ViralMoment[]>;
  getViralMomentsPosted(limit?: number): Promise<ViralMoment[]>;

  // Clip Generation Runs methods
  createClipGenerationRun(run: InsertClipGenerationRun): Promise<ClipGenerationRun>;
  updateClipGenerationRun(id: string, updates: Partial<InsertClipGenerationRun>): Promise<ClipGenerationRun | undefined>;
  getClipGenerationRuns(limit?: number): Promise<ClipGenerationRun[]>;
  getLatestClipGenerationRun(): Promise<ClipGenerationRun | undefined>;

  // Episode Comments methods (YouTube comments for sentiment analysis)
  getCommentsByEpisode(episodeId: string): Promise<EpisodeComment[]>;
  createEpisodeComment(comment: InsertEpisodeComment): Promise<EpisodeComment>;
  deleteCommentsByEpisode(episodeId: string): Promise<number>;

  // Comment Segment Links methods (sentiment analysis linking)
  createCommentSegmentLink(link: InsertCommentSegmentLink): Promise<CommentSegmentLink>;
  getSegmentLinksByComment(commentId: string): Promise<CommentSegmentLink[]>;
  getCommentsBySegment(segmentId: string): Promise<(CommentSegmentLink & { comment: EpisodeComment })[]>;
  getCommentSegmentLinksByEpisode(episodeId: string): Promise<CommentSegmentLink[]>;
  deleteSegmentLinksByEpisode(episodeId: string): Promise<number>;
  updateSegmentEngagement(segmentId: string, engagementScore: number, sentimentSummary: object): Promise<void>;

  // Feature Flags methods
  getFeatureFlag(key: string): Promise<FeatureFlag | undefined>;
  getAllFeatureFlags(): Promise<FeatureFlag[]>;
  setFeatureFlag(key: string, value: string, description?: string, updatedBy?: string): Promise<FeatureFlag>;
  deleteFeatureFlag(key: string): Promise<boolean>;

  // Episode Sources methods (multi-source support)
  getEpisodeSourcesByEpisode(episodeId: string): Promise<EpisodeSource[]>;
  getEpisodeSource(id: string): Promise<EpisodeSource | undefined>;
  getEpisodeSourceByUrl(episodeId: string, sourceUrl: string): Promise<EpisodeSource | undefined>;
  getEpisodeSourceByYouTubeId(youtubeVideoId: string): Promise<EpisodeSource | undefined>;
  getCanonicalSource(episodeId: string): Promise<EpisodeSource | undefined>;
  createEpisodeSource(source: InsertEpisodeSource): Promise<EpisodeSource>;
  updateEpisodeSource(id: string, data: Partial<InsertEpisodeSource>): Promise<EpisodeSource | undefined>;
  deleteEpisodeSource(id: string): Promise<boolean>;
  setCanonicalSource(episodeId: string, sourceId: string): Promise<EpisodeSource | undefined>;

  // Jobs methods (generic job system)
  getJob(id: string): Promise<Job | undefined>;
  getJobsByEpisodeSource(episodeSourceId: string): Promise<Job[]>;
  getJobsByStatus(status: string, limit?: number): Promise<Job[]>;
  countJobsByStatus(status: string): Promise<number>;
  getJobsByType(type: string, status?: string): Promise<Job[]>;
  getJobByTypeAndSource(type: string, episodeSourceId: string): Promise<Job | undefined>;
  getAllJobs(limit?: number): Promise<Job[]>;
  getAllEpisodesWithTranscripts(): Promise<Episode[]>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: string, data: Partial<InsertJob>): Promise<Job | undefined>;
  updateJobWhereStatus(id: string, expectedStatus: string, data: Partial<InsertJob>): Promise<Job | null>;
  getStuckJobs(stuckThresholdMinutes?: number): Promise<Job[]>;
  getOrphanedRunningJobs(currentWorkerId: string): Promise<Job[]>;
  retryJob(id: string): Promise<Job | undefined>;
  deleteJob(id: string): Promise<boolean>;
  cancelJob(id: string): Promise<Job | undefined>;
  
  // Orphan episode detection (stuck in pending without active jobs)
  getOrphanedEpisodes(stuckHours?: number): Promise<Array<{ id: string; title: string; transcriptStatus: string; updatedAt: Date; jobCount: number }>>;

  // Job Failures methods (permanent failure tracking)
  insertJobFailure(input: InsertJobFailure): Promise<JobFailure>;
  getRecentJobFailures(limit?: number, offset?: number): Promise<JobFailure[]>;

  // Annotation Reports methods (user reports for moderation)
  createAnnotationReport(report: InsertAnnotationReport): Promise<AnnotationReport>;
  getAnnotationReports(opts: { status?: string; limit?: number; offset?: number }): Promise<AnnotationReportWithDetails[]>;
  getAnnotationReportsByAnnotation(annotationId: string): Promise<AnnotationReport[]>;
  getAnnotationReportCountByStatus(): Promise<{ status: string; count: number }[]>;
  updateAnnotationReportStatus(id: string, data: { status: string; reviewedBy: string; resolution?: string }): Promise<AnnotationReport | undefined>;
  hasUserReportedAnnotation(userId: string, annotationId: string): Promise<boolean>;

  // Video Events methods (AI-generated from video analysis)
  getVideoEventsByEpisodeSource(episodeSourceId: string): Promise<VideoEvent[]>;
  getVideoEventsByEpisodeSourceAndType(episodeSourceId: string, eventType: string): Promise<VideoEvent[]>;
  getVideoEventsByEpisode(episodeId: string): Promise<VideoEvent[]>;
  getVideoEvent(id: string): Promise<VideoEvent | undefined>;
  createVideoEvent(event: InsertVideoEvent): Promise<VideoEvent>;
  createVideoEvents(events: InsertVideoEvent[]): Promise<VideoEvent[]>;
  deleteVideoEventsByEpisodeSource(episodeSourceId: string): Promise<number>;

  // Source Transcripts methods (per-source transcripts for video/YouTube)
  getSourceTranscriptsByEpisodeSource(episodeSourceId: string): Promise<SourceTranscript[]>;
  getSourceTranscript(id: string): Promise<SourceTranscript | undefined>;
  getSourceTranscriptSegments(sourceTranscriptId: string): Promise<SourceTranscriptSegment[]>;
  getSourceTranscriptSegmentsByEpisodeSource(episodeSourceId: string): Promise<SourceTranscriptSegment[]>;
  createSourceTranscript(transcript: InsertSourceTranscript): Promise<SourceTranscript>;
  createSourceTranscriptSegments(segments: InsertSourceTranscriptSegment[]): Promise<SourceTranscriptSegment[]>;
  deleteSourceTranscriptsByEpisodeSource(episodeSourceId: string): Promise<number>;

  // Episode Diffs methods (Integrity Engine)
  createEpisodeDiff(diff: InsertEpisodeDiff): Promise<EpisodeDiff>;
  getLatestEpisodeDiff(episodeId: string): Promise<EpisodeDiff | undefined>;
  getEpisodeDiffsByEpisode(episodeId: string): Promise<EpisodeDiff[]>;
  getEpisodeDiff(id: string): Promise<EpisodeDiff | undefined>;
  
  // Analyzer Requests (PLG / Public Analysis)
  createAnalyzerRequest(data: InsertAnalyzerRequest): Promise<AnalyzerRequest>;
  getAnalyzerRequest(id: string): Promise<AnalyzerRequest | undefined>;
  updateAnalyzerRequestStatus(id: string, status: string, errorMessage?: string): Promise<AnalyzerRequest | undefined>;
  updateAnalyzerRequestResults(id: string, results: any): Promise<AnalyzerRequest | undefined>;
  getAnalyzerRequestByYoutubeUrl(youtubeUrl: string): Promise<AnalyzerRequest | undefined>;
  
  // Analyzer Leads (PLG Lead Capture)
  createAnalyzerLead(data: InsertAnalyzerLead): Promise<AnalyzerLead>;

  // Demo Leads (B2B Lead Capture)
  createDemoLead(data: InsertDemoLead): Promise<DemoLead>;

  // Admin Notifications methods
  createAdminNotification(data: InsertAdminNotification): Promise<AdminNotification>;
  getAdminNotifications(status: "unread" | "all", limit?: number, offset?: number): Promise<{ notifications: AdminNotification[]; total: number }>;
  getUnreadNotificationCount(): Promise<number>;
  markNotificationRead(id: string): Promise<AdminNotification | undefined>;
  markAllNotificationsRead(): Promise<number>;

  // Statement methods (Semantic Engine)
  getStatementsByEpisode(episodeId: string): Promise<Statement[]>;
  replaceStatementsForEpisode(episodeId: string, statements: InsertStatement[]): Promise<Statement[]>;
  clearStatementsForEpisode(episodeId: string): Promise<void>;
  appendStatements(stmts: InsertStatement[]): Promise<void>;
  deduplicateStatements(episodeId: string): Promise<number>;
  populateEmbeddingVectors(episodeId: string): Promise<number>;
  
  // Statement Classification methods (Semantic Engine)
  getClassificationsByEpisode(episodeId: string): Promise<StatementClassification[]>;
  getClassificationsWithStatementsByEpisode(episodeId: string): Promise<StatementWithClassification[]>;
  upsertClassifications(classifications: InsertStatementClassification[]): Promise<StatementClassification[]>;
  deleteClassificationsByEpisode(episodeId: string): Promise<number>;

  // Canonical Entity methods (Knowledge Graph)
  findCanonicalEntityByNameAndType(name: string, type: string): Promise<CanonicalEntity | undefined>;
  createCanonicalEntity(entity: InsertCanonicalEntity): Promise<CanonicalEntity>;
  linkMentionToCanonical(link: InsertEntityLink): Promise<EntityLink>;
  getEntityLinkByMentionId(mentionId: string): Promise<EntityLink | undefined>;
  getCanonicalEntitiesForEpisode(episodeId: string): Promise<CanonicalEntityWithMentions[]>;
  getMentionsForCanonicalEntity(canonicalId: string): Promise<Array<{ mentionId: string; episodeId: string; rawText: string | null; timestamp: number | null; method: string; confidence: number }>>;
  deleteEntityLinksForEpisode(episodeId: string): Promise<number>;
  
  // Canonical Entity Admin methods (Phase 3b)
  getCanonicalEntitiesWithStats(options: { q?: string; type?: string; limit?: number; offset?: number }): Promise<{ items: Array<{ id: string; name: string; type: string; mentionCount: number; episodeCount: number }>; total: number }>;
  getCanonicalEntityById(id: string): Promise<CanonicalEntity | undefined>;
  getCanonicalEntityWithMentions(id: string): Promise<{ entity: CanonicalEntity; mentions: Array<{ mentionId: string; rawText: string | null; episodeId: string; episodeTitle: string; startTime: number | null; statementText: string | null }> } | undefined>;
  updateCanonicalEntity(id: string, data: Partial<InsertCanonicalEntity>): Promise<CanonicalEntity | undefined>;
  mergeCanonicalEntities(sourceId: string, targetId: string): Promise<{ mergedCount: number }>;
  getEpisodesWithUnlinkedMentions(): Promise<string[]>;

  // Integrity Score methods (Semantic Engine)
  getIntegrityScore(episodeId: string): Promise<IntegrityScore | undefined>;
  upsertIntegrityScore(data: InsertIntegrityScore): Promise<IntegrityScore>;

  // Topic methods (Semantic Clusters - Phase 4)
  createTopic(data: InsertTopic): Promise<Topic>;
  findTopicByName(name: string): Promise<Topic | undefined>;
  updateTopic(id: string, data: Partial<InsertTopic>): Promise<Topic | undefined>;
  getTopicsWithStats(options: { q?: string; limit?: number; offset?: number }): Promise<{ items: Array<{ id: string; name: string; description: string | null; statementCount: number; episodeCount: number; createdAt: Date }>; total: number }>;
  getTopicById(id: string): Promise<Topic | undefined>;
  getTopicWithStatements(id: string): Promise<{ topic: Topic; statements: Array<{ statementId: string; episodeId: string; episodeTitle: string; startTime: number; text: string; isPrimary: boolean; confidence: number }> } | undefined>;
  getAllTopicsWithEmbeddings(): Promise<Topic[]>;
  deleteTopic(id: string): Promise<boolean>;
  
  // Statement-Topic linking methods (Phase 4)
  linkStatementToTopic(data: InsertStatementTopic): Promise<StatementTopic>;
  linkStatementsToTopics(links: InsertStatementTopic[]): Promise<StatementTopic[]>;
  getStatementsWithoutTopics(limit?: number): Promise<Array<{ id: string; text: string; embedding: any }>>;
  getStatementTopicLinks(statementId: string): Promise<StatementTopic[]>;
  getCandidateStatementsForTopicDiscovery(limit: number, minLength: number): Promise<Array<{ id: string; text: string; episodeId: string; episodeTitle: string }>>;

  // Statement Relations methods (Phase 5)
  getRelationsByEpisode(episodeId: string): Promise<Array<{
    id: string;
    relation: string;
    confidence: number;
    statementAId: string;
    statementBId: string;
    statementAText: string;
    statementBText: string;
    statementAStartTime: number;
    statementBStartTime: number;
  }>>;
  upsertRelation(data: InsertStatementRelation): Promise<StatementRelation>;
  deleteRelationsForEpisode(episodeId: string, scope?: RelationScope): Promise<number>;
  getStatementsWithRelationContext(episodeId: string): Promise<Array<{
    id: string;
    text: string;
    startTime: number;
    claimFlag: boolean;
    topicIds: string[];
    canonicalEntityIds: string[];
  }>>;

  // Episode Insights (Phase 7 - Public Aggregation)
  getEpisodeInsights(episodeId: string): Promise<EpisodeInsights>;

  // Ingestion Programs methods (Phase 9)
  getAllPrograms(): Promise<Program[]>;
  getProgram(id: string): Promise<Program | undefined>;
  createProgram(data: InsertProgram): Promise<Program>;
  updateProgram(id: string, data: Partial<InsertProgram>): Promise<Program | undefined>;
  updateProgramLastAgentRun(id: string): Promise<void>;
  deleteProgram(id: string): Promise<boolean>;

  // Program Sources methods
  getProgramSources(programId: string): Promise<ProgramSource[]>;
  getProgramSource(id: string): Promise<ProgramSource | undefined>;
  createProgramSource(data: InsertProgramSource): Promise<ProgramSource>;
  updateProgramSource(id: string, data: Partial<InsertProgramSource>): Promise<ProgramSource | undefined>;
  deleteProgramSource(id: string): Promise<boolean>;
  updateProgramSourcePolledAt(id: string): Promise<void>;

  // Ingestion Events methods
  getUnprocessedEvents(programId: string, limit?: number): Promise<IngestionEvent[]>;
  createIngestionEvent(data: InsertIngestionEvent): Promise<IngestionEvent>;
  markEventsProcessed(eventIds: string[]): Promise<void>;
  getRecentEvents(programId: string, limit?: number): Promise<IngestionEvent[]>;
  getIngestionEvent(id: string): Promise<IngestionEvent | undefined>;
  updateIngestionEvent(id: string, data: { actionStatus?: string; episodeId?: string | null; processedAt?: Date | null }): Promise<IngestionEvent | undefined>;
  getEventsByIds(ids: string[]): Promise<IngestionEvent[]>;

  // Ingestion Recommendations methods
  getPendingRecommendations(programId?: string): Promise<IngestionRecommendation[]>;
  createRecommendation(data: InsertIngestionRecommendation): Promise<IngestionRecommendation>;
  createRecommendations(data: InsertIngestionRecommendation[]): Promise<IngestionRecommendation[]>;
  approveRecommendation(id: string, userId: string): Promise<IngestionRecommendation | undefined>;
  rejectRecommendation(id: string, userId: string): Promise<IngestionRecommendation | undefined>;
  executeRecommendation(id: string): Promise<IngestionRecommendation | undefined>;
  getRecommendationsByAgentRun(agentRunId: string): Promise<IngestionRecommendation[]>;
  getDailyRecommendationCounts(programId: string): Promise<{ catalog: number; tier1: number }>;

  // Speaker Identity Graph methods
  getSpeaker(id: string): Promise<Speaker | undefined>;
  getSpeakerByName(name: string): Promise<Speaker | undefined>;
  getAllSpeakers(limit?: number, offset?: number): Promise<Speaker[]>;
  createSpeaker(data: InsertSpeaker): Promise<Speaker>;
  updateSpeaker(id: string, data: Partial<InsertSpeaker>): Promise<Speaker | undefined>;
  getSpeakerAppearances(speakerId: string): Promise<SpeakerAppearance[]>;
  getEpisodeSpeakers(episodeId: string): Promise<(SpeakerAppearance & { speaker: Speaker })[]>;
  createSpeakerAppearance(data: InsertSpeakerAppearance): Promise<SpeakerAppearance>;
  getSpeakerWithAppearances(speakerId: string): Promise<SpeakerWithAppearances | undefined>;
  searchSpeakers(query: string, limit?: number): Promise<Speaker[]>;

  // Webhook methods
  getWebhooks(): Promise<Webhook[]>;
  getActiveWebhooksForEvent(eventType: string): Promise<Webhook[]>;
  createWebhook(data: InsertWebhook): Promise<Webhook>;
  updateWebhook(id: string, data: Partial<InsertWebhook>): Promise<Webhook | undefined>;
  deleteWebhook(id: string): Promise<boolean>;
  createWebhookDelivery(data: InsertWebhookDelivery): Promise<WebhookDelivery>;
  incrementWebhookFailure(id: string): Promise<void>;
  resetWebhookFailure(id: string): Promise<void>;

  // Ingestion Request methods
  getIngestionRequest(id: string): Promise<IngestionRequest | undefined>;
  getIngestionRequests(status?: string, limit?: number): Promise<IngestionRequest[]>;
  createIngestionRequest(data: InsertIngestionRequest): Promise<IngestionRequest>;
  updateIngestionRequest(id: string, data: Partial<IngestionRequest>): Promise<IngestionRequest | undefined>;

  // Brain API Key methods
  createBrainApiKey(data: InsertBrainApiKey): Promise<BrainApiKey>;
  getBrainApiKeyByHash(keyHash: string): Promise<BrainApiKey | undefined>;
  listBrainApiKeys(): Promise<BrainApiKey[]>;
  revokeBrainApiKey(id: string): Promise<boolean>;
  updateBrainApiKey(id: string, data: Partial<{ name: string; scopes: string[]; rateLimitPerMin: number; isActive: boolean }>): Promise<BrainApiKey | undefined>;
  touchBrainApiKeyLastUsed(id: string): Promise<void>;

  // Creator Leads
  createCreatorLead(data: InsertCreatorLead): Promise<CreatorLead>;
  getCreatorLeadsByEmail(email: string): Promise<CreatorLead[]>;

  // Creator Processed Episodes
  createCreatorProcessedEpisode(data: InsertCreatorProcessedEpisode): Promise<CreatorProcessedEpisode>;
  getCreatorProcessedEpisodes(userId: string): Promise<CreatorProcessedEpisode[]>;
  getCreatorProcessedEpisodeByUserAndEpisode(userId: string, episodeId: string): Promise<CreatorProcessedEpisode | undefined>;
  deleteCreatorProcessedEpisode(id: string, userId: string): Promise<boolean>;
  updateEpisodeTags(id: string, userId: string, tags: string[]): Promise<boolean>;
  getDistinctTags(userId: string): Promise<string[]>;

  // User Stripe / Clip Counter
  updateUserStripeFields(userId: string, data: Partial<{ stripeCustomerId: string; stripeSubscriptionId: string; subscriptionTier: string }>): Promise<User | undefined>;
  incrementClipsDownloaded(userId: string): Promise<number>;

  // Clip Jobs (Creator MP4 pipeline)
  createClipJob(data: InsertClipJob): Promise<ClipJob>;
  getClipJob(id: string): Promise<ClipJob | undefined>;
  getClipJobsByUser(userId: string, limit?: number): Promise<ClipJob[]>;
  updateClipJob(id: string, data: Partial<InsertClipJob>): Promise<ClipJob | undefined>;
  deleteClipJob(id: string, userId: string): Promise<boolean>;

  // Show Profiles (Show Intelligence)
  upsertShowProfile(podcastId: string, data: Partial<InsertShowProfile>, tagFilter?: string | null): Promise<ShowProfile>;
  getShowProfile(podcastId: string, tagFilter?: string | null): Promise<ShowProfile | undefined>;
  getShowProfilesForPodcasts(podcastIds: string[]): Promise<ShowProfile[]>;

  // Selman Packs methods
  upsertSelmanPack(data: InsertSelmanPack): Promise<SelmanPack>;
  getSelmanPackByEpisodeId(episodeId: string): Promise<SelmanPack | undefined>;

  // Batch helpers (N+1 query prevention)
  getEpisodesByIds(ids: string[]): Promise<Episode[]>;
  getViralMomentCountsByEpisodeIds(ids: string[]): Promise<Record<string, number>>;
  getViralMomentsByIds(ids: string[]): Promise<ViralMoment[]>;
}

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createLocalUser(data: { email: string; passwordHash: string; firstName?: string; lastName?: string }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        authProvider: "local",
        emailVerified: false,
      })
      .returning();
    return user;
  }

  async updateUserPassword(id: string, passwordHash: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async setPasswordResetToken(email: string, token: string, expires: Date): Promise<boolean> {
    const result = await db
      .update(users)
      .set({
        passwordResetToken: token,
        passwordResetExpires: expires,
        updatedAt: new Date(),
      })
      .where(eq(users.email, email))
      .returning();
    return result.length > 0;
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.passwordResetToken, token));
    return user;
  }

  async clearPasswordResetToken(id: string): Promise<void> {
    await db
      .update(users)
      .set({
        passwordResetToken: null,
        passwordResetExpires: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
  }

  async verifyUserEmail(id: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        emailVerified: true,
        emailVerificationToken: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // First check if user exists by ID
    const existingById = userData.id ? await db
      .select()
      .from(users)
      .where(eq(users.id, userData.id))
      .limit(1) : [];
    
    if (existingById[0] && userData.id) {
      const [user] = await db
        .update(users)
        .set({
          ...userData,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userData.id))
        .returning();
      return user;
    }
    
    // Check if user exists by email (handles case where same email has different provider IDs)
    if (userData.email) {
      const existingByEmail = await db
        .select()
        .from(users)
        .where(eq(users.email, userData.email))
        .limit(1);
      
      if (existingByEmail[0]) {
        // Update existing user with new ID/data (linking accounts)
        const [user] = await db
          .update(users)
          .set({
            ...userData,
            id: existingByEmail[0].id, // Keep existing ID to avoid breaking references
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingByEmail[0].id))
          .returning();
        return user;
      }
    }
    
    // No existing user found, create new one
    const [user] = await db
      .insert(users)
      .values(userData)
      .returning();
    return user;
  }

  async updateUserProfile(id: string, data: { firstName?: string; lastName?: string; profileImageUrl?: string }): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUserRole(id: string, role: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        role,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserCertifications(id: string, certifications: string[]): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        certifications,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async banUser(id: string, reason: string, bannedBy: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        isBanned: true,
        banReason: reason,
        bannedAt: new Date(),
        bannedBy,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async unbanUser(id: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        isBanned: false,
        banReason: null,
        bannedAt: null,
        bannedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async bulkDeleteUsers(userIds: string[]): Promise<number> {
    if (userIds.length === 0) return 0;
    
    // Delete user's annotations first (foreign key constraint)
    for (const userId of userIds) {
      await db.delete(annotations).where(eq(annotations.userId, userId));
    }
    
    // Delete users
    const result = await db
      .delete(users)
      .where(inArray(users.id, userIds))
      .returning();
    return result.length;
  }

  async updateUserYouTubeTokens(id: string, data: { accessToken: string; refreshToken: string; expiresAt: Date; channelId?: string; channelTitle?: string }): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        youtubeAccessToken: data.accessToken,
        youtubeRefreshToken: data.refreshToken,
        youtubeTokenExpires: data.expiresAt,
        ...(data.channelId && { youtubeChannelId: data.channelId }),
        ...(data.channelTitle && { youtubeChannelTitle: data.channelTitle }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getUsersWithYouTube(): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(and(
        not(isNull(users.youtubeChannelId)),
        not(isNull(users.youtubeRefreshToken))
      ))
      .orderBy(desc(users.createdAt));
  }

  async getAllPodcasts(): Promise<Podcast[]> {
    return await db.select().from(podcasts);
  }

  async getPodcast(id: string): Promise<Podcast | undefined> {
    const result = await db.select().from(podcasts).where(eq(podcasts.id, id));
    return result[0];
  }

  async getPodcastByTitle(title: string): Promise<Podcast | undefined> {
    const result = await db.select().from(podcasts).where(eq(podcasts.title, title));
    return result[0];
  }

  async createPodcast(insertPodcast: InsertPodcast): Promise<Podcast> {
    const result = await db.insert(podcasts).values(insertPodcast).returning();
    return result[0];
  }

  async updatePodcast(id: string, data: Partial<InsertPodcast>): Promise<Podcast | undefined> {
    const [result] = await db
      .update(podcasts)
      .set(data)
      .where(eq(podcasts.id, id))
      .returning();
    return result;
  }

  async deletePodcast(id: string): Promise<boolean> {
    // First delete all episodes and their related data
    const podcastEpisodes = await this.getEpisodesByPodcast(id);
    for (const episode of podcastEpisodes) {
      await this.deleteEpisode(episode.id);
    }
    // Then delete the podcast
    const result = await db
      .delete(podcasts)
      .where(eq(podcasts.id, id))
      .returning();
    return result.length > 0;
  }

  async getFeaturedLandingPodcasts(): Promise<Podcast[]> {
    return await db
      .select()
      .from(podcasts)
      .where(eq(podcasts.featuredLanding, true))
      .orderBy(desc(podcasts.featuredAt))
      .limit(4);
  }

  async getFeaturedExplorePodcasts(): Promise<Podcast[]> {
    return await db
      .select()
      .from(podcasts)
      .where(eq(podcasts.featuredExplore, true))
      .orderBy(desc(podcasts.featuredAt))
      .limit(8);
  }

  async setPodcastFeaturedLanding(id: string, featured: boolean): Promise<Podcast | undefined> {
    if (featured) {
      const currentFeatured = await this.getFeaturedLandingPodcasts();
      if (currentFeatured.length >= 4) {
        const oldest = currentFeatured[currentFeatured.length - 1];
        await db
          .update(podcasts)
          .set({ featuredLanding: false })
          .where(eq(podcasts.id, oldest.id));
      }
    }
    
    const [result] = await db
      .update(podcasts)
      .set({ 
        featuredLanding: featured,
        featuredAt: featured ? new Date() : null,
      })
      .where(eq(podcasts.id, id))
      .returning();
    return result;
  }

  async setPodcastFeaturedExplore(id: string, featured: boolean): Promise<Podcast | undefined> {
    if (featured) {
      const currentFeatured = await this.getFeaturedExplorePodcasts();
      if (currentFeatured.length >= 8) {
        const oldest = currentFeatured[currentFeatured.length - 1];
        await db
          .update(podcasts)
          .set({ featuredExplore: false })
          .where(eq(podcasts.id, oldest.id));
      }
    }
    
    const [result] = await db
      .update(podcasts)
      .set({ 
        featuredExplore: featured,
        featuredAt: featured ? new Date() : null,
      })
      .where(eq(podcasts.id, id))
      .returning();
    return result;
  }

  async getAllEpisodes(): Promise<Episode[]> {
    return await db.select().from(episodes);
  }

  async getCuratedEpisodes(): Promise<Episode[]> {
    return await db
      .select()
      .from(episodes)
      .where(eq(episodes.isCurated, true))
      .orderBy(desc(episodes.curatedAt), desc(episodes.publishedAt));
  }

  async getEpisodesByPodcast(podcastId: string): Promise<Episode[]> {
    return await db
      .select()
      .from(episodes)
      .where(eq(episodes.podcastId, podcastId));
  }

  async getEpisode(id: string): Promise<Episode | undefined> {
    const result = await db.select().from(episodes).where(eq(episodes.id, id));
    return result[0];
  }

  async createEpisode(insertEpisode: InsertEpisode): Promise<Episode> {
    const result = await db.insert(episodes).values(insertEpisode).returning();
    return result[0];
  }

  async updateEpisode(id: string, data: Partial<InsertEpisode>): Promise<Episode | undefined> {
    const [result] = await db
      .update(episodes)
      .set(data)
      .where(eq(episodes.id, id))
      .returning();
    return result;
  }

  async deleteEpisode(id: string): Promise<boolean> {
    // First delete all annotations for this episode
    await db.delete(annotations).where(eq(annotations.episodeId, id));
    // Delete all transcript segments for this episode
    await db.delete(transcriptSegments).where(eq(transcriptSegments.episodeId, id));
    // Then delete the episode
    const result = await db
      .delete(episodes)
      .where(eq(episodes.id, id))
      .returning();
    return result.length > 0;
  }

  async updateEpisodeVisibility(id: string, visibility: string): Promise<Episode | undefined> {
    const [result] = await db
      .update(episodes)
      .set({ visibility } as any)
      .where(eq(episodes.id, id))
      .returning();
    return result;
  }

  async updateEpisodeSummary(id: string, summary: any): Promise<Episode | undefined> {
    const [result] = await db
      .update(episodes)
      .set({ episodeSummary: summary } as any)
      .where(eq(episodes.id, id))
      .returning();
    return result;
  }

  async getEpisodeInventory(): Promise<Array<{ id: string; title: string; podcastName: string; transcriptStatus: string; claimCount: number; momentCount: number; narrativeCount: number; visibility: string; publishedAt: Date | null; hasSummary: boolean; summaryUpdatedAt: string | null }>> {
    const result = await db.execute(sql`
      SELECT 
        e.id,
        e.title,
        COALESCE(p.title, 'Unknown') as podcast_name,
        e.transcript_status,
        COALESCE(claims.count, 0)::int as claim_count,
        COALESCE(moments.count, 0)::int as moment_count,
        COALESCE(narratives.count, 0)::int as narrative_count,
        e.visibility,
        e.published_at,
        e.episode_summary IS NOT NULL as has_summary,
        e.episode_summary->>'generatedAt' as summary_updated_at
      FROM episodes e
      LEFT JOIN podcasts p ON e.podcast_id = p.id
      LEFT JOIN (
        SELECT episode_id, COUNT(*) as count FROM episode_claims GROUP BY episode_id
      ) claims ON e.id = claims.episode_id
      LEFT JOIN (
        SELECT episode_id, COUNT(*) as count FROM viral_moments GROUP BY episode_id
      ) moments ON e.id = moments.episode_id
      LEFT JOIN (
        SELECT episode_id, COUNT(*) as count FROM episode_segments WHERE segment_type = 'narrative' GROUP BY episode_id
      ) narratives ON e.id = narratives.episode_id
      ORDER BY e.published_at DESC NULLS LAST
    `);
    return (result.rows as any[]).map(row => ({
      id: row.id,
      title: row.title,
      podcastName: row.podcast_name,
      transcriptStatus: row.transcript_status,
      claimCount: row.claim_count,
      momentCount: row.moment_count,
      narrativeCount: row.narrative_count,
      visibility: row.visibility || 'backlog',
      publishedAt: row.published_at,
      hasSummary: row.has_summary || false,
      summaryUpdatedAt: row.summary_updated_at || null,
    }));
  }

  async getEpisodesForKeyMoments(visibility?: string, limit: number = 50): Promise<Episode[]> {
    // Get episodes where: transcriptStatus=ready, claim_count>=10, no moments yet, visibility is featured or supporting
    const result = await db.execute(sql`
      SELECT e.*
      FROM episodes e
      LEFT JOIN (
        SELECT episode_id, COUNT(*) as count FROM episode_claims GROUP BY episode_id
      ) claims ON e.id = claims.episode_id
      LEFT JOIN (
        SELECT episode_id, COUNT(*) as count FROM viral_moments GROUP BY episode_id
      ) moments ON e.id = moments.episode_id
      WHERE e.transcript_status = 'ready'
        AND COALESCE(claims.count, 0) >= 10
        AND COALESCE(moments.count, 0) = 0
        AND e.visibility IN ('featured', 'supporting')
        ${visibility ? sql`AND e.visibility = ${visibility}` : sql``}
      ORDER BY 
        CASE e.visibility WHEN 'featured' THEN 1 WHEN 'supporting' THEN 2 ELSE 3 END,
        e.published_at DESC
      LIMIT ${limit}
    `);
    return result.rows as Episode[];
  }

  async getEpisodesForNarratives(limit: number = 20, minClaims: number = 30): Promise<Episode[]> {
    // Get episodes where: transcriptStatus=ready, visibility=featured, claim_count>=minClaims, no narrative segments
    const result = await db.execute(sql`
      SELECT e.*
      FROM episodes e
      LEFT JOIN (
        SELECT episode_id, COUNT(*) as count FROM episode_claims GROUP BY episode_id
      ) claims ON e.id = claims.episode_id
      LEFT JOIN (
        SELECT episode_id, COUNT(*) as count FROM episode_segments WHERE segment_type = 'narrative' GROUP BY episode_id
      ) narratives ON e.id = narratives.episode_id
      WHERE e.transcript_status = 'ready'
        AND e.visibility = 'featured'
        AND COALESCE(claims.count, 0) >= ${minClaims}
        AND COALESCE(narratives.count, 0) = 0
      ORDER BY e.published_at DESC
      LIMIT ${limit}
    `);
    return result.rows as Episode[];
  }

  async getSegment(id: string): Promise<TranscriptSegment | undefined> {
    const result = await db
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.id, id))
      .limit(1);
    return result[0];
  }

  async getSegmentsByEpisode(episodeId: string): Promise<TranscriptSegment[]> {
    return await db
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.episodeId, episodeId))
      .orderBy(transcriptSegments.startTime);
  }

  async getTranscriptSegmentsByTimeRange(episodeId: string, startTime: number, endTime: number): Promise<TranscriptSegment[]> {
    return await db
      .select()
      .from(transcriptSegments)
      .where(
        and(
          eq(transcriptSegments.episodeId, episodeId),
          gte(transcriptSegments.startTime, startTime),
          lte(transcriptSegments.endTime, endTime)
        )
      )
      .orderBy(transcriptSegments.startTime);
  }

  async createSegment(
    insertSegment: InsertTranscriptSegment
  ): Promise<TranscriptSegment> {
    const result = await db
      .insert(transcriptSegments)
      .values(insertSegment)
      .returning();
    return result[0];
  }

  async createTranscriptSegments(episodeId: string, segments: any[]): Promise<void> {
    const touchedIds: string[] = [];

    // Upsert each segment (preserves IDs when episodeId+startTime match)
    for (const seg of segments) {
      const result = await db
        .insert(transcriptSegments)
        .values({
          episodeId,
          startTime: seg.startTime,
          endTime: seg.endTime,
          text: seg.text,
          type: seg.type || "speech",
          speaker: seg.speaker || null,
          isStale: false,
        })
        .onConflictDoUpdate({
          target: [transcriptSegments.episodeId, transcriptSegments.startTime],
          set: {
            endTime: seg.endTime,
            text: seg.text,
            type: seg.type || "speech",
            speaker: seg.speaker || null,
            isStale: false, // Reset stale flag on re-import
          },
        })
        .returning({ id: transcriptSegments.id });
      
      touchedIds.push(result[0].id);
    }

    // Find segments that weren't touched by this import (only if we have touched IDs)
    if (touchedIds.length > 0) {
      const untouchedSegments = await db
        .select({
          id: transcriptSegments.id,
          hasAnnotations: sql<boolean>`EXISTS(SELECT 1 FROM annotations WHERE segment_id = ${transcriptSegments.id})`,
        })
        .from(transcriptSegments)
        .where(
          and(
            eq(transcriptSegments.episodeId, episodeId),
            notInArray(transcriptSegments.id, touchedIds)
          )
        );

      // Delete untouched segments with no annotations
      const toDelete = untouchedSegments.filter((seg) => !seg.hasAnnotations).map((seg) => seg.id);
      if (toDelete.length > 0) {
        await db
          .delete(transcriptSegments)
          .where(inArray(transcriptSegments.id, toDelete));
      }

      // Mark untouched segments with annotations as stale
      const toMarkStale = untouchedSegments.filter((seg) => seg.hasAnnotations).map((seg) => seg.id);
      if (toMarkStale.length > 0) {
        await db
          .update(transcriptSegments)
          .set({ isStale: true })
          .where(inArray(transcriptSegments.id, toMarkStale));
      }
    }
  }

  async deleteAllSegmentsForEpisode(episodeId: string): Promise<number> {
    const result = await db
      .delete(transcriptSegments)
      .where(eq(transcriptSegments.episodeId, episodeId));
    return result.rowCount || 0;
  }

  async updateTranscriptSegment(id: string, data: { startTime?: number; endTime?: number; text?: string; speaker?: string }): Promise<TranscriptSegment | undefined> {
    const updateData: any = {};
    if (data.startTime !== undefined) updateData.startTime = data.startTime;
    if (data.endTime !== undefined) updateData.endTime = data.endTime;
    if (data.text !== undefined) updateData.text = data.text;
    if (data.speaker !== undefined) updateData.speaker = data.speaker;
    
    if (Object.keys(updateData).length === 0) {
      return this.getSegment(id);
    }
    
    const [updated] = await db
      .update(transcriptSegments)
      .set(updateData)
      .where(eq(transcriptSegments.id, id))
      .returning();
    return updated;
  }

  async renameSpeaker(episodeId: string, oldName: string, newName: string): Promise<number> {
    const result = await db
      .update(transcriptSegments)
      .set({ speaker: newName })
      .where(
        and(
          eq(transcriptSegments.episodeId, episodeId),
          eq(transcriptSegments.speaker, oldName)
        )
      );
    return result.rowCount || 0;
  }

  async getAnnotationsByEpisode(episodeId: string, options?: { userId?: string; sort?: "top" | "new" | "ai"; aiOnly?: boolean }): Promise<AnnotationWithAuthor[]> {
    // Show approved annotations to everyone
    // If user is logged in, also show their own pending annotations
    const statusFilter = options?.userId
      ? or(
          eq(annotations.status, "approved"),
          and(eq(annotations.userId, options.userId), eq(annotations.status, "pending"))
        )
      : eq(annotations.status, "approved");

    // Build filter conditions
    const conditions = [eq(annotations.episodeId, episodeId), statusFilter];
    
    // Add aiOnly filter if specified
    if (options?.aiOnly) {
      conditions.push(eq(annotations.isAiGenerated, true));
    }

    // Determine sort order
    const sortOrder = options?.sort || "top";
    let orderByClause;
    switch (sortOrder) {
      case "new":
        orderByClause = sql`${annotations.createdAt} DESC`;
        break;
      case "ai":
        // AI sorting: AI-generated first, then by upvotes
        orderByClause = sql`${annotations.isAiGenerated} DESC, ${annotations.upvotes} DESC, ${annotations.createdAt} DESC`;
        break;
      case "top":
      default:
        orderByClause = sql`${annotations.upvotes} DESC, ${annotations.createdAt} DESC`;
        break;
    }
      
    const result = await db
      .select({
        id: annotations.id,
        episodeId: annotations.episodeId,
        segmentId: annotations.segmentId,
        userId: annotations.userId,
        text: annotations.text,
        startOffset: annotations.startOffset,
        endOffset: annotations.endOffset,
        content: annotations.content,
        timestamp: annotations.timestamp,
        status: annotations.status,
        rejectionReason: annotations.rejectionReason,
        createdAt: annotations.createdAt,
        upvotes: annotations.upvotes,
        downvotes: annotations.downvotes,
        featured: annotations.featured,
        featuredAt: annotations.featuredAt,
        isHero: annotations.isHero,
        isAiGenerated: annotations.isAiGenerated,
        authorName: sql<string | null>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email}, NULL)`,
        authorAvatar: users.profileImageUrl,
      })
      .from(annotations)
      .leftJoin(users, eq(annotations.userId, users.id))
      .where(and(...conditions))
      .orderBy(orderByClause);
    return result;
  }

  async getAnnotationsByUser(userId: string): Promise<AnnotationWithMetadata[]> {
    const result = await db
      .select({
        id: annotations.id,
        episodeId: annotations.episodeId,
        segmentId: annotations.segmentId,
        userId: annotations.userId,
        text: annotations.text,
        startOffset: annotations.startOffset,
        endOffset: annotations.endOffset,
        content: annotations.content,
        timestamp: annotations.timestamp,
        status: annotations.status,
        rejectionReason: annotations.rejectionReason,
        createdAt: annotations.createdAt,
        upvotes: annotations.upvotes,
        downvotes: annotations.downvotes,
        featured: annotations.featured,
        featuredAt: annotations.featuredAt,
        isHero: annotations.isHero,
        isAiGenerated: annotations.isAiGenerated,
        authorName: sql<string | null>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email}, NULL)`,
        authorAvatar: users.profileImageUrl,
        episodeTitle: sql<string>`COALESCE(${episodes.title}, 'Unknown Episode')`,
        podcastTitle: sql<string>`COALESCE(${podcasts.title}, 'Unknown Podcast')`,
        artworkUrl: podcasts.artworkUrl,
        segmentText: sql<string>`COALESCE(${transcriptSegments.text}, '')`,
      })
      .from(annotations)
      .leftJoin(users, eq(annotations.userId, users.id))
      .leftJoin(episodes, eq(annotations.episodeId, episodes.id))
      .leftJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .leftJoin(transcriptSegments, eq(annotations.segmentId, transcriptSegments.id))
      .where(eq(annotations.userId, userId))
      .orderBy(sql`${annotations.createdAt} DESC`);
    
    // Keep original annotation.text, but add segment text for display
    return result.map((row) => ({
      ...row,
      text: row.segmentText,
    }));
  }

  async getAllAnnotations(): Promise<AnnotationWithAuthor[]> {
    const result = await db
      .select({
        id: annotations.id,
        episodeId: annotations.episodeId,
        segmentId: annotations.segmentId,
        userId: annotations.userId,
        text: annotations.text,
        startOffset: annotations.startOffset,
        endOffset: annotations.endOffset,
        content: annotations.content,
        timestamp: annotations.timestamp,
        status: annotations.status,
        rejectionReason: annotations.rejectionReason,
        createdAt: annotations.createdAt,
        upvotes: annotations.upvotes,
        downvotes: annotations.downvotes,
        featured: annotations.featured,
        featuredAt: annotations.featuredAt,
        isHero: annotations.isHero,
        isAiGenerated: annotations.isAiGenerated,
        authorName: sql<string | null>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email}, NULL)`,
        authorAvatar: users.profileImageUrl,
      })
      .from(annotations)
      .leftJoin(users, eq(annotations.userId, users.id));
    return result;
  }

  async getAnnotation(id: string): Promise<AnnotationWithAuthor | undefined> {
    const result = await db
      .select({
        id: annotations.id,
        episodeId: annotations.episodeId,
        segmentId: annotations.segmentId,
        userId: annotations.userId,
        text: annotations.text,
        startOffset: annotations.startOffset,
        endOffset: annotations.endOffset,
        content: annotations.content,
        timestamp: annotations.timestamp,
        status: annotations.status,
        rejectionReason: annotations.rejectionReason,
        createdAt: annotations.createdAt,
        upvotes: annotations.upvotes,
        downvotes: annotations.downvotes,
        featured: annotations.featured,
        featuredAt: annotations.featuredAt,
        isHero: annotations.isHero,
        isAiGenerated: annotations.isAiGenerated,
        authorName: sql<string | null>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email}, NULL)`,
        authorAvatar: users.profileImageUrl,
      })
      .from(annotations)
      .leftJoin(users, eq(annotations.userId, users.id))
      .where(eq(annotations.id, id));
    return result[0];
  }

  async createAnnotation(
    insertAnnotation: InsertAnnotation
  ): Promise<Annotation> {
    // Calculate timestamp based on annotation position within segment
    let calculatedTimestamp: number | null = null;
    
    if (insertAnnotation.segmentId && insertAnnotation.startOffset !== undefined) {
      // Get the segment to calculate the timestamp
      const segment = await db
        .select()
        .from(transcriptSegments)
        .where(eq(transcriptSegments.id, insertAnnotation.segmentId))
        .limit(1);
      
      if (segment[0]) {
        const seg = segment[0];
        const segmentDuration = seg.endTime - seg.startTime;
        const segmentTextLength = seg.text.length;
        
        if (segmentTextLength > 0 && segmentDuration > 0) {
          // Clamp startOffset within valid bounds [0, segmentTextLength]
          const clampedOffset = Math.max(0, Math.min(insertAnnotation.startOffset, segmentTextLength));
          // Calculate position ratio (where in the segment the annotation starts)
          const positionRatio = clampedOffset / segmentTextLength;
          // Calculate timestamp: segment start + (duration * ratio), clamped to segment bounds
          const rawTimestamp = seg.startTime + (segmentDuration * positionRatio);
          calculatedTimestamp = Math.round(Math.min(rawTimestamp, seg.endTime));
        } else {
          // Fallback to segment start if we can't calculate
          calculatedTimestamp = seg.startTime;
        }
      }
    }
    
    const result = await db
      .insert(annotations)
      .values({
        ...insertAnnotation,
        timestamp: calculatedTimestamp,
        createdAt: new Date(),
        upvotes: 0,
        downvotes: 0,
      })
      .returning();
    return result[0];
  }

  async updateAnnotation(id: string, content: string): Promise<Annotation | undefined> {
    const [result] = await db
      .update(annotations)
      .set({ content })
      .where(eq(annotations.id, id))
      .returning();
    return result;
  }

  async deleteAnnotation(id: string): Promise<boolean> {
    const result = await db
      .delete(annotations)
      .where(eq(annotations.id, id))
      .returning();
    return result.length > 0;
  }

  async getUserVote(userId: string, annotationId: string): Promise<AnnotationVote | undefined> {
    const [result] = await db
      .select()
      .from(annotationVotes)
      .where(and(
        eq(annotationVotes.userId, userId),
        eq(annotationVotes.annotationId, annotationId)
      ));
    return result;
  }

  async insertVote(userId: string, annotationId: string, type: "up" | "down"): Promise<Annotation> {
    await db.insert(annotationVotes).values({
      userId,
      annotationId,
      type,
    });
    
    const field = type === "up" ? "upvotes" : "downvotes";
    const [result] = await db
      .update(annotations)
      .set({
        [field]: sql`${annotations[field]} + 1`,
      })
      .where(eq(annotations.id, annotationId))
      .returning();
    
    if (!result) {
      throw new Error("Annotation not found");
    }
    return result;
  }

  async updateVote(userId: string, annotationId: string, type: "up" | "down"): Promise<Annotation> {
    const existing = await this.getUserVote(userId, annotationId);
    if (!existing) {
      throw new Error("No existing vote to update");
    }
    
    await db
      .update(annotationVotes)
      .set({ type })
      .where(and(
        eq(annotationVotes.userId, userId),
        eq(annotationVotes.annotationId, annotationId)
      ));
    
    const oldType = existing.type as "up" | "down";
    const oldField = oldType === "up" ? "upvotes" : "downvotes";
    const newField = type === "up" ? "upvotes" : "downvotes";
    
    const [result] = await db
      .update(annotations)
      .set({
        [oldField]: sql`${annotations[oldField]} - 1`,
        [newField]: sql`${annotations[newField]} + 1`,
      })
      .where(eq(annotations.id, annotationId))
      .returning();
    
    if (!result) {
      throw new Error("Annotation not found");
    }
    return result;
  }

  async deleteVote(userId: string, annotationId: string): Promise<Annotation> {
    const existing = await this.getUserVote(userId, annotationId);
    if (!existing) {
      throw new Error("No existing vote to delete");
    }
    
    await db
      .delete(annotationVotes)
      .where(and(
        eq(annotationVotes.userId, userId),
        eq(annotationVotes.annotationId, annotationId)
      ));
    
    const oldType = existing.type as "up" | "down";
    const field = oldType === "up" ? "upvotes" : "downvotes";
    
    const [result] = await db
      .update(annotations)
      .set({
        [field]: sql`${annotations[field]} - 1`,
      })
      .where(eq(annotations.id, annotationId))
      .returning();
    
    if (!result) {
      throw new Error("Annotation not found");
    }
    return result;
  }

  async getAnnotationWithUserVote(annotationId: string, userId?: string): Promise<(AnnotationWithAuthor & { userVote: "up" | "down" | null }) | undefined> {
    const annotation = await this.getAnnotation(annotationId);
    if (!annotation) return undefined;
    
    let userVote: "up" | "down" | null = null;
    if (userId) {
      const vote = await this.getUserVote(userId, annotationId);
      userVote = (vote?.type as "up" | "down") || null;
    }
    
    return { ...annotation, userVote };
  }

  async getFeaturedAnnotations(): Promise<AnnotationWithMetadata[]> {
    const result = await db
      .select({
        id: annotations.id,
        episodeId: annotations.episodeId,
        segmentId: annotations.segmentId,
        userId: annotations.userId,
        text: annotations.text,
        startOffset: annotations.startOffset,
        endOffset: annotations.endOffset,
        content: annotations.content,
        timestamp: annotations.timestamp,
        status: annotations.status,
        rejectionReason: annotations.rejectionReason,
        createdAt: annotations.createdAt,
        upvotes: annotations.upvotes,
        downvotes: annotations.downvotes,
        featured: annotations.featured,
        featuredAt: annotations.featuredAt,
        isHero: annotations.isHero,
        isAiGenerated: annotations.isAiGenerated,
        authorName: sql<string | null>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email}, NULL)`,
        authorAvatar: users.profileImageUrl,
        episodeTitle: sql<string>`COALESCE(${episodes.title}, 'Unknown Episode')`,
        podcastTitle: sql<string>`COALESCE(${podcasts.title}, 'Unknown Podcast')`,
        artworkUrl: podcasts.artworkUrl,
      })
      .from(annotations)
      .leftJoin(users, eq(annotations.userId, users.id))
      .leftJoin(episodes, eq(annotations.episodeId, episodes.id))
      .leftJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(eq(annotations.featured, true))
      .orderBy(desc(annotations.isHero), desc(annotations.featuredAt));
    
    return result;
  }

  async setAnnotationFeatured(id: string, featured: boolean): Promise<Annotation | undefined> {
    const [result] = await db
      .update(annotations)
      .set({ 
        featured,
        featuredAt: featured ? new Date() : null,
      })
      .where(eq(annotations.id, id))
      .returning();
    return result;
  }

  async setAnnotationHero(id: string, isHero: boolean): Promise<Annotation | undefined> {
    if (isHero) {
      await db
        .update(annotations)
        .set({ isHero: false })
        .where(eq(annotations.isHero, true));
    }
    
    const [result] = await db
      .update(annotations)
      .set({ 
        isHero,
        featured: isHero ? true : undefined,
        featuredAt: isHero ? new Date() : undefined,
      })
      .where(eq(annotations.id, id))
      .returning();
    return result;
  }

  async getHeroAnnotation(): Promise<AnnotationWithMetadata | undefined> {
    const [result] = await db
      .select({
        id: annotations.id,
        episodeId: annotations.episodeId,
        segmentId: annotations.segmentId,
        userId: annotations.userId,
        text: annotations.text,
        startOffset: annotations.startOffset,
        endOffset: annotations.endOffset,
        content: annotations.content,
        timestamp: annotations.timestamp,
        status: annotations.status,
        rejectionReason: annotations.rejectionReason,
        createdAt: annotations.createdAt,
        upvotes: annotations.upvotes,
        downvotes: annotations.downvotes,
        featured: annotations.featured,
        featuredAt: annotations.featuredAt,
        isHero: annotations.isHero,
        isAiGenerated: annotations.isAiGenerated,
        authorName: sql<string | null>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email}, NULL)`,
        authorAvatar: users.profileImageUrl,
        episodeTitle: sql<string>`COALESCE(${episodes.title}, 'Unknown Episode')`,
        podcastTitle: sql<string>`COALESCE(${podcasts.title}, 'Unknown Podcast')`,
        artworkUrl: podcasts.artworkUrl,
      })
      .from(annotations)
      .leftJoin(users, eq(annotations.userId, users.id))
      .leftJoin(episodes, eq(annotations.episodeId, episodes.id))
      .leftJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(eq(annotations.isHero, true))
      .limit(1);
    
    return result;
  }

  async getPendingAnnotations(opts: { limit: number; offset: number }): Promise<PendingAnnotationWithContext[]> {
    const rows = await db
      .select({
        annotation: annotations,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        },
        episode: {
          id: episodes.id,
          title: episodes.title,
        },
        podcast: {
          id: podcasts.id,
          title: podcasts.title,
        },
      })
      .from(annotations)
      .leftJoin(users, eq(annotations.userId, users.id))
      .leftJoin(episodes, eq(annotations.episodeId, episodes.id))
      .leftJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(eq(annotations.status, "pending"))
      .orderBy(desc(annotations.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    return rows.map(row => ({
      annotation: row.annotation,
      user: {
        id: row.user?.id || "",
        email: row.user?.email || "",
        firstName: row.user?.firstName || null,
        lastName: row.user?.lastName || null,
      },
      episode: {
        id: row.episode?.id || "",
        title: row.episode?.title || "Unknown Episode",
      },
      podcast: {
        id: row.podcast?.id || "",
        title: row.podcast?.title || "Unknown Podcast",
      },
    }));
  }

  async updateAnnotationStatus(
    id: string, 
    input: { status: "pending" | "approved" | "rejected"; rejectionReason?: string | null }
  ): Promise<Annotation | undefined> {
    const [result] = await db
      .update(annotations)
      .set({
        status: input.status,
        rejectionReason: input.rejectionReason ?? null,
      })
      .where(eq(annotations.id, id))
      .returning();
    return result;
  }

  async promoteAiAnnotation(id: string): Promise<Annotation | undefined> {
    const [result] = await db
      .update(annotations)
      .set({
        isAiGenerated: false,
        status: "approved",
        rejectionReason: null,
      })
      .where(eq(annotations.id, id))
      .returning();
    return result;
  }

  async getMostAnnotatedEpisodes(opts: { page: number; pageSize: number }): Promise<{
    episodes: {
      id: string;
      title: string;
      description: string | null;
      podcastId: string;
      podcastTitle: string;
      artworkUrl: string | null;
      audioUrl: string | null;
      pubDate: Date | null;
      annotationCount: number;
    }[];
    totalCount: number;
  }> {
    const { page, pageSize } = opts;
    const offset = (page - 1) * pageSize;

    try {
      const countResult = await db
        .select({
          episodeId: annotations.episodeId,
          count: sql<number>`count(*)::int`,
        })
        .from(annotations)
        .where(eq(annotations.status, "approved"))
        .groupBy(annotations.episodeId);

      const totalCount = countResult.length;

      if (totalCount === 0) {
        return { episodes: [], totalCount: 0 };
      }

      const results = await db
        .select({
          episodeId: annotations.episodeId,
          annotationCount: sql<number>`count(*)::int`,
          episodeTitle: sql<string>`COALESCE(${episodes.title}, 'Unknown Episode')`,
          episodeDescription: episodes.description,
          podcastId: sql<string>`COALESCE(${episodes.podcastId}, '')`,
          audioUrl: episodes.mediaUrl,
          pubDate: episodes.publishedAt,
          podcastTitle: sql<string>`COALESCE(${podcasts.title}, 'Unknown Podcast')`,
          artworkUrl: podcasts.artworkUrl,
        })
        .from(annotations)
        .innerJoin(episodes, eq(annotations.episodeId, episodes.id))
        .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
        .where(eq(annotations.status, "approved"))
        .groupBy(
          annotations.episodeId,
          episodes.id,
          episodes.title,
          episodes.description,
          episodes.podcastId,
          episodes.mediaUrl,
          episodes.publishedAt,
          podcasts.id,
          podcasts.title,
          podcasts.artworkUrl
        )
        .orderBy(desc(sql`count(*)`))
        .limit(pageSize)
        .offset(offset);

      return {
        episodes: results.map(r => ({
          id: r.episodeId,
          title: r.episodeTitle,
          description: r.episodeDescription,
          podcastId: r.podcastId,
          podcastTitle: r.podcastTitle,
          artworkUrl: r.artworkUrl,
          audioUrl: r.audioUrl,
          pubDate: r.pubDate,
          annotationCount: r.annotationCount,
        })),
        totalCount,
      };
    } catch (error) {
      console.error("[ERROR] getMostAnnotatedEpisodes failed:", error);
      return { episodes: [], totalCount: 0 };
    }
  }

  async getMusicDetectionsByEpisode(episodeId: string): Promise<MusicDetection[]> {
    return await db
      .select()
      .from(musicDetections)
      .where(eq(musicDetections.episodeId, episodeId))
      .orderBy(musicDetections.startTime);
  }

  async getTrendingMusic(limit: number = 10): Promise<(MusicDetection & { episodeTitle: string; podcastTitle: string; podcastArtworkUrl: string | null })[]> {
    const results = await db
      .select({
        id: musicDetections.id,
        episodeId: musicDetections.episodeId,
        artist: musicDetections.artist,
        title: musicDetections.title,
        album: musicDetections.album,
        startTime: musicDetections.startTime,
        endTime: musicDetections.endTime,
        releaseDate: musicDetections.releaseDate,
        label: musicDetections.label,
        artworkUrl: musicDetections.artworkUrl,
        spotifyUrl: musicDetections.spotifyUrl,
        appleMusicUrl: musicDetections.appleMusicUrl,
        songLink: musicDetections.songLink,
        createdAt: musicDetections.createdAt,
        episodeTitle: episodes.title,
        podcastTitle: podcasts.title,
        podcastArtworkUrl: podcasts.artworkUrl,
      })
      .from(musicDetections)
      .innerJoin(episodes, eq(musicDetections.episodeId, episodes.id))
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .orderBy(desc(musicDetections.createdAt))
      .limit(limit);
    
    return results;
  }

  async createMusicDetection(detection: InsertMusicDetection): Promise<MusicDetection> {
    const [result] = await db
      .insert(musicDetections)
      .values(detection)
      .returning();
    return result;
  }

  async createMusicDetections(detections: InsertMusicDetection[]): Promise<MusicDetection[]> {
    if (detections.length === 0) return [];
    const result = await db
      .insert(musicDetections)
      .values(detections)
      .returning();
    return result;
  }

  async deleteMusicDetectionsForEpisode(episodeId: string): Promise<number> {
    const result = await db
      .delete(musicDetections)
      .where(eq(musicDetections.episodeId, episodeId))
      .returning();
    return result.length;
  }

  async replaceMusicDetectionsForEpisode(episodeId: string, detections: InsertMusicDetection[]): Promise<MusicDetection[]> {
    await db.delete(musicDetections).where(eq(musicDetections.episodeId, episodeId));
    if (detections.length === 0) {
      return [];
    }
    const result = await db.insert(musicDetections).values(detections).returning();
    return result;
  }

  // ============ SPONSOR SEGMENT METHODS ============
  async getSponsorSegmentsByEpisode(episodeId: string): Promise<SponsorSegment[]> {
    return await db
      .select()
      .from(sponsorSegments)
      .where(eq(sponsorSegments.episodeId, episodeId))
      .orderBy(sponsorSegments.startTime);
  }

  async replaceSponsorSegmentsForEpisode(episodeId: string, segments: InsertSponsorSegment[]): Promise<SponsorSegment[]> {
    await db.delete(sponsorSegments).where(eq(sponsorSegments.episodeId, episodeId));
    if (segments.length === 0) {
      return [];
    }
    const result = await db.insert(sponsorSegments).values(segments).returning();
    return result;
  }

  // ============ EPISODE CLAIM METHODS ============
  async getClaimsByEpisodeId(episodeId: string): Promise<EpisodeClaim[]> {
    return await db
      .select()
      .from(episodeClaims)
      .where(eq(episodeClaims.episodeId, episodeId))
      .orderBy(episodeClaims.startTime);
  }

  async replaceClaimsForEpisode(episodeId: string, claims: InsertEpisodeClaim[]): Promise<EpisodeClaim[]> {
    await db.delete(episodeClaims).where(eq(episodeClaims.episodeId, episodeId));
    if (claims.length === 0) {
      return [];
    }
    const result = await db.insert(episodeClaims).values(claims).returning();
    return result;
  }

  // ============ EPISODE CANDIDATE METHODS ============
  async getEpisodeCandidatesByEpisode(episodeId: string): Promise<EpisodeCandidate[]> {
    return await db
      .select()
      .from(episodeCandidates)
      .where(eq(episodeCandidates.episodeId, episodeId))
      .orderBy(desc(episodeCandidates.confidenceScore));
  }

  async getEpisodeCandidate(id: string): Promise<EpisodeCandidate | undefined> {
    const result = await db.select().from(episodeCandidates).where(eq(episodeCandidates.id, id));
    return result[0];
  }

  async createEpisodeCandidate(candidate: InsertEpisodeCandidate): Promise<EpisodeCandidate> {
    const result = await db.insert(episodeCandidates).values(candidate).returning();
    return result[0];
  }

  async updateEpisodeCandidate(id: string, data: Partial<InsertEpisodeCandidate>): Promise<EpisodeCandidate | undefined> {
    const result = await db.update(episodeCandidates).set(data).where(eq(episodeCandidates.id, id)).returning();
    return result[0];
  }

  async getPendingCandidates(limit: number = 50): Promise<EpisodeCandidate[]> {
    return await db
      .select()
      .from(episodeCandidates)
      .where(eq(episodeCandidates.status, "pending"))
      .orderBy(desc(episodeCandidates.confidenceScore))
      .limit(limit);
  }

  async acceptCandidate(id: string, reviewedBy: string): Promise<EpisodeCandidate | undefined> {
    const result = await db
      .update(episodeCandidates)
      .set({ status: "accepted", reviewedBy, reviewedAt: new Date() })
      .where(eq(episodeCandidates.id, id))
      .returning();
    return result[0];
  }

  async rejectCandidate(id: string, reviewedBy: string, reason?: string): Promise<EpisodeCandidate | undefined> {
    const result = await db
      .update(episodeCandidates)
      .set({ status: "rejected", reviewedBy, reviewedAt: new Date(), rejectionReason: reason || null })
      .where(eq(episodeCandidates.id, id))
      .returning();
    return result[0];
  }

  async getEpisodesAwaitingReview(limit: number = 50): Promise<Episode[]> {
    return await db
      .select()
      .from(episodes)
      .where(eq(episodes.resolutionStatus, "awaiting_review"))
      .orderBy(asc(episodes.resolutionFallbackAt))
      .limit(limit);
  }

  async getEpisodesPastFallback(): Promise<Episode[]> {
    return await db
      .select()
      .from(episodes)
      .where(
        and(
          or(
            eq(episodes.resolutionStatus, "awaiting_review"),
            eq(episodes.resolutionStatus, "unresolved")
          ),
          lte(episodes.resolutionFallbackAt, new Date())
        )
      );
  }

  // ============ SEMANTIC SEGMENT METHODS ============
  async getSemanticSegmentsByEpisode(episodeId: string): Promise<EpisodeSemanticSegment[]> {
    return await db
      .select()
      .from(episodeSemanticSegments)
      .where(eq(episodeSemanticSegments.episodeId, episodeId))
      .orderBy(episodeSemanticSegments.startTime);
  }

  async insertSemanticSegments(segments: InsertEpisodeSemanticSegment[]): Promise<EpisodeSemanticSegment[]> {
    if (segments.length === 0) {
      return [];
    }
    const result = await db.insert(episodeSemanticSegments).values(segments).returning();
    return result;
  }

  async deleteSemanticSegmentsByEpisode(episodeId: string): Promise<void> {
    await db.delete(episodeSemanticSegments).where(eq(episodeSemanticSegments.episodeId, episodeId));
  }

  // ============ STATEMENT METHODS (Semantic Engine) ============
  async getStatementsByEpisode(episodeId: string): Promise<Statement[]> {
    return await db
      .select()
      .from(statements)
      .where(eq(statements.episodeId, episodeId))
      .orderBy(statements.startTime);
  }

  async replaceStatementsForEpisode(episodeId: string, stmts: InsertStatement[]): Promise<Statement[]> {
    await db.delete(statements).where(eq(statements.episodeId, episodeId));
    if (stmts.length === 0) {
      return [];
    }
    const result = await db.insert(statements).values(stmts).returning();
    // Populate pgvector column from JSONB embeddings for cosine similarity search
    await db.execute(sql`
      UPDATE statements
      SET embedding_vector = (embedding::text)::vector
      WHERE episode_id = ${episodeId}
        AND embedding IS NOT NULL
        AND embedding_vector IS NULL
    `);
    return result;
  }

  async clearStatementsForEpisode(episodeId: string): Promise<void> {
    await db.delete(statements).where(eq(statements.episodeId, episodeId));
  }

  async appendStatements(stmts: InsertStatement[]): Promise<void> {
    if (stmts.length === 0) return;
    await db.insert(statements).values(stmts);
    const episodeId = stmts[0].episodeId;
    await db.execute(sql`
      UPDATE statements
      SET embedding_vector = (embedding::text)::vector
      WHERE episode_id = ${episodeId}
        AND embedding IS NOT NULL
        AND embedding_vector IS NULL
    `);
  }

  async deduplicateStatements(episodeId: string): Promise<number> {
    const result = await db.execute(sql`
      DELETE FROM statements
      WHERE episode_id = ${episodeId}
        AND id NOT IN (
          SELECT MIN(id) FROM statements
          WHERE episode_id = ${episodeId}
          GROUP BY LOWER(TRIM(text))
        )
    `);
    return (result as any).rowCount ?? 0;
  }

  async populateEmbeddingVectors(episodeId: string): Promise<number> {
    const result = await db.execute(sql`
      UPDATE statements
      SET embedding_vector = (embedding::text)::vector
      WHERE episode_id = ${episodeId}
        AND embedding IS NOT NULL
        AND embedding_vector IS NULL
    `);
    return (result as any).rowCount ?? 0;
  }

  // ============ STATEMENT CLASSIFICATION METHODS (Semantic Engine) ============
  async getClassificationsByEpisode(episodeId: string): Promise<StatementClassification[]> {
    const result = await db
      .select({
        classification: statementClassifications,
      })
      .from(statementClassifications)
      .innerJoin(statements, eq(statementClassifications.statementId, statements.id))
      .where(eq(statements.episodeId, episodeId));
    return result.map(r => r.classification);
  }

  async getClassificationsWithStatementsByEpisode(episodeId: string): Promise<StatementWithClassification[]> {
    const result = await db
      .select({
        statement: statements,
        classification: statementClassifications,
      })
      .from(statements)
      .leftJoin(statementClassifications, eq(statements.id, statementClassifications.statementId))
      .where(eq(statements.episodeId, episodeId))
      .orderBy(statements.startTime);
    return result.map(r => ({
      ...r.statement,
      classification: r.classification ?? undefined,
    }));
  }

  async upsertClassifications(classifications: InsertStatementClassification[]): Promise<StatementClassification[]> {
    if (classifications.length === 0) return [];
    const results: StatementClassification[] = [];
    for (const c of classifications) {
      const [result] = await db
        .insert(statementClassifications)
        .values(c)
        .onConflictDoUpdate({
          target: statementClassifications.statementId,
          set: {
            claimFlag: c.claimFlag,
            claimType: c.claimType,
            certainty: c.certainty,
            polarity: c.polarity,
            modality: c.modality,
            sentiment: c.sentiment,
            emotionalTone: c.emotionalTone,
            updatedAt: new Date(),
          },
        })
        .returning();
      results.push(result);
    }
    return results;
  }

  async deleteClassificationsByEpisode(episodeId: string): Promise<number> {
    const stmts = await this.getStatementsByEpisode(episodeId);
    if (stmts.length === 0) return 0;
    const stmtIds = stmts.map(s => s.id);
    const result = await db
      .delete(statementClassifications)
      .where(inArray(statementClassifications.statementId, stmtIds));
    return result.rowCount ?? 0;
  }

  // ============ CATEGORY METHODS ============
  async getAllCategories(): Promise<Category[]> {
    return await db.select().from(categories).orderBy(asc(categories.name));
  }

  async getCategoriesWithCounts(): Promise<CategoryWithPodcastCount[]> {
    const result = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        iconName: categories.iconName,
        color: categories.color,
        createdAt: categories.createdAt,
        podcastCount: sql<number>`COALESCE(COUNT(${podcastCategories.podcastId}), 0)::int`,
      })
      .from(categories)
      .leftJoin(podcastCategories, eq(categories.id, podcastCategories.categoryId))
      .groupBy(categories.id)
      .orderBy(asc(categories.name));
    return result;
  }

  async getCategory(id: string): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.id, id));
    return category;
  }

  async getCategoryBySlug(slug: string): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.slug, slug));
    return category;
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [result] = await db.insert(categories).values(category).returning();
    return result;
  }

  async updateCategory(id: string, data: Partial<InsertCategory>): Promise<Category | undefined> {
    const [result] = await db
      .update(categories)
      .set(data)
      .where(eq(categories.id, id))
      .returning();
    return result;
  }

  async deleteCategory(id: string): Promise<boolean> {
    const result = await db.delete(categories).where(eq(categories.id, id)).returning();
    return result.length > 0;
  }

  async getPodcastsByCategory(categoryId: string): Promise<Podcast[]> {
    const result = await db
      .select({
        id: podcasts.id,
        title: podcasts.title,
        host: podcasts.host,
        description: podcasts.description,
        artworkUrl: podcasts.artworkUrl,
        podcastIndexFeedId: podcasts.podcastIndexFeedId,
        youtubeChannelId: podcasts.youtubeChannelId,
        featuredLanding: podcasts.featuredLanding,
        featuredExplore: podcasts.featuredExplore,
        featuredAt: podcasts.featuredAt,
        knownSpeakers: podcasts.knownSpeakers,
        createdAt: podcasts.createdAt,
        updatedAt: podcasts.updatedAt,
      })
      .from(podcasts)
      .innerJoin(podcastCategories, eq(podcasts.id, podcastCategories.podcastId))
      .where(eq(podcastCategories.categoryId, categoryId));
    return result;
  }

  async getCategoriesForPodcast(podcastId: string): Promise<Category[]> {
    const result = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        iconName: categories.iconName,
        color: categories.color,
        createdAt: categories.createdAt,
      })
      .from(categories)
      .innerJoin(podcastCategories, eq(categories.id, podcastCategories.categoryId))
      .where(eq(podcastCategories.podcastId, podcastId));
    return result;
  }

  async assignCategoryToPodcast(podcastId: string, categoryId: string): Promise<void> {
    await db
      .insert(podcastCategories)
      .values({ podcastId, categoryId })
      .onConflictDoNothing();
  }

  async removeCategoryFromPodcast(podcastId: string, categoryId: string): Promise<void> {
    await db
      .delete(podcastCategories)
      .where(
        and(
          eq(podcastCategories.podcastId, podcastId),
          eq(podcastCategories.categoryId, categoryId)
        )
      );
  }

  // ============ ENTITY METHODS ============
  async getAllEntities(): Promise<Entity[]> {
    return await db.select().from(entities).where(eq(entities.isActive, true)).orderBy(asc(entities.name));
  }

  async getEntitiesWithStats(): Promise<EntityWithMentionCount[]> {
    const result = await db
      .select({
        id: entities.id,
        type: entities.type,
        name: entities.name,
        description: entities.description,
        imageUrl: entities.imageUrl,
        affiliateNetwork: entities.affiliateNetwork,
        affiliateUrl: entities.affiliateUrl,
        canonicalUrl: entities.canonicalUrl,
        brand: entities.brand,
        author: entities.author,
        location: entities.location,
        priceText: entities.priceText,
        rating: entities.rating,
        isVerified: entities.isVerified,
        isActive: entities.isActive,
        createdAt: entities.createdAt,
        updatedAt: entities.updatedAt,
        mentionCount: sql<number>`COUNT(DISTINCT ${entityMentions.id})::int`,
        clickCount: sql<number>`COUNT(DISTINCT ${entityClicks.id})::int`,
      })
      .from(entities)
      .leftJoin(entityMentions, eq(entityMentions.entityId, entities.id))
      .leftJoin(entityClicks, eq(entityClicks.entityId, entities.id))
      .groupBy(entities.id)
      .orderBy(desc(sql`COUNT(DISTINCT ${entityMentions.id})`));
    return result;
  }

  async getEntity(id: string): Promise<Entity | undefined> {
    const [entity] = await db.select().from(entities).where(eq(entities.id, id));
    return entity;
  }

  async getEntityByName(name: string): Promise<Entity | undefined> {
    const [entity] = await db
      .select()
      .from(entities)
      .where(and(
        eq(entities.name, name),
        eq(entities.isActive, true)
      ));
    return entity;
  }

  async searchEntities(query: string, type?: string): Promise<Entity[]> {
    const searchPattern = `%${query}%`;
    let conditions = [
      eq(entities.isActive, true),
      or(
        like(entities.name, searchPattern),
        like(entities.brand, searchPattern),
        like(entities.author, searchPattern),
        like(entities.description, searchPattern)
      ),
    ];
    
    if (type) {
      conditions.push(eq(entities.type, type));
    }
    
    return await db
      .select()
      .from(entities)
      .where(and(...conditions))
      .orderBy(asc(entities.name))
      .limit(50);
  }

  async createEntity(entity: InsertEntity): Promise<Entity> {
    const [result] = await db.insert(entities).values(entity).returning();
    return result;
  }

  async updateEntity(id: string, data: Partial<InsertEntity>): Promise<Entity | undefined> {
    const [result] = await db
      .update(entities)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(entities.id, id))
      .returning();
    return result;
  }

  async deleteEntity(id: string): Promise<boolean> {
    const result = await db.delete(entities).where(eq(entities.id, id)).returning();
    return result.length > 0;
  }

  // ============ ENTITY MENTION METHODS ============
  async getEntityMentionsByEpisode(episodeId: string): Promise<EntityMentionWithDetails[]> {
    const result = await db
      .select({
        id: entityMentions.id,
        entityId: entityMentions.entityId,
        episodeId: entityMentions.episodeId,
        segmentId: entityMentions.segmentId,
        mentionText: entityMentions.mentionText,
        timestamp: entityMentions.timestamp,
        isAutoExtracted: entityMentions.isAutoExtracted,
        isApproved: entityMentions.isApproved,
        displayOrder: entityMentions.displayOrder,
        createdAt: entityMentions.createdAt,
        entity: {
          id: entities.id,
          type: entities.type,
          name: entities.name,
          description: entities.description,
          imageUrl: entities.imageUrl,
          affiliateNetwork: entities.affiliateNetwork,
          affiliateUrl: entities.affiliateUrl,
          canonicalUrl: entities.canonicalUrl,
          brand: entities.brand,
          author: entities.author,
          location: entities.location,
          priceText: entities.priceText,
          rating: entities.rating,
          isVerified: entities.isVerified,
          isActive: entities.isActive,
          createdAt: entities.createdAt,
          updatedAt: entities.updatedAt,
        },
      })
      .from(entityMentions)
      .innerJoin(entities, eq(entityMentions.entityId, entities.id))
      .where(eq(entityMentions.episodeId, episodeId))
      .orderBy(asc(entityMentions.displayOrder), asc(entityMentions.timestamp));
    return result;
  }

  async getApprovedEntityMentionsByEpisode(episodeId: string): Promise<EntityMentionWithDetails[]> {
    const result = await db
      .select({
        id: entityMentions.id,
        entityId: entityMentions.entityId,
        episodeId: entityMentions.episodeId,
        segmentId: entityMentions.segmentId,
        mentionText: entityMentions.mentionText,
        timestamp: entityMentions.timestamp,
        isAutoExtracted: entityMentions.isAutoExtracted,
        isApproved: entityMentions.isApproved,
        displayOrder: entityMentions.displayOrder,
        createdAt: entityMentions.createdAt,
        entity: {
          id: entities.id,
          type: entities.type,
          name: entities.name,
          description: entities.description,
          imageUrl: entities.imageUrl,
          affiliateNetwork: entities.affiliateNetwork,
          affiliateUrl: entities.affiliateUrl,
          canonicalUrl: entities.canonicalUrl,
          brand: entities.brand,
          author: entities.author,
          location: entities.location,
          priceText: entities.priceText,
          rating: entities.rating,
          isVerified: entities.isVerified,
          isActive: entities.isActive,
          createdAt: entities.createdAt,
          updatedAt: entities.updatedAt,
        },
      })
      .from(entityMentions)
      .innerJoin(entities, eq(entityMentions.entityId, entities.id))
      .where(
        and(
          eq(entityMentions.episodeId, episodeId),
          eq(entityMentions.isApproved, true),
          eq(entities.isActive, true)
        )
      )
      .orderBy(asc(entityMentions.displayOrder), asc(entityMentions.timestamp));
    return result;
  }

  async getEntityMentionByEpisodeAndEntity(episodeId: string, entityId: string): Promise<EntityMention | undefined> {
    const [mention] = await db
      .select()
      .from(entityMentions)
      .where(
        and(
          eq(entityMentions.episodeId, episodeId),
          eq(entityMentions.entityId, entityId)
        )
      );
    return mention;
  }

  async getEpisodesByEntity(entityId: string): Promise<{ episodeId: string; episodeTitle: string; podcastTitle: string; mentionCount: number; mentionId: string; isApproved: boolean }[]> {
    const result = await db
      .select({
        episodeId: episodes.id,
        episodeTitle: episodes.title,
        podcastTitle: podcasts.title,
        mentionCount: sql<number>`1::int`,
        mentionId: entityMentions.id,
        isApproved: entityMentions.isApproved,
      })
      .from(entityMentions)
      .innerJoin(episodes, eq(entityMentions.episodeId, episodes.id))
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(eq(entityMentions.entityId, entityId))
      .orderBy(episodes.title);
    return result;
  }

  async createEntityMention(mention: InsertEntityMention): Promise<EntityMention> {
    const [result] = await db
      .insert(entityMentions)
      .values(mention)
      .onConflictDoUpdate({
        target: [entityMentions.entityId, entityMentions.episodeId],
        set: {
          mentionText: mention.mentionText,
          timestamp: mention.timestamp,
          segmentId: mention.segmentId,
        },
      })
      .returning();
    return result;
  }

  async approveEntityMention(id: string): Promise<EntityMention | undefined> {
    const [result] = await db
      .update(entityMentions)
      .set({ isApproved: true })
      .where(eq(entityMentions.id, id))
      .returning();
    return result;
  }

  async unapproveEntityMention(id: string): Promise<EntityMention | undefined> {
    const [result] = await db
      .update(entityMentions)
      .set({ isApproved: false })
      .where(eq(entityMentions.id, id))
      .returning();
    return result;
  }

  async deleteEntityMention(id: string): Promise<boolean> {
    const result = await db.delete(entityMentions).where(eq(entityMentions.id, id)).returning();
    return result.length > 0;
  }

  // ============ ENTITY CLICK TRACKING ============
  async logEntityClick(data: InsertEntityClick): Promise<EntityClick> {
    const [result] = await db.insert(entityClicks).values(data).returning();
    return result;
  }

  async getEntityClickStats(entityId: string): Promise<{ totalClicks: number; last30Days: number }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const [stats] = await db
      .select({
        totalClicks: sql<number>`COUNT(*)::int`,
        last30Days: sql<number>`COUNT(*) FILTER (WHERE ${entityClicks.clickedAt} > ${thirtyDaysAgo})::int`,
      })
      .from(entityClicks)
      .where(eq(entityClicks.entityId, entityId));
    
    return stats || { totalClicks: 0, last30Days: 0 };
  }

  async getTopEntitiesWithMentions(options?: { 
    type?: string; 
    minMentions?: number; 
    limit?: number 
  }): Promise<{
    id: string;
    name: string;
    type: string;
    description: string | null;
    affiliateNetwork: string | null;
    affiliateUrl: string | null;
    mentionCount: number;
    episodeCount: number;
    speakers: string[];
    quotes: { text: string; episodeId: string; episodeTitle: string; timestamp: number | null; context?: string; sentiment?: string }[];
  }[]> {
    const { type, minMentions = 1, limit = 50 } = options || {};

    const conditions = type ? and(eq(entities.type, type)) : undefined;

    const entityStats = await db
      .select({
        id: entities.id,
        name: entities.name,
        type: entities.type,
        description: entities.description,
        affiliateNetwork: entities.affiliateNetwork,
        affiliateUrl: entities.affiliateUrl,
        mentionCount: sql<number>`COUNT(DISTINCT ${entityMentions.id})::int`,
        episodeCount: sql<number>`COUNT(DISTINCT ${entityMentions.episodeId})::int`,
      })
      .from(entities)
      .leftJoin(entityMentions, eq(entities.id, entityMentions.entityId))
      .where(conditions)
      .groupBy(entities.id)
      .having(sql`COUNT(DISTINCT ${entityMentions.id}) >= ${minMentions}`)
      .orderBy(desc(sql`COUNT(DISTINCT ${entityMentions.id})`))
      .limit(limit);

    const results = await Promise.all(
      entityStats.map(async (entity) => {
        const mentions = await db
          .select({
            mentionText: entityMentions.mentionText,
            episodeId: entityMentions.episodeId,
            episodeTitle: episodes.title,
            timestamp: entityMentions.timestamp,
          })
          .from(entityMentions)
          .leftJoin(episodes, eq(entityMentions.episodeId, episodes.id))
          .where(eq(entityMentions.entityId, entity.id))
          .limit(10);

        const speakers = new Set<string>();
        const quotes: { text: string; episodeId: string; episodeTitle: string; timestamp: number | null; context?: string; sentiment?: string }[] = [];

        for (const mention of mentions) {
          if (mention.mentionText && mention.episodeId && mention.episodeTitle) {
            let parsed: { quote?: string; speaker?: string; context?: string; sentiment?: string } | null = null;
            
            try {
              parsed = JSON.parse(mention.mentionText);
            } catch {
              const speakerMatch = mention.mentionText.match(/- ([^(]+)/);
              const quoteMatch = mention.mentionText.match(/"([^"]+)"/);
              const contextMatch = mention.mentionText.match(/\(([^)]+)\)$/);
              if (speakerMatch || quoteMatch) {
                parsed = {
                  speaker: speakerMatch?.[1]?.trim(),
                  quote: quoteMatch?.[1],
                  context: contextMatch?.[1],
                };
              }
            }

            if (parsed) {
              if (parsed.speaker) {
                speakers.add(parsed.speaker);
              }
              if (parsed.quote) {
                quotes.push({
                  text: parsed.quote,
                  episodeId: mention.episodeId,
                  episodeTitle: mention.episodeTitle,
                  timestamp: mention.timestamp,
                  context: parsed.context,
                  sentiment: parsed.sentiment,
                });
              }
            }
          }
        }

        return {
          ...entity,
          speakers: Array.from(speakers),
          quotes,
        };
      })
    );

    return results;
  }

  // ============ CLIPS ============
  async getAllClipsWithMetadata(): Promise<ClipWithFullMetadata[]> {
    const results = await db
      .select({
        id: clips.id,
        episodeId: clips.episodeId,
        userId: clips.userId,
        annotationId: clips.annotationId,
        title: clips.title,
        startTime: clips.startTime,
        endTime: clips.endTime,
        transcriptText: clips.transcriptText,
        createdAt: clips.createdAt,
        authorName: sql<string>`COALESCE(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), ${users.email})`,
        authorAvatar: users.profileImageUrl,
        episodeTitle: episodes.title,
        podcastTitle: podcasts.title,
        podcastArtworkUrl: podcasts.artworkUrl,
        mediaUrl: episodes.mediaUrl,
      })
      .from(clips)
      .leftJoin(users, eq(clips.userId, users.id))
      .innerJoin(episodes, eq(clips.episodeId, episodes.id))
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .orderBy(desc(clips.createdAt));
    
    return results;
  }

  async getClipsByEpisode(episodeId: string): Promise<ClipWithAuthor[]> {
    const results = await db
      .select({
        id: clips.id,
        episodeId: clips.episodeId,
        userId: clips.userId,
        annotationId: clips.annotationId,
        title: clips.title,
        startTime: clips.startTime,
        endTime: clips.endTime,
        transcriptText: clips.transcriptText,
        createdAt: clips.createdAt,
        authorName: sql<string>`COALESCE(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), ${users.email})`,
        authorAvatar: users.profileImageUrl,
      })
      .from(clips)
      .leftJoin(users, eq(clips.userId, users.id))
      .where(eq(clips.episodeId, episodeId))
      .orderBy(desc(clips.createdAt));
    
    return results;
  }

  async getClipsByUser(userId: string): Promise<Clip[]> {
    return await db
      .select()
      .from(clips)
      .where(eq(clips.userId, userId))
      .orderBy(desc(clips.createdAt));
  }

  async getClip(id: string): Promise<ClipWithAuthor | undefined> {
    const [result] = await db
      .select({
        id: clips.id,
        episodeId: clips.episodeId,
        userId: clips.userId,
        annotationId: clips.annotationId,
        title: clips.title,
        startTime: clips.startTime,
        endTime: clips.endTime,
        transcriptText: clips.transcriptText,
        createdAt: clips.createdAt,
        authorName: sql<string>`COALESCE(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), ${users.email})`,
        authorAvatar: users.profileImageUrl,
      })
      .from(clips)
      .leftJoin(users, eq(clips.userId, users.id))
      .where(eq(clips.id, id));
    
    return result;
  }

  async getClipWithMetadata(id: string): Promise<ClipWithFullMetadata | undefined> {
    const [result] = await db
      .select({
        id: clips.id,
        episodeId: clips.episodeId,
        userId: clips.userId,
        annotationId: clips.annotationId,
        title: clips.title,
        startTime: clips.startTime,
        endTime: clips.endTime,
        transcriptText: clips.transcriptText,
        createdAt: clips.createdAt,
        authorName: sql<string>`COALESCE(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), ${users.email})`,
        authorAvatar: users.profileImageUrl,
        episodeTitle: episodes.title,
        podcastTitle: podcasts.title,
        podcastArtworkUrl: podcasts.artworkUrl,
        mediaUrl: episodes.mediaUrl,
      })
      .from(clips)
      .leftJoin(users, eq(clips.userId, users.id))
      .innerJoin(episodes, eq(clips.episodeId, episodes.id))
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(eq(clips.id, id));
    
    return result;
  }

  async createClip(clip: InsertClip): Promise<Clip> {
    const [result] = await db.insert(clips).values(clip).returning();
    return result;
  }

  async deleteClip(id: string): Promise<boolean> {
    const result = await db.delete(clips).where(eq(clips.id, id)).returning();
    return result.length > 0;
  }

  // Episode Segments methods (AI-generated topic/chapter markers)
  async getEpisodeSegmentsByEpisode(episodeId: string): Promise<EpisodeSegment[]> {
    return await db
      .select()
      .from(episodeSegments)
      .where(eq(episodeSegments.episodeId, episodeId))
      .orderBy(asc(episodeSegments.startTime));
  }

  async getEpisodeSegment(id: string): Promise<EpisodeSegment | undefined> {
    const [segment] = await db
      .select()
      .from(episodeSegments)
      .where(eq(episodeSegments.id, id));
    return segment;
  }

  async createEpisodeSegment(segment: InsertEpisodeSegment): Promise<EpisodeSegment> {
    const [result] = await db.insert(episodeSegments).values(segment).returning();
    return result;
  }

  async createEpisodeSegments(segments: InsertEpisodeSegment[]): Promise<EpisodeSegment[]> {
    if (segments.length === 0) return [];
    return await db.insert(episodeSegments).values(segments).returning();
  }

  async updateEpisodeSegment(id: string, data: Partial<InsertEpisodeSegment>): Promise<EpisodeSegment | undefined> {
    const [result] = await db
      .update(episodeSegments)
      .set(data)
      .where(eq(episodeSegments.id, id))
      .returning();
    return result;
  }

  async deleteEpisodeSegment(id: string): Promise<boolean> {
    const result = await db.delete(episodeSegments).where(eq(episodeSegments.id, id)).returning();
    return result.length > 0;
  }

  async deleteEpisodeSegmentsByEpisode(episodeId: string): Promise<number> {
    const result = await db
      .delete(episodeSegments)
      .where(eq(episodeSegments.episodeId, episodeId))
      .returning();
    return result.length;
  }

  // Episode Chapters methods (curated navigation chapters, V1 spec)
  async getEpisodeChaptersByEpisode(episodeId: string): Promise<EpisodeChapter[]> {
    return await db
      .select()
      .from(episodeChapters)
      .where(eq(episodeChapters.episodeId, episodeId))
      .orderBy(asc(episodeChapters.displayOrder));
  }

  async createEpisodeChapter(chapter: InsertEpisodeChapter): Promise<EpisodeChapter> {
    const [result] = await db.insert(episodeChapters).values(chapter).returning();
    return result;
  }

  async createEpisodeChapters(chapters: InsertEpisodeChapter[]): Promise<EpisodeChapter[]> {
    if (chapters.length === 0) return [];
    return await db.insert(episodeChapters).values(chapters).returning();
  }

  async deleteEpisodeChaptersByEpisode(episodeId: string): Promise<number> {
    const result = await db
      .delete(episodeChapters)
      .where(eq(episodeChapters.episodeId, episodeId))
      .returning();
    return result.length;
  }

  // Episode Highlights methods (shareable key moments)
  async getEpisodeHighlightsByEpisode(episodeId: string): Promise<EpisodeHighlight[]> {
    return await db
      .select()
      .from(episodeHighlights)
      .where(eq(episodeHighlights.episodeId, episodeId))
      .orderBy(asc(episodeHighlights.displayOrder));
  }

  async createEpisodeHighlights(highlights: InsertEpisodeHighlight[]): Promise<EpisodeHighlight[]> {
    if (highlights.length === 0) return [];
    return await db.insert(episodeHighlights).values(highlights).returning();
  }

  async deleteEpisodeHighlightsByEpisode(episodeId: string): Promise<number> {
    const result = await db
      .delete(episodeHighlights)
      .where(eq(episodeHighlights.episodeId, episodeId))
      .returning();
    return result.length;
  }

  // Viral Moments methods (TikTok/Reels-worthy clips)
  async getViralMomentsByEpisode(episodeId: string): Promise<ViralMoment[]> {
    return await db
      .select()
      .from(viralMoments)
      .where(eq(viralMoments.episodeId, episodeId))
      .orderBy(desc(viralMoments.viralityScore));
  }

  async createViralMoments(moments: InsertViralMoment[]): Promise<ViralMoment[]> {
    if (moments.length === 0) return [];
    return await db.insert(viralMoments).values(moments).returning();
  }

  async deleteViralMoment(id: string): Promise<boolean> {
    const result = await db
      .delete(viralMoments)
      .where(eq(viralMoments.id, id))
      .returning();
    return result.length > 0;
  }

  async deleteViralMomentsByEpisode(episodeId: string): Promise<number> {
    const result = await db
      .delete(viralMoments)
      .where(eq(viralMoments.episodeId, episodeId))
      .returning();
    return result.length;
  }

  async getTopViralMoments(limit: number = 20): Promise<ViralMoment[]> {
    return await db
      .select()
      .from(viralMoments)
      .orderBy(desc(viralMoments.viralityScore))
      .limit(limit);
  }

  async getViralMoment(id: string): Promise<ViralMoment | undefined> {
    const result = await db
      .select()
      .from(viralMoments)
      .where(eq(viralMoments.id, id))
      .limit(1);
    return result[0];
  }

  async updateViralMomentClipStatus(
    id: string,
    status: string,
    videoPath?: string | null,
    error?: string | null
  ): Promise<ViralMoment | undefined> {
    const updateData: Record<string, any> = {
      clipStatus: status,
    };
    if (videoPath !== undefined) {
      updateData.videoPath = videoPath;
    }
    if (error !== undefined) {
      updateData.clipError = error;
    }
    if (status === "ready") {
      updateData.clipExtractedAt = new Date();
      // Always clear error when status becomes ready
      updateData.clipError = null;
    }

    const [result] = await db
      .update(viralMoments)
      .set(updateData)
      .where(eq(viralMoments.id, id))
      .returning();
    return result;
  }

  async getViralMomentsPendingExtraction(limit: number = 10): Promise<ViralMoment[]> {
    return await db
      .select()
      .from(viralMoments)
      .where(eq(viralMoments.clipStatus, "pending"))
      .orderBy(desc(viralMoments.viralityScore))
      .limit(limit);
  }

  // Get all viral moments that need clips (pending OR failed, for upload workflow)
  async getAllViralMomentsNeedingClips(limit: number = 50): Promise<ViralMoment[]> {
    return await db
      .select()
      .from(viralMoments)
      .where(
        or(
          eq(viralMoments.clipStatus, "pending"),
          eq(viralMoments.clipStatus, "failed")
        )
      )
      .orderBy(desc(viralMoments.viralityScore))
      .limit(limit);
  }

  async updateViralMomentCaptionedPath(id: string, captionedPath: string): Promise<ViralMoment | undefined> {
    const [result] = await db
      .update(viralMoments)
      .set({ captionedPath })
      .where(eq(viralMoments.id, id))
      .returning();
    return result;
  }

  async getViralMomentsPendingCaptions(limit: number = 10): Promise<ViralMoment[]> {
    return await db
      .select()
      .from(viralMoments)
      .where(
        and(
          eq(viralMoments.clipStatus, "ready"),
          isNull(viralMoments.captionedPath)
        )
      )
      .orderBy(desc(viralMoments.viralityScore))
      .limit(limit);
  }

  async updateViralMomentOptimizedPath(id: string, optimizedPath: string, platform?: string): Promise<ViralMoment | undefined> {
    const updateData: Record<string, any> = { optimizedPath, updatedAt: new Date() };
    if (platform) updateData.platform = platform;
    const [result] = await db
      .update(viralMoments)
      .set(updateData)
      .where(eq(viralMoments.id, id))
      .returning();
    return result;
  }

  async updateViralMomentPosting(
    id: string,
    updates: { postingStatus?: string; description?: string; hashtags?: string[]; postedAt?: Date; postUrl?: string }
  ): Promise<ViralMoment | undefined> {
    const [result] = await db
      .update(viralMoments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(viralMoments.id, id))
      .returning();
    return result;
  }

  async updateViralMomentMetrics(
    id: string,
    metrics: { views?: number; likes?: number; comments?: number; shares?: number }
  ): Promise<ViralMoment | undefined> {
    const [result] = await db
      .update(viralMoments)
      .set({ ...metrics, updatedAt: new Date() })
      .where(eq(viralMoments.id, id))
      .returning();
    return result;
  }

  async getViralMomentsReadyForPosting(limit: number = 10): Promise<ViralMoment[]> {
    return await db
      .select()
      .from(viralMoments)
      .where(
        and(
          eq(viralMoments.clipStatus, "ready"),
          or(
            eq(viralMoments.postingStatus, "ready"),
            eq(viralMoments.postingStatus, "draft")
          ),
          not(isNull(viralMoments.captionedPath))
        )
      )
      .orderBy(desc(viralMoments.viralityScore))
      .limit(limit);
  }

  async getViralMomentsPosted(limit: number = 20): Promise<ViralMoment[]> {
    return await db
      .select()
      .from(viralMoments)
      .where(
        and(
          eq(viralMoments.clipStatus, "ready"),
          eq(viralMoments.postingStatus, "posted"),
          not(isNull(viralMoments.captionedPath))
        )
      )
      .orderBy(desc(viralMoments.updatedAt))
      .limit(limit);
  }

  // Clip Generation Runs methods
  async createClipGenerationRun(run: InsertClipGenerationRun): Promise<ClipGenerationRun> {
    const [result] = await db.insert(clipGenerationRuns).values(run).returning();
    return result;
  }

  async updateClipGenerationRun(id: string, updates: Partial<InsertClipGenerationRun>): Promise<ClipGenerationRun | undefined> {
    const [result] = await db
      .update(clipGenerationRuns)
      .set(updates)
      .where(eq(clipGenerationRuns.id, id))
      .returning();
    return result;
  }

  async getClipGenerationRuns(limit: number = 20): Promise<ClipGenerationRun[]> {
    return await db
      .select()
      .from(clipGenerationRuns)
      .orderBy(desc(clipGenerationRuns.startedAt))
      .limit(limit);
  }

  async getLatestClipGenerationRun(): Promise<ClipGenerationRun | undefined> {
    const [result] = await db
      .select()
      .from(clipGenerationRuns)
      .orderBy(desc(clipGenerationRuns.startedAt))
      .limit(1);
    return result;
  }

  // Episode Comments methods (YouTube comments for sentiment analysis)
  async getCommentsByEpisode(episodeId: string): Promise<EpisodeComment[]> {
    return await db
      .select()
      .from(episodeComments)
      .where(eq(episodeComments.episodeId, episodeId))
      .orderBy(desc(episodeComments.likeCount));
  }

  async createEpisodeComment(comment: InsertEpisodeComment): Promise<EpisodeComment> {
    const [result] = await db
      .insert(episodeComments)
      .values(comment)
      .onConflictDoUpdate({
        target: [episodeComments.episodeId, episodeComments.externalId],
        set: {
          likeCount: comment.likeCount,
          replyCount: comment.replyCount,
        },
      })
      .returning();
    return result;
  }

  async deleteCommentsByEpisode(episodeId: string): Promise<number> {
    const result = await db
      .delete(episodeComments)
      .where(eq(episodeComments.episodeId, episodeId))
      .returning();
    return result.length;
  }

  // Comment Segment Links methods (sentiment analysis linking)
  async createCommentSegmentLink(link: InsertCommentSegmentLink): Promise<CommentSegmentLink> {
    const [result] = await db
      .insert(commentSegmentLinks)
      .values(link)
      .returning();
    return result;
  }

  async getSegmentLinksByComment(commentId: string): Promise<CommentSegmentLink[]> {
    return await db
      .select()
      .from(commentSegmentLinks)
      .where(eq(commentSegmentLinks.commentId, commentId));
  }

  async getCommentsBySegment(segmentId: string): Promise<(CommentSegmentLink & { comment: EpisodeComment })[]> {
    const links = await db
      .select({
        id: commentSegmentLinks.id,
        commentId: commentSegmentLinks.commentId,
        segmentId: commentSegmentLinks.segmentId,
        sentimentLabel: commentSegmentLinks.sentimentLabel,
        confidence: commentSegmentLinks.confidence,
        createdAt: commentSegmentLinks.createdAt,
        comment: episodeComments,
      })
      .from(commentSegmentLinks)
      .innerJoin(episodeComments, eq(commentSegmentLinks.commentId, episodeComments.id))
      .where(eq(commentSegmentLinks.segmentId, segmentId))
      .orderBy(desc(episodeComments.likeCount));
    
    return links.map(l => ({
      id: l.id,
      commentId: l.commentId,
      segmentId: l.segmentId,
      sentimentLabel: l.sentimentLabel,
      confidence: l.confidence,
      createdAt: l.createdAt,
      comment: l.comment,
    }));
  }

  async getCommentSegmentLinksByEpisode(episodeId: string): Promise<CommentSegmentLink[]> {
    const comments = await this.getCommentsByEpisode(episodeId);
    const commentIds = comments.map(c => c.id);
    
    if (commentIds.length === 0) return [];
    
    return await db
      .select()
      .from(commentSegmentLinks)
      .where(inArray(commentSegmentLinks.commentId, commentIds));
  }

  async deleteSegmentLinksByEpisode(episodeId: string): Promise<number> {
    // Delete all links for comments belonging to this episode
    const comments = await this.getCommentsByEpisode(episodeId);
    const commentIds = comments.map(c => c.id);
    
    if (commentIds.length === 0) return 0;
    
    const result = await db
      .delete(commentSegmentLinks)
      .where(inArray(commentSegmentLinks.commentId, commentIds))
      .returning();
    return result.length;
  }

  async updateSegmentEngagement(segmentId: string, engagementScore: number, sentimentSummary: object): Promise<void> {
    await db
      .update(episodeSegments)
      .set({ engagementScore, sentimentSummary })
      .where(eq(episodeSegments.id, segmentId));
  }

  // Feature Flags methods
  async getFeatureFlag(key: string): Promise<FeatureFlag | undefined> {
    const [flag] = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, key));
    return flag;
  }

  async getAllFeatureFlags(): Promise<FeatureFlag[]> {
    return await db.select().from(featureFlags).orderBy(asc(featureFlags.key));
  }

  async setFeatureFlag(key: string, value: string, description?: string, updatedBy?: string): Promise<FeatureFlag> {
    // Upsert: update if exists, insert if not
    const existing = await this.getFeatureFlag(key);
    if (existing) {
      const [result] = await db
        .update(featureFlags)
        .set({
          value,
          description: description ?? existing.description,
          updatedBy: updatedBy ?? existing.updatedBy,
          updatedAt: new Date(),
        })
        .where(eq(featureFlags.key, key))
        .returning();
      return result;
    } else {
      const [result] = await db
        .insert(featureFlags)
        .values({
          key,
          value,
          description,
          updatedBy,
        })
        .returning();
      return result;
    }
  }

  async deleteFeatureFlag(key: string): Promise<boolean> {
    const result = await db
      .delete(featureFlags)
      .where(eq(featureFlags.key, key))
      .returning();
    return result.length > 0;
  }

  // Episode Sources methods
  async getEpisodeSourcesByEpisode(episodeId: string): Promise<EpisodeSource[]> {
    return await db
      .select()
      .from(episodeSources)
      .where(eq(episodeSources.episodeId, episodeId))
      .orderBy(desc(episodeSources.isCanonical), asc(episodeSources.createdAt));
  }

  async getEpisodeSource(id: string): Promise<EpisodeSource | undefined> {
    const [source] = await db
      .select()
      .from(episodeSources)
      .where(eq(episodeSources.id, id));
    return source;
  }

  async getEpisodeSourceByUrl(episodeId: string, sourceUrl: string): Promise<EpisodeSource | undefined> {
    const [source] = await db
      .select()
      .from(episodeSources)
      .where(and(eq(episodeSources.episodeId, episodeId), eq(episodeSources.sourceUrl, sourceUrl)));
    return source;
  }

  async getEpisodeSourceByYouTubeId(youtubeVideoId: string): Promise<EpisodeSource | undefined> {
    const [source] = await db
      .select()
      .from(episodeSources)
      .where(
        and(
          eq(episodeSources.platform, "youtube"),
          like(episodeSources.sourceUrl, `%${youtubeVideoId}%`)
        )
      );
    return source;
  }

  async getCanonicalSource(episodeId: string): Promise<EpisodeSource | undefined> {
    const [source] = await db
      .select()
      .from(episodeSources)
      .where(
        and(
          eq(episodeSources.episodeId, episodeId),
          eq(episodeSources.isCanonical, true)
        )
      );
    return source;
  }

  async createEpisodeSource(source: InsertEpisodeSource): Promise<EpisodeSource> {
    // If this is being set as canonical, unset any existing canonical source
    if (source.isCanonical) {
      await db
        .update(episodeSources)
        .set({ isCanonical: false })
        .where(eq(episodeSources.episodeId, source.episodeId));
    }

    const [result] = await db
      .insert(episodeSources)
      .values(source)
      .returning();
    return result;
  }

  async updateEpisodeSource(id: string, data: Partial<InsertEpisodeSource>): Promise<EpisodeSource | undefined> {
    // If setting as canonical, unset others first
    if (data.isCanonical === true) {
      const existing = await this.getEpisodeSource(id);
      if (existing) {
        await db
          .update(episodeSources)
          .set({ isCanonical: false })
          .where(eq(episodeSources.episodeId, existing.episodeId));
      }
    }

    const [result] = await db
      .update(episodeSources)
      .set(data)
      .where(eq(episodeSources.id, id))
      .returning();
    return result;
  }

  async deleteEpisodeSource(id: string): Promise<boolean> {
    const result = await db
      .delete(episodeSources)
      .where(eq(episodeSources.id, id))
      .returning();
    return result.length > 0;
  }

  async setCanonicalSource(episodeId: string, sourceId: string): Promise<EpisodeSource | undefined> {
    // First, unset all canonical flags for this episode
    await db
      .update(episodeSources)
      .set({ isCanonical: false })
      .where(eq(episodeSources.episodeId, episodeId));

    // Then set the specified source as canonical
    const [result] = await db
      .update(episodeSources)
      .set({ isCanonical: true })
      .where(eq(episodeSources.id, sourceId))
      .returning();
    return result;
  }

  // Jobs methods
  async getJob(id: string): Promise<Job | undefined> {
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, id));
    return job;
  }

  async getJobsByEpisodeSource(episodeSourceId: string): Promise<Job[]> {
    return await db
      .select()
      .from(jobs)
      .where(eq(jobs.episodeSourceId, episodeSourceId))
      .orderBy(desc(jobs.createdAt));
  }

  async getJobsByStatus(status: string, limit: number = 100): Promise<Job[]> {
    const now = new Date();
    return await db
      .select()
      .from(jobs)
      .where(and(
        eq(jobs.status, status),
        // Only get jobs that are ready to run (no nextRetryAt or nextRetryAt has passed)
        or(isNull(jobs.nextRetryAt), lte(jobs.nextRetryAt, now))
      ))
      // Priority: INGEST jobs first (content acquisition), then INTEL (AI analysis)
      // Uses SQL CASE expression to sort INGEST before INTEL
      .orderBy(
        sql`CASE WHEN ${jobs.pipelineStage} = 'INGEST' THEN 0 ELSE 1 END`,
        asc(jobs.createdAt)
      )
      .limit(limit);
  }

  async countJobsByStatus(status: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(jobs)
      .where(eq(jobs.status, status));
    return result[0]?.count ?? 0;
  }

  async getJobsByType(type: string, status?: string): Promise<Job[]> {
    if (status) {
      return await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.type, type), eq(jobs.status, status)))
        .orderBy(desc(jobs.createdAt));
    }
    return await db
      .select()
      .from(jobs)
      .where(eq(jobs.type, type))
      .orderBy(desc(jobs.createdAt));
  }

  async getJobByTypeAndSource(type: string, episodeSourceId: string): Promise<Job | undefined> {
    const [job] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.type, type), eq(jobs.episodeSourceId, episodeSourceId)))
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    return job;
  }

  async getAllEpisodesWithTranscripts(): Promise<Episode[]> {
    return await db
      .select()
      .from(episodes)
      .where(eq(episodes.transcriptStatus, "ready"))
      .orderBy(desc(episodes.createdAt));
  }

  async getAllJobs(limit: number = 100): Promise<Job[]> {
    return await db
      .select()
      .from(jobs)
      .orderBy(desc(jobs.createdAt))
      .limit(limit);
  }

  async createJob(job: InsertJob): Promise<Job> {
    // Auto-set pipelineStage based on job type if not provided
    const { JOB_TYPE_PIPELINE } = await import("@shared/schema");
    const pipelineStage = job.pipelineStage ?? JOB_TYPE_PIPELINE[job.type] ?? "INTEL";
    
    const [result] = await db
      .insert(jobs)
      .values({ ...job, pipelineStage })
      .returning();
    return result;
  }

  async updateJob(id: string, data: Partial<InsertJob>): Promise<Job | undefined> {
    const [result] = await db
      .update(jobs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    return result;
  }

  /**
   * Optimistic locking for job status transitions.
   * 
   * IMPORTANT: Use this instead of updateJob() when transitioning job status
   * to prevent race conditions in concurrent workers.
   * 
   * Contract:
   * - Claiming jobs: expectedStatus="pending", set startedAt + lockedBy
   * - Completing/failing: expectedStatus="running", clear startedAt + lockedBy
   * 
   * Returns null if the job's status doesn't match expectedStatus (someone else modified it).
   */
  async updateJobWhereStatus(id: string, expectedStatus: string, data: Partial<InsertJob>): Promise<Job | null> {
    const result = await db
      .update(jobs)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(jobs.id, id), eq(jobs.status, expectedStatus)))
      .returning();
    return result[0] ?? null;
  }

  /**
   * Find jobs that have been running longer than the threshold.
   * Used by stuck job recovery to detect crashed/hung workers.
   */
  async getStuckJobs(stuckThresholdMinutes: number = 15): Promise<Job[]> {
    const cutoff = new Date(Date.now() - stuckThresholdMinutes * 60 * 1000);
    return await db
      .select()
      .from(jobs)
      .where(and(
        eq(jobs.status, "running"),
        lt(jobs.startedAt, cutoff)
      ))
      .orderBy(asc(jobs.startedAt));
  }

  /**
   * Find running jobs locked by workers OTHER than the current worker.
   * Used on startup to immediately recover orphaned jobs from previous workers.
   */
  async getOrphanedRunningJobs(currentWorkerId: string): Promise<Job[]> {
    return await db
      .select()
      .from(jobs)
      .where(and(
        eq(jobs.status, "running"),
        ne(jobs.lockedBy, currentWorkerId)
      ))
      .orderBy(asc(jobs.startedAt));
  }

  async retryJob(id: string): Promise<Job | undefined> {
    const [result] = await db
      .update(jobs)
      .set({ 
        status: "pending",
        attempts: 0,
        lastError: null,
        updatedAt: new Date() 
      })
      .where(eq(jobs.id, id))
      .returning();
    return result;
  }

  async deleteJob(id: string): Promise<boolean> {
    const result = await db.delete(jobs).where(eq(jobs.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async cancelJob(id: string): Promise<Job | undefined> {
    const [result] = await db
      .update(jobs)
      .set({ 
        status: "error",
        lastError: "Cancelled by user",
        updatedAt: new Date() 
      })
      .where(eq(jobs.id, id))
      .returning();
    return result;
  }

  async getOrphanedEpisodes(stuckHours: number = 24): Promise<Array<{ id: string; title: string; transcriptStatus: string; updatedAt: Date; jobCount: number }>> {
    const cutoff = new Date(Date.now() - stuckHours * 60 * 60 * 1000);
    
    // Count active transcript-related jobs for this episode (linked through episode_sources)
    const results = await db
      .select({
        id: episodes.id,
        title: episodes.title,
        transcriptStatus: episodes.transcriptStatus,
        updatedAt: episodes.updatedAt,
        jobCount: sql<number>`(
          SELECT COUNT(*) FROM ${jobs} j
          INNER JOIN ${episodeSources} es ON j.episode_source_id = es.id
          WHERE es.episode_id = ${episodes.id}
          AND j.status IN ('pending', 'running')
        )::int`,
      })
      .from(episodes)
      .where(and(
        eq(episodes.transcriptStatus, "pending"),
        lt(episodes.updatedAt, cutoff)
      ))
      .orderBy(asc(episodes.updatedAt));
    
    // Filter to only those with no active jobs
    return results.filter(r => r.jobCount === 0);
  }

  // Job Failures methods
  async insertJobFailure(input: InsertJobFailure): Promise<JobFailure> {
    const [result] = await db
      .insert(jobFailures)
      .values({
        jobId: input.jobId,
        jobType: input.jobType,
        errorMessage: input.errorMessage.slice(0, 4000),
        errorStack: input.errorStack?.slice(0, 8000) ?? null,
        isTransient: input.isTransient,
      })
      .returning();
    return result;
  }

  async getRecentJobFailures(limit: number = 50, offset: number = 0): Promise<JobFailure[]> {
    return await db
      .select()
      .from(jobFailures)
      .orderBy(desc(jobFailures.createdAt))
      .limit(limit)
      .offset(offset);
  }

  // Annotation Reports methods
  async createAnnotationReport(report: InsertAnnotationReport): Promise<AnnotationReport> {
    const [result] = await db
      .insert(annotationReports)
      .values(report)
      .returning();
    return result;
  }

  async getAnnotationReports(opts: { status?: string; limit?: number; offset?: number }): Promise<AnnotationReportWithDetails[]> {
    const { status, limit = 50, offset = 0 } = opts;
    
    const reporter = db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    }).from(users).as("reporter");
    
    const annotationAuthor = db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    }).from(users).as("annotation_author");
    
    const reviewer = db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    }).from(users).as("reviewer");

    let query = db
      .select({
        report: annotationReports,
        reporter: {
          id: reporter.id,
          firstName: reporter.firstName,
          lastName: reporter.lastName,
          email: reporter.email,
        },
        annotation: {
          id: annotations.id,
          text: annotations.text,
          content: annotations.content,
          userId: annotations.userId,
        },
        annotationAuthor: {
          id: annotationAuthor.id,
          firstName: annotationAuthor.firstName,
          lastName: annotationAuthor.lastName,
          email: annotationAuthor.email,
        },
        reviewer: {
          id: reviewer.id,
          firstName: reviewer.firstName,
          lastName: reviewer.lastName,
        },
      })
      .from(annotationReports)
      .innerJoin(reporter, eq(annotationReports.reporterId, reporter.id))
      .innerJoin(annotations, eq(annotationReports.annotationId, annotations.id))
      .innerJoin(annotationAuthor, eq(annotations.userId, annotationAuthor.id))
      .leftJoin(reviewer, eq(annotationReports.reviewedBy, reviewer.id))
      .orderBy(desc(annotationReports.createdAt))
      .limit(limit)
      .offset(offset);

    if (status) {
      query = query.where(eq(annotationReports.status, status)) as typeof query;
    }

    const results = await query;
    
    return results.map(row => ({
      ...row.report,
      reporter: row.reporter,
      annotation: row.annotation,
      annotationAuthor: row.annotationAuthor,
      reviewer: row.reviewer,
    }));
  }

  async getAnnotationReportsByAnnotation(annotationId: string): Promise<AnnotationReport[]> {
    return await db
      .select()
      .from(annotationReports)
      .where(eq(annotationReports.annotationId, annotationId))
      .orderBy(desc(annotationReports.createdAt));
  }

  async getAnnotationReportCountByStatus(): Promise<{ status: string; count: number }[]> {
    const results = await db
      .select({
        status: annotationReports.status,
        count: count(),
      })
      .from(annotationReports)
      .groupBy(annotationReports.status);
    
    return results.map(r => ({ status: r.status, count: Number(r.count) }));
  }

  async updateAnnotationReportStatus(id: string, data: { status: string; reviewedBy: string; resolution?: string }): Promise<AnnotationReport | undefined> {
    const [result] = await db
      .update(annotationReports)
      .set({
        status: data.status,
        reviewedBy: data.reviewedBy,
        reviewedAt: new Date(),
        resolution: data.resolution ?? null,
      })
      .where(eq(annotationReports.id, id))
      .returning();
    return result;
  }

  async hasUserReportedAnnotation(userId: string, annotationId: string): Promise<boolean> {
    const [result] = await db
      .select({ id: annotationReports.id })
      .from(annotationReports)
      .where(and(
        eq(annotationReports.reporterId, userId),
        eq(annotationReports.annotationId, annotationId)
      ))
      .limit(1);
    return !!result;
  }

  // Video Events methods
  async getVideoEventsByEpisodeSource(episodeSourceId: string): Promise<VideoEvent[]> {
    return await db
      .select()
      .from(videoEvents)
      .where(eq(videoEvents.episodeSourceId, episodeSourceId))
      .orderBy(asc(videoEvents.startTime));
  }

  async getVideoEventsByEpisodeSourceAndType(episodeSourceId: string, eventType: string): Promise<VideoEvent[]> {
    return await db
      .select()
      .from(videoEvents)
      .where(and(
        eq(videoEvents.episodeSourceId, episodeSourceId),
        eq(videoEvents.eventType, eventType)
      ))
      .orderBy(asc(videoEvents.startTime));
  }

  async getVideoEventsByEpisode(episodeId: string): Promise<VideoEvent[]> {
    const sources = await this.getEpisodeSourcesByEpisode(episodeId);
    if (sources.length === 0) return [];
    
    const sourceIds = sources.map(s => s.id);
    return await db
      .select()
      .from(videoEvents)
      .where(inArray(videoEvents.episodeSourceId, sourceIds))
      .orderBy(asc(videoEvents.startTime));
  }

  async getVideoEvent(id: string): Promise<VideoEvent | undefined> {
    const [result] = await db
      .select()
      .from(videoEvents)
      .where(eq(videoEvents.id, id));
    return result;
  }

  async createVideoEvent(event: InsertVideoEvent): Promise<VideoEvent> {
    const [result] = await db
      .insert(videoEvents)
      .values(event)
      .returning();
    return result;
  }

  async createVideoEvents(events: InsertVideoEvent[]): Promise<VideoEvent[]> {
    if (events.length === 0) return [];
    return await db
      .insert(videoEvents)
      .values(events)
      .returning();
  }

  async deleteVideoEventsByEpisodeSource(episodeSourceId: string): Promise<number> {
    const result = await db
      .delete(videoEvents)
      .where(eq(videoEvents.episodeSourceId, episodeSourceId))
      .returning();
    return result.length;
  }

  // Source Transcripts methods
  async getSourceTranscriptsByEpisodeSource(episodeSourceId: string): Promise<SourceTranscript[]> {
    return await db
      .select()
      .from(sourceTranscripts)
      .where(eq(sourceTranscripts.episodeSourceId, episodeSourceId))
      .orderBy(desc(sourceTranscripts.createdAt));
  }

  async getSourceTranscript(id: string): Promise<SourceTranscript | undefined> {
    const [result] = await db
      .select()
      .from(sourceTranscripts)
      .where(eq(sourceTranscripts.id, id));
    return result;
  }

  async getSourceTranscriptSegments(sourceTranscriptId: string): Promise<SourceTranscriptSegment[]> {
    return await db
      .select()
      .from(sourceTranscriptSegments)
      .where(eq(sourceTranscriptSegments.sourceTranscriptId, sourceTranscriptId))
      .orderBy(asc(sourceTranscriptSegments.startTime));
  }

  async getSourceTranscriptSegmentsByEpisodeSource(episodeSourceId: string): Promise<SourceTranscriptSegment[]> {
    const transcripts = await this.getSourceTranscriptsByEpisodeSource(episodeSourceId);
    if (transcripts.length === 0) return [];
    
    const transcriptIds = transcripts.map(t => t.id);
    return await db
      .select()
      .from(sourceTranscriptSegments)
      .where(inArray(sourceTranscriptSegments.sourceTranscriptId, transcriptIds))
      .orderBy(asc(sourceTranscriptSegments.startTime));
  }

  async createSourceTranscript(transcript: InsertSourceTranscript): Promise<SourceTranscript> {
    const [result] = await db
      .insert(sourceTranscripts)
      .values(transcript)
      .returning();
    return result;
  }

  async createSourceTranscriptSegments(segments: InsertSourceTranscriptSegment[]): Promise<SourceTranscriptSegment[]> {
    if (segments.length === 0) return [];
    return await db
      .insert(sourceTranscriptSegments)
      .values(segments)
      .returning();
  }

  async deleteSourceTranscriptsByEpisodeSource(episodeSourceId: string): Promise<number> {
    const transcripts = await this.getSourceTranscriptsByEpisodeSource(episodeSourceId);
    if (transcripts.length === 0) return 0;
    
    const transcriptIds = transcripts.map(t => t.id);
    
    // Delete segments first
    await db
      .delete(sourceTranscriptSegments)
      .where(inArray(sourceTranscriptSegments.sourceTranscriptId, transcriptIds));
    
    // Then delete transcripts
    const result = await db
      .delete(sourceTranscripts)
      .where(eq(sourceTranscripts.episodeSourceId, episodeSourceId))
      .returning();
    
    return result.length;
  }

  // ============ Episode Diffs (Integrity Engine) ============
  async createEpisodeDiff(diff: InsertEpisodeDiff): Promise<EpisodeDiff> {
    const [result] = await db
      .insert(episodeDiffs)
      .values(diff)
      .returning();
    return result;
  }

  async getLatestEpisodeDiff(episodeId: string): Promise<EpisodeDiff | undefined> {
    const [result] = await db
      .select()
      .from(episodeDiffs)
      .where(eq(episodeDiffs.episodeId, episodeId))
      .orderBy(desc(episodeDiffs.createdAt))
      .limit(1);
    return result;
  }

  async getEpisodeDiffsByEpisode(episodeId: string): Promise<EpisodeDiff[]> {
    return await db
      .select()
      .from(episodeDiffs)
      .where(eq(episodeDiffs.episodeId, episodeId))
      .orderBy(desc(episodeDiffs.createdAt));
  }

  async getEpisodeDiff(id: string): Promise<EpisodeDiff | undefined> {
    const [result] = await db
      .select()
      .from(episodeDiffs)
      .where(eq(episodeDiffs.id, id));
    return result;
  }
  
  // ============ Analyzer Requests (PLG / Public Analysis) ============
  async createAnalyzerRequest(data: InsertAnalyzerRequest): Promise<AnalyzerRequest> {
    const [result] = await db
      .insert(analyzerRequests)
      .values(data)
      .returning();
    return result;
  }
  
  async getAnalyzerRequest(id: string): Promise<AnalyzerRequest | undefined> {
    const [result] = await db
      .select()
      .from(analyzerRequests)
      .where(eq(analyzerRequests.id, id));
    return result;
  }
  
  async updateAnalyzerRequestStatus(id: string, status: string, errorMessage?: string): Promise<AnalyzerRequest | undefined> {
    const [result] = await db
      .update(analyzerRequests)
      .set({
        status,
        errorMessage: errorMessage || null,
        updatedAt: new Date(),
      })
      .where(eq(analyzerRequests.id, id))
      .returning();
    return result;
  }
  
  async getAnalyzerRequestByYoutubeUrl(youtubeUrl: string): Promise<AnalyzerRequest | undefined> {
    const [result] = await db
      .select()
      .from(analyzerRequests)
      .where(eq(analyzerRequests.youtubeUrl, youtubeUrl))
      .orderBy(desc(analyzerRequests.createdAt))
      .limit(1);
    return result;
  }
  
  async updateAnalyzerRequestResults(id: string, results: any): Promise<AnalyzerRequest | undefined> {
    const [result] = await db
      .update(analyzerRequests)
      .set({
        results,
        status: "ready",
        updatedAt: new Date(),
      })
      .where(eq(analyzerRequests.id, id))
      .returning();
    return result;
  }
  
  async createAnalyzerLead(data: InsertAnalyzerLead): Promise<AnalyzerLead> {
    const [result] = await db
      .insert(analyzerLeads)
      .values(data)
      .returning();
    return result;
  }

  // ============ Demo Leads (B2B) ============
  async createDemoLead(data: InsertDemoLead): Promise<DemoLead> {
    const [result] = await db
      .insert(demoLeads)
      .values(data)
      .returning();
    return result;
  }

  // ============ Admin Notifications ============
  async createAdminNotification(data: InsertAdminNotification): Promise<AdminNotification> {
    const [result] = await db
      .insert(adminNotifications)
      .values(data)
      .returning();
    return result;
  }

  async getAdminNotifications(status: "unread" | "all", limit: number = 50, offset: number = 0): Promise<{ notifications: AdminNotification[]; total: number }> {
    let total = 0;
    let notifications: AdminNotification[] = [];
    
    if (status === "unread") {
      const [countResult] = await db
        .select({ count: count() })
        .from(adminNotifications)
        .where(eq(adminNotifications.isRead, false));
      
      total = countResult?.count ?? 0;
      
      notifications = await db
        .select()
        .from(adminNotifications)
        .where(eq(adminNotifications.isRead, false))
        .orderBy(desc(adminNotifications.createdAt))
        .limit(limit)
        .offset(offset);
    } else {
      const [countResult] = await db
        .select({ count: count() })
        .from(adminNotifications);
      
      total = countResult?.count ?? 0;
      
      notifications = await db
        .select()
        .from(adminNotifications)
        .orderBy(desc(adminNotifications.createdAt))
        .limit(limit)
        .offset(offset);
    }
    
    return { notifications, total };
  }

  async getUnreadNotificationCount(): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(adminNotifications)
      .where(eq(adminNotifications.isRead, false));
    return result?.count ?? 0;
  }

  async markNotificationRead(id: string): Promise<AdminNotification | undefined> {
    const [result] = await db
      .update(adminNotifications)
      .set({ isRead: true })
      .where(eq(adminNotifications.id, id))
      .returning();
    return result;
  }

  async markAllNotificationsRead(): Promise<number> {
    const result = await db
      .update(adminNotifications)
      .set({ isRead: true })
      .where(eq(adminNotifications.isRead, false))
      .returning();
    return result.length;
  }

  // ============ Canonical Entities (Knowledge Graph) ============
  async findCanonicalEntityByNameAndType(name: string, type: string): Promise<CanonicalEntity | undefined> {
    const [result] = await db
      .select()
      .from(canonicalEntities)
      .where(
        and(
          sql`lower(${canonicalEntities.name}) = lower(${name})`,
          eq(canonicalEntities.type, type)
        )
      );
    return result;
  }

  async createCanonicalEntity(entity: InsertCanonicalEntity): Promise<CanonicalEntity> {
    const [result] = await db
      .insert(canonicalEntities)
      .values(entity)
      .returning();
    return result;
  }

  async linkMentionToCanonical(link: InsertEntityLink): Promise<EntityLink> {
    const [result] = await db
      .insert(entityLinks)
      .values(link)
      .onConflictDoUpdate({
        target: [entityLinks.mentionId],
        set: {
          canonicalId: link.canonicalId,
          method: link.method,
          confidence: link.confidence,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async getEntityLinkByMentionId(mentionId: string): Promise<EntityLink | undefined> {
    const [result] = await db
      .select()
      .from(entityLinks)
      .where(eq(entityLinks.mentionId, mentionId));
    return result;
  }

  async getCanonicalEntitiesForEpisode(episodeId: string): Promise<CanonicalEntityWithMentions[]> {
    const results = await db
      .select({
        canonical: canonicalEntities,
        mention: entityMentions,
        link: entityLinks,
      })
      .from(entityLinks)
      .innerJoin(canonicalEntities, eq(entityLinks.canonicalId, canonicalEntities.id))
      .innerJoin(entityMentions, eq(entityLinks.mentionId, entityMentions.id))
      .where(eq(entityMentions.episodeId, episodeId))
      .orderBy(asc(canonicalEntities.type), asc(canonicalEntities.name));

    const groupedMap = new Map<string, CanonicalEntityWithMentions>();

    for (const row of results) {
      const canonicalId = row.canonical.id;
      if (!groupedMap.has(canonicalId)) {
        groupedMap.set(canonicalId, {
          ...row.canonical,
          mentions: [],
        });
      }
      groupedMap.get(canonicalId)!.mentions.push({
        mentionId: row.mention.id,
        rawText: row.mention.mentionText,
        statementId: row.mention.segmentId,
        timestamp: row.mention.timestamp,
        episodeId: row.mention.episodeId,
        method: row.link.method,
        confidence: row.link.confidence,
      });
    }

    return Array.from(groupedMap.values());
  }

  async getMentionsForCanonicalEntity(canonicalId: string): Promise<Array<{ mentionId: string; episodeId: string; rawText: string | null; timestamp: number | null; method: string; confidence: number }>> {
    const results = await db
      .select({
        mentionId: entityMentions.id,
        episodeId: entityMentions.episodeId,
        rawText: entityMentions.mentionText,
        timestamp: entityMentions.timestamp,
        method: entityLinks.method,
        confidence: entityLinks.confidence,
      })
      .from(entityLinks)
      .innerJoin(entityMentions, eq(entityLinks.mentionId, entityMentions.id))
      .where(eq(entityLinks.canonicalId, canonicalId))
      .orderBy(asc(entityMentions.timestamp));

    return results;
  }

  async deleteEntityLinksForEpisode(episodeId: string): Promise<number> {
    const mentionIds = await db
      .select({ id: entityMentions.id })
      .from(entityMentions)
      .where(eq(entityMentions.episodeId, episodeId));

    if (mentionIds.length === 0) return 0;

    const ids = mentionIds.map(m => m.id);
    const result = await db
      .delete(entityLinks)
      .where(inArray(entityLinks.mentionId, ids))
      .returning();
    return result.length;
  }

  async getCanonicalEntitiesWithStats(options: { q?: string; type?: string; limit?: number; offset?: number }): Promise<{ items: Array<{ id: string; name: string; type: string; mentionCount: number; episodeCount: number }>; total: number }> {
    const { q, type, limit = 50, offset = 0 } = options;
    
    const conditions: SQL[] = [];
    if (q) {
      conditions.push(ilike(canonicalEntities.name, `%${q}%`));
    }
    if (type) {
      conditions.push(eq(canonicalEntities.type, type));
    }

    const countResult = await db
      .select({ count: sql<number>`count(DISTINCT ${canonicalEntities.id})::int` })
      .from(canonicalEntities)
      .leftJoin(entityLinks, eq(entityLinks.canonicalId, canonicalEntities.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult[0]?.count ?? 0;

    const items = await db
      .select({
        id: canonicalEntities.id,
        name: canonicalEntities.name,
        type: canonicalEntities.type,
        mentionCount: sql<number>`COUNT(DISTINCT ${entityLinks.mentionId})::int`,
        episodeCount: sql<number>`COUNT(DISTINCT ${entityMentions.episodeId})::int`,
      })
      .from(canonicalEntities)
      .leftJoin(entityLinks, eq(entityLinks.canonicalId, canonicalEntities.id))
      .leftJoin(entityMentions, eq(entityMentions.id, entityLinks.mentionId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(canonicalEntities.id)
      .orderBy(desc(sql`COUNT(DISTINCT ${entityLinks.mentionId})`))
      .limit(limit)
      .offset(offset);

    return { items, total };
  }

  async getCanonicalEntityById(id: string): Promise<CanonicalEntity | undefined> {
    const [entity] = await db.select().from(canonicalEntities).where(eq(canonicalEntities.id, id));
    return entity;
  }

  async getCanonicalEntityWithMentions(id: string): Promise<{ entity: CanonicalEntity; mentions: Array<{ mentionId: string; rawText: string | null; episodeId: string; episodeTitle: string; startTime: number | null; statementText: string | null }> } | undefined> {
    const [entity] = await db.select().from(canonicalEntities).where(eq(canonicalEntities.id, id));
    if (!entity) return undefined;

    const mentionRows = await db
      .select({
        mentionId: entityMentions.id,
        rawText: entityMentions.mentionText,
        episodeId: entityMentions.episodeId,
        episodeTitle: episodes.title,
        startTime: entityMentions.timestamp,
        statementText: statements.text,
      })
      .from(entityLinks)
      .innerJoin(entityMentions, eq(entityLinks.mentionId, entityMentions.id))
      .innerJoin(episodes, eq(entityMentions.episodeId, episodes.id))
      .leftJoin(statements, eq(entityMentions.segmentId, statements.id))
      .where(eq(entityLinks.canonicalId, id))
      .orderBy(asc(episodes.title), asc(entityMentions.timestamp));

    return { entity, mentions: mentionRows };
  }

  async updateCanonicalEntity(id: string, data: Partial<InsertCanonicalEntity>): Promise<CanonicalEntity | undefined> {
    const [result] = await db
      .update(canonicalEntities)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(canonicalEntities.id, id))
      .returning();
    return result;
  }

  async mergeCanonicalEntities(sourceId: string, targetId: string): Promise<{ mergedCount: number }> {
    const result = await db
      .update(entityLinks)
      .set({ canonicalId: targetId, updatedAt: new Date() })
      .where(eq(entityLinks.canonicalId, sourceId))
      .returning();

    if (result.length > 0) {
      await db.delete(canonicalEntities).where(eq(canonicalEntities.id, sourceId));
    }

    return { mergedCount: result.length };
  }

  async getEpisodesWithUnlinkedMentions(): Promise<string[]> {
    const result = await db
      .selectDistinct({ episodeId: entityMentions.episodeId })
      .from(entityMentions)
      .leftJoin(entityLinks, eq(entityLinks.mentionId, entityMentions.id))
      .where(isNull(entityLinks.id));

    return result.map(r => r.episodeId);
  }

  async getIntegrityScore(episodeId: string): Promise<IntegrityScore | undefined> {
    const [score] = await db.select().from(integrityScores).where(eq(integrityScores.episodeId, episodeId));
    return score;
  }

  async upsertIntegrityScore(data: InsertIntegrityScore): Promise<IntegrityScore> {
    const [result] = await db
      .insert(integrityScores)
      .values(data)
      .onConflictDoUpdate({
        target: integrityScores.episodeId,
        set: {
          version: data.version,
          score: data.score,
          band: data.band,
          components: data.components,
          summary: data.summary,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    return result;
  }

  // ============ TOPIC METHODS (Phase 4) ============

  async createTopic(data: InsertTopic): Promise<Topic> {
    const [topic] = await db.insert(topics).values(data).returning();
    return topic;
  }

  async findTopicByName(name: string): Promise<Topic | undefined> {
    const [topic] = await db
      .select()
      .from(topics)
      .where(ilike(topics.name, name));
    return topic;
  }

  async updateTopic(id: string, data: Partial<InsertTopic>): Promise<Topic | undefined> {
    const [result] = await db
      .update(topics)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(topics.id, id))
      .returning();
    return result;
  }

  async getTopicsWithStats(options: { q?: string; limit?: number; offset?: number }): Promise<{ items: Array<{ id: string; name: string; description: string | null; statementCount: number; episodeCount: number; createdAt: Date }>; total: number }> {
    const { q, limit = 50, offset = 0 } = options;

    const conditions: SQL[] = [];
    if (q) {
      conditions.push(ilike(topics.name, `%${q}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total
    const [{ count: total }] = await db
      .select({ count: count() })
      .from(topics)
      .where(whereClause);

    // Get items with counts
    const items = await db
      .select({
        id: topics.id,
        name: topics.name,
        description: topics.description,
        createdAt: topics.createdAt,
        statementCount: sql<number>`COALESCE(COUNT(DISTINCT ${statementTopics.statementId}), 0)::int`,
        episodeCount: sql<number>`COALESCE(COUNT(DISTINCT ${statements.episodeId}), 0)::int`,
      })
      .from(topics)
      .leftJoin(statementTopics, eq(statementTopics.topicId, topics.id))
      .leftJoin(statements, eq(statements.id, statementTopics.statementId))
      .where(whereClause)
      .groupBy(topics.id, topics.name, topics.description, topics.createdAt)
      .orderBy(desc(sql`COALESCE(COUNT(DISTINCT ${statementTopics.statementId}), 0)`))
      .limit(limit)
      .offset(offset);

    return { items, total: Number(total) };
  }

  async getTopicById(id: string): Promise<Topic | undefined> {
    const [topic] = await db.select().from(topics).where(eq(topics.id, id));
    return topic;
  }

  async getTopicWithStatements(id: string): Promise<{ topic: Topic; statements: Array<{ statementId: string; episodeId: string; episodeTitle: string; startTime: number; text: string; isPrimary: boolean; confidence: number }> } | undefined> {
    const topic = await this.getTopicById(id);
    if (!topic) return undefined;

    const statementRows = await db
      .select({
        statementId: statements.id,
        episodeId: statements.episodeId,
        episodeTitle: episodes.title,
        startTime: statements.startTime,
        text: statements.text,
        isPrimary: statementTopics.isPrimary,
        confidence: statementTopics.confidence,
      })
      .from(statementTopics)
      .innerJoin(statements, eq(statements.id, statementTopics.statementId))
      .innerJoin(episodes, eq(episodes.id, statements.episodeId))
      .where(eq(statementTopics.topicId, id))
      .orderBy(asc(episodes.title), asc(statements.startTime));

    return { topic, statements: statementRows };
  }

  async getAllTopicsWithEmbeddings(): Promise<Topic[]> {
    return db.select().from(topics).where(sql`${topics.embedding} IS NOT NULL`);
  }

  // ============ STATEMENT-TOPIC LINKING METHODS (Phase 4) ============

  async linkStatementToTopic(data: InsertStatementTopic): Promise<StatementTopic> {
    const [link] = await db.insert(statementTopics).values(data).returning();
    return link;
  }

  async linkStatementsToTopics(links: InsertStatementTopic[]): Promise<StatementTopic[]> {
    if (links.length === 0) return [];
    const results = await db
      .insert(statementTopics)
      .values(links)
      .onConflictDoNothing()
      .returning();
    return results;
  }

  async getStatementsWithoutTopics(limit: number = 500): Promise<Array<{ id: string; text: string; embedding: any }>> {
    const result = await db
      .select({
        id: statements.id,
        text: statements.text,
        embedding: statements.embedding,
      })
      .from(statements)
      .leftJoin(statementTopics, eq(statementTopics.statementId, statements.id))
      .where(isNull(statementTopics.statementId))
      .limit(limit);

    return result;
  }

  async getStatementTopicLinks(statementId: string): Promise<StatementTopic[]> {
    return db.select().from(statementTopics).where(eq(statementTopics.statementId, statementId));
  }

  async getCandidateStatementsForTopicDiscovery(limit: number, minLength: number): Promise<Array<{ id: string; text: string; episodeId: string; episodeTitle: string }>> {
    const result = await db
      .select({
        id: statements.id,
        text: statements.text,
        episodeId: statements.episodeId,
        episodeTitle: episodes.title,
      })
      .from(statements)
      .innerJoin(statementClassifications, eq(statementClassifications.statementId, statements.id))
      .innerJoin(episodes, eq(episodes.id, statements.episodeId))
      .where(
        and(
          eq(statementClassifications.claimFlag, true),
          sql`LENGTH(${statements.text}) >= ${minLength}`
        )
      )
      .orderBy(sql`RANDOM()`)
      .limit(limit);

    return result;
  }

  async deleteTopic(id: string): Promise<boolean> {
    // First delete all statement_topics links
    await db.delete(statementTopics).where(eq(statementTopics.topicId, id));
    
    // Then delete the topic
    const result = await db.delete(topics).where(eq(topics.id, id)).returning();
    return result.length > 0;
  }

  // ============ STATEMENT RELATIONS (Phase 5) ============
  
  async getRelationsByEpisode(episodeId: string): Promise<Array<{
    id: string;
    relation: string;
    confidence: number;
    statementAId: string;
    statementBId: string;
    statementAText: string;
    statementBText: string;
    statementAStartTime: number;
    statementBStartTime: number;
  }>> {
    const stmtA = db.$with('stmt_a').as(
      db.select({
        id: statements.id,
        text: statements.text,
        startTime: statements.startTime,
      }).from(statements)
    );
    
    const stmtB = db.$with('stmt_b').as(
      db.select({
        id: statements.id,
        text: statements.text,
        startTime: statements.startTime,
      }).from(statements)
    );

    const result = await db
      .with(stmtA, stmtB)
      .select({
        id: statementRelations.id,
        relation: statementRelations.relation,
        confidence: statementRelations.confidence,
        statementAId: statementRelations.statementAId,
        statementBId: statementRelations.statementBId,
        statementAText: stmtA.text,
        statementBText: stmtB.text,
        statementAStartTime: stmtA.startTime,
        statementBStartTime: stmtB.startTime,
      })
      .from(statementRelations)
      .innerJoin(stmtA, eq(stmtA.id, statementRelations.statementAId))
      .innerJoin(stmtB, eq(stmtB.id, statementRelations.statementBId))
      .where(eq(statementRelations.episodeId, episodeId))
      .orderBy(asc(stmtA.startTime));

    return result;
  }

  async upsertRelation(data: InsertStatementRelation): Promise<StatementRelation> {
    const [relation] = await db
      .insert(statementRelations)
      .values(data)
      .onConflictDoUpdate({
        target: [statementRelations.statementAId, statementRelations.statementBId, statementRelations.relation],
        set: {
          confidence: data.confidence,
          scope: data.scope,
          updatedAt: new Date(),
        },
      })
      .returning();
    return relation;
  }

  async deleteRelationsForEpisode(episodeId: string, scope: RelationScope = "intra_episode"): Promise<number> {
    const result = await db
      .delete(statementRelations)
      .where(and(
        eq(statementRelations.episodeId, episodeId),
        eq(statementRelations.scope, scope)
      ))
      .returning();
    return result.length;
  }

  async getStatementsWithRelationContext(episodeId: string): Promise<Array<{
    id: string;
    text: string;
    startTime: number;
    claimFlag: boolean;
    topicIds: string[];
    canonicalEntityIds: string[];
  }>> {
    // Get all statements with their classifications
    const statementsWithClass = await db
      .select({
        id: statements.id,
        text: statements.text,
        startTime: statements.startTime,
        claimFlag: statementClassifications.claimFlag,
      })
      .from(statements)
      .innerJoin(statementClassifications, eq(statementClassifications.statementId, statements.id))
      .where(eq(statements.episodeId, episodeId))
      .orderBy(asc(statements.startTime));

    // Get topic links for all statements in episode
    const topicLinks = await db
      .select({
        statementId: statementTopics.statementId,
        topicId: statementTopics.topicId,
      })
      .from(statementTopics)
      .innerJoin(statements, eq(statements.id, statementTopics.statementId))
      .where(eq(statements.episodeId, episodeId));

    // Get entity links for all statements in episode (via segmentId)
    const entityLinkRows = await db
      .select({
        statementId: statements.id,
        canonicalEntityId: entityLinks.canonicalId,
      })
      .from(entityLinks)
      .innerJoin(entityMentions, eq(entityMentions.id, entityLinks.mentionId))
      .innerJoin(statements, and(
        eq(statements.segmentId, entityMentions.segmentId),
        eq(statements.episodeId, episodeId)
      ))
      .where(eq(entityMentions.episodeId, episodeId));

    // Build lookup maps
    const topicMap = new Map<string, string[]>();
    for (const link of topicLinks) {
      if (!topicMap.has(link.statementId)) {
        topicMap.set(link.statementId, []);
      }
      topicMap.get(link.statementId)!.push(link.topicId);
    }

    const entityMap = new Map<string, string[]>();
    for (const link of entityLinkRows) {
      if (link.statementId && link.canonicalEntityId) {
        if (!entityMap.has(link.statementId)) {
          entityMap.set(link.statementId, []);
        }
        entityMap.get(link.statementId)!.push(link.canonicalEntityId);
      }
    }

    // Combine data
    return statementsWithClass.map(s => ({
      id: s.id,
      text: s.text,
      startTime: s.startTime,
      claimFlag: s.claimFlag,
      topicIds: topicMap.get(s.id) || [],
      canonicalEntityIds: entityMap.get(s.id) || [],
    }));
  }

  async getEpisodeInsights(episodeId: string): Promise<EpisodeInsights> {
    // 1. Get integrity score
    const integrityScore = await this.getIntegrityScore(episodeId);
    
    // Parse components from JSON if available
    let metricsFromComponents: { certainty: number; skepticism: number; sentiment: number; emotionalIntensity: number } | null = null;
    if (integrityScore?.components) {
      const comp = integrityScore.components as any;
      metricsFromComponents = {
        certainty: comp.metrics?.avgCertainty ?? comp.metrics?.certainty ?? 0,
        skepticism: comp.metrics?.avgSkepticism ?? comp.metrics?.skepticism ?? 0,
        sentiment: comp.metrics?.avgSentiment ?? comp.metrics?.sentiment ?? 0,
        emotionalIntensity: comp.metrics?.avgEmotionalIntensity ?? comp.metrics?.emotionalIntensity ?? 0,
      };
    }

    // 2. Get relation counts for integrity metrics
    const relationCounts = await db
      .select({
        relation: statementRelations.relation,
        count: sql<number>`count(*)::int`,
      })
      .from(statementRelations)
      .where(eq(statementRelations.episodeId, episodeId))
      .groupBy(statementRelations.relation);
    
    const contradictionsCount = relationCounts.find(r => r.relation === 'contradicts')?.count ?? 0;
    const supportsCount = relationCounts.find(r => r.relation === 'supports')?.count ?? 0;

    // 3. Get top topics by statement count
    const topTopics = await db
      .select({
        id: topics.id,
        name: topics.name,
        statementCount: sql<number>`count(${statementTopics.id})::int`,
      })
      .from(topics)
      .innerJoin(statementTopics, eq(statementTopics.topicId, topics.id))
      .innerJoin(statements, eq(statements.id, statementTopics.statementId))
      .where(eq(statements.episodeId, episodeId))
      .groupBy(topics.id, topics.name)
      .orderBy(desc(sql`count(${statementTopics.id})`))
      .limit(5);

    // 4. Get top entities by mention count
    const topEntities = await db
      .select({
        id: canonicalEntities.id,
        name: canonicalEntities.name,
        type: canonicalEntities.type,
        mentionCount: sql<number>`count(${entityLinks.id})::int`,
      })
      .from(canonicalEntities)
      .innerJoin(entityLinks, eq(entityLinks.canonicalId, canonicalEntities.id))
      .innerJoin(entityMentions, eq(entityMentions.id, entityLinks.mentionId))
      .where(eq(entityMentions.episodeId, episodeId))
      .groupBy(canonicalEntities.id, canonicalEntities.name, canonicalEntities.type)
      .orderBy(desc(sql`count(${entityLinks.id})`))
      .limit(10);

    // 5. Get key claims (high certainty, claimFlag = true)
    const keyClaims = await db
      .select({
        statementId: statements.id,
        startTime: statements.startTime,
        text: statements.text,
        certainty: statementClassifications.certainty,
        polarity: statementClassifications.polarity,
      })
      .from(statements)
      .innerJoin(statementClassifications, eq(statementClassifications.statementId, statements.id))
      .where(and(
        eq(statements.episodeId, episodeId),
        eq(statementClassifications.claimFlag, true),
        sql`${statementClassifications.certainty} >= 0.7`
      ))
      .orderBy(desc(statementClassifications.certainty), asc(statements.startTime))
      .limit(5);

    // 6. Get contradictions (from statement_relations)
    const contradictions = await db
      .select({
        statementAId: statementRelations.statementAId,
        statementBId: statementRelations.statementBId,
        confidence: statementRelations.confidence,
        statementAText: sql<string>`sa.text`,
        statementBText: sql<string>`sb.text`,
        statementAStartTime: sql<number | null>`sa.start_time`,
        statementBStartTime: sql<number | null>`sb.start_time`,
      })
      .from(statementRelations)
      .innerJoin(sql`statements sa`, sql`sa.id = ${statementRelations.statementAId}`)
      .innerJoin(sql`statements sb`, sql`sb.id = ${statementRelations.statementBId}`)
      .where(and(
        eq(statementRelations.episodeId, episodeId),
        eq(statementRelations.relation, 'contradicts'),
        sql`${statementRelations.confidence} >= 0.7`
      ))
      .orderBy(desc(statementRelations.confidence))
      .limit(10);

    // 7. Get emotional peaks (high absolute sentiment)
    const emotionalPeaks = await db
      .select({
        statementId: statements.id,
        startTime: statements.startTime,
        text: statements.text,
        sentiment: statementClassifications.sentiment,
      })
      .from(statements)
      .innerJoin(statementClassifications, eq(statementClassifications.statementId, statements.id))
      .where(and(
        eq(statements.episodeId, episodeId),
        sql`ABS(${statementClassifications.sentiment}) >= 0.6`
      ))
      .orderBy(desc(sql`ABS(${statementClassifications.sentiment})`))
      .limit(5);

    // Build the response
    return {
      integrity: integrityScore ? {
        score: Math.round(integrityScore.score),
        band: integrityScore.band as IntegrityBand,
        summary: integrityScore.summary,
        metrics: {
          certainty: metricsFromComponents?.certainty ?? 0,
          skepticism: metricsFromComponents?.skepticism ?? 0,
          sentiment: metricsFromComponents?.sentiment ?? 0,
          emotionalIntensity: metricsFromComponents?.emotionalIntensity ?? 0,
          contradictionsCount,
          supportsCount,
        },
      } : null,
      topics: topTopics.map(t => ({
        id: t.id,
        name: t.name,
        statementCount: t.statementCount,
      })),
      entities: topEntities.map(e => ({
        id: e.id,
        name: e.name,
        type: e.type as CanonicalEntityType,
        mentionCount: e.mentionCount,
      })),
      keyClaims: keyClaims.map(c => ({
        statementId: c.statementId,
        startTime: c.startTime,
        text: c.text,
        certainty: c.certainty,
        polarity: c.polarity as StatementPolarityType | null,
      })),
      contradictions: contradictions.map(c => ({
        statementAId: c.statementAId,
        statementBId: c.statementBId,
        statementAText: c.statementAText,
        statementBText: c.statementBText,
        statementAStartTime: c.statementAStartTime,
        statementBStartTime: c.statementBStartTime,
        confidence: c.confidence,
      })),
      emotionalPeaks: emotionalPeaks.map(e => ({
        statementId: e.statementId,
        startTime: e.startTime,
        text: e.text,
        sentiment: e.sentiment,
        intensity: Math.abs(e.sentiment), // Use absolute sentiment as intensity
      })),
    };
  }

  // ============ INGESTION PROGRAMS METHODS (Phase 9) ============
  
  async getAllPrograms(): Promise<Program[]> {
    return db.select().from(programs).orderBy(desc(programs.createdAt));
  }

  async getProgram(id: string): Promise<Program | undefined> {
    const [program] = await db.select().from(programs).where(eq(programs.id, id));
    return program;
  }

  async createProgram(data: InsertProgram): Promise<Program> {
    const [program] = await db.insert(programs).values(data).returning();
    return program;
  }

  async updateProgram(id: string, data: Partial<InsertProgram>): Promise<Program | undefined> {
    const [program] = await db
      .update(programs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(programs.id, id))
      .returning();
    return program;
  }

  async deleteProgram(id: string): Promise<boolean> {
    const result = await db.delete(programs).where(eq(programs.id, id)).returning();
    return result.length > 0;
  }

  async updateProgramLastAgentRun(id: string): Promise<void> {
    await db
      .update(programs)
      .set({ lastAgentRun: new Date(), updatedAt: new Date() })
      .where(eq(programs.id, id));
  }

  // ============ PROGRAM SOURCES METHODS ============

  async getProgramSources(programId: string): Promise<ProgramSource[]> {
    return db.select().from(programSources).where(eq(programSources.programId, programId)).orderBy(desc(programSources.createdAt));
  }

  async getProgramSource(id: string): Promise<ProgramSource | undefined> {
    const [source] = await db.select().from(programSources).where(eq(programSources.id, id));
    return source;
  }

  async createProgramSource(data: InsertProgramSource): Promise<ProgramSource> {
    const [source] = await db.insert(programSources).values(data).returning();
    return source;
  }

  async updateProgramSource(id: string, data: Partial<InsertProgramSource>): Promise<ProgramSource | undefined> {
    const [source] = await db
      .update(programSources)
      .set(data)
      .where(eq(programSources.id, id))
      .returning();
    return source;
  }

  async deleteProgramSource(id: string): Promise<boolean> {
    const result = await db.delete(programSources).where(eq(programSources.id, id)).returning();
    return result.length > 0;
  }

  async updateProgramSourcePolledAt(id: string): Promise<void> {
    await db
      .update(programSources)
      .set({ lastPolledAt: new Date() })
      .where(eq(programSources.id, id));
  }

  // ============ INGESTION EVENTS METHODS ============

  async getUnprocessedEvents(programId: string, limit: number = 100): Promise<IngestionEvent[]> {
    return db
      .select()
      .from(ingestionEvents)
      .where(and(
        eq(ingestionEvents.programId, programId),
        isNull(ingestionEvents.processedAt)
      ))
      .orderBy(asc(ingestionEvents.observedAt))
      .limit(limit);
  }

  async createIngestionEvent(data: InsertIngestionEvent): Promise<IngestionEvent> {
    const [event] = await db.insert(ingestionEvents).values(data).returning();
    return event;
  }

  async markEventsProcessed(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    await db
      .update(ingestionEvents)
      .set({ processedAt: new Date() })
      .where(inArray(ingestionEvents.id, eventIds));
  }

  async getRecentEvents(programId: string, limit: number = 50): Promise<IngestionEvent[]> {
    return db
      .select()
      .from(ingestionEvents)
      .where(eq(ingestionEvents.programId, programId))
      .orderBy(desc(ingestionEvents.observedAt))
      .limit(limit);
  }

  async getIngestionEvent(id: string): Promise<IngestionEvent | undefined> {
    const [event] = await db
      .select()
      .from(ingestionEvents)
      .where(eq(ingestionEvents.id, id));
    return event;
  }

  async updateIngestionEvent(id: string, data: { actionStatus?: string; episodeId?: string | null; processedAt?: Date | null }): Promise<IngestionEvent | undefined> {
    const [event] = await db
      .update(ingestionEvents)
      .set(data)
      .where(eq(ingestionEvents.id, id))
      .returning();
    return event;
  }

  async getEventsByIds(ids: string[]): Promise<IngestionEvent[]> {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(ingestionEvents)
      .where(inArray(ingestionEvents.id, ids));
  }

  async getYoutubeEventsByProgram(programId: string): Promise<IngestionEvent[]> {
    return db
      .select()
      .from(ingestionEvents)
      .where(and(
        eq(ingestionEvents.programId, programId),
        eq(ingestionEvents.type, "youtube_upload_found")
      ))
      .orderBy(desc(ingestionEvents.observedAt));
  }

  // ============ INGESTION RECOMMENDATIONS METHODS ============

  async getPendingRecommendations(programId?: string): Promise<IngestionRecommendation[]> {
    const conditions = [eq(ingestionRecommendations.status, "pending")];
    if (programId) {
      conditions.push(eq(ingestionRecommendations.programId, programId));
    }
    return db
      .select()
      .from(ingestionRecommendations)
      .where(and(...conditions))
      .orderBy(desc(ingestionRecommendations.createdAt));
  }

  async createRecommendation(data: InsertIngestionRecommendation): Promise<IngestionRecommendation> {
    const [rec] = await db.insert(ingestionRecommendations).values(data).returning();
    return rec;
  }

  async createRecommendations(data: InsertIngestionRecommendation[]): Promise<IngestionRecommendation[]> {
    if (data.length === 0) return [];
    return db.insert(ingestionRecommendations).values(data).returning();
  }

  async approveRecommendation(id: string, userId: string): Promise<IngestionRecommendation | undefined> {
    const [rec] = await db
      .update(ingestionRecommendations)
      .set({ status: "approved", approvedBy: userId, approvedAt: new Date() })
      .where(eq(ingestionRecommendations.id, id))
      .returning();
    return rec;
  }

  async rejectRecommendation(id: string, userId: string): Promise<IngestionRecommendation | undefined> {
    const [rec] = await db
      .update(ingestionRecommendations)
      .set({ status: "rejected", approvedBy: userId, approvedAt: new Date() })
      .where(eq(ingestionRecommendations.id, id))
      .returning();
    return rec;
  }

  async executeRecommendation(id: string): Promise<IngestionRecommendation | undefined> {
    const [rec] = await db
      .update(ingestionRecommendations)
      .set({ status: "executed", executedAt: new Date() })
      .where(eq(ingestionRecommendations.id, id))
      .returning();
    return rec;
  }

  async getRecommendationsByAgentRun(agentRunId: string): Promise<IngestionRecommendation[]> {
    return db
      .select()
      .from(ingestionRecommendations)
      .where(eq(ingestionRecommendations.agentRunId, agentRunId))
      .orderBy(desc(ingestionRecommendations.createdAt));
  }

  async getDailyRecommendationCounts(programId: string): Promise<{ catalog: number; tier1: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const results = await db
      .select({
        action: ingestionRecommendations.action,
        count: count(),
      })
      .from(ingestionRecommendations)
      .where(and(
        eq(ingestionRecommendations.programId, programId),
        sql`${ingestionRecommendations.createdAt} >= ${today}`,
        or(
          eq(ingestionRecommendations.action, "catalog"),
          eq(ingestionRecommendations.action, "tier1_skim")
        )
      ))
      .groupBy(ingestionRecommendations.action);
    
    const counts = { catalog: 0, tier1: 0 };
    for (const r of results) {
      if (r.action === "catalog") counts.catalog = Number(r.count);
      if (r.action === "tier1_skim") counts.tier1 = Number(r.count);
    }
    return counts;
  }

  // ============ USER CLIP REQUESTS METHODS ============

  async createUserClipRequest(data: InsertUserClipRequest): Promise<UserClipRequest> {
    const [request] = await db.insert(userClipRequests).values(data).returning();
    return request;
  }

  async getUserClipRequests(userId: string): Promise<UserClipRequest[]> {
    return db
      .select()
      .from(userClipRequests)
      .where(eq(userClipRequests.userId, userId))
      .orderBy(desc(userClipRequests.createdAt));
  }

  async getUserClipRequest(id: string): Promise<UserClipRequest | undefined> {
    const [request] = await db
      .select()
      .from(userClipRequests)
      .where(eq(userClipRequests.id, id));
    return request;
  }

  async updateUserClipRequest(id: string, data: Partial<UserClipRequest>): Promise<UserClipRequest | undefined> {
    const [request] = await db
      .update(userClipRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userClipRequests.id, id))
      .returning();
    return request;
  }

  async getPendingUserClipRequests(): Promise<UserClipRequest[]> {
    return db
      .select()
      .from(userClipRequests)
      .where(eq(userClipRequests.status, "pending"))
      .orderBy(userClipRequests.createdAt);
  }

  async getAnalyzingUserClipRequests(): Promise<UserClipRequest[]> {
    return db
      .select()
      .from(userClipRequests)
      .where(eq(userClipRequests.status, "analyzing"))
      .orderBy(userClipRequests.createdAt);
  }

  // ============ CLIP ORDERS ============
  async createClipOrder(data: InsertClipOrder): Promise<ClipOrder> {
    const [order] = await db.insert(clipOrders).values(data).returning();
    return order;
  }

  async getClipOrder(id: string): Promise<ClipOrder | undefined> {
    const [order] = await db
      .select()
      .from(clipOrders)
      .where(eq(clipOrders.id, id));
    return order;
  }

  async getClipOrderByStripeSession(sessionId: string): Promise<ClipOrder | undefined> {
    const [order] = await db
      .select()
      .from(clipOrders)
      .where(eq(clipOrders.stripeSessionId, sessionId));
    return order;
  }

  async getUserClipOrders(userId: string): Promise<ClipOrder[]> {
    return db
      .select()
      .from(clipOrders)
      .where(eq(clipOrders.userId, userId))
      .orderBy(desc(clipOrders.createdAt));
  }

  async getAllClipOrders(): Promise<ClipOrder[]> {
    return db
      .select()
      .from(clipOrders)
      .orderBy(desc(clipOrders.createdAt));
  }

  async getPendingClipOrders(): Promise<ClipOrder[]> {
    return db
      .select()
      .from(clipOrders)
      .where(or(
        eq(clipOrders.status, "paid"),
        eq(clipOrders.status, "processing")
      ))
      .orderBy(clipOrders.createdAt);
  }

  async updateClipOrder(id: string, data: Partial<ClipOrder>): Promise<ClipOrder | undefined> {
    const [order] = await db
      .update(clipOrders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(clipOrders.id, id))
      .returning();
    return order;
  }

  // ============ ZOOM ANALYSIS METHODS ============

  async getEpisodeZoomAnalysis(episodeId: string): Promise<EpisodeZoomAnalysis | undefined> {
    const [analysis] = await db
      .select()
      .from(episodeZoomAnalysis)
      .where(eq(episodeZoomAnalysis.episodeId, episodeId));
    return analysis;
  }

  async upsertEpisodeZoomAnalysis(data: InsertEpisodeZoomAnalysis): Promise<EpisodeZoomAnalysis> {
    const existing = await this.getEpisodeZoomAnalysis(data.episodeId);
    if (existing) {
      const [updated] = await db
        .update(episodeZoomAnalysis)
        .set({ 
          analysisVersion: data.analysisVersion,
          payload: data.payload,
          createdAt: new Date(),
        })
        .where(eq(episodeZoomAnalysis.episodeId, data.episodeId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(episodeZoomAnalysis).values(data).returning();
    return created;
  }

  async deleteEpisodeZoomAnalysis(episodeId: string): Promise<boolean> {
    const result = await db
      .delete(episodeZoomAnalysis)
      .where(eq(episodeZoomAnalysis.episodeId, episodeId))
      .returning();
    return result.length > 0;
  }

  // ============ CLAIM INSTANCES METHODS ============

  async getClaimInstancesByEpisode(episodeId: string): Promise<ClaimInstance[]> {
    return db
      .select()
      .from(claimInstances)
      .where(eq(claimInstances.episodeId, episodeId))
      .orderBy(asc(claimInstances.startMs));
  }

  async getClaimInstancesByKind(claimKind: string, limit: number = 100): Promise<ClaimInstance[]> {
    return db
      .select()
      .from(claimInstances)
      .where(eq(claimInstances.claimKind, claimKind))
      .orderBy(desc(claimInstances.createdAt))
      .limit(limit);
  }

  async getClaimInstancesBySourceType(sourceType: string, limit: number = 100): Promise<ClaimInstance[]> {
    return db
      .select()
      .from(claimInstances)
      .where(eq(claimInstances.sourceType, sourceType))
      .orderBy(desc(claimInstances.createdAt))
      .limit(limit);
  }

  async createClaimInstance(data: InsertClaimInstance): Promise<ClaimInstance> {
    const [created] = await db.insert(claimInstances).values(data).returning();
    return created;
  }

  async createClaimInstances(instances: InsertClaimInstance[]): Promise<number> {
    if (instances.length === 0) return 0;
    await db.insert(claimInstances).values(instances);
    return instances.length;
  }

  async deleteClaimInstancesByEpisode(episodeId: string): Promise<number> {
    const result = await db
      .delete(claimInstances)
      .where(eq(claimInstances.episodeId, episodeId))
      .returning();
    return result.length;
  }

  async getClaimInstancesRollup(sourceType?: string): Promise<Array<{ claimKind: string; count: number }>> {
    const baseQuery = db
      .select({
        claimKind: claimInstances.claimKind,
        count: count(),
      })
      .from(claimInstances);
    
    if (sourceType) {
      return baseQuery
        .where(eq(claimInstances.sourceType, sourceType))
        .groupBy(claimInstances.claimKind);
    }
    return baseQuery.groupBy(claimInstances.claimKind);
  }

  // ============ SPEAKER IDENTITY GRAPH ============
  async getSpeaker(id: string): Promise<Speaker | undefined> {
    const [speaker] = await db.select().from(speakers).where(eq(speakers.id, id));
    return speaker;
  }

  async getSpeakerByName(name: string): Promise<Speaker | undefined> {
    const [speaker] = await db.select().from(speakers).where(sql`lower(${speakers.name}) = lower(${name})`);
    return speaker;
  }

  async getAllSpeakers(limit = 100, offset = 0): Promise<Speaker[]> {
    return db.select().from(speakers).orderBy(desc(speakers.totalEpisodes)).limit(limit).offset(offset);
  }

  async createSpeaker(data: InsertSpeaker): Promise<Speaker> {
    const [speaker] = await db.insert(speakers).values(data).returning();
    return speaker;
  }

  async updateSpeaker(id: string, data: Partial<InsertSpeaker>): Promise<Speaker | undefined> {
    const [speaker] = await db.update(speakers).set({ ...data, updatedAt: new Date() }).where(eq(speakers.id, id)).returning();
    return speaker;
  }

  async getSpeakerAppearances(speakerId: string): Promise<SpeakerAppearance[]> {
    return db.select().from(speakerAppearances).where(eq(speakerAppearances.speakerId, speakerId));
  }

  async getEpisodeSpeakers(episodeId: string): Promise<(SpeakerAppearance & { speaker: Speaker })[]> {
    const rows = await db
      .select()
      .from(speakerAppearances)
      .innerJoin(speakers, eq(speakerAppearances.speakerId, speakers.id))
      .where(eq(speakerAppearances.episodeId, episodeId));
    return rows.map(r => ({ ...r.speaker_appearances, speaker: r.speakers }));
  }

  async createSpeakerAppearance(data: InsertSpeakerAppearance): Promise<SpeakerAppearance> {
    const [appearance] = await db.insert(speakerAppearances).values(data).onConflictDoNothing().returning();
    return appearance;
  }

  async getSpeakerWithAppearances(speakerId: string): Promise<SpeakerWithAppearances | undefined> {
    const speaker = await this.getSpeaker(speakerId);
    if (!speaker) return undefined;

    const rows = await db
      .select({
        episodeId: speakerAppearances.episodeId,
        episodeTitle: episodes.title,
        podcastId: speakerAppearances.podcastId,
        podcastTitle: podcasts.title,
        role: speakerAppearances.role,
        statementCount: speakerAppearances.statementCount,
        publishedAt: episodes.publishedAt,
      })
      .from(speakerAppearances)
      .innerJoin(episodes, eq(speakerAppearances.episodeId, episodes.id))
      .innerJoin(podcasts, eq(speakerAppearances.podcastId, podcasts.id))
      .where(eq(speakerAppearances.speakerId, speakerId))
      .orderBy(desc(episodes.publishedAt));

    return {
      ...speaker,
      appearances: rows.map(r => ({
        ...r,
        publishedAt: r.publishedAt?.toISOString() ?? "",
      })),
    };
  }

  async searchSpeakers(query: string, limit = 20): Promise<Speaker[]> {
    return db
      .select()
      .from(speakers)
      .where(or(
        ilike(speakers.name, `%${query}%`),
        sql`EXISTS (SELECT 1 FROM unnest(${speakers.aliases}) alias WHERE alias ILIKE ${'%' + query + '%'})`
      ))
      .orderBy(desc(speakers.totalEpisodes))
      .limit(limit);
  }

  // ============ WEBHOOK SYSTEM ============
  async getWebhooks(): Promise<Webhook[]> {
    return db.select().from(webhooks).orderBy(desc(webhooks.createdAt));
  }

  async getActiveWebhooksForEvent(eventType: string): Promise<Webhook[]> {
    return db
      .select()
      .from(webhooks)
      .where(and(
        eq(webhooks.isActive, true),
        sql`${eventType} = ANY(${webhooks.events})`
      ));
  }

  async createWebhook(data: InsertWebhook): Promise<Webhook> {
    const [webhook] = await db.insert(webhooks).values(data).returning();
    return webhook;
  }

  async updateWebhook(id: string, data: Partial<InsertWebhook>): Promise<Webhook | undefined> {
    const [webhook] = await db.update(webhooks).set({ ...data, updatedAt: new Date() }).where(eq(webhooks.id, id)).returning();
    return webhook;
  }

  async deleteWebhook(id: string): Promise<boolean> {
    const result = await db.delete(webhooks).where(eq(webhooks.id, id)).returning();
    return result.length > 0;
  }

  async createWebhookDelivery(data: InsertWebhookDelivery): Promise<WebhookDelivery> {
    const [delivery] = await db.insert(webhookDeliveries).values(data).returning();
    return delivery;
  }

  async incrementWebhookFailure(id: string): Promise<void> {
    await db.update(webhooks).set({
      failureCount: sql`${webhooks.failureCount} + 1`,
      updatedAt: new Date(),
    }).where(eq(webhooks.id, id));
  }

  async resetWebhookFailure(id: string): Promise<void> {
    await db.update(webhooks).set({
      failureCount: 0,
      lastDeliveredAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(webhooks.id, id));
  }

  // ============ INGESTION REQUESTS ============
  async getIngestionRequest(id: string): Promise<IngestionRequest | undefined> {
    const [req] = await db.select().from(ingestionRequests).where(eq(ingestionRequests.id, id));
    return req;
  }

  async getIngestionRequests(status?: string, limit = 50): Promise<IngestionRequest[]> {
    const conditions: SQL[] = [];
    if (status) conditions.push(eq(ingestionRequests.status, status));
    return db
      .select()
      .from(ingestionRequests)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(ingestionRequests.createdAt))
      .limit(limit);
  }

  async createIngestionRequest(data: InsertIngestionRequest): Promise<IngestionRequest> {
    const [req] = await db.insert(ingestionRequests).values(data).returning();
    return req;
  }

  async updateIngestionRequest(id: string, data: Partial<IngestionRequest>): Promise<IngestionRequest | undefined> {
    const [req] = await db.update(ingestionRequests).set({ ...data, updatedAt: new Date() }).where(eq(ingestionRequests.id, id)).returning();
    return req;
  }

  // ============ Brain API Key Methods ============

  async createBrainApiKey(data: InsertBrainApiKey): Promise<BrainApiKey> {
    const [key] = await db.insert(brainApiKeys).values(data).returning();
    return key;
  }

  async getBrainApiKeyByHash(keyHash: string): Promise<BrainApiKey | undefined> {
    const [key] = await db.select().from(brainApiKeys)
      .where(and(eq(brainApiKeys.keyHash, keyHash), eq(brainApiKeys.isActive, true)));
    return key;
  }

  async listBrainApiKeys(): Promise<BrainApiKey[]> {
    return db.select().from(brainApiKeys).orderBy(desc(brainApiKeys.createdAt));
  }

  async revokeBrainApiKey(id: string): Promise<boolean> {
    const [key] = await db.update(brainApiKeys)
      .set({ isActive: false })
      .where(eq(brainApiKeys.id, id))
      .returning();
    return !!key;
  }

  async updateBrainApiKey(id: string, data: Partial<{ name: string; scopes: string[]; rateLimitPerMin: number; isActive: boolean }>): Promise<BrainApiKey | undefined> {
    const [key] = await db.update(brainApiKeys).set(data).where(eq(brainApiKeys.id, id)).returning();
    return key;
  }

  async touchBrainApiKeyLastUsed(id: string): Promise<void> {
    await db.update(brainApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(brainApiKeys.id, id));
  }

  async createCreatorLead(data: InsertCreatorLead): Promise<CreatorLead> {
    const [lead] = await db.insert(creatorLeads).values(data).returning();
    return lead;
  }

  async getCreatorLeadsByEmail(email: string): Promise<CreatorLead[]> {
    return db.select().from(creatorLeads).where(eq(creatorLeads.email, email)).orderBy(desc(creatorLeads.createdAt));
  }

  async createCreatorProcessedEpisode(data: InsertCreatorProcessedEpisode): Promise<CreatorProcessedEpisode> {
    const [ep] = await db.insert(creatorProcessedEpisodes).values(data).returning();
    return ep;
  }

  async getCreatorProcessedEpisodes(userId: string): Promise<CreatorProcessedEpisode[]> {
    return db.select().from(creatorProcessedEpisodes)
      .where(eq(creatorProcessedEpisodes.userId, userId))
      .orderBy(desc(creatorProcessedEpisodes.createdAt));
  }

  async getCreatorProcessedEpisodeByUserAndEpisode(userId: string, episodeId: string): Promise<CreatorProcessedEpisode | undefined> {
    const [ep] = await db.select().from(creatorProcessedEpisodes)
      .where(and(
        eq(creatorProcessedEpisodes.userId, userId),
        eq(creatorProcessedEpisodes.episodeId, episodeId)
      ));
    return ep;
  }

  async deleteCreatorProcessedEpisode(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(creatorProcessedEpisodes)
      .where(and(eq(creatorProcessedEpisodes.id, id), eq(creatorProcessedEpisodes.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async updateEpisodeTags(id: string, userId: string, tags: string[]): Promise<boolean> {
    const result = await db.update(creatorProcessedEpisodes)
      .set({ tags })
      .where(and(eq(creatorProcessedEpisodes.id, id), eq(creatorProcessedEpisodes.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async getDistinctTags(userId: string): Promise<string[]> {
    const rows = await db.execute(sql`
      SELECT DISTINCT unnest(tags) AS tag
      FROM creator_processed_episodes
      WHERE user_id = ${userId}
      AND tags IS NOT NULL AND array_length(tags, 1) > 0
      ORDER BY tag
    `);
    return (rows.rows || []).map((r: any) => r.tag as string);
  }

  async updateUserStripeFields(userId: string, data: Partial<{ stripeCustomerId: string; stripeSubscriptionId: string; subscriptionTier: string }>): Promise<User | undefined> {
    const [user] = await db.update(users).set({
      ...data,
      updatedAt: new Date(),
    }).where(eq(users.id, userId)).returning();
    return user;
  }

  async incrementClipsDownloaded(userId: string): Promise<number> {
    const [user] = await db.update(users).set({
      clipsDownloaded: sql`${users.clipsDownloaded} + 1`,
      updatedAt: new Date(),
    }).where(eq(users.id, userId)).returning();
    return user?.clipsDownloaded ?? 0;
  }

  async createClipJob(data: InsertClipJob): Promise<ClipJob> {
    const [job] = await db.insert(clipJobs).values(data).returning();
    return job;
  }

  async getClipJob(id: string): Promise<ClipJob | undefined> {
    const [job] = await db.select().from(clipJobs).where(eq(clipJobs.id, id));
    return job;
  }

  async getClipJobsByUser(userId: string, limit: number = 10): Promise<ClipJob[]> {
    return db.select().from(clipJobs)
      .where(eq(clipJobs.userId, userId))
      .orderBy(desc(clipJobs.createdAt))
      .limit(limit);
  }

  async updateClipJob(id: string, data: Partial<InsertClipJob>): Promise<ClipJob | undefined> {
    const [job] = await db.update(clipJobs).set(data).where(eq(clipJobs.id, id)).returning();
    return job;
  }

  async deleteClipJob(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(clipJobs)
      .where(and(eq(clipJobs.id, id), eq(clipJobs.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async upsertShowProfile(podcastId: string, data: Partial<InsertShowProfile>, tagFilter?: string | null): Promise<ShowProfile> {
    const existing = await this.getShowProfile(podcastId, tagFilter);
    if (existing) {
      const [updated] = await db
        .update(showProfiles)
        .set({ ...data, computedAt: new Date() })
        .where(eq(showProfiles.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(showProfiles)
      .values({ podcastId, episodeCount: 0, tagFilter: tagFilter || null, ...data })
      .returning();
    return created;
  }

  async getShowProfile(podcastId: string, tagFilter?: string | null): Promise<ShowProfile | undefined> {
    const conditions = [eq(showProfiles.podcastId, podcastId)];
    if (tagFilter) {
      conditions.push(eq(showProfiles.tagFilter, tagFilter));
    } else {
      conditions.push(isNull(showProfiles.tagFilter));
    }
    const [profile] = await db.select().from(showProfiles).where(and(...conditions));
    return profile;
  }

  async getShowProfilesForPodcasts(podcastIds: string[]): Promise<ShowProfile[]> {
    if (podcastIds.length === 0) return [];
    return db.select().from(showProfiles).where(inArray(showProfiles.podcastId, podcastIds));
  }

  async getEpisodesByIds(ids: string[]): Promise<Episode[]> {
    if (ids.length === 0) return [];
    return db.select().from(episodes).where(inArray(episodes.id, ids));
  }

  async getViralMomentCountsByEpisodeIds(ids: string[]): Promise<Record<string, number>> {
    if (ids.length === 0) return {};
    const rows = await db
      .select({
        episodeId: viralMoments.episodeId,
        cnt: count(),
      })
      .from(viralMoments)
      .where(inArray(viralMoments.episodeId, ids))
      .groupBy(viralMoments.episodeId);
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.episodeId] = Number(row.cnt);
    }
    return result;
  }

  async getViralMomentsByIds(ids: string[]): Promise<ViralMoment[]> {
    if (ids.length === 0) return [];
    return db.select().from(viralMoments).where(inArray(viralMoments.id, ids));
  }

  async upsertSelmanPack(data: InsertSelmanPack): Promise<SelmanPack> {
    const existing = await this.getSelmanPackByEpisodeId(data.episodeId);
    if (existing) {
      const [updated] = await db
        .update(selmanPacks)
        .set({
          companyName: data.companyName,
          contactName: data.contactName,
          priorEpisodeCount: data.priorEpisodeCount,
          currentCallSignals: data.currentCallSignals,
          longitudinal: data.longitudinal,
          dealIntelligence: data.dealIntelligence,
          allEpisodeIds: data.allEpisodeIds,
          deliveryStatus: data.deliveryStatus,
          deliveredAt: data.deliveredAt,
        })
        .where(eq(selmanPacks.episodeId, data.episodeId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(selmanPacks).values(data).returning();
    return created;
  }

  async getSelmanPackByEpisodeId(episodeId: string): Promise<SelmanPack | undefined> {
    const [pack] = await db
      .select()
      .from(selmanPacks)
      .where(eq(selmanPacks.episodeId, episodeId));
    return pack;
  }

  // ============ FINANCIAL CREDIBILITY ENGINE ============

  async getUnenrichedFinancialClaims(): Promise<EpisodeClaim[]> {
    const rows = await db
      .select({ claim: episodeClaims })
      .from(episodeClaims)
      .leftJoin(claimEnrichments, eq(claimEnrichments.claimId, episodeClaims.id))
      .where(
        and(
          eq(episodeClaims.claimType, "financial"),
          isNull(claimEnrichments.id)
        )
      );
    return rows.map(r => r.claim);
  }

  async createClaimEnrichment(data: InsertClaimEnrichment): Promise<ClaimEnrichment | undefined> {
    const [row] = await db
      .insert(claimEnrichments)
      .values(data)
      .onConflictDoNothing()
      .returning();
    return row;
  }

  async getClaimsReadyForPricing(): Promise<Array<{
    claim: EpisodeClaim;
    enrichment: ClaimEnrichment;
    episodePublishedAt: Date;
  }>> {
    const rows = await db
      .select({
        claim: episodeClaims,
        enrichment: claimEnrichments,
        episodePublishedAt: episodes.publishedAt,
      })
      .from(claimEnrichments)
      .innerJoin(episodeClaims, eq(episodeClaims.id, claimEnrichments.claimId))
      .innerJoin(episodes, eq(episodes.id, episodeClaims.episodeId))
      .leftJoin(claimPrices, eq(claimPrices.claimId, episodeClaims.id))
      .where(
        and(
          eq(claimEnrichments.skip, false),
          sql`array_length(${claimEnrichments.tickers}, 1) > 0`,
          sql`${claimEnrichments.confidence} > 0.7`,
          isNull(claimPrices.id)
        )
      );
    return rows.map(r => ({
      claim: r.claim,
      enrichment: r.enrichment,
      episodePublishedAt: r.episodePublishedAt,
    }));
  }

  async createClaimPrice(data: InsertClaimPrice): Promise<ClaimPrice | undefined> {
    const [row] = await db
      .insert(claimPrices)
      .values(data)
      .onConflictDoNothing()
      .returning();
    return row;
  }

  async getClaimsReadyForScoring(minAgeDays = 30): Promise<Array<{
    claim: EpisodeClaim;
    enrichment: ClaimEnrichment;
    price: ClaimPrice;
  }>> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - minAgeDays);
    const rows = await db
      .select({
        claim: episodeClaims,
        enrichment: claimEnrichments,
        price: claimPrices,
      })
      .from(claimPrices)
      .innerJoin(episodeClaims, eq(episodeClaims.id, claimPrices.claimId))
      .innerJoin(claimEnrichments, eq(claimEnrichments.claimId, episodeClaims.id))
      .leftJoin(claimOutcomes, and(
        eq(claimOutcomes.claimId, episodeClaims.id),
        eq(claimOutcomes.ticker, claimPrices.ticker)
      ))
      .where(
        and(
          isNull(claimOutcomes.id),
          sql`${claimPrices.resolvedAt} < ${cutoff.toISOString()}`
        )
      );
    return rows.map(r => ({
      claim: r.claim,
      enrichment: r.enrichment,
      price: r.price,
    }));
  }

  async createClaimOutcome(data: InsertClaimOutcome): Promise<ClaimOutcome | undefined> {
    const [row] = await db
      .insert(claimOutcomes)
      .values(data)
      .onConflictDoNothing()
      .returning();
    return row;
  }

  async getClaimOutcomesByShow(showId: string): Promise<ClaimOutcome[]> {
    const rows = await db
      .select({ outcome: claimOutcomes })
      .from(claimOutcomes)
      .innerJoin(episodeClaims, eq(episodeClaims.id, claimOutcomes.claimId))
      .innerJoin(episodes, eq(episodes.id, episodeClaims.episodeId))
      .where(eq(episodes.podcastId, showId));
    return rows.map(r => r.outcome);
  }

  async upsertSourceCredibility(data: InsertSourceCredibility): Promise<SourceCredibility> {
    const existing = await db
      .select()
      .from(sourceCredibility)
      .where(eq(sourceCredibility.showId, data.showId))
      .limit(1);
    if (existing.length > 0) {
      const [updated] = await db
        .update(sourceCredibility)
        .set({ ...data, computedAt: new Date() })
        .where(eq(sourceCredibility.showId, data.showId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(sourceCredibility).values(data).returning();
    return created;
  }

  async getSourceCredibilityByShow(showId: string): Promise<SourceCredibility | undefined> {
    const [row] = await db
      .select()
      .from(sourceCredibility)
      .where(eq(sourceCredibility.showId, showId));
    return row;
  }
}

// MemStorage class removed - not used in production (PostgreSQL via DbStorage is used)
// If mock storage is needed for testing, create a minimal version in tests/

export const storage = new DbStorage();
