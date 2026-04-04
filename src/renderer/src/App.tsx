import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Empty, Input, Modal, Segmented, Select, Spin, Switch, Tag } from 'antd';
import ReactMarkdown from 'react-markdown';
import type { ChatSession } from '@shared/types';
import {
  formatDeleteSessionConfirm,
  formatNoSourceReason,
  messages,
  resolveInitialLocale,
  type AppLocale,
  writeStoredLocale,
} from './lib/i18n';
import { useChatStore } from './store/chatStore';

const { TextArea } = Input;

function getSessionPreview(session: ChatSession, fallback: string): string {
  const latestMessage = [...session.messages].reverse().find((message) => message.content.trim());
  return latestMessage?.content.slice(0, 42) ?? fallback;
}

export default function App(): JSX.Element {
  const [draft, setDraft] = useState('');
  const [locale, setLocale] = useState<AppLocale>(resolveInitialLocale);
  const [showRuntimeDetails, setShowRuntimeDetails] = useState(false);
  const [showKnowledgeDetails, setShowKnowledgeDetails] = useState(false);
  const [showImportHistory, setShowImportHistory] = useState(false);
  const sessions = useChatStore((state) => state.sessions);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const runtime = useChatStore((state) => state.runtime);
  const knowledge = useChatStore((state) => state.knowledge);
  const knowledgeImports = useChatStore((state) => state.knowledgeImports);
  const knowledgeOnlyMode = useChatStore((state) => state.knowledgeOnlyMode);
  const knowledgeScopeId = useChatStore((state) => state.knowledgeScopeId);
  const sending = useChatStore((state) => state.sending);
  const knowledgeBusy = useChatStore((state) => state.knowledgeBusy);
  const error = useChatStore((state) => state.error);
  const knowledgeError = useChatStore((state) => state.knowledgeError);
  const knowledgeNotice = useChatStore((state) => state.knowledgeNotice);
  const loadSessions = useChatStore((state) => state.loadSessions);
  const createSession = useChatStore((state) => state.createSession);
  const selectSession = useChatStore((state) => state.selectSession);
  const deleteSession = useChatStore((state) => state.deleteSession);
  const setKnowledgeOnlyMode = useChatStore((state) => state.setKnowledgeOnlyMode);
  const setKnowledgeScopeId = useChatStore((state) => state.setKnowledgeScopeId);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const importKnowledgeFiles = useChatStore((state) => state.importKnowledgeFiles);
  const importKnowledgeFolder = useChatStore((state) => state.importKnowledgeFolder);
  const deleteKnowledgeImport = useChatStore((state) => state.deleteKnowledgeImport);
  const reindexKnowledge = useChatStore((state) => state.reindexKnowledge);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const copy = messages[locale];
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale]
  );

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    writeStoredLocale(locale);
  }, [locale]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [sessions, activeSessionId]);

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId),
    [activeSessionId, sessions]
  );
  const selectedKnowledgeScope = useMemo(
    () => knowledgeImports.find((entry) => entry.id === knowledgeScopeId),
    [knowledgeImports, knowledgeScopeId]
  );

  const handleSend = async (): Promise<void> => {
    const content = draft.trim();
    if (!content) {
      return;
    }

    setDraft('');
    await sendMessage(content);
  };

  const handleDeleteSession = (session: ChatSession): void => {
    Modal.confirm({
      title: copy.deleteSessionConfirmTitle,
      content: formatDeleteSessionConfirm(locale, session.title),
      okText: copy.confirm,
      cancelText: copy.cancel,
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteSession(session.id);
      },
    });
  };

  const lastIndexed = knowledge?.lastIndexedAt
    ? timeFormatter.format(new Date(knowledge.lastIndexedAt))
    : copy.noIndexYet;
  const generationLabel =
    currentSession?.inspector.generationMode === 'llm' ? copy.llm : copy.fallback;
  const llmStatusLabel = knowledge?.llmEnabled ? copy.enabled : copy.disabled;
  const indexingModeLabel =
    knowledge?.indexingMode === 'incremental' ? copy.incremental : knowledge?.indexingMode ?? copy.none;
  const noSourceReason = formatNoSourceReason(
    locale,
    currentSession?.inspector.debug?.noSourceReason
  );

  return (
    <div className="app-shell">
      <aside className="panel sidebar">
        <div className="panel-header">
          <div>
            <span className="eyebrow">{copy.workspace}</span>
            <h1>Synapse</h1>
          </div>
          <div className="header-actions">
            <Segmented<AppLocale>
              options={[
                { label: copy.languageChinese, value: 'zh-CN' },
                { label: 'EN', value: 'en-US' },
              ]}
              size="small"
              value={locale}
              onChange={(value) => setLocale(value)}
            />
            <Button type="primary" onClick={() => void createSession()}>
              {copy.newChat}
            </Button>
          </div>
        </div>

        <div className="runtime-strip">
          <div className="runtime-strip-main">
            <Tag color="volcano">
              {runtime?.autoStarted ? copy.pythonManaged : copy.manualBackend}
            </Tag>
            <Button
              size="small"
              type="text"
              className="inline-toggle"
              onClick={() => setShowRuntimeDetails((value) => !value)}
            >
              {showRuntimeDetails ? copy.hideDetails : copy.showDetails}
            </Button>
          </div>
          {showRuntimeDetails ? (
            <div className="runtime-details">
              <span className="runtime-url">{runtime?.backendUrl ?? copy.runtimeLoading}</span>
            </div>
          ) : null}
        </div>

        <section className="knowledge-panel">
          <div className="knowledge-header">
            <div>
              <span className="eyebrow">{copy.knowledgeBase}</span>
              <h2>{copy.knowledgeBase}</h2>
            </div>
            <div className="knowledge-status-tags">
              <Tag color={knowledge?.databaseConnected ? 'success' : 'error'}>
                {copy.database}: {knowledge?.databaseConnected ? copy.connected : copy.disconnected}
              </Tag>
              <Tag color={knowledge?.redisConnected ? 'success' : 'warning'}>
                {copy.redis}: {knowledge?.redisConnected ? copy.connected : copy.disconnected}
              </Tag>
            </div>
          </div>

          {knowledgeError ? <Alert type="error" showIcon message={knowledgeError} /> : null}
          {knowledgeNotice ? <Alert type="success" showIcon message={knowledgeNotice} /> : null}
          {knowledge?.databaseError ? (
            <Alert type="warning" showIcon message={`${copy.database}: ${knowledge.databaseError}`} />
          ) : null}
          {knowledge?.redisError ? (
            <Alert type="warning" showIcon message={`${copy.redis}: ${knowledge.redisError}`} />
          ) : null}

          <div className="knowledge-actions">
            <Button size="small" onClick={() => void importKnowledgeFiles()} disabled={knowledgeBusy}>
              {copy.importFiles}
            </Button>
            <Button size="small" onClick={() => void importKnowledgeFolder()} disabled={knowledgeBusy}>
              {copy.importFolder}
            </Button>
            <Button size="small" onClick={() => void reindexKnowledge()} loading={knowledgeBusy}>
              {knowledgeBusy ? copy.importing : copy.reindex}
            </Button>
            <Button
              size="small"
              type="text"
              className="inline-toggle"
              onClick={() => setShowKnowledgeDetails((value) => !value)}
            >
              {showKnowledgeDetails ? copy.hideDetails : copy.showDetails}
            </Button>
            <Button
              size="small"
              type="text"
              className="inline-toggle"
              onClick={() => setShowImportHistory((value) => !value)}
            >
              {showImportHistory ? copy.hideHistory : copy.showHistory}
            </Button>
          </div>

          {showKnowledgeDetails ? (
            <div className="knowledge-meta-grid">
              <div className="knowledge-stat">
                <span className="knowledge-stat-label">{copy.documents}</span>
                <strong>{knowledge?.documents ?? 0}</strong>
              </div>
              <div className="knowledge-stat">
                <span className="knowledge-stat-label">{copy.indexedSources}</span>
                <strong>{knowledge?.indexedSources ?? 0}</strong>
              </div>
              <div className="knowledge-stat">
                <span className="knowledge-stat-label">{copy.deduplicated}</span>
                <strong>{knowledge?.deduplicatedChunks ?? 0}</strong>
              </div>
              <div className="knowledge-stat">
                <span className="knowledge-stat-label">{copy.reused}</span>
                <strong>{knowledge?.reusedChunks ?? 0}</strong>
              </div>
              <div className="knowledge-stat">
                <span className="knowledge-stat-label">{copy.added}</span>
                <strong>{knowledge?.newChunks ?? 0}</strong>
              </div>
              <div className="knowledge-stat">
                <span className="knowledge-stat-label">{copy.removed}</span>
                <strong>{knowledge?.removedChunks ?? 0}</strong>
              </div>
              <div className="knowledge-stat">
                <span className="knowledge-stat-label">{copy.lastIndexed}</span>
                <strong>{lastIndexed}</strong>
              </div>
              <div className="knowledge-stat">
                <span className="knowledge-stat-label">{copy.embedding}</span>
                <strong>{knowledge?.embeddingModel ?? copy.fallback}</strong>
              </div>
              <div className="knowledge-stat">
                <span className="knowledge-stat-label">{copy.provider}</span>
                <strong>{knowledge?.embeddingProvider ?? copy.none}</strong>
              </div>
              <div className="knowledge-stat">
                <span className="knowledge-stat-label">{copy.llm}</span>
                <strong>{llmStatusLabel}</strong>
              </div>
              <div className="knowledge-stat">
                <span className="knowledge-stat-label">{copy.model}</span>
                <strong>{knowledge?.activeModel ?? copy.fallback}</strong>
              </div>
              <div className="knowledge-stat">
                <span className="knowledge-stat-label">{copy.indexingMode}</span>
                <strong>{indexingModeLabel}</strong>
              </div>
            </div>
          ) : null}

          {showImportHistory ? (
            <div className="knowledge-history">
              <div className="section-title">{copy.importedHistory}</div>
              {knowledgeImports.length ? (
                knowledgeImports.map((entry) => (
                  <div key={entry.id} className="knowledge-import-card">
                    <div className="knowledge-import-top">
                      <strong>{entry.label}</strong>
                      <div className="knowledge-import-tags">
                        {knowledgeScopeId === entry.id ? (
                          <Tag color="gold">{copy.activeScope}</Tag>
                        ) : null}
                        <Tag color={entry.mode === 'folder' ? 'blue' : 'purple'}>{entry.mode}</Tag>
                      </div>
                    </div>
                    <p>{entry.rootPath}</p>
                    <p className="knowledge-import-names">{entry.sourceNames.join(', ')}</p>
                    <div className="knowledge-import-footer">
                      <span>
                        {entry.fileCount} {copy.filesUnit} | {timeFormatter.format(new Date(entry.updatedAt))}
                      </span>
                      <div className="knowledge-import-actions">
                        <Button
                          size="small"
                          type={knowledgeScopeId === entry.id ? 'default' : 'text'}
                          disabled={knowledgeBusy}
                          onClick={() =>
                            setKnowledgeScopeId(knowledgeScopeId === entry.id ? undefined : entry.id)
                          }
                        >
                          {knowledgeScopeId === entry.id ? copy.clearScope : copy.useAsScope}
                        </Button>
                        <Button
                          size="small"
                          danger
                          disabled={knowledgeBusy}
                          onClick={() => void deleteKnowledgeImport(entry.rootPath)}
                        >
                          {copy.deleteImport}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="knowledge-empty">{copy.noImports}</p>
              )}
            </div>
          ) : null}
        </section>

        <div className="session-list">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`session-card ${session.id === activeSessionId ? 'active' : ''}`}
              onClick={() => selectSession(session.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selectSession(session.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="session-card-top">
                <strong>{session.title}</strong>
                <div className="session-card-actions">
                  <span>{timeFormatter.format(new Date(session.updatedAt))}</span>
                  <Button
                    size="small"
                    type="text"
                    danger
                    className="session-delete-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteSession(session);
                    }}
                  >
                    {copy.deleteSession}
                  </Button>
                </div>
              </div>
              <p>{getSessionPreview(session, copy.startConversation)}</p>
            </div>
          ))}
        </div>
      </aside>

      <main className="panel chat-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">{copy.conversation}</span>
            <h2>{currentSession?.title ?? copy.loading}</h2>
          </div>
          <Tag color="geekblue">{sending ? copy.streaming : copy.ready}</Tag>
        </div>

        {error ? <Alert banner type="warning" message={error} /> : null}

        <div className="message-list">
          {!currentSession ? (
            <div className="empty-state">
              <Spin />
            </div>
          ) : currentSession.messages.length === 0 ? (
            <div className="empty-state">
              <Empty
                description={copy.emptyConversation}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </div>
          ) : (
            currentSession.messages.map((message) => (
              <article key={message.id} className={`message-bubble ${message.role}`}>
                <header>
                  <span>{message.role === 'user' ? copy.you : copy.assistant}</span>
                  <span>{timeFormatter.format(new Date(message.createdAt))}</span>
                </header>
                {message.role === 'assistant' ? (
                  <div className="markdown-body">
                    <ReactMarkdown>{message.content || '...'}</ReactMarkdown>
                  </div>
                ) : (
                  <p>{message.content}</p>
                )}
              </article>
            ))
          )}
          <div ref={messageEndRef} />
        </div>

        <div className="composer">
          <div className="composer-toggles">
            <label className="composer-toggle" htmlFor="knowledge-only-switch">
              <div>
                <strong>{copy.knowledgeOnly}</strong>
                <span>{copy.knowledgeOnlyHint}</span>
              </div>
              <Switch
                id="knowledge-only-switch"
                size="small"
                checked={knowledgeOnlyMode}
                onChange={setKnowledgeOnlyMode}
              />
            </label>
            <div className="composer-toggle composer-toggle-stack">
              <div>
                <strong>{copy.scopeKnowledge}</strong>
                <span>{copy.scopeKnowledgeHint}</span>
              </div>
              <Select
                allowClear
                size="small"
                className="scope-select"
                placeholder={copy.allKnowledge}
                value={selectedKnowledgeScope?.id}
                options={knowledgeImports.map((entry) => ({
                  value: entry.id,
                  label: `${entry.label} (${entry.fileCount} ${copy.filesUnit})`,
                }))}
                onChange={(value) => setKnowledgeScopeId(value)}
              />
            </div>
          </div>
          <TextArea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={copy.composerPlaceholder}
            autoSize={{ minRows: 3, maxRows: 7 }}
            onPressEnter={(event) => {
              if (!event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
          />
          <div className="composer-actions">
            <span>{copy.composerHint}</span>
            <Button type="primary" loading={sending} onClick={() => void handleSend()}>
              {copy.send}
            </Button>
          </div>
        </div>
      </main>

      <aside className="panel inspector">
        <div className="panel-header">
          <div>
            <span className="eyebrow">{copy.inspector}</span>
            <h2>{copy.inspector}</h2>
          </div>
        </div>

        <section className="inspector-section">
          <div className="section-title">{copy.generation}</div>
          <p>
            {currentSession?.inspector.generationMode
              ? `${generationLabel}${currentSession?.inspector.model ? ` | ${copy.model} ${currentSession.inspector.model}` : ''}${currentSession?.inspector.knowledgeScopeLabel ? ` | ${copy.scope} ${currentSession.inspector.knowledgeScopeLabel}` : ''}`
              : copy.noGeneration}
          </p>
        </section>

        <section className="inspector-section">
          <div className="section-title">{copy.shortSummary}</div>
          <p>{currentSession?.inspector.summary || copy.noSummary}</p>
        </section>

        <section className="inspector-section">
          <div className="section-title">{copy.queryRewrite}</div>
          <p>{currentSession?.inspector.rewrittenQuery || copy.noRewrite}</p>
        </section>

        <section className="inspector-section">
          <div className="section-title">{copy.longTermMemory}</div>
          {currentSession?.inspector.facts.length ? (
            currentSession.inspector.facts.map((fact) => (
              <div key={fact.id} className="fact-card">
                <strong>{fact.content}</strong>
                <span>
                  {copy.confidence} {fact.confidence.toFixed(2)}
                </span>
              </div>
            ))
          ) : (
            <p>{copy.noMemory}</p>
          )}
        </section>

        <section className="inspector-section">
          <div className="section-title">{copy.ragSources}</div>
          {currentSession?.inspector.sources.length ? (
            currentSession.inspector.sources.map((source) => (
              <div key={source.id} className="source-card">
                <div className="source-card-top">
                  <strong>{source.title}</strong>
                  <Tag color="gold">{source.strategy}</Tag>
                </div>
                <p>{source.snippet}</p>
                <span>
                  {source.source} | {copy.fused} {source.score.toFixed(3)} | {copy.lexical}{' '}
                  {source.lexicalScore.toFixed(3)} | {copy.vector} {source.vectorScore.toFixed(3)}
                </span>
              </div>
            ))
          ) : (
            <p>{copy.noSources}</p>
          )}
        </section>

        <section className="inspector-section">
          <div className="section-title">{copy.retrievalDebug}</div>
          <div className="knowledge-meta-grid">
            <div className="knowledge-stat">
              <span className="knowledge-stat-label">{copy.knowledgeCandidates}</span>
              <strong>{currentSession?.inspector.debug?.knowledgeCandidates ?? 0}</strong>
            </div>
            <div className="knowledge-stat">
              <span className="knowledge-stat-label">{copy.knowledgeKept}</span>
              <strong>{currentSession?.inspector.debug?.knowledgeKept ?? 0}</strong>
            </div>
            <div className="knowledge-stat">
              <span className="knowledge-stat-label">{copy.memoryCandidates}</span>
              <strong>{currentSession?.inspector.debug?.memoryCandidates ?? 0}</strong>
            </div>
            <div className="knowledge-stat">
              <span className="knowledge-stat-label">{copy.memoryKept}</span>
              <strong>{currentSession?.inspector.debug?.memoryKept ?? 0}</strong>
            </div>
            <div className="knowledge-stat">
              <span className="knowledge-stat-label">{copy.filteredByScope}</span>
              <strong>{currentSession?.inspector.debug?.knowledgeFilteredByScope ?? 0}</strong>
            </div>
            <div className="knowledge-stat">
              <span className="knowledge-stat-label">{copy.filteredByThreshold}</span>
              <strong>
                {(currentSession?.inspector.debug?.knowledgeFilteredByThreshold ?? 0) +
                  (currentSession?.inspector.debug?.memoryFilteredByThreshold ?? 0)}
              </strong>
            </div>
            <div className="knowledge-stat">
              <span className="knowledge-stat-label">{copy.mergedCandidates}</span>
              <strong>{currentSession?.inspector.debug?.mergedCandidates ?? 0}</strong>
            </div>
            <div className="knowledge-stat">
              <span className="knowledge-stat-label">{copy.finalSources}</span>
              <strong>{currentSession?.inspector.debug?.finalSources ?? 0}</strong>
            </div>
          </div>
          <p>
            {copy.noSourceReason}: {noSourceReason}
          </p>
        </section>
      </aside>
    </div>
  );
}
