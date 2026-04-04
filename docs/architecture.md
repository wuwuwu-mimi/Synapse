# 架构与数据流

本文档描述 `Synapse` 当前版本的实际架构、模块职责和关键调用链，方便后续继续演进。

## 1. 总体架构

`Synapse` 由三层组成：

- Electron 桌面层
- React 渲染层
- FastAPI 后端服务层

其中：

- Electron 负责窗口生命周期、桌面文件访问、IPC、后端进程管理
- React 负责聊天 UI、知识库面板、上下文检查器与会话状态
- FastAPI 负责摘要、长期事实、RAG 检索、知识索引与可选 LLM 生成

## 2. 进程职责

### Electron 主进程

主目录：`src/main/`

主要职责：

- 创建桌面窗口
- 管理应用生命周期
- 自动拉起 Python FastAPI 后端
- 管理本地会话存储文件 `sessions.json`
- 提供知识导入 IPC
- 在 Windows 上优先用 `pythonw.exe` 启动后端，避免控制台窗口常驻

当前关键模块：

- `src/main/index.ts`
  - 窗口创建
  - IPC 注册
  - 启动 Python 服务
- `src/main/python.ts`
  - 检测后端健康状态
  - 自动启动 / 释放 FastAPI 进程
- `src/main/knowledge.ts`
  - 选择知识文件 / 文件夹
  - 将导入文件复制到 `knowledge/imports/`

### Preload

主目录：`src/preload/`

主要职责：

- 通过 `contextBridge` 暴露白名单 API
- 隔离 `ipcRenderer` 细节
- 给渲染层提供安全的 Electron 能力

当前暴露能力包括：

- 会话读取 / 创建 / 更新
- 运行时配置读取
- 知识文件选择
- 知识文件夹选择
- 知识导入

### React 渲染层

主目录：`src/renderer/`

主要职责：

- 展示聊天界面
- 管理当前会话与消息状态
- 发起流式聊天请求
- 展示知识库状态
- 展示上下文检查器
- 切换中英文界面

当前关键模块：

- `src/renderer/src/App.tsx`
  - 主界面布局
  - 聊天面板
  - 知识库面板
  - inspector 面板
- `src/renderer/src/store/chatStore.ts`
  - 会话状态管理
  - 流式聊天
  - 知识导入 / 重建索引动作
- `src/renderer/src/lib/sse.ts`
  - SSE 流读取与事件解析
- `src/renderer/src/lib/knowledge.ts`
  - 知识库 API 调用封装
- `src/renderer/src/lib/i18n.ts`
  - 中英文文案与语言切换

### FastAPI 后端

主目录：`python_service/app/`

主要职责：

- 提供健康检查接口
- 提供知识库状态接口
- 执行知识切分与重建索引
- 执行查询改写与混合检索
- 维护短期摘要与长期事实
- 生成聊天回答
- 通过 SSE 返回流式事件

当前关键模块：

- `python_service/app/main.py`
  - FastAPI 入口
  - API 注册
  - SSE 输出
- `python_service/app/services/chat_engine.py`
  - 串联摘要、记忆、检索、回答生成
- `python_service/app/services/retrieval.py`
  - 文档切分
  - embedding 生成
  - pgvector 同步
  - hybrid retrieval
- `python_service/app/services/embedding_service.py`
  - `hash` / `ollama` embedding provider
- `python_service/app/services/llm_service.py`
  - OpenAI 兼容 `/chat/completions` 调用
- `python_service/app/services/memory_store.py`
  - 当前短期 / 长期记忆实现

## 3. 当前数据流

### 聊天主流程

```text
Renderer
  -> POST /api/chat/stream
  -> ChatEngine
  -> MemoryStore.build_context()
  -> RetrievalService.retrieve()
  -> optional LLMService.answer()
  -> SSE delta / done
  -> Renderer 更新消息与 inspector
```

详细步骤：

1. 用户在输入框按 Enter 发送消息
2. 前端将 `session_id`、`query`、`history` 发送给 `/api/chat/stream`
3. `MemoryStore` 生成短期摘要并提取长期事实
4. `RetrievalService` 改写查询并执行检索
5. 若配置了真实 LLM，则交给 `LLMService` 生成回答
6. 若未配置真实 LLM，则走 fallback 逻辑
7. 后端以 SSE `delta` / `done` 事件返回结果
8. 前端把 summary / facts / sources / generation_mode 写入当前会话的 inspector

### 知识导入流程

```text
Renderer
  -> Electron IPC
  -> main/knowledge.ts
  -> copy files to knowledge/imports/
  -> POST /api/knowledge/import
  -> RetrievalService.refresh_documents()
  -> pgvector reindex
  -> Renderer refreshes status
```

