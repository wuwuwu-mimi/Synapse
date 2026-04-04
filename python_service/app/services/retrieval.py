from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from psycopg import connect
from psycopg.types.json import Json

from app.config import Settings
from app.schemas import MemoryFact, RetrievalSource
from app.services.embedding_service import EmbeddingService
from app.services.postgres_sql import BOOTSTRAP_SQL, HYBRID_SEARCH_SQL

INDEX_STATE_VERSION = 1


@dataclass
class RawKnowledgeChunk:
    id: str
    title: str
    source: str
    snippet: str
    content: str
    search_text: str
    chunk_hash: str
    source_hash: str


@dataclass
class KnowledgeChunk:
    id: str
    title: str
    source: str
    snippet: str
    content: str
    search_text: str
    embedding: list[float]
    chunk_hash: str
    source_hash: str


@dataclass
class DatabaseChunk:
    id: str
    title: str
    source: str
    snippet: str
    content: str
    search_text: str
    embedding: list[float]
    metadata: dict[str, object]


@dataclass
class IndexStats:
    source_count: int = 0
    total_chunks: int = 0
    deduplicated_chunks: int = 0
    reused_chunks: int = 0
    new_chunks: int = 0
    removed_chunks: int = 0
    indexing_mode: str = "incremental"


class RetrievalService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.embedding_service = EmbeddingService(settings)
        self._chunks: list[KnowledgeChunk] = []
        self._document_count = 0
        self._database_connected = False
        self._database_error: str | None = None
        self._last_indexed_at: str | None = None
        self._index_stats = IndexStats()

    @property
    def document_count(self) -> int:
        return self._document_count

    @property
    def database_connected(self) -> bool:
        return self._database_connected

    @property
    def database_error(self) -> str | None:
        return self._database_error

    @property
    def last_indexed_at(self) -> str | None:
        return self._last_indexed_at

    @property
    def embedding_provider(self) -> str:
        return self.embedding_service.provider

    @property
    def embedding_model(self) -> str | None:
        return self.embedding_service.active_model

    @property
    def indexed_sources(self) -> int:
        return self._index_stats.source_count

    @property
    def deduplicated_chunks(self) -> int:
        return self._index_stats.deduplicated_chunks

    @property
    def reused_chunks(self) -> int:
        return self._index_stats.reused_chunks

    @property
    def new_chunks(self) -> int:
        return self._index_stats.new_chunks

    @property
    def removed_chunks(self) -> int:
        return self._index_stats.removed_chunks

    @property
    def indexing_mode(self) -> str:
        return self._index_stats.indexing_mode

    def refresh_documents(self) -> None:
        raw_chunks: list[RawKnowledgeChunk] = []
        next_state: dict[str, object] | None = None
        base_stats = IndexStats()

        try:
            previous_state = self._load_index_state()
            raw_chunks, next_state, base_stats = self._collect_raw_chunks(previous_state)

            self._bootstrap_database()
            existing_chunks = self._load_database_chunks()
            chunks = self._materialize_chunks(raw_chunks, existing_chunks)
            removed_chunks = self._sync_chunks_to_database(chunks, existing_chunks)
            self._save_index_state(next_state)

            self._chunks = chunks
            self._document_count = self._count_database_chunks()
            self._database_connected = True
            self._database_error = None
            self._index_stats = IndexStats(
                source_count=base_stats.source_count,
                total_chunks=base_stats.total_chunks,
                deduplicated_chunks=base_stats.deduplicated_chunks,
                reused_chunks=sum(1 for chunk in chunks if chunk.id in existing_chunks),
                new_chunks=sum(1 for chunk in chunks if chunk.id not in existing_chunks),
                removed_chunks=removed_chunks,
            )
        except Exception as exc:
            self._database_connected = False
            self._database_error = str(exc)
            self._index_stats = base_stats

            if raw_chunks:
                try:
                    self._chunks = self._materialize_chunks(raw_chunks, {})
                    self._document_count = len(self._chunks)
                except Exception:
                    self._chunks = []
                    self._document_count = 0
            else:
                self._chunks = []
                self._document_count = 0
        finally:
            self._last_indexed_at = datetime.now(timezone.utc).isoformat()

    def rewrite_query(self, query: str) -> str:
        expansions = {
            "\u8bb0\u5fc6": "\u77ed\u671f\u8bb0\u5fc6 \u957f\u671f\u8bb0\u5fc6 redis \u6458\u8981 facts memory",
            "\u68c0\u7d22": "bm25 \u5411\u91cf\u68c0\u7d22 \u6df7\u5408\u68c0\u7d22 rrf retrieval vector lexical",
            "\u684c\u9762": "electron react typescript ipc preload desktop",
            "\u4e0a\u4e0b\u6587": "summary context inspector sources facts",
            "memory": "summary facts long term memory redis",
            "retrieval": "rag bm25 vector hybrid search",
        }
        rewritten = [query.strip()]
        lowered = query.lower()

        for keyword, extension in expansions.items():
            if keyword in query or keyword in lowered:
                rewritten.append(extension)

        return " ".join(part for part in rewritten if part).strip()

    def retrieve(
        self,
        session_id: str,
        query: str,
        facts: list[MemoryFact],
        top_k: int | None = None,
    ) -> tuple[str, list[RetrievalSource]]:
        limit = top_k or self.settings.default_top_k
        rewritten_query = self.rewrite_query(query)

        knowledge_results = self._retrieve_knowledge(rewritten_query)
        memory_results = self._score_memory_facts(session_id, rewritten_query, facts)

        merged: dict[str, RetrievalSource] = {}
        for result in [*knowledge_results, *memory_results]:
            existing = merged.get(result.id)
            if existing is None or result.score > existing.score:
                merged[result.id] = result

        ordered = sorted(merged.values(), key=lambda item: item.score, reverse=True)
        return rewritten_query, ordered[:limit]

    def _retrieve_knowledge(self, query: str) -> list[RetrievalSource]:
        if self._database_connected:
            try:
                return self._retrieve_from_database(query)
            except Exception as exc:
                self._database_connected = False
                self._database_error = str(exc)

        return self._retrieve_from_memory(query)
    def _collect_raw_chunks(
        self, previous_state: dict[str, object]
    ) -> tuple[list[RawKnowledgeChunk], dict[str, object], IndexStats]:
        candidates: list[RawKnowledgeChunk] = []
        state_sources: dict[str, object] = {}
        knowledge_dir = self.settings.knowledge_path
        previous_sources = previous_state.get("sources", {})

        if not knowledge_dir.exists():
            return [], {"version": INDEX_STATE_VERSION, "sources": {}}, IndexStats()

        source_paths = [
            file_path
            for file_path in sorted(knowledge_dir.rglob("*"))
            if file_path.is_file() and file_path.suffix.lower() in {".md", ".txt"}
        ]

        indexed_source_count = 0

        for file_path in source_paths:
            relative_source = str(file_path.relative_to(knowledge_dir)).replace("\\", "/")
            content = file_path.read_text(encoding="utf-8")
            if not content.strip():
                continue

            indexed_source_count += 1
            source_hash = self._hash_text(content)
            cached = previous_sources.get(relative_source) if isinstance(previous_sources, dict) else None
            chunks = self._chunks_from_state(relative_source, source_hash, cached)
            if chunks is None:
                chunks = self._chunk_file(file_path, relative_source, content, source_hash)

            state_sources[relative_source] = {
                "source_hash": source_hash,
                "chunks": [self._chunk_to_state(chunk) for chunk in chunks],
            }
            candidates.extend(chunks)

        deduplicated = self._deduplicate_chunks(candidates)
        stats = IndexStats(
            source_count=indexed_source_count,
            total_chunks=len(candidates),
            deduplicated_chunks=max(0, len(candidates) - len(deduplicated)),
        )
        return deduplicated, {
            "version": INDEX_STATE_VERSION,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "sources": state_sources,
        }, stats

    def _chunk_file(
        self,
        file_path: Path,
        relative_source: str,
        content: str,
        source_hash: str,
    ) -> list[RawKnowledgeChunk]:
        sections = re.split(r"\n(?=#)", content)
        chunks: list[RawKnowledgeChunk] = []

        for section in sections:
            normalized = section.strip()
            if not normalized:
                continue

            lines = normalized.splitlines()
            title = lines[0].lstrip("# ").strip() or file_path.stem
            body = "\n".join(lines[1:]).strip() or normalized
            paragraphs = [part.strip() for part in re.split(r"\n\s*\n", body) if part.strip()]

            for paragraph in paragraphs:
                snippet = paragraph.replace("\n", " ")
                chunk_content = f"{title}\n{paragraph}"
                chunk_hash = self._hash_text(self._normalize_chunk_text(chunk_content))
                chunks.append(
                    RawKnowledgeChunk(
                        id=str(uuid5(NAMESPACE_URL, f"chunk::{chunk_hash}")),
                        title=title,
                        source=relative_source,
                        snippet=snippet[:180],
                        content=chunk_content,
                        search_text=self._to_search_text(chunk_content),
                        chunk_hash=chunk_hash,
                        source_hash=source_hash,
                    )
                )

        return chunks

    def _deduplicate_chunks(self, chunks: list[RawKnowledgeChunk]) -> list[RawKnowledgeChunk]:
        deduplicated: dict[str, RawKnowledgeChunk] = {}

        for chunk in sorted(chunks, key=lambda item: (item.id, item.source, item.title)):
            existing = deduplicated.get(chunk.id)
            if existing is None or (chunk.source, chunk.title) < (existing.source, existing.title):
                deduplicated[chunk.id] = chunk

        return list(deduplicated.values())

    def _chunks_from_state(
        self, source: str, source_hash: str, cached: object
    ) -> list[RawKnowledgeChunk] | None:
        if not isinstance(cached, dict):
            return None
        if cached.get("source_hash") != source_hash:
            return None

        items = cached.get("chunks")
        if not isinstance(items, list):
            return None

        chunks: list[RawKnowledgeChunk] = []
        for item in items:
            if not isinstance(item, dict):
                return None

            try:
                chunks.append(
                    RawKnowledgeChunk(
                        id=str(item["id"]),
                        title=str(item["title"]),
                        source=source,
                        snippet=str(item["snippet"]),
                        content=str(item["content"]),
                        search_text=str(item["search_text"]),
                        chunk_hash=str(item["chunk_hash"]),
                        source_hash=source_hash,
                    )
                )
            except KeyError:
                return None

        return chunks

    def _chunk_to_state(self, chunk: RawKnowledgeChunk) -> dict[str, str]:
        return {
            "id": chunk.id,
            "title": chunk.title,
            "snippet": chunk.snippet,
            "content": chunk.content,
            "search_text": chunk.search_text,
            "chunk_hash": chunk.chunk_hash,
        }

    def _load_index_state(self) -> dict[str, object]:
        state_path = self.settings.knowledge_index_state_path
        if not state_path.exists():
            return {"version": INDEX_STATE_VERSION, "sources": {}}

        try:
            payload = json.loads(state_path.read_text(encoding="utf-8"))
        except Exception:
            return {"version": INDEX_STATE_VERSION, "sources": {}}

        if not isinstance(payload, dict):
            return {"version": INDEX_STATE_VERSION, "sources": {}}
        if payload.get("version") != INDEX_STATE_VERSION:
            return {"version": INDEX_STATE_VERSION, "sources": {}}

        sources = payload.get("sources")
        if not isinstance(sources, dict):
            return {"version": INDEX_STATE_VERSION, "sources": {}}

        return payload

    def _save_index_state(self, state: dict[str, object] | None) -> None:
        if state is None:
            return

        state_path = self.settings.knowledge_index_state_path
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    def _bootstrap_database(self) -> None:
        with connect(self.settings.postgres_dsn, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(BOOTSTRAP_SQL)

    def _load_database_chunks(self) -> dict[str, DatabaseChunk]:
        with connect(self.settings.postgres_dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                      id::text,
                      source_path,
                      title,
                      snippet,
                      search_text,
                      content,
                      embedding::text,
                      metadata
                    FROM knowledge_chunks
                    WHERE session_id IS NULL
                    """
                )
                rows = cur.fetchall()

        chunks: dict[str, DatabaseChunk] = {}
        for row in rows:
            metadata = row[7] if isinstance(row[7], dict) else {}
            chunks[str(row[0])] = DatabaseChunk(
                id=str(row[0]),
                source=str(row[1]),
                title=str(row[2]),
                snippet=str(row[3]),
                search_text=str(row[4]),
                content=str(row[5]),
                embedding=self._parse_vector_literal(str(row[6])),
                metadata=metadata,
            )

        return chunks

    def _materialize_chunks(
        self,
        raw_chunks: list[RawKnowledgeChunk],
        existing_chunks: dict[str, DatabaseChunk],
    ) -> list[KnowledgeChunk]:
        new_chunks = [
            chunk
            for chunk in raw_chunks
            if chunk.id not in existing_chunks or not existing_chunks[chunk.id].embedding
        ]
        new_embeddings = self.embedding_service.embed_many([chunk.content for chunk in new_chunks])
        embedding_by_id = {
            chunk.id: embedding for chunk, embedding in zip(new_chunks, new_embeddings)
        }

        return [
            KnowledgeChunk(
                id=chunk.id,
                title=chunk.title,
                source=chunk.source,
                snippet=chunk.snippet,
                content=chunk.content,
                search_text=chunk.search_text,
                embedding=(
                    existing_chunks[chunk.id].embedding
                    if chunk.id in existing_chunks and existing_chunks[chunk.id].embedding
                    else embedding_by_id[chunk.id]
                ),
                chunk_hash=chunk.chunk_hash,
                source_hash=chunk.source_hash,
            )
            for chunk in raw_chunks
        ]
    def _sync_chunks_to_database(
        self,
        chunks: list[KnowledgeChunk],
        existing_chunks: dict[str, DatabaseChunk],
    ) -> int:
        current_ids = {chunk.id for chunk in chunks}
        removed_ids = sorted(existing_id for existing_id in existing_chunks if existing_id not in current_ids)
        upsert_rows = []

        for chunk in chunks:
            existing = existing_chunks.get(chunk.id)
            if existing is not None and self._database_chunk_matches(existing, chunk):
                continue

            upsert_rows.append(
                (
                    chunk.id,
                    chunk.source,
                    chunk.title,
                    chunk.snippet,
                    chunk.search_text,
                    chunk.content,
                    self._vector_literal(chunk.embedding),
                    Json(
                        {
                            "source": chunk.source,
                            "source_hash": chunk.source_hash,
                            "chunk_hash": chunk.chunk_hash,
                        }
                    ),
                )
            )

        with connect(self.settings.postgres_dsn, autocommit=True) as conn:
            with conn.cursor() as cur:
                if removed_ids:
                    cur.executemany(
                        "DELETE FROM knowledge_chunks WHERE session_id IS NULL AND id = %s::uuid",
                        [(chunk_id,) for chunk_id in removed_ids],
                    )

                if upsert_rows:
                    cur.executemany(
                        """
                        INSERT INTO knowledge_chunks (
                          id,
                          session_id,
                          source_path,
                          title,
                          snippet,
                          search_text,
                          content,
                          embedding,
                          metadata
                        )
                        VALUES (%s, NULL, %s, %s, %s, %s, %s, %s::vector, %s)
                        ON CONFLICT (id) DO UPDATE SET
                          source_path = EXCLUDED.source_path,
                          title = EXCLUDED.title,
                          snippet = EXCLUDED.snippet,
                          search_text = EXCLUDED.search_text,
                          content = EXCLUDED.content,
                          embedding = EXCLUDED.embedding,
                          metadata = EXCLUDED.metadata
                        """,
                        upsert_rows,
                    )

        return len(removed_ids)

    def _database_chunk_matches(self, existing: DatabaseChunk, current: KnowledgeChunk) -> bool:
        return (
            existing.source == current.source
            and existing.title == current.title
            and existing.snippet == current.snippet
            and existing.search_text == current.search_text
            and existing.content == current.content
        )

    def _count_database_chunks(self) -> int:
        with connect(self.settings.postgres_dsn) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM knowledge_chunks WHERE session_id IS NULL")
                row = cur.fetchone()
        return int(row[0]) if row else 0

    def _retrieve_from_database(self, query: str) -> list[RetrievalSource]:
        params = {
            "query_search": self._query_search_terms(query),
            "embedding": self._vector_literal(self._embed(query)),
            "candidate_k": max(self.settings.retrieval_candidate_k, self.settings.default_top_k),
        }

        with connect(self.settings.postgres_dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(HYBRID_SEARCH_SQL, params)
                rows = cur.fetchall()

        results = [
            RetrievalSource(
                id=str(row[0]),
                title=row[2],
                source=row[1],
                snippet=row[3],
                score=float(row[7]),
                lexical_score=float(row[5]),
                vector_score=float(row[6]),
                strategy="db+hybrid",
            )
            for row in rows
        ]
        return [item for item in results if self._passes_threshold(item)]

    def _retrieve_from_memory(self, query: str) -> list[RetrievalSource]:
        query_tokens = self._tokenize(query)
        query_embedding = self._embed(query)
        results: list[RetrievalSource] = []

        for chunk in self._chunks:
            lexical_score = self._lexical_score(query_tokens, self._tokenize(chunk.content))
            vector_score = self._cosine(query_embedding, chunk.embedding)
            candidate = RetrievalSource(
                id=chunk.id,
                title=chunk.title,
                source=chunk.source,
                snippet=chunk.snippet,
                score=self._hybrid_score(lexical_score, vector_score),
                lexical_score=lexical_score,
                vector_score=vector_score,
                strategy="memory-fallback",
            )
            if self._passes_threshold(candidate):
                results.append(candidate)

        results.sort(key=lambda item: item.score, reverse=True)
        return results[: self.settings.retrieval_candidate_k]

    def _score_memory_facts(
        self, session_id: str, query: str, facts: list[MemoryFact]
    ) -> list[RetrievalSource]:
        query_tokens = self._tokenize(query)
        query_embedding = self._embed(query)
        results: list[RetrievalSource] = []

        for fact in facts:
            lexical_score = self._lexical_score(query_tokens, self._tokenize(fact.content))
            vector_score = self._cosine(query_embedding, self._embed(fact.content))
            candidate = RetrievalSource(
                id=fact.id,
                title="Long-term Memory",
                source=f"session:{session_id}",
                snippet=fact.content,
                score=self._hybrid_score(lexical_score, vector_score),
                lexical_score=lexical_score,
                vector_score=vector_score,
                strategy="memory+hybrid",
            )
            if self._passes_threshold(candidate):
                results.append(candidate)

        results.sort(key=lambda item: item.score, reverse=True)
        return results[: self.settings.retrieval_candidate_k]
    def _passes_threshold(self, source: RetrievalSource) -> bool:
        return (
            source.lexical_score >= self.settings.retrieval_min_lexical_score
            or source.score >= self.settings.retrieval_min_fused_score
            or source.vector_score >= self.settings.retrieval_min_vector_score
        )

    def _query_search_terms(self, query: str) -> str:
        terms = sorted(self._tokenize(query))
        return " ".join(terms) if terms else query.strip() or "synapse"

    def _to_search_text(self, text: str) -> str:
        return " ".join(sorted(self._tokenize(text)))

    def _lexical_score(self, query_tokens: set[str], chunk_tokens: set[str]) -> float:
        if not query_tokens or not chunk_tokens:
            return 0.0

        overlap = sum(1 for token in query_tokens if token in chunk_tokens)
        return overlap / math.sqrt(len(query_tokens) * len(chunk_tokens))

    def _hybrid_score(self, lexical_score: float, vector_score: float) -> float:
        return (lexical_score * 0.45) + (max(vector_score, 0.0) * 0.55)

    def _tokenize(self, text: str) -> set[str]:
        normalized = text.lower()
        words = set(re.findall(r"[a-z0-9_]+", normalized))
        chinese_parts = re.findall(r"[\u4e00-\u9fff]+", normalized)

        for part in chinese_parts:
            words.add(part)
            if len(part) == 1:
                continue
            for index in range(len(part) - 1):
                words.add(part[index : index + 2])

        return words

    def _embed(self, text: str) -> list[float]:
        return self.embedding_service.embed(text)

    def _hash_text(self, text: str) -> str:
        return sha256(text.encode("utf-8")).hexdigest()

    def _normalize_chunk_text(self, text: str) -> str:
        return " ".join(text.lower().split())

    def _vector_literal(self, values: list[float]) -> str:
        return "[" + ",".join(f"{value:.8f}" for value in values) + "]"

    def _parse_vector_literal(self, value: str) -> list[float]:
        normalized = value.strip()
        if not normalized or normalized == "[]":
            return []
        if normalized.startswith("[") and normalized.endswith("]"):
            normalized = normalized[1:-1]
        if not normalized:
            return []
        return [float(item) for item in normalized.split(",")]

    def _cosine(self, left: list[float], right: list[float]) -> float:
        return sum(l * r for l, r in zip(left, right))
