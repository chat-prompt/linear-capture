/**
 * E2E Search Quality Test
 * 
 * Opens PGlite DB directly, runs search queries, and compares:
 *   - Before: RRF only (original)
 *   - After:  RRF → Rerank → Recency Boost (new pipeline)
 *
 * Usage: node scripts/test-search-quality.mjs
 */

import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import path from 'path';
import os from 'os';

const DB_PATH = path.join(
  os.homedir(),
  'Library/Application Support/linear-capture/local.db'
);
const WORKER_URL = 'https://linear-capture-ai.kangjun-f0f.workers.dev';
const RRF_K = 60;

// ─── Helpers ─────────────────────────────────────────

async function getEmbedding(text) {
  const resp = await fetch(`${WORKER_URL}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts: [text] }),
  });
  if (!resp.ok) throw new Error(`Embedding API error: ${resp.status}`);
  const data = await resp.json();
  return data.embeddings[0];
}

async function rerankDocs(query, documents, topN) {
  const resp = await fetch(`${WORKER_URL}/rerank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, documents, topN }),
  });
  if (!resp.ok) throw new Error(`Rerank API error: ${resp.status}`);
  const data = await resp.json();
  return data.results;
}

function calculateRecencyScore(timestamp, source) {
  if (!timestamp) return 0.5;
  const configs = {
    slack: { halfLifeDays: 7, weight: 0.6 },
    linear: { halfLifeDays: 14, weight: 0.4 },
    notion: { halfLifeDays: 30, weight: 0.2 },
    gmail: { halfLifeDays: 14, weight: 0.5 },
  };
  const config = configs[source] || { halfLifeDays: 14, weight: 0.3 };
  const ageInDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  const lambda = Math.LN2 / config.halfLifeDays;
  return Math.exp(-lambda * Math.max(0, ageInDays));
}

function applyRecencyBoost(results) {
  const configs = {
    slack: { halfLifeDays: 7, weight: 0.6 },
    linear: { halfLifeDays: 14, weight: 0.4 },
    notion: { halfLifeDays: 30, weight: 0.2 },
    gmail: { halfLifeDays: 14, weight: 0.5 },
  };
  return results.map((r) => {
    const config = configs[r.source] || { halfLifeDays: 14, weight: 0.3 };
    const recencyScore = calculateRecencyScore(r.timestamp, r.source);
    const boostedScore = (1 - config.weight) * r.score + config.weight * recencyScore;
    return { ...r, score: boostedScore, recencyScore };
  });
}

function mergeWithRRF(semantic, keyword, k = 60) {
  const scoreMap = new Map();

  semantic.forEach((item, rank) => {
    const rrfScore = 1 / (k + rank + 1);
    const existing = scoreMap.get(item.id);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scoreMap.set(item.id, { ...item, score: rrfScore });
    }
  });

  keyword.forEach((item, rank) => {
    const rrfScore = 1 / (k + rank + 1);
    const existing = scoreMap.get(item.id);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scoreMap.set(item.id, { ...item, score: rrfScore });
    }
  });

  return Array.from(scoreMap.values()).sort((a, b) => b.score - a.score);
}

function formatResult(r, idx) {
  const age = r.timestamp ? `${Math.round((Date.now() - r.timestamp) / 86400000)}d ago` : 'no date';
  const title = (r.title || '').slice(0, 50);
  const content = (r.content || '').slice(0, 60).replace(/\n/g, ' ');
  return `  ${String(idx + 1).padStart(2)}. [${r.source.padEnd(6)}] score=${r.score.toFixed(4)} | ${age.padStart(8)} | ${title || content}`;
}

