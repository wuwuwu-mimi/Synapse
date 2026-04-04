import { create } from 'zustand';
import type {
  ChatMessage,
  KnowledgeImportEntry,
  ChatSession,
  KnowledgeStatus,
  RuntimeConfig,
  SessionInspector,
} from '@shared/types';
import { getKnowledgeStatus, importKnowledgeIndex, reindexKnowledge } from '@renderer/lib/knowledge';
import {
  formatImportedNotice,
  formatReindexNotice,
  messages,
  readStoredLocale,
} from '@renderer/lib/i18n';
import { streamChat } from '@renderer/lib/sse';

interface ChatStore {
  sessions: ChatSession[];
  activeSessionId?: string;
  runtime?: RuntimeConfig;
  knowledge?: KnowledgeStatus;
  knowledgeImports: KnowledgeImportEntry[];
  knowledgeOnlyMode: boolean;
  knowledgeScopeId?: string;
  sending: boolean;
  knowledgeBusy: boolean;
  error?: string;
  knowledgeError?: string;
  knowledgeNotice?: string;
  loadSessions: () => Promise<void>;
  createSession: () => Promise<void>;
  selectSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => Promise<void>;
  setKnowledgeOnlyMode: (enabled: boolean) => void;
  setKnowledgeScopeId: (scopeId?: string) => void;
  sendMessage: (content: string) => Promise<void>;
  importKnowledgeFiles: () => Promise<void>;
  importKnowledgeFolder: () => Promise<void>;
  deleteKnowledgeImport: (rootPath: string) => Promise<void>;
  reindexKnowledge: () => Promise<void>;
}

const createId = (): string => crypto.randomUUID();

const replaceSession = (sessions: ChatSession[], nextSession: ChatSession): ChatSession[] =>
  sessions
    .map((session) => (session.id === nextSession.id ? nextSession : session))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const toMessagePayload = (messages: ChatMessage[]) =>
  messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

const normalizeInspector = (inspector: SessionInspector): SessionInspector => ({
  summary: inspector.summary,
  rewrittenQuery: inspector.rewrittenQuery,
  facts: inspector.facts,
  sources: inspector.sources,
  debug: inspector.debug,
  generationMode: inspector.generationMode,
  model: inspector.model,
  knowledgeScopeLabel: inspector.knowledgeScopeLabel,
});

const resolveScopeId = (
  scopeId: string | undefined,
  knowledgeImports: KnowledgeImportEntry[],
): string | undefined =>
  knowledgeImports.some((entry) => entry.id === scopeId) ? scopeId : undefined;

