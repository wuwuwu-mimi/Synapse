/// <reference types="vite/client" />

import type {
  ChatSession,
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
      importKnowledge: (payload: KnowledgeImportRequest) => Promise<KnowledgeImportResult>;
    };
  }
}

export {};
