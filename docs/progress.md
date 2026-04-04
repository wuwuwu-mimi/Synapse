# Synapse 开发进度记录

本文档用于记录 `Synapse` 当前已经完成的功能、关键修复、已验证内容、当前已知限制，以及下一阶段待办，方便后续每轮开发继续追加。

## 文档用途

- 作为阶段性开发日志
- 作为 README 的补充进度记录
- 作为后续迭代的 backlog 入口
- 作为排查“这个功能到底有没有做完”的参考

## 项目目标摘要

`Synapse` 目标是做一个桌面端 RAG 助手原型，具备以下核心能力：

- Electron 桌面壳
- React 聊天界面
- FastAPI 后端
- 短期记忆 / 长期记忆 / RAG 检索链路
- 本地知识导入与重建索引
- 真正接入 pgvector
- 支持本地 embedding 与可选真实 LLM
- 在 UI 中展示上下文、记忆和检索细节，便于调试

## 里程碑记录

### Milestone 1：项目骨架与桌面端 MVP

已完成：

- 初始化 Electron + React + TypeScript 项目结构
- 初始化 FastAPI 后端服务
- 实现桌面端三栏式布局
- 支持本地会话创建、切换、保存
- 支持基础聊天流式渲染
- 支持右侧 inspector 查看摘要、记忆、检索来源

阶段意义：

- 完成了“桌面端 RAG 原型”的最小可运行结构
- 前后端职责边界基本明确

### Milestone 2：双语界面与品牌统一

已完成：

- 应用名称改为 `Synapse`
- UI 支持中文 / 英文切换
- 修复了部分中文界面文本与乱码问题

阶段意义：

- 项目从单纯技术原型进入可持续演示与迭代状态

### Milestone 3：真实 pgvector 检索接入

已完成：

- 检索链路从原本的本地内存假向量，切换为真实 PostgreSQL + pgvector
- 知识切分结果可写入 `knowledge_chunks`
- 检索可从数据库中执行 hybrid search
- 增加了检索阈值：
  - `RETRIEVAL_MIN_LEXICAL_SCORE`
  - `RETRIEVAL_MIN_VECTOR_SCORE`
  - `RETRIEVAL_MIN_FUSED_SCORE`

阶段意义：

- RAG 的“检索”部分开始具备真实工程价值
- 不再是纯 mock 流程

### Milestone 4：知识导入与重建索引

已完成：

- Electron 主进程支持选择知识文件
- Electron 主进程支持选择知识文件夹
- 支持导入 `.md` / `.txt`
- 支持把导入内容复制到 `knowledge/imports/`
- 后端支持：
  - `GET /api/knowledge/status`
  - `POST /api/knowledge/reindex`
  - `POST /api/knowledge/import`
- 前端左侧知识库面板可显示：
  - 数据库连接状态
  - chunk 数量
  - 上次索引时间
  - 当前模型 / fallback 状态

阶段意义：

- 知识库不再依赖手动拷贝文件
- 已具备桌面端可操作的知识导入闭环

### Milestone 5：OpenAI 兼容 LLM 接口接入

已完成：

- 后端新增 OpenAI 兼容 `chat/completions` 调用能力
- 支持：
  - 回答生成
  - 摘要生成
- 当 `LLM_ENABLED=true` 且配置完整时，可切到真实模型生成
- 未启用 LLM 时自动走 fallback 路径
- chat final event 已暴露：
  - `generation_mode`
  - `model`

当前状态：

- 代码层已支持真实 LLM
- 是否实际启用取决于 `.env` 中 `LLM_*` 配置

阶段意义：

- 从“只有检索”走向“检索 + 生成”的完整 RAG 原型

### Milestone 6：本地 Ollama embedding 接入

已完成：

- 增加 `EmbeddingService`
- 支持两种 embedding provider：
  - `hash`
  - `ollama`
- 支持本地 Ollama `/api/embed`
- 当前已验证可用的模型：
  - `mxbai-embed-large:latest`
  - `bge-m3:latest`
