# Synapse

`Synapse` 是一个桌面端 RAG 原型项目，基于 Electron + React + FastAPI 构建，当前已经具备知识导入、真实 pgvector 检索、本地 Ollama embedding、Redis 记忆持久化、上下文检查器和双语界面等核心能力。

## 当前能力

- 桌面端：Electron 主进程、Preload 安全桥接、React 渲染层
- UI：中文 / 英文切换，三栏布局，会话列表、聊天区、上下文检查器
- 后端：FastAPI API、SSE 流式响应、摘要 / 事实 / 检索 / 回答链路
- 检索：真实 PostgreSQL + pgvector，支持 lexical / vector / fused 阈值过滤
- Embedding：支持 `hash` fallback 与本地 Ollama embedding
- 记忆：摘要与事实已接入 Redis 持久化
- 知识库：支持导入 `.md` / `.txt` 文件与文件夹，并重建索引
- 知识库：支持导入历史查看与已导入批次删除
- 调试：UI 可显示数据库、Redis、embedding、LLM 等运行状态

## 当前目录

```text
.
├─ docker-compose.yml
├─ docker/
├─ docs/
│  ├─ architecture.md
│  └─ progress.md
├─ knowledge/
├─ python_service/
├─ src/
├─ .env.example
└─ package.json
```

## 本地启动

### 1. 安装依赖

```bash
npm install
pip install -r python_service/requirements.txt
```

### 2. 启动基础设施

```bash
docker compose up -d
```

默认会启动：

- PostgreSQL + pgvector
- Redis

### 3. 准备环境变量

复制模板：

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

### 4. 启动应用

```bash
npm run dev
```

## 配置说明

### 基础运行

- `RAG_BACKEND_URL`：桌面端访问的后端地址
- `RAG_BACKEND_AUTOSTART`：是否由 Electron 自动启动后端
- `PYTHON_EXECUTABLE`：Python 可执行文件路径

### 基础设施

- `POSTGRES_DSN`：PostgreSQL / pgvector 连接串
- `REDIS_URL`：Redis 连接串
- `KNOWLEDGE_DIR`：知识目录

### Embedding

- `EMBEDDING_PROVIDER`：`hash` 或 `ollama`
- `EMBEDDING_DIMENSIONS`：当前写入 pgvector 的维度
- `OLLAMA_BASE_URL`：本地 Ollama 地址
- `OLLAMA_EMBEDDING_MODEL`：本地 embedding 模型名
- `EMBEDDING_TIMEOUT_SECONDS`：embedding 请求超时秒数

### 检索阈值

- `RETRIEVAL_CANDIDATE_K`
- `RETRIEVAL_MIN_LEXICAL_SCORE`
- `RETRIEVAL_MIN_VECTOR_SCORE`
- `RETRIEVAL_MIN_FUSED_SCORE`

### LLM

- `LLM_ENABLED`
- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`
- `LLM_SUMMARY_MODEL`
- `LLM_TEMPERATURE`

说明：后端会调用 `{LLM_BASE_URL}/chat/completions`，因此需要兼容 OpenAI Chat Completions 接口。

## 推荐本地开发配置

### 方案 A：真实检索 + 本地 embedding + fallback 回答

```env
RAG_BACKEND_AUTOSTART=true
PYTHON_EXECUTABLE=python

POSTGRES_DSN=postgresql://user:password@127.0.0.1:5432/database
REDIS_URL=redis://127.0.0.1:6379/0
KNOWLEDGE_DIR=../../knowledge

EMBEDDING_PROVIDER=ollama
EMBEDDING_DIMENSIONS=64
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_EMBEDDING_MODEL=bge-m3:latest
EMBEDDING_TIMEOUT_SECONDS=60

RETRIEVAL_CANDIDATE_K=12
RETRIEVAL_MIN_LEXICAL_SCORE=0.08
RETRIEVAL_MIN_VECTOR_SCORE=0.42
RETRIEVAL_MIN_FUSED_SCORE=0.24

LLM_ENABLED=false
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=
LLM_MODEL=
LLM_SUMMARY_MODEL=
LLM_TEMPERATURE=0.2
```

### 方案 B：真实检索 + 本地 embedding + 真实 LLM

```env
LLM_ENABLED=true
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=your_api_key
LLM_MODEL=your_chat_model
LLM_SUMMARY_MODEL=
LLM_TEMPERATURE=0.2
```

其余配置可沿用方案 A。

## 关键接口

- `GET /health`
- `GET /api/knowledge/status`
- `POST /api/knowledge/reindex`
- `POST /api/knowledge/import`
- `POST /api/retrieve`
- `POST /api/chat/stream`

## 当前验证过的内容

- `npm run typecheck`
- `npm run build`
- Python AST 检查
- pgvector 连接验证
- Redis 持久化验证
- Ollama embedding 验证
- Electron 开发模式启动验证
- SSE 流式聊天验证

## 公开仓库说明

本仓库不会提交以下本地内容：

- `.env`
- 本地日志文件
- 临时调试输出
- 用户私有项目说明或本地工作文档

## 已知限制

- 上游 LLM 当前仍是非原生流式透传
- 完整会话消息仍保存在本地文件，而不是统一存入 Redis
- 知识库管理仍缺少去重与增量重建能力
- 自动化测试与打包发布流程仍未完善

## 下一阶段建议

- 增加知识库去重与增量索引
- 支持真正的上游流式 LLM 返回
- 增加自动化回归测试
- 增加桌面端打包与发布流程

## 相关文档

- `docs/architecture.md`：当前实现架构说明
- `docs/progress.md`：阶段进度与里程碑记录
