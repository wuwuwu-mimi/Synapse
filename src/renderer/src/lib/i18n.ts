export type AppLocale = 'zh-CN' | 'en-US';

export interface AppMessages {
  workspace: string;
  conversation: string;
  inspector: string;
  newChat: string;
  runtimeLoading: string;
  pythonManaged: string;
  manualBackend: string;
  loading: string;
  emptyConversation: string;
  you: string;
  assistant: string;
  composerPlaceholder: string;
  composerHint: string;
  send: string;
  knowledgeOnly: string;
  knowledgeOnlyHint: string;
  scopeKnowledge: string;
  scopeKnowledgeHint: string;
  allKnowledge: string;
  scope: string;
  shortSummary: string;
  noSummary: string;
  queryRewrite: string;
  noRewrite: string;
  longTermMemory: string;
  noMemory: string;
  confidence: string;
  ragSources: string;
  retrievalDebug: string;
  knowledgeCandidates: string;
  knowledgeKept: string;
  memoryCandidates: string;
  memoryKept: string;
  filteredByScope: string;
  filteredByThreshold: string;
  mergedCandidates: string;
  finalSources: string;
  noSourceReason: string;
  noSources: string;
  fused: string;
  lexical: string;
  vector: string;
  startConversation: string;
  newSessionTitle: string;
  deleteSession: string;
  confirm: string;
  cancel: string;
  deleteSessionConfirmTitle: string;
  failedToSend: string;
  backendUnavailable: string;
  backendStartHint: string;
  ready: string;
  streaming: string;
  knowledgeBase: string;
  importFiles: string;
  importFolder: string;
  importedHistory: string;
  deleteImport: string;
  useAsScope: string;
  clearScope: string;
  activeScope: string;
  noImports: string;
  filesUnit: string;
  showDetails: string;
  hideDetails: string;
  showHistory: string;
  hideHistory: string;
  reindex: string;
  importing: string;
  documents: string;
  indexedSources: string;
  deduplicated: string;
  reused: string;
  added: string;
  removed: string;
  indexingMode: string;
  lastIndexed: string;
  database: string;
  redis: string;
  embedding: string;
  provider: string;
  serviceErrors: string;
  none: string;
  status: string;
  connected: string;
  disconnected: string;
  enabled: string;
  disabled: string;
  incremental: string;
  languageChinese: string;
  generation: string;
  noGeneration: string;
  model: string;
  llm: string;
  fallback: string;
  noIndexYet: string;
}

export const LOCALE_STORAGE_KEY = 'synapse.locale';

