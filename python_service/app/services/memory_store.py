import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from uuid import uuid4

from redis import Redis

from app.config import Settings
from app.schemas import ChatMessage, MemoryFact


class MemoryStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.redis: Redis | None = None
        self.summary_by_session: dict[str, str] = {}
        self.facts_by_session: dict[str, list[MemoryFact]] = defaultdict(list)
        self._connect_redis()

    def _connect_redis(self) -> None:
        try:
            client = Redis.from_url(self.settings.redis_url, decode_responses=True)
            client.ping()
            self.redis = client
        except Exception:
            self.redis = None

    def _summary_key(self, session_id: str) -> str:
        return f"myrag:session:{session_id}:summary"

    def _facts_key(self, session_id: str) -> str:
        return f"myrag:session:{session_id}:facts"

    def build_context(self, session_id: str, history: list[ChatMessage]) -> tuple[str, list[MemoryFact]]:
        if not history:
            return self.summary_by_session.get(session_id, ""), self._load_facts(session_id)

        recent_window = history[-self.settings.short_memory_window :]
        summary = self._summarize_window(recent_window)
        facts = self._merge_facts(session_id, self._extract_facts(history))

        self.set_summary(session_id, summary)
        if self.redis is not None:
            self.redis.set(
                self._facts_key(session_id),
                json.dumps([fact.model_dump() for fact in facts], ensure_ascii=False),
            )

        return summary, facts

    def set_summary(self, session_id: str, summary: str) -> None:
        self.summary_by_session[session_id] = summary
        if self.redis is not None:
            self.redis.set(self._summary_key(session_id), summary)

    def _load_facts(self, session_id: str) -> list[MemoryFact]:
        if self.facts_by_session.get(session_id):
            return self.facts_by_session[session_id]

        if self.redis is None:
            return []

        payload = self.redis.get(self._facts_key(session_id))
        if not payload:
            return []

        facts = [MemoryFact(**item) for item in json.loads(payload)]
        self.facts_by_session[session_id] = facts
        return facts

    def _merge_facts(self, session_id: str, new_facts: list[MemoryFact]) -> list[MemoryFact]:
        existing = {fact.content: fact for fact in self._load_facts(session_id)}
        for fact in new_facts:
            existing[fact.content] = fact

        merged = sorted(existing.values(), key=lambda item: item.created_at, reverse=True)[:8]
        self.facts_by_session[session_id] = merged
        return merged

    def _summarize_window(self, window: list[ChatMessage]) -> str:
        user_focus: list[str] = []
        assistant_commitments: list[str] = []

        for message in window:
            normalized = " ".join(message.content.split())
            if message.role == "user" and normalized:
                user_focus.append(normalized[:48])
            elif message.role == "assistant" and normalized:
                assistant_commitments.append(normalized[:48])

        if not user_focus and not assistant_commitments:
            return ""

        parts = []
        if user_focus:
            parts.append("User focus: " + "; ".join(user_focus[-3:]))
        if assistant_commitments:
            parts.append("Assistant commitments: " + "; ".join(assistant_commitments[-2:]))

        return " | ".join(parts)

    def _extract_facts(self, history: list[ChatMessage]) -> list[MemoryFact]:
        patterns: list[tuple[re.Pattern[str], float]] = [
            (re.compile(r"\u6211\u662f([^\uff0c\u3002\uff01\uff1f\n]+)"), 0.86),
            (re.compile(r"\u6211\u53eb([^\uff0c\u3002\uff01\uff1f\n]+)"), 0.88),
            (re.compile(r"\u6211\u559c\u6b22([^\uff0c\u3002\uff01\uff1f\n]+)"), 0.82),
            (re.compile(r"\u6211\u5728([^\uff0c\u3002\uff01\uff1f\n]+)"), 0.78),
            (re.compile(r"\u6211\u7684\u9879\u76ee\u662f([^\uff0c\u3002\uff01\uff1f\n]+)"), 0.84),
            (re.compile(r"\u8bf7\u8bb0\u4f4f([^\uff0c\u3002\uff01\uff1f\n]+)"), 0.92),
        ]

        facts: list[MemoryFact] = []
        for message in history:
            if message.role != "user":
                continue
            for pattern, confidence in patterns:
                for match in pattern.findall(message.content):
                    content = match.strip()
                    if len(content) < 2:
                        continue
                    facts.append(
                        MemoryFact(
                            id=str(uuid4()),
                            content=content,
                            confidence=confidence,
                            created_at=datetime.now(timezone.utc).isoformat(),
                            source="memory",
                        )
                    )

        return facts
