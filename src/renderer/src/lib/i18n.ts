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
  shortSummary: string;
  noSummary: string;
  queryRewrite: string;
  noRewrite: string;
  longTermMemory: string;
  noMemory: string;
  confidence: string;
  ragSources: string;
  noSources: string;
  fused: string;
  lexical: string;
  vector: string;
  startConversation: string;
  newSessionTitle: string;
  failedToSend: string;
  backendUnavailable: string;
  backendStartHint: string;
  ready: string;
  streaming: string;
  knowledgeBase: string;
  importFiles: string;
  importFolder: string;
  reindex: string;
  importing: string;
  documents: string;
  lastIndexed: string;
  database: string;
  connected: string;
  disconnected: string;
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
    shortSummary: '短期摘要',
    noSummary: '暂时还没有摘要。',
    queryRewrite: '查询改写',
    noRewrite: '本轮还没有生成改写查询。',
    longTermMemory: '长期记忆',
    noMemory: '暂时还没有命中长期记忆。',
    confidence: '置信度',
    ragSources: 'RAG 来源',
    noSources: '暂时还没有检索证据。',
    fused: '融合',
    lexical: '词法',
    vector: '向量',
    startConversation: '开始一段新对话...',
    newSessionTitle: '新会话',
    failedToSend: '发送消息失败',
    backendUnavailable: '后端不可用',
    backendStartHint: '请先安装 Python 依赖并启动 FastAPI 服务。',
    ready: '就绪',
    streaming: '生成中',
    knowledgeBase: '知识库',
    importFiles: '导入文件',
    importFolder: '导入文件夹',
    reindex: '重新索引',
    importing: '处理中...',
    documents: '分块数',
    lastIndexed: '上次索引',
    database: '数据库',
    connected: '已连接',
    disconnected: '未连接',
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
    shortSummary: 'Short Summary',
    noSummary: 'No summary yet.',
    queryRewrite: 'Query Rewrite',
    noRewrite: 'No rewrite generated for this turn.',
    longTermMemory: 'Long-term Memory',
    noMemory: 'No long-term memory hit yet.',
    confidence: 'Confidence',
    ragSources: 'RAG Sources',
    noSources: 'No retrieval evidence yet.',
    fused: 'Fused',
    lexical: 'Lexical',
    vector: 'Vector',
    startConversation: 'Start a new conversation...',
    newSessionTitle: 'New Session',
    failedToSend: 'Failed to send message',
    backendUnavailable: 'Backend unavailable',
    backendStartHint: 'Install Python dependencies and start the FastAPI service first.',
    ready: 'Ready',
    streaming: 'Streaming',
    knowledgeBase: 'Knowledge Base',
    importFiles: 'Import Files',
    importFolder: 'Import Folder',
    reindex: 'Reindex',
    importing: 'Working...',
    documents: 'Chunks',
    lastIndexed: 'Last indexed',
    database: 'Database',
    connected: 'Connected',
    disconnected: 'Disconnected',
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