export const messages: Record<AppLocale, AppMessages> = {
  'zh-CN': {
    workspace: '工作区',
    conversation: '会话',
    inspector: '上下文检查器',
    newChat: '新建会话',
    runtimeLoading: '正在加载运行时...',
    pythonManaged: 'Python 已托管',
    manualBackend: '手动后端',
    loading: '加载中...',
    emptyConversation: '发送一条消息，体验短期记忆、长期记忆和 RAG 检索流程。',
    you: '你',
    assistant: '助手',
    composerPlaceholder: '可以询问记忆链路、检索设计，或桌面端架构。',
    composerHint: 'Enter 发送，Shift + Enter 换行',
    send: '发送',
    knowledgeOnly: '仅基于知识库回答',
    knowledgeOnlyHint: '开启后，本轮回答只使用检索到的知识库内容，不使用会话记忆。',
    scopeKnowledge: '知识范围',
    scopeKnowledgeHint: '可限制只在某一批已导入知识中检索。',
    allKnowledge: '全部知识',
    scope: '范围',
    shortSummary: '短期摘要',
    noSummary: '暂时还没有摘要。',
    queryRewrite: '查询改写',
    noRewrite: '本轮还没有生成改写查询。',
    longTermMemory: '长期记忆',
    noMemory: '暂时还没有命中长期记忆。',
    confidence: '置信度',
    ragSources: 'RAG 来源',
    retrievalDebug: '检索调试',
    knowledgeCandidates: '知识候选',
    knowledgeKept: '知识保留',
    memoryCandidates: '记忆候选',
    memoryKept: '记忆保留',
    filteredByScope: '范围过滤',
    filteredByThreshold: '阈值过滤',
    mergedCandidates: '合并候选',
    finalSources: '最终来源',
    noSourceReason: '无结果原因',
    noSources: '暂时还没有检索证据。',
    fused: '融合',
    lexical: '词法',
    vector: '向量',
    startConversation: '开始一段新对话...',
    newSessionTitle: '新会话',
    deleteSession: '删除会话',
    confirm: '确认',
    cancel: '取消',
    deleteSessionConfirmTitle: '确认删除会话',
    failedToSend: '发送消息失败',
    backendUnavailable: '后端不可用',
    backendStartHint: '请先安装 Python 依赖并启动 FastAPI 服务。',
    ready: '就绪',
    streaming: '生成中',
    knowledgeBase: '知识库',
    importFiles: '导入文件',
    importFolder: '导入文件夹',
    importedHistory: '导入历史',
    deleteImport: '删除',
    useAsScope: '设为范围',
    clearScope: '清除范围',
    activeScope: '当前范围',
    noImports: '暂时还没有导入记录。',
    filesUnit: '个文件',
    showDetails: '展开详情',
    hideDetails: '收起详情',
    showHistory: '展开历史',
    hideHistory: '收起历史',
    reindex: '重新索引',
    importing: '处理中...',
    documents: '分块数',
    indexedSources: '文件数',
    deduplicated: '已去重',
    reused: '复用分块',
    added: '新增分块',
    removed: '删除分块',
    indexingMode: '索引模式',
    lastIndexed: '上次索引',
    database: '数据库',
    redis: 'Redis',
    embedding: 'Embedding',
    provider: '提供方',
    serviceErrors: '服务错误',
    none: '无',
    status: '状态',
    connected: '已连接',
    disconnected: '未连接',
    enabled: '已启用',
    disabled: '未启用',
    incremental: '增量',
    languageChinese: '中文',
    generation: '生成方式',
    noGeneration: '暂时还没有生成信息。',
    model: '模型',
    llm: 'LLM',
    fallback: '回退方案',
    noIndexYet: '尚未建立索引',
  },
  'en-US': {
    workspace: 'Workspace',
    conversation: 'Conversation',
    inspector: 'Context Inspector',
    newChat: 'New Chat',
    runtimeLoading: 'Loading runtime...',
    pythonManaged: 'Python managed',
    manualBackend: 'Manual backend',
    loading: 'Loading...',
    emptyConversation: 'Send a message to exercise short memory, long memory, and retrieval.',
    you: 'You',
    assistant: 'Assistant',
    composerPlaceholder: 'Ask about memory flow, retrieval design, or desktop architecture.',
    composerHint: 'Enter to send, Shift + Enter for a new line',
    send: 'Send',
    knowledgeOnly: 'Knowledge-only answers',
    knowledgeOnlyHint: 'When enabled, this turn answers only from retrieved knowledge base evidence.',
    scopeKnowledge: 'Knowledge scope',
    scopeKnowledgeHint: 'Optionally limit retrieval to one imported batch.',
    allKnowledge: 'All knowledge',
    scope: 'Scope',
    shortSummary: 'Short Summary',
    noSummary: 'No summary yet.',
    queryRewrite: 'Query Rewrite',
    noRewrite: 'No rewrite generated for this turn.',
    longTermMemory: 'Long-term Memory',
    noMemory: 'No long-term memory hit yet.',
    confidence: 'Confidence',
    ragSources: 'RAG Sources',
    retrievalDebug: 'Retrieval Debug',
    knowledgeCandidates: 'Knowledge candidates',
    knowledgeKept: 'Knowledge kept',
    memoryCandidates: 'Memory candidates',
    memoryKept: 'Memory kept',
    filteredByScope: 'Filtered by scope',
    filteredByThreshold: 'Filtered by threshold',
    mergedCandidates: 'Merged candidates',
    finalSources: 'Final sources',
    noSourceReason: 'No-source reason',
    noSources: 'No retrieval evidence yet.',
    fused: 'Fused',
    lexical: 'Lexical',
    vector: 'Vector',
    startConversation: 'Start a new conversation...',
    newSessionTitle: 'New Session',
    deleteSession: 'Delete chat',
    confirm: 'Confirm',
    cancel: 'Cancel',
    deleteSessionConfirmTitle: 'Delete this chat?',
    failedToSend: 'Failed to send message',
    backendUnavailable: 'Backend unavailable',
    backendStartHint: 'Install Python dependencies and start the FastAPI service first.',
    ready: 'Ready',
    streaming: 'Streaming',
    knowledgeBase: 'Knowledge Base',
    importFiles: 'Import Files',
    importFolder: 'Import Folder',
    importedHistory: 'Import History',
    deleteImport: 'Delete',
    useAsScope: 'Use as scope',
    clearScope: 'Clear scope',
    activeScope: 'Active scope',
    noImports: 'No imported batches yet.',
    filesUnit: 'files',
    showDetails: 'Show details',
    hideDetails: 'Hide details',
    showHistory: 'Show history',
    hideHistory: 'Hide history',
    reindex: 'Reindex',
    importing: 'Working...',
    documents: 'Chunks',
    indexedSources: 'Sources',
    deduplicated: 'Deduped',
    reused: 'Reused',
    added: 'Added',
    removed: 'Removed',
    indexingMode: 'Index Mode',
    lastIndexed: 'Last indexed',
    database: 'Database',
    redis: 'Redis',
    embedding: 'Embedding',
    provider: 'Provider',
    serviceErrors: 'Service errors',
    none: 'None',
    status: 'Status',
    connected: 'Connected',
    disconnected: 'Disconnected',
    enabled: 'Enabled',
    disabled: 'Disabled',
    incremental: 'Incremental',
    languageChinese: '中文',
    generation: 'Generation',
    noGeneration: 'No generation metadata yet.',
    model: 'Model',
    llm: 'LLM',
    fallback: 'Fallback',
    noIndexYet: 'Not indexed yet',
  },
};

