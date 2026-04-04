from __future__ import annotations

import json
import math
import re
from hashlib import sha256
from urllib import error, request

from app.config import Settings


class EmbeddingService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._cache: dict[str, list[float]] = {}

    @property
    def provider(self) -> str:
        provider = self.settings.embedding_provider.strip().lower()
        return provider or "hash"

    @property
    def active_model(self) -> str | None:
        if self.provider == "ollama" and self.settings.ollama_embedding_model.strip():
            return self.settings.ollama_embedding_model.strip()
        return None

    def embed(self, text: str) -> list[float]:
        return self.embed_many([text])[0]

    def embed_many(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        misses: list[str] = []
        for text in texts:
            if text not in self._cache:
                misses.append(text)

        if misses:
            if self.provider == "ollama":
                raw_vectors = self._embed_many_ollama(misses)
            else:
                raw_vectors = [self._embed_with_hash(text) for text in misses]

            if len(raw_vectors) != len(misses):
                raise RuntimeError("Embedding provider returned an unexpected number of vectors.")

            for text, vector in zip(misses, raw_vectors):
                self._cache[text] = self._project_and_normalize(vector)

        return [self._cache[text] for text in texts]

    def _embed_many_ollama(self, texts: list[str]) -> list[list[float]]:
        model = self.settings.ollama_embedding_model.strip()
        if not model:
            raise RuntimeError("OLLAMA_EMBEDDING_MODEL is required when EMBEDDING_PROVIDER=ollama.")

        payload = json.dumps({"model": model, "input": texts}).encode("utf-8")
        req = request.Request(
            url=self._ollama_endpoint(),
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with request.urlopen(req, timeout=self.settings.embedding_timeout_seconds) as response:
                body = json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(
                f"Ollama embedding request failed: {exc.code} {detail}".strip()
            ) from exc
        except error.URLError as exc:
            raise RuntimeError(f"Ollama embedding request failed: {exc.reason}") from exc

        embeddings = body.get("embeddings")
        if not isinstance(embeddings, list) or not embeddings:
            raise RuntimeError("Ollama embedding response did not include embeddings.")

        return [self._coerce_vector(item) for item in embeddings]

    def _ollama_endpoint(self) -> str:
        base_url = self.settings.ollama_base_url.rstrip("/")
        return f"{base_url}/api/embed"

    def _project_and_normalize(self, values: list[float]) -> list[float]:
        target_dims = self.settings.embedding_dimensions
        if target_dims <= 0:
            raise RuntimeError("EMBEDDING_DIMENSIONS must be greater than zero.")

        if len(values) == target_dims:
            projected = values[:]
        else:
            projected = [0.0] * target_dims
            counts = [0] * target_dims
            for index, value in enumerate(values):
                bucket = index % target_dims
                projected[bucket] += value
                counts[bucket] += 1

            for index, count in enumerate(counts):
                if count:
                    projected[index] /= count

        length = math.sqrt(sum(value * value for value in projected)) or 1.0
        return [value / length for value in projected]

    def _embed_with_hash(self, text: str) -> list[float]:
        dimensions = self.settings.embedding_dimensions
        vector = [0.0] * dimensions
        for token in self._tokenize(text):
            digest = sha256(token.encode("utf-8")).digest()
            for index in range(dimensions):
                byte = digest[index % len(digest)]
                vector[index] += (byte / 127.5) - 1.0

        length = math.sqrt(sum(value * value for value in vector)) or 1.0
        return [value / length for value in vector]

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

    def _coerce_vector(self, values: object) -> list[float]:
        if not isinstance(values, list):
            raise RuntimeError("Embedding vector is not a list.")
        return [float(value) for value in values]
