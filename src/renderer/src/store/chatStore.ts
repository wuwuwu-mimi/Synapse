import { create } from 'zustand';
import type {
  ChatMessage,
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
  sending: boolean;
  knowledgeBusy: boolean;
  error?: string;
  knowledgeError?: string;
  knowledgeNotice?: string;
  loadSessions: () => Promise<void>;
  createSession: () => Promise<void>;
  selectSession: (sessionId: string) => void;
  sendMessage: (content: string) => Promise<void>;
  importKnowledgeFiles: () => Promise<void>;
  importKnowledgeFolder: () => Promise<void>;
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
  generationMode: inspector.generationMode,
  model: inspector.model,
});

async function resolveRuntime(state: ChatStore): Promise<RuntimeConfig> {
  return state.runtime ?? window.electronAPI.getRuntimeConfig();
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  activeSessionId: undefined,
  runtime: undefined,
  knowledge: undefined,
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
    let knowledgeError: string | undefined;
    try {
      knowledge = await getKnowledgeStatus(runtime.backendUrl);
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
  sendMessage: async (content) => {
    const state = get();
    const session = state.sessions.find((item) => item.id === state.activeSessionId);

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
      set({
        runtime,
        knowledge,
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
      set({
        runtime,
        knowledge,
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
  reindexKnowledge: async () => {
    set({ knowledgeBusy: true, knowledgeError: undefined, knowledgeNotice: undefined });
    try {
      const runtime = await resolveRuntime(get());
      const knowledge = await reindexKnowledge(runtime.backendUrl);
      const locale = readStoredLocale() ?? 'en-US';
      set({
        runtime,
        knowledge,
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