async function resolveRuntime(state: ChatStore): Promise<RuntimeConfig> {
  return state.runtime ?? window.electronAPI.getRuntimeConfig();
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  activeSessionId: undefined,
  runtime: undefined,
  knowledge: undefined,
  knowledgeImports: [],
  knowledgeOnlyMode: false,
  knowledgeScopeId: undefined,
  sending: false,
  knowledgeBusy: false,
  error: undefined,
  knowledgeError: undefined,
  knowledgeNotice: undefined,
  loadSessions: async () => {
    const [sessions, runtime] = await Promise.all([
      window.electronAPI.listSessions(),
      window.electronAPI.getRuntimeConfig(),
    ]);
    const locale = readStoredLocale() ?? 'en-US';

    let knowledge: KnowledgeStatus | undefined;
    let knowledgeImports: KnowledgeImportEntry[] = [];
    let knowledgeError: string | undefined;
    try {
      [knowledge, knowledgeImports] = await Promise.all([
        getKnowledgeStatus(runtime.backendUrl),
        window.electronAPI.listKnowledgeImports(),
      ]);
    } catch (error) {
      knowledgeError = error instanceof Error ? error.message : 'Failed to load knowledge status';
    }

    if (sessions.length === 0) {
      const session = await window.electronAPI.createSession(messages[locale].newSessionTitle);
      set({
        sessions: [session],
        activeSessionId: session.id,
        runtime,
        knowledge,
        knowledgeImports,
        knowledgeScopeId: resolveScopeId(get().knowledgeScopeId, knowledgeImports),
        knowledgeError,
        error: undefined,
      });
      return;
    }

    set({
      sessions,
      activeSessionId: sessions[0]?.id,
      runtime,
      knowledge,
      knowledgeImports,
      knowledgeScopeId: resolveScopeId(get().knowledgeScopeId, knowledgeImports),
      knowledgeError,
      error: undefined,
    });
  },
  createSession: async () => {
    const locale = readStoredLocale() ?? 'en-US';
    const session = await window.electronAPI.createSession(messages[locale].newSessionTitle);
    set((state) => ({
      sessions: [session, ...state.sessions].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
      ),
      activeSessionId: session.id,
    }));
  },
  selectSession: (sessionId) => {
    set({ activeSessionId: sessionId });
  },
  deleteSession: async (sessionId) => {
    const remainingSessions = await window.electronAPI.deleteSession(sessionId);
    if (remainingSessions.length > 0) {
      set({
        sessions: remainingSessions,
        activeSessionId:
          get().activeSessionId === sessionId ? remainingSessions[0]?.id : get().activeSessionId,
      });
      return;
    }

    const locale = readStoredLocale() ?? 'en-US';
    const session = await window.electronAPI.createSession(messages[locale].newSessionTitle);
    set({
      sessions: [session],
      activeSessionId: session.id,
    });
  },
  setKnowledgeOnlyMode: (enabled) => {
    set({ knowledgeOnlyMode: enabled });
  },
  setKnowledgeScopeId: (scopeId) => {
    set({ knowledgeScopeId: scopeId });
  },
  sendMessage: async (content) => {
    const state = get();
    const session = state.sessions.find((item) => item.id === state.activeSessionId);
    const selectedScope = state.knowledgeImports.find((entry) => entry.id === state.knowledgeScopeId);

    if (!session || !content.trim() || state.sending) {
      return;
    }

    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: createId(),
      role: 'user',
      content: content.trim(),
      createdAt: now,
      status: 'done',
    };
    const assistantMessage: ChatMessage = {
      id: createId(),
      role: 'assistant',
      content: '',
      createdAt: now,
      status: 'streaming',
    };

    const optimisticSession: ChatSession = {
      ...session,
      updatedAt: now,
      messages: [...session.messages, userMessage, assistantMessage],
    };

    set({
      sessions: replaceSession(state.sessions, optimisticSession),
      sending: true,
      error: undefined,
    });
    await window.electronAPI.upsertSession(optimisticSession);

    const runtime = await resolveRuntime(state);
    if (!state.runtime) {
      set({ runtime });
    }

    try {
      const finalEvent = await streamChat({
        backendUrl: runtime.backendUrl,
        payload: {
          session_id: session.id,
          query: userMessage.content,
          knowledge_only: state.knowledgeOnlyMode,
          knowledge_scope_prefix: selectedScope?.sourcePrefix,
          knowledge_scope_label: selectedScope?.label,
          history: toMessagePayload([...session.messages, userMessage]),
        },
        onDelta: (delta) => {
          set((currentState) => {
            const currentSession = currentState.sessions.find((item) => item.id === session.id);
            if (!currentSession) {
              return currentState;
            }

            const nextSession: ChatSession = {
              ...currentSession,
              messages: currentSession.messages.map((message) =>
                message.id === assistantMessage.id
                  ? {
                      ...message,
                      content: message.content + delta,
                    }
                  : message
              ),
            };

            return {
              sessions: replaceSession(currentState.sessions, nextSession),
            };
          });
        },
      });

      const currentSession = get().sessions.find((item) => item.id === session.id);
      if (!currentSession) {
        set({ sending: false });
        return;
      }

      const finalizedSession: ChatSession = {
        ...currentSession,
        updatedAt: new Date().toISOString(),
        inspector: normalizeInspector({
          summary: finalEvent.summary,
          rewrittenQuery: finalEvent.rewritten_query,
          generationMode: finalEvent.generation_mode,
          model: finalEvent.model ?? undefined,
          knowledgeScopeLabel: finalEvent.knowledge_scope_label ?? undefined,
          debug: finalEvent.debug
            ? {
                knowledgeStrategy: finalEvent.debug.knowledge_strategy,
                knowledgeScopePrefix: finalEvent.debug.knowledge_scope_prefix,
                knowledgeCandidates: finalEvent.debug.knowledge_candidates,
                knowledgeKept: finalEvent.debug.knowledge_kept,
                knowledgeFilteredByScope: finalEvent.debug.knowledge_filtered_by_scope,
                knowledgeFilteredByThreshold: finalEvent.debug.knowledge_filtered_by_threshold,
                memoryCandidates: finalEvent.debug.memory_candidates,
                memoryKept: finalEvent.debug.memory_kept,
                memoryFilteredByThreshold: finalEvent.debug.memory_filtered_by_threshold,
                mergedCandidates: finalEvent.debug.merged_candidates,
                finalSources: finalEvent.debug.final_sources,
                noSourceReason: finalEvent.debug.no_source_reason ?? undefined,
              }
            : undefined,
          facts: finalEvent.facts.map((fact) => ({
            id: fact.id,
            content: fact.content,
            confidence: fact.confidence,
            createdAt: fact.created_at,
            source: fact.source,
          })),
          sources: finalEvent.sources.map((source) => ({
            id: source.id,
            title: source.title,
            source: source.source,
            snippet: source.snippet,
            score: source.score,
            lexicalScore: source.lexical_score,
            vectorScore: source.vector_score,
            strategy: source.strategy,
          })),
        }),
        messages: currentSession.messages.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                status: 'done',
              }
            : message
        ),
      };

      set((currentState) => ({
        sessions: replaceSession(currentState.sessions, finalizedSession),
        sending: false,
      }));
      await window.electronAPI.upsertSession(finalizedSession);
    } catch (error) {
      const locale = readStoredLocale() ?? 'en-US';
      const copy = messages[locale];
      const message = error instanceof Error ? error.message : copy.failedToSend;

      set((currentState) => {
        const currentSession = currentState.sessions.find((item) => item.id === session.id);
        if (!currentSession) {
          return {
            error: message,
            sending: false,
          };
        }

        const failedSession: ChatSession = {
          ...currentSession,
          updatedAt: new Date().toISOString(),
          messages: currentSession.messages.map((item) =>
            item.id === assistantMessage.id
              ? {
                  ...item,
                  status: 'done',
                  content:
                    item.content ||
                    `${copy.backendUnavailable}: ${message}

${copy.backendStartHint}`,
                }
              : item
          ),
        };

        void window.electronAPI.upsertSession(failedSession);

        return {
          sessions: replaceSession(currentState.sessions, failedSession),
          error: message,
          sending: false,
        };
      });
    }
  },
  importKnowledgeFiles: async () => {
    const paths = await window.electronAPI.pickKnowledgeFiles();
    if (paths.length === 0) {
      return;
    }

    set({ knowledgeBusy: true, knowledgeError: undefined, knowledgeNotice: undefined });
    try {
      const result = await window.electronAPI.importKnowledge({ mode: 'files', paths });
      const runtime = await resolveRuntime(get());
      const knowledge = await importKnowledgeIndex(runtime.backendUrl, {
        imported_paths: result.importedPaths,
      });
      const locale = readStoredLocale() ?? 'en-US';
      const knowledgeImports = await window.electronAPI.listKnowledgeImports();
      set({
        runtime,
        knowledge,
        knowledgeImports,
        knowledgeScopeId: resolveScopeId(get().knowledgeScopeId, knowledgeImports),
        knowledgeBusy: false,
        knowledgeNotice: formatImportedNotice(locale, result.importedCount),
      });
    } catch (error) {
      set({
        knowledgeBusy: false,
        knowledgeError: error instanceof Error ? error.message : 'Failed to import files',
      });
    }
  },
  importKnowledgeFolder: async () => {
    const folderPath = await window.electronAPI.pickKnowledgeFolder();
    if (!folderPath) {
      return;
    }

    set({ knowledgeBusy: true, knowledgeError: undefined, knowledgeNotice: undefined });
    try {
      const result = await window.electronAPI.importKnowledge({
        mode: 'folder',
        paths: [folderPath],
      });
      const runtime = await resolveRuntime(get());
      const knowledge = await importKnowledgeIndex(runtime.backendUrl, {
        imported_paths: result.importedPaths,
      });
      const locale = readStoredLocale() ?? 'en-US';
      const knowledgeImports = await window.electronAPI.listKnowledgeImports();
      set({
        runtime,
        knowledge,
        knowledgeImports,
        knowledgeScopeId: resolveScopeId(get().knowledgeScopeId, knowledgeImports),
        knowledgeBusy: false,
        knowledgeNotice: formatImportedNotice(locale, result.importedCount),
      });
    } catch (error) {
      set({
        knowledgeBusy: false,
        knowledgeError: error instanceof Error ? error.message : 'Failed to import folder',
      });
    }
  },
  deleteKnowledgeImport: async (rootPath) => {
    set({ knowledgeBusy: true, knowledgeError: undefined, knowledgeNotice: undefined });
    try {
      await window.electronAPI.deleteKnowledgeImport(rootPath);
      const runtime = await resolveRuntime(get());
      const [knowledge, knowledgeImports] = await Promise.all([
        reindexKnowledge(runtime.backendUrl),
        window.electronAPI.listKnowledgeImports(),
      ]);
      set({
        runtime,
        knowledge,
        knowledgeImports,
        knowledgeScopeId: resolveScopeId(get().knowledgeScopeId, knowledgeImports),
        knowledgeBusy: false,
      });
    } catch (error) {
      set({
        knowledgeBusy: false,
        knowledgeError:
          error instanceof Error ? error.message : 'Failed to delete imported knowledge',
      });
    }
  },
  reindexKnowledge: async () => {
    set({ knowledgeBusy: true, knowledgeError: undefined, knowledgeNotice: undefined });
    try {
      const runtime = await resolveRuntime(get());
      const [knowledge, knowledgeImports] = await Promise.all([
        reindexKnowledge(runtime.backendUrl),
        window.electronAPI.listKnowledgeImports(),
      ]);
      const locale = readStoredLocale() ?? 'en-US';
      set({
        runtime,
        knowledge,
        knowledgeImports,
        knowledgeScopeId: resolveScopeId(get().knowledgeScopeId, knowledgeImports),
        knowledgeBusy: false,
        knowledgeNotice: formatReindexNotice(locale, knowledge.documents),
      });
    } catch (error) {
      set({
        knowledgeBusy: false,
        knowledgeError: error instanceof Error ? error.message : 'Failed to reindex knowledge',
      });
    }
  },
}));
