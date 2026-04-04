export interface StreamChatPayload {
  session_id: string;
  query: string;
  knowledge_only?: boolean;
  knowledge_scope_prefix?: string;
  knowledge_scope_label?: string;
  history: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export interface StreamChatFinalEvent {
  summary: string;
  rewritten_query?: string;
  generation_mode?: 'llm' | 'fallback';
  model?: string | null;
  knowledge_scope_label?: string | null;
  debug?: {
    knowledge_strategy: string;
    knowledge_scope_prefix?: string | null;
    knowledge_candidates: number;
    knowledge_kept: number;
    knowledge_filtered_by_scope: number;
    knowledge_filtered_by_threshold: number;
    memory_candidates: number;
    memory_kept: number;
    memory_filtered_by_threshold: number;
    merged_candidates: number;
    final_sources: number;
    no_source_reason?: string | null;
  };
  facts: Array<{
    id: string;
    content: string;
    confidence: number;
    created_at: string;
    source: 'memory' | 'knowledge';
  }>;
  sources: Array<{
    id: string;
    title: string;
    source: string;
    snippet: string;
    score: number;
    lexical_score: number;
    vector_score: number;
    strategy: string;
  }>;
}

const decoder = new TextDecoder();

function parseEventBlock(block: string): { event: string; data: string } | null {
  const lines = block
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? 'message';
  const data = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n');

  return { event, data };
}

export async function streamChat(options: {
  backendUrl: string;
  payload: StreamChatPayload;
  onDelta: (delta: string) => void;
}): Promise<StreamChatFinalEvent> {
  const response = await fetch(`${options.backendUrl}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(options.payload)
  });

  if (!response.ok || !response.body) {
    throw new Error(`Backend request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  let buffer = '';
  let finalEvent: StreamChatFinalEvent | null = null;

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (buffer.includes('\n\n')) {
      const boundary = buffer.indexOf('\n\n');
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const parsed = parseEventBlock(block);
      if (!parsed) {
        continue;
      }

      if (parsed.event === 'delta') {
        const payload = JSON.parse(parsed.data) as { content: string };
        options.onDelta(payload.content);
      }

      if (parsed.event === 'done') {
        finalEvent = JSON.parse(parsed.data) as StreamChatFinalEvent;
      }

      if (parsed.event === 'error') {
        const payload = JSON.parse(parsed.data) as { detail: string };
        throw new Error(payload.detail);
      }
    }
  }

  if (!finalEvent) {
    throw new Error('Stream ended before a done event was received.');
  }

  return finalEvent;
}
