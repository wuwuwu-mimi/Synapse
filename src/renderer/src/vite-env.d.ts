/// <reference types="vite/client" />

import type {
  ChatSession,
  KnowledgeImportEntry,
  KnowledgeImportRequest,
  KnowledgeImportResult,
  RuntimeConfig,
} from '@shared/types';

declare global {
  interface Window {
    electronAPI: {
      listSessions: () => Promise<ChatSession[]>;
      createSession: (title?: string) => Promise<ChatSession>;
      upsertSession: (session: ChatSession) => Promise<ChatSession>;
      getRuntimeConfig: () => Promise<RuntimeConfig>;
      pickKnowledgeFiles: () => Promise<string[]>;
      pickKnowledgeFolder: () => Promise<string | null>;
      listKnowledgeImports: () => Promise<KnowledgeImportEntry[]>;
      deleteKnowledgeImport: (rootPath: string) => Promise<void>;
      importKnowledge: (payload: KnowledgeImportRequest) => Promise<KnowledgeImportResult>;
    };
  }
}

export {};