- 当前本地默认已切换并验证过：
  - `EMBEDDING_PROVIDER=ollama`
  - `OLLAMA_EMBEDDING_MODEL=bge-m3:latest`

说明：

- 当前 pgvector 列维度仍为 `64`
- Ollama 返回的更高维 embedding 会先压缩 / 投影到 `64` 维再写库

阶段意义：

- 检索向量不再依赖内置 hash 方案
- 本地 embedding 质量明显更接近真实 RAG 系统

### Milestone 7：关键运行问题修复

已完成：

- 修复 Enter 发送消息后提示“后端不可用”的问题
  - 原因：SSE 分隔符格式错误
  - 现状：已修复
- 修复 Windows 启动桌面应用时一直弹出命令行窗口的问题
  - 原因：使用 `python.exe` 启动后端
  - 现状：Windows 下优先尝试 `pythonw.exe`

阶段意义：

- 用户可用性明显提升
- 日常开发和演示体验更稳定

## 当前版本真实状态

截至当前版本，项目已具备以下真实可用能力：

- 桌面端 UI 可正常启动
- Electron 可自动拉起 Python 后端
- 桌面端可发送聊天请求
- FastAPI 可正常返回 SSE 流
- 知识导入 / 重建索引流程可运行
- 检索已接入真实 pgvector
- embedding 已接入本地 Ollama
- inspector 可查看当前摘要、检索来源、生成模式

## 已做过的验证记录

### 构建与静态检查

- `npm run typecheck` 已通过
- `npm run build` 已通过
- Python AST 解析检查已通过

### 后端 smoke test

已验证以下接口：

- `GET /health`
- `GET /api/knowledge/status`
- `POST /api/knowledge/reindex`
- `POST /api/knowledge/import`
- `POST /api/retrieve`
- `POST /api/chat/stream`

### 运行时验证

已验证：

- Electron 开发模式可启动
- Electron renderer 可连接 backend
- 桌面端发送消息后可收到 SSE
- 本地 pgvector 连接正常
- 本地 Ollama embedding 调用正常
- `bge-m3:latest` 已完成一轮重建索引和检索验证

## 当前已知限制

- Redis 还未真正接入持久化记忆
- LLM 代码已接入，但若 `.env` 未完整配置则不会启用真实生成
- 上游 LLM 目前不是原生流式透传
- 知识库管理还没有删除、去重、导入历史和增量索引
- embedding provider / model 还没有在桌面 UI 中显式展示
- fallback 输出当前仍偏工程说明风格，还可以继续优化为更自然的中英文自适应回复

## 当前建议的默认开发模式

建议本地默认使用：

- PostgreSQL + pgvector：真实数据库
- Ollama embedding：`bge-m3:latest`
- LLM：先不开启，保持 fallback

适合当前配置的大致形式：

```env
POSTGRES_DSN=postgresql://admin:123456@127.0.0.1:5432/synapse
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_EMBEDDING_MODEL=bge-m3:latest
LLM_ENABLED=false
```

这样能保证：

- 检索链路是真实的
- 本地依赖简单
- 调试成本较低

## 下一阶段 backlog

### 高优先级

- 接入真实 Redis 保存短期摘要与长期事实
- 将真实 LLM 生成完整跑通并验证 `generation_mode=llm`
- 在桌面 UI 中展示当前 `embedding_provider` / `embedding_model`
- 改善 fallback 输出的语言适配与可读性

### 中优先级

- 支持知识库删除与去重
- 支持导入历史记录与状态展示
- 支持增量重建索引
- 增加更多检索观测项，例如阈值命中原因

### 低优先级

- 接入自动化测试
- 增加桌面端打包与发布流程
- 补充更完整的 API 字段说明文档

## 后续维护建议

后续每完成一轮功能，建议在本文档中追加：

- 本轮目标
- 实际完成项
- 新增配置项
- 做过的验证
- 遗留问题
- 下一轮待办

这样后面继续开发时，不需要反复从聊天记录里回溯上下文。
