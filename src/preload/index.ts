import { contextBridge, ipcRenderer } from 'electron';
import type {
  ChatSession,
  KnowledgeImportEntry,
  KnowledgeImportRequest,
  KnowledgeImportResult,
  RuntimeConfig,
} from '@shared/types';

const api = {
  listSessions: (): Promise<ChatSession[]> => ipcRenderer.invoke('app:list-sessions'),
  createSession: (title?: string): Promise<ChatSession> =>
    ipcRenderer.invoke('app:create-session', title),
  upsertSession: (session: ChatSession): Promise<ChatSession> =>
    ipcRenderer.invoke('app:upsert-session', session),
  deleteSession: (sessionId: string): Promise<ChatSession[]> =>
    ipcRenderer.invoke('app:delete-session', sessionId),
  getRuntimeConfig: (): Promise<RuntimeConfig> => ipcRenderer.invoke('app:get-runtime-config'),
  pickKnowledgeFiles: (): Promise<string[]> => ipcRenderer.invoke('knowledge:pick-files'),
  pickKnowledgeFolder: (): Promise<string | null> => ipcRenderer.invoke('knowledge:pick-folder'),
  listKnowledgeImports: (): Promise<KnowledgeImportEntry[]> =>
    ipcRenderer.invoke('knowledge:list-imports'),
  deleteKnowledgeImport: (rootPath: string): Promise<void> =>
    ipcRenderer.invoke('knowledge:delete-import', rootPath),
  importKnowledge: (payload: KnowledgeImportRequest): Promise<KnowledgeImportResult> =>
    ipcRenderer.invoke('knowledge:import', payload),
};

contextBridge.exposeInMainWorld('electronAPI', api);
