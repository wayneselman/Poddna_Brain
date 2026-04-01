import { db } from "../db";
import { sql } from "drizzle-orm";
import { getEmbeddingForText } from "../ai/embeddings";
import type { SearchQuery, SearchResult, StatementPolarityType, CanonicalEntityType } from "@shared/schema";

const DEFAULT_LIMIT = 20;
const VECTOR_SEARCH_LIMIT = 100;

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

interface StatementRow {
  id: string;
  episode_id: string;
  segment_id: string | null;
  text: string;
  start_time: number | null;
  similarity: number;
}

interface ClassificationRow {
  statement_id: string;
  claim_flag: boolean;
  certainty: number;
  polarity: string;
  sentiment: number;
}

interface TopicRow {
  statement_id: string;
  topic_id: string;
  topic_name: string;
}

interface EntityRow {
  segment_id: string;
  entity_id: string;
  entity_name: string;
  entity_type: string;
}

interface RelationRow {
  statement_id: string;
  relation: string;
}

interface EpisodeRow {
  id: string;
  title: string;
  podcast_id: string;
}

interface PodcastRow {
  id: string;
  title: string;
}

export async function semanticSearch(query: SearchQuery): Promise<SearchResult[]> {
  const { query: queryText, filters = {}, limit = DEFAULT_LIMIT } = query;
  
  console.log(`[SEMANTIC-SEARCH] Searching for: "${queryText.slice(0, 50)}..."`);
  
  const queryEmbedding = await getEmbeddingForText(queryText);

  let filterClause = sql``;
  if (filters.episodeIds && filters.episodeIds.length > 0) {
    const epArr = `{${filters.episodeIds.map(id => `"${id}"`).join(",")}}`;
    filterClause = sql` AND s.episode_id = ANY(${epArr}::text[])`;
  }

  const vectorResults = await db.execute(sql`
    SELECT 
      s.id,
      s.episode_id,
      s.segment_id,
      s.text,
      s.start_time,
      s.embedding
    FROM statements s
    WHERE s.embedding IS NOT NULL
    ${filterClause}
  `);

  const rows = vectorResults.rows as unknown as (StatementRow & { embedding: number[] | string })[];

  const scored = rows.map(row => {
    const emb = typeof row.embedding === 'string' ? JSON.parse(row.embedding) as number[] : row.embedding;
    return { ...row, similarity: cosineSimilarity(queryEmbedding, emb) };
  });

  const topSim = scored.length > 0 ? Math.max(...scored.map(r => r.similarity)) : 0;
  console.log(`[SEMANTIC-SEARCH] ${scored.length} statements with embeddings, top similarity: ${topSim.toFixed(4)}`);

  const filtered = scored
    .filter(r => r.similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, VECTOR_SEARCH_LIMIT);

  const candidates = filtered as (StatementRow & { similarity: number })[];
  
  if (candidates.length === 0) {
    console.log("[SEMANTIC-SEARCH] No results above similarity threshold (0.3)");
    return [];
  }
  
  console.log(`[SEMANTIC-SEARCH] Found ${candidates.length} vector candidates`);
  
  const statementIds = candidates.map(c => c.id);
  const episodeIds = Array.from(new Set(candidates.map(c => c.episode_id)));
  
  // Format arrays for PostgreSQL ARRAY literal
  const stmtIdsArray = `{${statementIds.map(id => `"${id}"`).join(",")}}`;
  const epIdsArray = `{${episodeIds.map(id => `"${id}"`).join(",")}}`;
  
  const [classifications, topics, entities, relations, episodes] = await Promise.all([
    db.execute(sql`
      SELECT statement_id, claim_flag, certainty, polarity, sentiment
      FROM statement_classifications
      WHERE statement_id = ANY(${stmtIdsArray}::text[])
    `),
    
    db.execute(sql`
      SELECT st.statement_id, st.topic_id, t.name as topic_name
      FROM statement_topics st
      JOIN topics t ON st.topic_id = t.id
      WHERE st.statement_id = ANY(${stmtIdsArray}::text[])
    `),
    
    // Entity query via segment_id: statements → entity_mentions → entity_links → canonical_entities
    db.execute(sql`
      SELECT DISTINCT em.segment_id, ce.id as entity_id, ce.name as entity_name, ce.type as entity_type
      FROM entity_mentions em
      JOIN entity_links el ON el.mention_id = em.id
      JOIN canonical_entities ce ON el.canonical_id = ce.id
      WHERE em.segment_id IS NOT NULL
    `),
    
    db.execute(sql`
      SELECT 
        CASE 
          WHEN statement_a_id = ANY(${stmtIdsArray}::text[]) THEN statement_a_id
          ELSE statement_b_id
        END as statement_id,
        relation
      FROM statement_relations
      WHERE statement_a_id = ANY(${stmtIdsArray}::text[])
         OR statement_b_id = ANY(${stmtIdsArray}::text[])
    `),
    
    db.execute(sql`
      SELECT e.id, e.title, e.podcast_id
      FROM episodes e
      WHERE e.id = ANY(${epIdsArray}::text[])
    `),
  ]);
  
  const classificationRows = classifications.rows as unknown as ClassificationRow[];
  const topicRows = topics.rows as unknown as TopicRow[];
  const entityRows = entities.rows as unknown as EntityRow[];
  const relationRows = relations.rows as unknown as RelationRow[];
  const episodeRows = episodes.rows as unknown as EpisodeRow[];
  
  const podcastIds = Array.from(new Set(episodeRows.map(e => e.podcast_id)));
  const podIdsArray = `{${podcastIds.map(id => `"${id}"`).join(",")}}`;
  const podcasts = await db.execute(sql`
    SELECT id, title FROM podcasts WHERE id = ANY(${podIdsArray}::text[])
  `);
  const podcastRows = podcasts.rows as unknown as PodcastRow[];
  
  const classificationMap = new Map(classificationRows.map(c => [c.statement_id, c]));
  const episodeMap = new Map(episodeRows.map(e => [e.id, e]));
  const podcastMap = new Map(podcastRows.map(p => [p.id, p]));
  
  const topicsByStatement = new Map<string, { id: string; name: string }[]>();
  for (const t of topicRows) {
    if (!topicsByStatement.has(t.statement_id)) {
      topicsByStatement.set(t.statement_id, []);
    }
    topicsByStatement.get(t.statement_id)!.push({ id: t.topic_id, name: t.topic_name });
  }
  
  // Entity data is indexed by segment_id since entity_mentions connect via segment
  const entitiesBySegment = new Map<string, { id: string; name: string; type: CanonicalEntityType }[]>();
  for (const e of entityRows) {
    if (!e.segment_id) continue;
    if (!entitiesBySegment.has(e.segment_id)) {
      entitiesBySegment.set(e.segment_id, []);
    }
    entitiesBySegment.get(e.segment_id)!.push({
      id: e.entity_id,
      name: e.entity_name,
      type: e.entity_type as CanonicalEntityType,
    });
  }
  
  const relationsByStatement = new Map<string, Set<string>>();
  for (const r of relationRows) {
    if (!relationsByStatement.has(r.statement_id)) {
      relationsByStatement.set(r.statement_id, new Set());
    }
    relationsByStatement.get(r.statement_id)!.add(r.relation);
  }
  
  let postFiltered = candidates.filter(candidate => {
    const classification = classificationMap.get(candidate.id);
    const statementTopics = topicsByStatement.get(candidate.id) || [];
    // Look up entities by segment_id since entity_mentions connect to segments
    const statementEntities = candidate.segment_id ? (entitiesBySegment.get(candidate.segment_id) || []) : [];
    const statementRelations = relationsByStatement.get(candidate.id) || new Set();
    
    if (filters.claimOnly && (!classification || !classification.claim_flag)) {
      return false;
    }
    
    if (filters.topics && filters.topics.length > 0) {
      const topicIds = new Set(statementTopics.map(t => t.id));
      if (!filters.topics.some(t => topicIds.has(t))) {
        return false;
      }
    }
    
    if (filters.entities && filters.entities.length > 0) {
      const entityIds = new Set(statementEntities.map(e => e.id));
      if (!filters.entities.some(e => entityIds.has(e))) {
        return false;
      }
    }
    
    if (filters.polarity && classification && classification.polarity !== filters.polarity) {
      return false;
    }
    
    if (filters.certaintyMin !== undefined && classification) {
      if (classification.certainty < filters.certaintyMin) {
        return false;
      }
    }
    
    if (filters.sentimentMin !== undefined && classification) {
      if (Math.abs(classification.sentiment) < filters.sentimentMin) {
        return false;
      }
    }
    
    if (filters.contradictionsOnly) {
      if (!statementRelations.has("contradicts")) {
        return false;
      }
    }
    
    if (filters.supportsOnly) {
      if (!statementRelations.has("supports")) {
        return false;
      }
    }
    
    if (filters.episodeIds && filters.episodeIds.length > 0) {
      if (!filters.episodeIds.includes(candidate.episode_id)) {
        return false;
      }
    }
    
    return true;
  });
  
  const ranked = postFiltered.map(candidate => {
    const classification = classificationMap.get(candidate.id);
    const certainty = classification?.certainty ?? 0;
    const sentiment = classification?.sentiment ?? 0;
    
    const score = candidate.similarity + 
                  0.1 * certainty + 
                  0.05 * Math.abs(sentiment);
    
    return { candidate, score };
  });
  
  ranked.sort((a, b) => b.score - a.score);
  
  const results: SearchResult[] = ranked.slice(0, limit).map(({ candidate, score }) => {
    const classification = classificationMap.get(candidate.id);
    const episode = episodeMap.get(candidate.episode_id);
    const podcast = episode ? podcastMap.get(episode.podcast_id) : undefined;
    const statementTopics = topicsByStatement.get(candidate.id) || [];
    // Look up entities by segment_id since entity_mentions connect to segments
    const statementEntities = candidate.segment_id ? (entitiesBySegment.get(candidate.segment_id) || []) : [];
    const statementRelations = relationsByStatement.get(candidate.id) || new Set();
    
    return {
      statementId: candidate.id,
      episodeId: candidate.episode_id,
      episodeTitle: episode?.title || "Unknown Episode",
      podcastTitle: podcast?.title,
      startTime: candidate.start_time,
      text: candidate.text,
      
      score,
      similarity: candidate.similarity,
      
      topics: statementTopics,
      entities: statementEntities,
      
      claimFlag: classification?.claim_flag ?? false,
      certainty: classification?.certainty,
      polarity: classification?.polarity as StatementPolarityType | null | undefined,
      sentiment: classification?.sentiment,
      
      hasContradictions: statementRelations.has("contradicts"),
      hasSupports: statementRelations.has("supports"),
    };
  });
  
  console.log(`[SEMANTIC-SEARCH] Returning ${results.length} results (filtered from ${candidates.length})`);
  
  return results;
}
