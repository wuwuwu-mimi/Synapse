from __future__ import annotations

import asyncio
import json

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.schemas import (
    ChatRequest,
    KnowledgeImportRequest,
    KnowledgeImportResponse,
    KnowledgeStatusResponse,
    RetrieveRequest,
    RetrieveResponse,
)
from app.services.chat_engine import ChatEngine
from app.services.llm_service import LLMService
from app.services.memory_store import MemoryStore
from app.services.retrieval import RetrievalService

settings = get_settings()
memory_store = MemoryStore(settings)
retrieval_service = RetrievalService(settings)
llm_service = LLMService(settings)
chat_engine = ChatEngine(memory_store, retrieval_service, llm_service)

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


def sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def build_knowledge_status() -> KnowledgeStatusResponse:
    return KnowledgeStatusResponse(
        knowledge_dir=str(settings.knowledge_path),
        documents=retrieval_service.document_count,
        database_connected=retrieval_service.database_connected,
        database_error=retrieval_service.database_error,
        redis_connected=memory_store.redis_connected,
        redis_error=memory_store.redis_error,
        last_indexed_at=retrieval_service.last_indexed_at,
        embedding_provider=retrieval_service.embedding_provider,
        embedding_model=retrieval_service.embedding_model,
        llm_enabled=llm_service.enabled,
        active_model=llm_service.active_model,
        indexed_sources=retrieval_service.indexed_sources,
        deduplicated_chunks=retrieval_service.deduplicated_chunks,
        reused_chunks=retrieval_service.reused_chunks,
        new_chunks=retrieval_service.new_chunks,
        removed_chunks=retrieval_service.removed_chunks,
        indexing_mode=retrieval_service.indexing_mode,
    )


@app.on_event('startup')
def on_startup() -> None:
    retrieval_service.refresh_documents()


@app.get('/health')
async def health() -> dict:
    status = build_knowledge_status()
    return {
        'status': 'ok',
        'documents': status.documents,
        'knowledge_dir': status.knowledge_dir,
        'database_connected': status.database_connected,
        'database_error': status.database_error,
        'redis_connected': status.redis_connected,
        'redis_error': status.redis_error,
        'last_indexed_at': status.last_indexed_at,
        'embedding_provider': status.embedding_provider,
        'embedding_model': status.embedding_model,
        'llm_enabled': status.llm_enabled,
        'active_model': status.active_model,
        'indexed_sources': status.indexed_sources,
        'deduplicated_chunks': status.deduplicated_chunks,
        'reused_chunks': status.reused_chunks,
        'new_chunks': status.new_chunks,
        'removed_chunks': status.removed_chunks,
        'indexing_mode': status.indexing_mode,
    }


@app.get('/api/knowledge/status', response_model=KnowledgeStatusResponse)
async def knowledge_status() -> KnowledgeStatusResponse:
    return build_knowledge_status()


@app.post('/api/knowledge/reindex', response_model=KnowledgeStatusResponse)
async def knowledge_reindex() -> KnowledgeStatusResponse:
    retrieval_service.refresh_documents()
    return build_knowledge_status()


@app.post('/api/knowledge/import', response_model=KnowledgeImportResponse)
async def knowledge_import(request: KnowledgeImportRequest) -> KnowledgeImportResponse:
    retrieval_service.refresh_documents()
    status = build_knowledge_status()
    return KnowledgeImportResponse(
        **status.model_dump(),
        imported_paths=request.imported_paths,
        imported_count=len(request.imported_paths),
    )


@app.post('/api/retrieve', response_model=RetrieveResponse)
async def retrieve(request: RetrieveRequest) -> RetrieveResponse:
    summary, facts = memory_store.build_context(request.session_id, [])
    rewritten_query, sources = retrieval_service.retrieve(
        request.session_id, request.query, facts, request.top_k
    )
    return RetrieveResponse(
        query=request.query,
        rewritten_query=rewritten_query,
        summary=summary,
        facts=facts,
        sources=sources,
    )


@app.post('/api/chat/stream')
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    async def event_stream():
        try:
            async for event_name, payload in chat_engine.stream_reply(
                request.session_id, request.query, request.history
            ):
                yield sse(event_name, payload)
                if event_name == 'delta':
                    await asyncio.sleep(0.01)
        except Exception as exc:
            yield sse('error', {'detail': str(exc)})

    return StreamingResponse(event_stream(), media_type='text/event-stream')
