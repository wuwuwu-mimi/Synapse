from __future__ import annotations

import json
from urllib import error, request

from app.config import Settings
from app.schemas import ChatMessage


class LLMService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @property
    def enabled(self) -> bool:
        return (
            self.settings.llm_enabled
            and bool(self.settings.llm_base_url.strip())
            and bool(self.settings.llm_api_key.strip())
            and bool(self.settings.llm_model.strip())
        )

    @property
    def active_model(self) -> str | None:
        return self.settings.llm_model or None

    def summarize(
        self,
        history: list[ChatMessage],
        fallback_summary: str,
    ) -> str | None:
        if not self.enabled or not history:
            return None

        transcript = "\n".join(
            f"{message.role.upper()}: {message.content.strip()}" for message in history[-10:]
        ).strip()
        if not transcript:
            return None

        prompt_messages = [
            {
                "role": "system",
                "content": (
                    "Summarize the conversation in at most 2 short lines. "
                    "Use the same language as the user's latest message. "
                    "Keep names, preferences, and current task details."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Existing summary:\n{fallback_summary or '(none)'}\n\n"
                    f"Recent transcript:\n{transcript}"
                ),
            },
        ]
        return self._complete(prompt_messages, model=self.settings.summary_model, temperature=0.1)

    def answer(
        self,
        query: str,
        summary: str,
        facts: list[str],
        sources: list[dict[str, str]],
    ) -> str:
        prompt_messages = [
            {
                "role": "system",
                "content": (
                    "You are Synapse, a desktop RAG assistant. "
                    "Answer in the same language as the user's latest query. "
                    "Use retrieved evidence when it is relevant, be explicit about uncertainty, "
                    "and keep responses structured and practical."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"User query:\n{query}\n\n"
                    f"Short-term summary:\n{summary or '(none)'}\n\n"
                    f"Long-term memory:\n{self._format_list(facts)}\n\n"
                    f"Retrieved sources:\n{self._format_sources(sources)}\n\n"
                    "Please answer the user. When sources are available, reference them naturally."
                ),
            },
        ]
        return self._complete(prompt_messages, model=self.settings.llm_model, temperature=self.settings.llm_temperature)

    def _complete(
        self,
        messages: list[dict[str, str]],
        model: str,
        temperature: float,
    ) -> str:
        payload = json.dumps(
            {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "stream": False,
            }
        ).encode("utf-8")

        req = request.Request(
            url=self._endpoint(),
            data=payload,
            headers=self._headers(),
            method="POST",
        )

        try:
            with request.urlopen(req, timeout=60) as response:
                body = json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"LLM request failed: {exc.code} {detail}".strip()) from exc
        except error.URLError as exc:
            raise RuntimeError(f"LLM request failed: {exc.reason}") from exc

        choices = body.get("choices") or []
        if not choices:
            raise RuntimeError("LLM response did not include any choices.")

        content = choices[0].get("message", {}).get("content", "")
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("LLM response did not include message content.")

        return content.strip()

    def _endpoint(self) -> str:
        base_url = self.settings.llm_base_url.rstrip("/")
        return f"{base_url}/chat/completions"

    def _headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.settings.llm_api_key}",
        }

    def _format_list(self, items: list[str]) -> str:
        if not items:
            return "(none)"
        return "\n".join(f"- {item}" for item in items)

    def _format_sources(self, sources: list[dict[str, str]]) -> str:
        if not sources:
            return "(none)"
        return "\n".join(
            f"- {source['title']} ({source['source']}): {source['snippet']}" for source in sources
        )
