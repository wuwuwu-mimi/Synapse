from __future__ import annotations

import asyncio

from app.schemas import ChatFinalEvent, ChatMessage, RetrievalSource
from app.services.llm_service import LLMService
from app.services.memory_store import MemoryStore
from app.services.retrieval import RetrievalService


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

    async def prepare_reply(
        self, session_id: str, query: str, history: list[ChatMessage]
    ) -> tuple[str, ChatFinalEvent]:
        summary, facts = self.memory_store.build_context(session_id, history)
        rewritten_query, sources = self.retrieval_service.retrieve(session_id, query, facts)

        generation_mode = 'fallback'
        model: str | None = None
        answer = self._compose_fallback_answer(query, summary, facts, sources)

        refined_summary = await self._refine_summary(history, summary)
        if refined_summary:
            summary = refined_summary
            self.memory_store.set_summary(session_id, summary)

        if self.llm_service.enabled:
            try:
                answer = await asyncio.to_thread(
                    self.llm_service.answer,
                    query,
                    summary,
                    [fact.content for fact in facts],
                    [
                        {
                            'title': source.title,
                            'source': source.source,
                            'snippet': source.snippet,
                        }
                        for source in sources[:4]
                    ],
                )
                generation_mode = 'llm'
                model = self.llm_service.active_model
            except Exception:
                generation_mode = 'fallback'
                model = None

        return (
            answer,
            ChatFinalEvent(
                summary=summary,
                rewritten_query=rewritten_query,
                facts=facts,
                sources=sources,
                generation_mode=generation_mode,
                model=model,
            ),
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

    def _compose_fallback_answer(
        self,
        query: str,
        summary: str,
        facts,
        sources: list[RetrievalSource],
    ) -> str:
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
