/**
 * Shared upsert helper for Notion document sync
 *
 * Used by both notion-sync-local.ts and notion-sync-api.ts
 * to avoid duplicating the INSERT...ON CONFLICT SQL.
 */

interface UpsertParams {
  sourceId: string;
  title: string;
  content: string;
  contentHash: string;
  embedding: string;
  metadata: string;
  sourceDate: Date;
}

export async function upsertNotionDocument(
  db: { query: (sql: string, params?: any[]) => Promise<any> },
  params: UpsertParams,
): Promise<void> {
  await db.query(
    `
    INSERT INTO documents (
      source_type, source_id, title, content, content_hash,
      embedding, metadata, source_created_at, source_updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (source_type, source_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      content_hash = EXCLUDED.content_hash,
      embedding = EXCLUDED.embedding,
      metadata = EXCLUDED.metadata,
      source_updated_at = EXCLUDED.source_updated_at,
      indexed_at = NOW()
    `,
    [
      'notion',
      params.sourceId,
      params.title,
      params.content,
      params.contentHash,
      params.embedding,
      params.metadata,
      params.sourceDate,
      params.sourceDate,
    ]
  );
}