// ─── Main ─────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Search Quality E2E Test — Before vs After');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. Open DB
  console.log(`[DB] Opening PGlite at: ${DB_PATH}`);
  const db = new PGlite(DB_PATH, { extensions: { vector } });
  await db.waitReady;
  await db.exec('CREATE EXTENSION IF NOT EXISTS vector');

  // 2. Check data
  const stats = await db.query(`
    SELECT source_type, COUNT(*) as count, 
           COUNT(embedding) as with_embedding,
           MIN(source_created_at) as oldest,
           MAX(source_created_at) as newest
    FROM documents 
    GROUP BY source_type
    ORDER BY count DESC
  `);
  
  console.log('\n[DB] Document Stats:');
  console.log('  Source    | Count | w/Embedding | Oldest → Newest');
  console.log('  ---------|-------|-------------|------------------');
  let totalDocs = 0;
  for (const row of stats.rows) {
    const oldest = row.oldest ? new Date(row.oldest).toLocaleDateString() : '-';
    const newest = row.newest ? new Date(row.newest).toLocaleDateString() : '-';
    console.log(`  ${String(row.source_type).padEnd(8)} | ${String(row.count).padStart(5)} | ${String(row.with_embedding).padStart(11)} | ${oldest} → ${newest}`);
    totalDocs += Number(row.count);
  }
  console.log(`  TOTAL    | ${String(totalDocs).padStart(5)} |`);

  if (totalDocs === 0) {
    console.log('\n❌ No documents in DB. Need to sync data first.');
    await db.close();
    return;
  }

  // 3. Get sample queries — pick from actual content
  const sampleTitles = await db.query(`
    SELECT title, source_type, source_created_at FROM documents 
    WHERE title IS NOT NULL AND title != '' 
    ORDER BY source_created_at DESC 
    LIMIT 10
  `);
  
  console.log('\n[DB] Recent documents (for query ideas):');
  for (const row of sampleTitles.rows) {
    console.log(`  [${row.source_type}] ${row.title}`);
  }

  // 4. Define test queries
  const testQueries = [
    '견적서',
    'Claude',
    '교육 일정',
    'Linear',
    '지피터스 파트너스',
    '세미나',
    'SKT',
  ];

  // 5. Run searches
  for (const query of testQueries) {
    console.log(`\n${'─'.repeat(65)}`);
    console.log(`🔍 Query: "${query}"`);
    console.log('─'.repeat(65));

    // Get embedding
    let queryEmbedding;
    try {
      queryEmbedding = await getEmbedding(query);
    } catch (e) {
      console.log(`  ⚠ Embedding failed: ${e.message}`);
      continue;
    }

    // Semantic search
    const semanticResult = await db.query(
      `SELECT id, source_type, source_id, title, content, metadata, source_created_at,
              1 - (embedding <=> $1) AS score
       FROM documents
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1
       LIMIT 100`,
      [JSON.stringify(queryEmbedding)]
    );
    const semanticResults = semanticResult.rows.map((r) => ({
      id: r.id,
      source: r.source_type,
      title: r.title || '',
      content: r.content,
      score: Number(r.score),
      timestamp: r.source_created_at ? new Date(r.source_created_at).getTime() : undefined,
    }));

    // Keyword search (FTS)
    let keywordResults = [];
    try {
      const keywordResult = await db.query(
        `SELECT id, source_type, source_id, title, content, metadata, source_created_at,
                ts_rank(tsv, query) AS score
         FROM documents, websearch_to_tsquery('simple', $1) query
         WHERE tsv @@ query
         ORDER BY score DESC
         LIMIT 100`,
        [query]
      );
      keywordResults = keywordResult.rows.map((r) => ({
        id: r.id,
        source: r.source_type,
        title: r.title || '',
        content: r.content,
        score: Number(r.score),
        timestamp: r.source_created_at ? new Date(r.source_created_at).getTime() : undefined,
      }));
    } catch {
      // FTS may fail on short/special queries
    }

    console.log(`  Semantic: ${semanticResults.length}, Keyword: ${keywordResults.length}`);

    // RRF merge
    const rrfResults = mergeWithRRF(semanticResults, keywordResults, RRF_K);
    const top30 = rrfResults.slice(0, 30);

    // ═══ BEFORE: RRF only ═══
    console.log(`\n  📊 BEFORE (RRF only) — top 10:`);
    for (let i = 0; i < Math.min(10, top30.length); i++) {
      console.log(formatResult(top30[i], i));
    }

    // ═══ AFTER: RRF → Rerank → Recency Boost ═══
    let afterResults;
    try {
      const documents = top30.map((r) => ({
        id: r.id,
        text: `${r.title || ''} ${r.content}`.slice(0, 1000),
      }));

      const reranked = await rerankDocs(query, documents, documents.length);
      console.log(`  ✅ Rerank returned: ${reranked.length} results (sent ${documents.length})`);

      // Apply rerank scores
      const scoreMap = new Map(reranked.map((r) => [r.id, r.relevanceScore]));
      const rerankedResults = top30.map((r) => ({
        ...r,
        score: scoreMap.get(r.id) ?? r.score,
      }));

      // Apply recency boost
      afterResults = applyRecencyBoost(rerankedResults);
      afterResults.sort((a, b) => b.score - a.score);
    } catch (e) {
      console.log(`  ⚠ Rerank failed: ${e.message}`);
      afterResults = applyRecencyBoost(top30);
      afterResults.sort((a, b) => b.score - a.score);
    }

    console.log(`\n  📊 AFTER (RRF → Rerank → Recency) — top 10:`);
    for (let i = 0; i < Math.min(10, afterResults.length); i++) {
      console.log(formatResult(afterResults[i], i));
    }

    // ═══ DIFF ═══
    const beforeIds = top30.slice(0, 5).map((r) => r.id);
    const afterIds = afterResults.slice(0, 5).map((r) => r.id);
    const changed = beforeIds.some((id, i) => id !== afterIds[i]);
    console.log(`\n  ${changed ? '🔄 Ranking CHANGED' : '➡️ Ranking unchanged'} (top 5)`);
  }

  await db.close();
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' Done.');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
