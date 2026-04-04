import { contextBridge, ipcRenderer } from 'electron';
import type {
  ChatSession,
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
  getRuntimeConfig: (): Promise<RuntimeConfig> => ipcRenderer.invoke('app:get-runtime-config'),
  pickKnowledgeFiles: (): Promise<string[]> => ipcRenderer.invoke('knowledge:pick-files'),
  pickKnowledgeFolder: (): Promise<string | null> => ipcRenderer.invoke('knowledge:pick-folder'),
  importKnowledge: (payload: KnowledgeImportRequest): Promise<KnowledgeImportResult> =>
    ipcRenderer.invoke('knowledge:import', payload),
};

contextBridge.exposeInMainWorld('electronAPI', api);
