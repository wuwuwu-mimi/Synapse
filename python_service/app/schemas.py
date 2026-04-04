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


class KnowledgeImportRequest(BaseModel):
    imported_paths: list[str] = Field(default_factory=list)


class KnowledgeStatusResponse(BaseModel):
    knowledge_dir: str
    documents: int
    database_connected: bool
    database_error: str | None = None
    last_indexed_at: str | None = None
    embedding_provider: str = "hash"
    embedding_model: str | None = None
    llm_enabled: bool = False
    active_model: str | None = None


class KnowledgeImportResponse(KnowledgeStatusResponse):
    imported_paths: list[str] = Field(default_factory=list)
    imported_count: int = 0


class ChatRequest(BaseModel):
    session_id: str
    query: str
    history: list[ChatMessage] = Field(default_factory=list)


class ChatFinalEvent(BaseModel):
    summary: str
    rewritten_query: str
    facts: list[MemoryFact] = Field(default_factory=list)
    sources: list[RetrievalSource] = Field(default_factory=list)
    generation_mode: str = "fallback"
    model: str | None = None
