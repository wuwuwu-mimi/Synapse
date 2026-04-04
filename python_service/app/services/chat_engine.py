from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.schemas import ChatFinalEvent, ChatMessage, MemoryFact, RetrievalDebug, RetrievalSource
from app.services.llm_service import LLMService
from app.services.memory_store import MemoryStore
from app.services.retrieval import RetrievalService


@dataclass
class ReplyContext:
    summary: str
    rewritten_query: str
    facts: list[MemoryFact]
    sources: list[RetrievalSource]
    debug: RetrievalDebug
    knowledge_only: bool = False
    knowledge_scope_label: str | None = None


class ChatEngine:
    def __init__(
        self,
        memory_store: MemoryStore,
        retrieval_service: RetrievalService,
        llm_service: LLMService,
    ) -> None:
        self.memory_store = memory_store
        self.retrieval_service = retrieval_service
        self.llm_service = llm_service

    async def stream_reply(
        self,
        session_id: str,
        query: str,
        history: list[ChatMessage],
        knowledge_only: bool = False,
        knowledge_scope_prefix: str | None = None,
        knowledge_scope_label: str | None = None,
    ) -> AsyncIterator[tuple[str, dict]]:
        context = await self._prepare_context(
            session_id,
            query,
            history,
            knowledge_only,
            knowledge_scope_prefix,
            knowledge_scope_label,
        )

        if self.llm_service.enabled:
            emitted = False
            answer_stream = self.llm_service.stream_answer(
                query,
                context.summary,
                [fact.content for fact in context.facts],
                [
                    {
                        'title': source.title,
                        'source': source.source,
                        'snippet': source.snippet,
                    }
                    for source in context.sources[:4]
                ],
                knowledge_only=context.knowledge_only,
            )
            try:
                while True:
                    chunk = await asyncio.to_thread(self._next_chunk, answer_stream)
                    if chunk is None:
                        break
                    emitted = True
                    yield 'delta', {'content': chunk}
            except Exception:
                if emitted:
                    raise
            else:
                if emitted:
                    yield 'done', self._build_final_event(
                        context,
                        generation_mode='llm',
                        model=self.llm_service.active_model,
                    ).model_dump()
                    return

        answer = self._compose_fallback_answer(
            query,
            context.summary,
            context.facts,
            context.sources,
            knowledge_only=context.knowledge_only,
        )
        for chunk in self.chunk_text(answer):
            yield 'delta', {'content': chunk}

        yield 'done', self._build_final_event(context).model_dump()

    async def _prepare_context(
        self,
        session_id: str,
        query: str,
        history: list[ChatMessage],
        knowledge_only: bool,
        knowledge_scope_prefix: str | None,
        knowledge_scope_label: str | None,
    ) -> ReplyContext:
        if knowledge_only:
            summary = ''
            facts: list[MemoryFact] = []
        else:
            summary, facts = self.memory_store.build_context(session_id, history)
        rewritten_query, sources, debug = self.retrieval_service.retrieve(
            session_id,
            query,
            facts,
            knowledge_scope_prefix=knowledge_scope_prefix,
        )

        if not knowledge_only:
            refined_summary = await self._refine_summary(history, summary)
            if refined_summary:
                summary = refined_summary
                self.memory_store.set_summary(session_id, summary)

        return ReplyContext(
            summary=summary,
            rewritten_query=rewritten_query,
            facts=facts,
            sources=sources,
            debug=debug,
            knowledge_only=knowledge_only,
            knowledge_scope_label=knowledge_scope_label or knowledge_scope_prefix,
        )

    async def _refine_summary(self, history: list[ChatMessage], summary: str) -> str | None:
        if not self.llm_service.enabled:
            return None

        try:
            return await asyncio.to_thread(self.llm_service.summarize, history, summary)
        except Exception:
            return None

    def chunk_text(self, text: str, chunk_size: int = 28) -> list[str]:
        return [text[index : index + chunk_size] for index in range(0, len(text), chunk_size)]

    def _build_final_event(
        self,
        context: ReplyContext,
        generation_mode: str = 'fallback',
        model: str | None = None,
    ) -> ChatFinalEvent:
        return ChatFinalEvent(
            summary=context.summary,
            rewritten_query=context.rewritten_query,
            facts=context.facts,
            sources=context.sources,
            debug=context.debug,
            generation_mode=generation_mode,
            model=model,
            knowledge_scope_label=context.knowledge_scope_label,
        )

    def _next_chunk(self, answer_stream) -> str | None:
        return next(answer_stream, None)

    def _compose_fallback_answer(
        self,
        query: str,
        summary: str,
        facts,
        sources: list[RetrievalSource],
        knowledge_only: bool = False,
    ) -> str:
        if knowledge_only:
            lines = [
                '### Answer',
                f'I answered "{query}" using only the retrieved knowledge base evidence from this turn.',
            ]
        else:
            lines = [
                '### Answer',
                f'I organized an implementation-oriented answer for "{query}" from the current memory and knowledge base.',
            ]

        if sources:
            lines.extend(
                [
                    '',
                    '### Retrieved evidence',
                    *[
                        f'{index}. **{source.title}**: {source.snippet}'
                        for index, source in enumerate(sources[:3], start=1)
                    ],
                ]
            )
        elif knowledge_only:
            lines.extend(
                [
                    '',
                    '### Knowledge base status',
                    '- No relevant knowledge chunks were retrieved for this question.',
                    '- Try using document keywords, headings, or more specific terms from the imported files.',
                ]
            )

        if summary:
            lines.extend(['', '### Short-term summary', f'- {summary}'])

        if facts:
            lines.extend(
                [
                    '',
                    '### Long-term memory hits',
                    *[f'- {fact.content} (confidence {fact.confidence:.2f})' for fact in facts[:3]],
                ]
            )

        if knowledge_only:
            lines.extend(
                [
                    '',
                    '### Suggested next steps',
                    '- Ask with phrases that appear in the imported markdown documents.',
                    '- Open the inspector and check whether any RAG sources were retrieved.',
                    '- Reindex the knowledge base after updating imported files.',
                ]
            )
        else:
            lines.extend(
                [
                    '',
                    '### Suggested next steps',
                    '- Keep desktop capabilities in Electron IPC and keep RAG logic in FastAPI.',
                    '- Surface summary, long-term memory, and retrieved evidence in the inspector for debugging.',
                    '- Configure a compatible OpenAI endpoint to replace this fallback with model-generated answers.',
                ]
            )

        return "\n".join(lines)