export function resolveInitialLocale(): AppLocale {
  const stored = readStoredLocale();
  if (stored) {
    return stored;
  }

  const preferred = navigator.language.toLowerCase();
  return preferred.startsWith('zh') ? 'zh-CN' : 'en-US';
}

export function readStoredLocale(): AppLocale | null {
  const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return value === 'zh-CN' || value === 'en-US' ? value : null;
}

export function writeStoredLocale(locale: AppLocale): void {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

export function formatImportedNotice(locale: AppLocale, count: number): string {
  return locale === 'zh-CN' ? `已导入 ${count} 个文件。` : `Imported ${count} files.`;
}

export function formatReindexNotice(locale: AppLocale, count: number): string {
  return locale === 'zh-CN'
    ? `索引已刷新，当前共有 ${count} 个知识分块。`
    : `Index refreshed. ${count} chunks are available.`;
}

export function formatNoSourceReason(locale: AppLocale, reason?: string | null): string {
  if (!reason) {
    return locale === 'zh-CN' ? '无' : 'None';
  }

  const zh: Record<string, string> = {
    scope_filtered_all: '当前选择的知识范围没有命中任何候选。',
    threshold_filtered: '有候选被召回，但全部被阈值过滤掉了。',
    memory_filtered: '仅命中了记忆候选，但它们都被阈值过滤掉了。',
    no_match: '当前查询没有召回相关候选。',
  };
  const en: Record<string, string> = {
    scope_filtered_all: 'The selected knowledge scope produced no candidates.',
    threshold_filtered: 'Candidates were found, but all were filtered out by thresholds.',
    memory_filtered: 'Only memory candidates were found, and they were filtered out by thresholds.',
    no_match: 'The current query did not retrieve relevant candidates.',
  };

  return locale === 'zh-CN' ? zh[reason] ?? reason : en[reason] ?? reason;
}

export function formatDeleteSessionConfirm(locale: AppLocale, title: string): string {
  return locale === 'zh-CN'
    ? `删除后将无法恢复「${title}」中的消息记录。`
    : `This permanently removes the messages in "${title}".`;
}
