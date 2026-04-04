# Synapse

> A bilingual desktop RAG workspace focused on local knowledge, memory, and traceable retrieval.

## 项目简介

Synapse 是一个面向个人知识工作的桌面应用原型，目标不是做“只会聊天”的壳，而是把会话、知识库、记忆与检索过程真正串起来。

当前版本已经可以在本地完成一条比较完整的 RAG 链路：导入文档、写入向量数据库、结合会话上下文检索、展示来源，并把部分记忆状态持久化下来。整个界面支持中文与英文切换，应用名统一为 `Synapse`。

## 当前项目

### 现在已经实现的能力

- Electron + React + FastAPI 的桌面端架构
- 中文 / 英文双语界面
- 多会话管理，支持会话删除
- 文档与文件夹导入，保留原始文件名显示
- 导入历史管理，支持删除导入批次
- 基于 PostgreSQL + pgvector 的真实向量检索
- 基于 Redis 的摘要 / 事实记忆持久化
- 本地 Ollama embedding 接入
- 检索阈值过滤，减少低质量命中
- 可按导入批次限制知识检索范围
- SSE 流式回答
- 上下文检查器，可查看摘要、改写、记忆、来源与检索调试信息

### 当前技术栈

- 桌面端：Electron
- 前端：React + TypeScript + Zustand + Ant Design
- 后端：FastAPI
- 检索：PostgreSQL + pgvector
- 记忆：Redis
- Embedding：Ollama / fallback embedding
- 通信：HTTP + SSE

### 当前产品形态

Synapse 现在更像一个“可验证的桌面 RAG 工作台”，重点在于：

- 检索链路是真实可运行的，而不是纯前端演示
- 知识来源是可见的，命中过程是可调试的
- 会话记忆与知识检索可以同时参与回答
- 导入、索引、检索、生成之间已经形成基本闭环

## 对后续项目的想法

接下来我更希望 Synapse 往下面几个方向继续演进：

- 更稳定的知识工作流：导入、去重、重建索引、批次管理做得更自然
- 更强的可控检索：支持更清晰的命中解释、召回分析和质量评估
- 更实用的记忆系统：把短期上下文、长期事实和用户偏好区分管理
- 更完整的桌面产品化：安装包、自动更新、日志与错误恢复能力补齐
- 更接近真正的个人知识助手：不只是回答问题，而是帮助整理、追踪和复用知识

---

如果你想看实现细节，可以继续查看 `docs/architecture.md` 与 `docs/progress.md`。
