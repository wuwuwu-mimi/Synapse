from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Synapse FastAPI"
    redis_url: str = "redis://127.0.0.1:6379/0"
    postgres_dsn: str = "postgresql://rag:rag@127.0.0.1:5432/rag"
    knowledge_dir: str = "../../knowledge"
    short_memory_window: int = 8
    default_top_k: int = 4
    retrieval_candidate_k: int = 12
    retrieval_min_lexical_score: float = 0.08
    retrieval_min_vector_score: float = 0.42
    retrieval_min_fused_score: float = 0.24
    embedding_provider: str = "hash"
    embedding_dimensions: int = 64
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_embedding_model: str = ""
    embedding_timeout_seconds: int = 60
    llm_enabled: bool = False
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = ""
    llm_summary_model: str = ""
    llm_temperature: float = 0.2
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "http://127.0.0.1:5174",
            "http://localhost:5174",
        ]
    )

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def knowledge_path(self) -> Path:
        return (Path(__file__).resolve().parent / self.knowledge_dir).resolve()

    @property
    def summary_model(self) -> str:
        return self.llm_summary_model or self.llm_model


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
