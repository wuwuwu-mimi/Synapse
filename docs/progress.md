# Synapse 开发进度记录

本文档用于记录 `Synapse` 当前已完成能力、已验证结果、已知限制和下一阶段建议，便于后续继续迭代。

## 当前完成情况

### 1. 桌面端与基础链路

- Electron + React + TypeScript 桌面工程已可运行
- FastAPI 后端可由 Electron 自动拉起
- Windows 下优先使用 `pythonw.exe`，避免额外命令行窗口常驻
- 聊天支持 SSE 流式返回
- 修复了回车发送后误报“后端不可用”的问题

### 2. 产品形态

- 应用名称统一为 `Synapse`
- UI 支持中文 / 英文切换
- 三栏布局已稳定：会话列表、聊天区、上下文检查器

### 3. 检索与知识库

- 检索已接入真实 PostgreSQL + pgvector
- 已加入 lexical / vector / fused 阈值过滤
- 支持导入 `.md` / `.txt` 文件和文件夹
- 支持导入历史查看和已导入批次删除
- 已实现知识分块去重
- 已实现首版增量索引：
  - 为知识目录生成本地索引状态文件
  - 未变化文件复用已有切块状态
  - 未变化 chunk 复用数据库已有 embedding
  - 删除旧 chunk、仅增量写入变化部分

### 4. Embedding 与生成

- 支持 `hash` fallback embedding
- 支持本地 Ollama embedding
- 已验证可用的本地 embedding 模型：
  - `mxbai-embed-large:latest`
  - `bge-m3:latest`
- 已接入 OpenAI 兼容 `chat/completions` 接口
- 未启用真实 LLM 时仍可走 fallback 回答

### 5. 记忆能力

- 摘要与事实已接入 Redis 持久化
- 会话状态可跨后端重启恢复基础信息
- UI 可显示数据库、Redis、embedding、LLM 等运行状态

## 最近一轮完成的重点

- 完成知识库导入历史 + 删除功能
- 完成知识去重与增量索引首版
- 在 UI 中补充索引统计字段：
  - 文件数
  - 去重数
  - 复用 chunk 数
  - 新增 chunk 数
  - 删除 chunk 数
  - 索引模式
- 更新 `README.md` 与 `.env.example`

## 已验证结果

### 构建 / 静态检查

- `npm run typecheck` 通过
- `npm run build` 通过
- Python AST 检查通过

### 运行验证

- pgvector 连接正常
- Redis 连接正常
- Ollama embedding 调用正常
- 增量索引验证通过：第二次刷新可复用已有 chunk
- 去重验证通过：重复文档不会导致知识 chunk 重复写入

## 当前已知限制

- 上游 LLM 仍不是原生流式透传
- 完整消息历史尚未统一迁移到 Redis
- 知识库冲突提示仍较基础，缺少更细的差异预览
- 自动化测试覆盖仍不足
- 桌面端打包与发布流程尚未补齐

## 下一阶段建议

### 高优先级

- 接入真正的上游流式 LLM 返回
- 补齐自动化回归测试
- 为知识导入增加更细粒度的冲突提示和预览

### 中优先级

- 统一会话消息持久化策略
- 为知识库管理增加更多运维/诊断信息
- 优化 fallback 输出风格与中英文自适应表现

### 低优先级

- 增加桌面端打包与发布流程
- 补充更完整的 API 与配置文档