详细步骤：

1. 用户点击 `Import Files` 或 `Import Folder`
2. Electron 主进程打开系统选择器
3. 选中的 `.md` / `.txt` 文件被复制到 `knowledge/imports/`
4. 前端调用 `/api/knowledge/import`
5. 后端执行 `refresh_documents()`
6. 文档被重新切分、向量化并写入 pgvector
7. UI 刷新 chunk 数量、索引时间和数据库状态

## 4. IPC 设计

当前 IPC 只处理“桌面端职责”，不承载 RAG 业务逻辑。

已实现的 IPC：

- `app:list-sessions`
- `app:create-session`
- `app:upsert-session`
- `app:get-runtime-config`
- `knowledge:pick-files`
- `knowledge:pick-folder`
- `knowledge:import`

这样的边界划分有两个好处：

- Electron 主进程保持轻量，不变成业务大单体
- RAG 逻辑集中在 FastAPI，后续更容易演进成独立服务

## 5. 存储设计

### 会话存储

当前状态：

- Electron 主进程使用本地 `sessions.json` 持久化会话
- 会话包含消息历史和 inspector 展示内容

优点：

- 实现简单
- 桌面端原型阶段足够稳定

后续可演进：

- 换成 SQLite 或更结构化的本地存储

### 记忆存储

当前状态：

- 短期摘要与长期事实仍保存在进程内存中
- Redis 目前尚未真正接入

后续目标：

- 接入真实 Redis
- 支持跨进程 / 跨重启恢复摘要与事实

### 知识存储

当前状态：

- 原始知识文件存放在 `knowledge/` 与 `knowledge/imports/`
- 切分结果写入 PostgreSQL `knowledge_chunks`
- 向量列使用 pgvector

附带表：

- `knowledge_chunks`
- `memory_facts`（结构已预留，后续可进一步接入真实长期记忆持久化）

## 6. 检索设计

当前检索策略属于 hybrid retrieval：

- lexical score
- vector score
- fused score

大致流程：

1. 先进行查询改写
2. 同时准备词法检索条件与向量检索向量
3. 在 pgvector 中执行 hybrid SQL
4. 生成 lexical / vector / fused 分数
5. 结合阈值过滤结果

当前阈值配置：

- `RETRIEVAL_MIN_LEXICAL_SCORE`
- `RETRIEVAL_MIN_VECTOR_SCORE`
- `RETRIEVAL_MIN_FUSED_SCORE`

保留条件：

- 任意一种分数达到阈值即可保留该 chunk

## 7. Embedding 设计

当前支持两种 provider：

### `hash`

特点：

- 不依赖外部服务
- 用于离线 fallback
- 质量一般，但足够用于最小原型

### `ollama`

特点：

- 使用本地 Ollama `/api/embed`
- 更接近真实语义 embedding
- 当前已验证模型包括：
  - `mxbai-embed-large:latest`
  - `bge-m3:latest`

当前实现注意点：

- pgvector 维度当前固定为 `64`
- 若 Ollama 返回更高维向量，会先做压缩 / 投影再入库

## 8. LLM 生成设计

当前 LLM 设计为“可选启用”：

- 若 `LLM_ENABLED=true` 且配置完整，则调用真实 OpenAI 兼容模型
- 若配置不完整，则自动走 fallback 回答

当前调用方式：

```text
{LLM_BASE_URL}/chat/completions
```

当前限制：

- 上游调用仍是非流式
- 桌面端看到的 SSE 是后端把完整答案切块后二次返回

## 9. 当前主要 API

### 健康检查

- `GET /health`

返回当前：

- 数据库状态
- 知识目录
- 文档数量
- embedding provider / model
- LLM 是否启用
- 当前 active model

### 知识库

- `GET /api/knowledge/status`
- `POST /api/knowledge/reindex`
- `POST /api/knowledge/import`

### 检索

- `POST /api/retrieve`

### 聊天

- `POST /api/chat/stream`

## 10. 当前已知架构限制

- 会话与记忆仍未统一持久化
- LLM 上游不是原生流式透传
- 桌面端知识库管理仍偏 MVP
- 当前 embedding 维度方案是兼容性折中，不是最终设计

## 11. 下一步架构演进建议

### 高优先级

- 接入真实 Redis 做短期 / 长期记忆持久化
- 把真实 LLM 回答生成完整联调通
- 在桌面 UI 中展示 embedding provider / embedding model

### 中优先级

- 支持知识库去重、删除、导入历史
- 支持增量重建索引
- 增加检索观测能力与调试字段

### 低优先级

- 引入自动化回归测试
- 增加桌面端打包与发布流程
