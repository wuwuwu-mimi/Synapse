import type { KnowledgeStatus } from '@shared/types';

interface KnowledgeImportPayload {
  imported_paths: string[];
}

function toCamelStatus(payload: {
  knowledge_dir: string;
  documents: number;
  database_connected: boolean;
  database_error?: string | null;
  redis_connected?: boolean;
  redis_error?: string | null;
  embedding_provider?: string | null;
  embedding_model?: string | null;
  last_indexed_at?: string | null;
  llm_enabled: boolean;
  active_model?: string | null;
  indexed_sources?: number;
  deduplicated_chunks?: number;
  reused_chunks?: number;
  new_chunks?: number;
  removed_chunks?: number;
  indexing_mode?: string | null;
}): KnowledgeStatus {
  return {
    knowledgeDir: payload.knowledge_dir,
    documents: payload.documents,
    databaseConnected: payload.database_connected,
    databaseError: payload.database_error,
    redisConnected: payload.redis_connected,
    redisError: payload.redis_error,
    embeddingProvider: payload.embedding_provider,
    embeddingModel: payload.embedding_model,
    lastIndexedAt: payload.last_indexed_at,
    llmEnabled: payload.llm_enabled,
    activeModel: payload.active_model,
    indexedSources: payload.indexed_sources,
    deduplicatedChunks: payload.deduplicated_chunks,
    reusedChunks: payload.reused_chunks,
    newChunks: payload.new_chunks,
    removedChunks: payload.removed_chunks,
    indexingMode: payload.indexing_mode,
  };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Knowledge request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getKnowledgeStatus(backendUrl: string): Promise<KnowledgeStatus> {
  const payload = await request<{
    knowledge_dir: string;
    documents: number;
    database_connected: boolean;
    database_error?: string | null;
    redis_connected?: boolean;
    redis_error?: string | null;
    embedding_provider?: string | null;
    embedding_model?: string | null;
    last_indexed_at?: string | null;
    llm_enabled: boolean;
    active_model?: string | null;
    indexed_sources?: number;
    deduplicated_chunks?: number;
    reused_chunks?: number;
    new_chunks?: number;
    removed_chunks?: number;
    indexing_mode?: string | null;
  }>(`${backendUrl}/api/knowledge/status`);

  return toCamelStatus(payload);
}

export async function importKnowledgeIndex(
  backendUrl: string,
  payload: KnowledgeImportPayload,
): Promise<KnowledgeStatus> {
  const response = await request<{
    knowledge_dir: string;
    documents: number;
    database_connected: boolean;
    database_error?: string | null;
    redis_connected?: boolean;
    redis_error?: string | null;
    embedding_provider?: string | null;
    embedding_model?: string | null;
    last_indexed_at?: string | null;
    llm_enabled: boolean;
    active_model?: string | null;
    indexed_sources?: number;
    deduplicated_chunks?: number;
    reused_chunks?: number;
    new_chunks?: number;
    removed_chunks?: number;
    indexing_mode?: string | null;
  }>(`${backendUrl}/api/knowledge/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return toCamelStatus(response);
}

export async function reindexKnowledge(backendUrl: string): Promise<KnowledgeStatus> {
  const response = await request<{
    knowledge_dir: string;
    documents: number;
    database_connected: boolean;
    database_error?: string | null;
    redis_connected?: boolean;
    redis_error?: string | null;
    embedding_provider?: string | null;
    embedding_model?: string | null;
    last_indexed_at?: string | null;
    llm_enabled: boolean;
    active_model?: string | null;
    indexed_sources?: number;
    deduplicated_chunks?: number;
    reused_chunks?: number;
    new_chunks?: number;
    removed_chunks?: number;
    indexing_mode?: string | null;
  }>(`${backendUrl}/api/knowledge/reindex`, {
    method: 'POST',
  });

  return toCamelStatus(response);
}
