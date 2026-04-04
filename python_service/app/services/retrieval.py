from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from psycopg import connect
from psycopg.types.json import Json

from app.config import Settings
from app.schemas import MemoryFact, RetrievalSource
from app.services.embedding_service import EmbeddingService
from app.services.postgres_sql import BOOTSTRAP_SQL, HYBRID_SEARCH_SQL


@dataclass
class KnowledgeChunk:
    id: str
    title: str
    source: str
    snippet: str
    content: str
    search_text: str
    embedding: list[float]


class RetrievalService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.embedding_service = EmbeddingService(settings)
        self._chunks: list[KnowledgeChunk] = []
        self._document_count = 0
        self._database_connected = False
        self._database_error: str | None = None
        self._last_indexed_at: str | None = None

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

    def refresh_documents(self) -> None:
        try:
            chunks = self._load_local_chunks()
            self._bootstrap_database()
            self._sync_chunks_to_database(chunks)
            self._chunks = chunks
            self._document_count = len(chunks)
            self._document_count = self._count_database_chunks()
            self._database_connected = True
            self._database_error = None
        except Exception as exc:
            self._database_connected = False
            self._database_error = str(exc)
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

    def _load_local_chunks(self) -> list[KnowledgeChunk]:
        chunks: list[KnowledgeChunk] = []
        knowledge_dir = self.settings.knowledge_path
        if not knowledge_dir.exists():
            return chunks

        for file_path in sorted(knowledge_dir.rglob("*")):
            if file_path.suffix.lower() not in {".md", ".txt"} or not file_path.is_file():
                continue
            chunks.extend(self._chunk_file(file_path))

        return chunks

    def _chunk_file(self, file_path: Path) -> list[KnowledgeChunk]:
        content = file_path.read_text(encoding="utf-8")
        sections = re.split(r"\n(?=#)", content)
        chunks: list[KnowledgeChunk] = []
        relative_source = str(file_path.relative_to(self.settings.knowledge_path)).replace("\\", "/")

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
                chunk_id = str(uuid5(NAMESPACE_URL, f"{relative_source}::{title}::{paragraph}"))
                chunks.append(
                    KnowledgeChunk(
                        id=chunk_id,
                        title=title,
                        source=relative_source,
                        snippet=snippet[:180],
                        content=chunk_content,
                        search_text=self._to_search_text(chunk_content),
                        embedding=[],
                    )
                )

        if chunks:
            embeddings = self.embedding_service.embed_many([chunk.content for chunk in chunks])
            for chunk, embedding in zip(chunks, embeddings):
                chunk.embedding = embedding

        return chunks

    def _bootstrap_database(self) -> None:
        with connect(self.settings.postgres_dsn, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(BOOTSTRAP_SQL)

    def _sync_chunks_to_database(self, chunks: list[KnowledgeChunk]) -> None:
        with connect(self.settings.postgres_dsn, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM knowledge_chunks WHERE session_id IS NULL")
                if not chunks:
                    return

                rows = [
                    (
                        chunk.id,
                        chunk.source,
                        chunk.title,
                        chunk.snippet,
                        chunk.search_text,
                        chunk.content,
                        self._vector_literal(chunk.embedding),
                        Json({"source": chunk.source}),
                    )
                    for chunk in chunks
                ]
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
                    rows,
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

    def _vector_literal(self, values: list[float]) -> str:
        return "[" + ",".join(f"{value:.8f}" for value in values) + "]"

    def _cosine(self, left: list[float], right: list[float]) -> float:
        return sum(l * r for l, r in zip(left, right))
