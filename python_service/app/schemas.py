from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str
    content: str


class MemoryFact(BaseModel):
    id: str
    content: str
    confidence: float
    created_at: str
    source: str = "memory"


class RetrievalSource(BaseModel):
    id: str
    title: str
    source: str
    snippet: str
    score: float
    lexical_score: float
    vector_score: float
    strategy: str


class RetrievalDebug(BaseModel):
    knowledge_strategy: str = "db+hybrid"
    knowledge_scope_prefix: str | None = None
    knowledge_candidates: int = 0
    knowledge_kept: int = 0
    knowledge_filtered_by_scope: int = 0
    knowledge_filtered_by_threshold: int = 0
    memory_candidates: int = 0
    memory_kept: int = 0
    memory_filtered_by_threshold: int = 0
    merged_candidates: int = 0
    final_sources: int = 0
    no_source_reason: str | None = None


class RetrieveRequest(BaseModel):
    session_id: str
    query: str
    top_k: int = 4


class RetrieveResponse(BaseModel):
    query: str
    rewritten_query: str
    summary: str
    facts: list[MemoryFact] = Field(default_factory=list)
    sources: list[RetrievalSource] = Field(default_factory=list)
    debug: RetrievalDebug = Field(default_factory=RetrievalDebug)


class KnowledgeImportRequest(BaseModel):
    imported_paths: list[str] = Field(default_factory=list)


class KnowledgeStatusResponse(BaseModel):
    knowledge_dir: str
    documents: int
    database_connected: bool
    database_error: str | None = None
    redis_connected: bool = False
    redis_error: str | None = None
    last_indexed_at: str | None = None
    embedding_provider: str = "hash"
    embedding_model: str | None = None
    llm_enabled: bool = False
    active_model: str | None = None
    indexed_sources: int = 0
    deduplicated_chunks: int = 0
    reused_chunks: int = 0
    new_chunks: int = 0
    removed_chunks: int = 0
    indexing_mode: str = "incremental"


class KnowledgeImportResponse(KnowledgeStatusResponse):
    imported_paths: list[str] = Field(default_factory=list)
    imported_count: int = 0


class ChatRequest(BaseModel):
    session_id: str
    query: str
    history: list[ChatMessage] = Field(default_factory=list)
    knowledge_only: bool = False
    knowledge_scope_prefix: str | None = None
    knowledge_scope_label: str | None = None


class ChatFinalEvent(BaseModel):
    summary: str
    rewritten_query: str
    facts: list[MemoryFact] = Field(default_factory=list)
    sources: list[RetrievalSource] = Field(default_factory=list)
    debug: RetrievalDebug = Field(default_factory=RetrievalDebug)
    generation_mode: str = "fallback"
    model: str | None = None
    knowledge_scope_label: str | None = None
