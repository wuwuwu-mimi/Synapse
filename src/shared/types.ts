export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  status?: 'streaming' | 'done';
}

export interface MemoryFact {
  id: string;
  content: string;
  confidence: number;
  createdAt: string;
  source: 'memory' | 'knowledge';
}

export interface RetrievalSource {
  id: string;
  title: string;
  source: string;
  snippet: string;
  score: number;
  lexicalScore: number;
  vectorScore: number;
  strategy: string;
}

export interface RetrievalDebug {
  knowledgeStrategy: string;
  knowledgeScopePrefix?: string | null;
  knowledgeCandidates: number;
  knowledgeKept: number;
  knowledgeFilteredByScope: number;
  knowledgeFilteredByThreshold: number;
  memoryCandidates: number;
  memoryKept: number;
  memoryFilteredByThreshold: number;
  mergedCandidates: number;
  finalSources: number;
  noSourceReason?: string | null;
}

export type GenerationMode = 'llm' | 'fallback';

export interface SessionInspector {
  summary: string;
  facts: MemoryFact[];
  sources: RetrievalSource[];
  debug?: RetrievalDebug;
  rewrittenQuery?: string;
  generationMode?: GenerationMode;
  model?: string;
  knowledgeScopeLabel?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  inspector: SessionInspector;
}

export interface RuntimeConfig {
  backendUrl: string;
  autoStarted: boolean;
}

export interface KnowledgeStatus {
  knowledgeDir: string;
  documents: number;
  databaseConnected: boolean;
  databaseError?: string | null;
  redisConnected?: boolean;
  redisError?: string | null;
  embeddingProvider?: string | null;
  embeddingModel?: string | null;
  lastIndexedAt?: string | null;
  llmEnabled: boolean;
  activeModel?: string | null;
  indexedSources?: number;
  deduplicatedChunks?: number;
  reusedChunks?: number;
  newChunks?: number;
  removedChunks?: number;
  indexingMode?: string | null;
}

export interface KnowledgeImportRequest {
  mode: 'files' | 'folder';
  paths: string[];
}

export interface KnowledgeImportResult {
  importedCount: number;
  importedPaths: string[];
  skippedPaths: string[];
  targetRoot: string;
}

export interface KnowledgeImportEntry {
  id: string;
  mode: 'files' | 'folder';
  label: string;
  rootPath: string;
  sourcePrefix: string;
  sourceNames: string[];
  fileCount: number;
  updatedAt: string;
}
