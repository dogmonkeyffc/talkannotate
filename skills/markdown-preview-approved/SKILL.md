---
name: markdown-preview-approved
description: Publish AI-generated Markdown to the local preview service at http://localhost:3180, then fetch browser-made human annotations to continue iteration. Use this skill whenever the user wants Markdown content to be previewed, persisted, reviewed by humans in the browser, or when the agent should pull annotations back from the preview service and apply them to any Markdown document, not only design docs.
---

# Markdown Preview Approved Skill

用于管理这样一条协作链路：

- AI agent 生成或改写 Markdown
- AI agent 把 Markdown 发送到本地预览服务
- 人类在浏览器里阅读并做批注
- AI agent 拉取批注，继续整理、修改、生成下一版 Markdown

这个 skill 面向通用 Markdown 文档，不局限于架构设计文档。适用对象可以是：

- 设计文档
- 技术方案
- API 文档
- 需求说明
- 会议纪要
- 操作文档
- README
- 任何需要“预览 -> 人工批注 -> AI 继续迭代”的 Markdown 内容

## 适用场景

当用户有以下意图时，优先使用本 skill：

- “把这份 Markdown 发到本地预览服务”
- “根据现有内容创建一个可预览版本”
- “读取某篇 Markdown 文档的浏览器批注”
- “根据人类批注继续修改文档”
- “把聊天里的内容整理成 Markdown 并送去预览”
- “汇总当前文档、版本和批注，生成下一版”

如果用户只是想在聊天里讨论内容、不需要发到预览服务、也不需要回收批注，则不必使用本 skill。

## 协作模型

这个 skill 的默认角色分工是：

- AI agent：生成 Markdown、发送到预览服务、拉取批注、整合意见、产出下一版
- Human reviewer：在浏览器中阅读文档并创建批注
- Preview service：保存 Markdown 文档、维护版本、存储批注、提供读取接口

不要把人类浏览器批注行为误写成 agent 行为；agent 的职责是发布和回收，不是替代人工评审本身。

## 服务事实

- 基址：`http://localhost:3180`
- OpenAPI JSON：`http://localhost:3180/documentation/json`
- 文档 UI：`http://localhost:3180/documentation/`
- 健康检查：`GET /api/health`

## 核心对象

### Document

文档列表项包含：

- `id`
- `slug`
- `title`
- `summary`
- `currentVersion`
- `versionsCount`
- `updatedAt`

创建或追加文档版本时使用：

- `title`: 文档标题
- `content`: 完整 Markdown 内容
- `id`: 可选；如果传已有文档 ID，则表示基于原文档追加一个新版本

### Annotation

批注由人类在浏览器中创建，AI agent 负责读取和消费。

读取接口支持：

- `GET /api/documents/{id}/annotations`
- 可选 `version` 查询参数

写入接口也存在，但这个协作模型下默认优先把批注视为人工产生的数据源；除非用户明确要求 agent 代写批注，否则 agent 主要做读取、整理、吸收。

批注对象依赖 `anchor` 和 `note`，其中 `anchor` 至少包含：

- `blockId`
- `quote`
- `selectedText`
- `startOffset`
- `endOffset`

可选上下文字段：

- `contextBefore`
- `contextAfter`
- `startCol`
- `endCol`
- `startLine`
- `endLine`

当前公开颜色枚举仅看到：`violet`。

## 默认工作流

### 0. 发布前必须检查已有文档（最高优先级）

**任何发布操作之前，都必须先调用 `GET /api/documents` 检查是否已经存在同名或相关文档。**

决策树：

1. `GET /api/documents` 获取文档列表
2. 检查列表中是否有标题相同或主题一致的文档
   - **如果存在**：记住该文档的 `id`，后续发布时必须携带 `id` 以追加版本，而不是创建新文档
   - **如果不存在**：不传 `id`，创建新文档
3. 如果拿不准是否是同一篇文档，调用 `GET /api/documents/{id}/content` 对比内容再决定

**绝对禁止在没有检查文档列表的情况下直接 `POST /api/documents` 而不传 `id`。** 这是导致重复文档的根本原因。

### 1. 发布前先判断目标

先把用户请求识别成以下几类之一：

- `publish`: 把新的 Markdown 发到预览服务（新建文档，**仅在确认文档不存在时使用**）
- `republish`: 基于已有文档生成新版本并重新发布（**必须传 `id`**）
- `fetch-annotations`: 拉取某个文档或某个版本的人类批注
- `revise-from-annotations`: 根据批注修改 Markdown 并生成下一版（**必须传 `id`**）
- `summarize-review`: 汇总文档现状、历史版本、人工批注

如果一次请求混合多个目标，默认顺序是：

1. 读取当前文档
2. 读取当前版本批注
3. 整理出应该吸收的反馈
4. 产出新的完整 Markdown
5. 追加新版本到预览服务（**传原 `id`**）

### 2. 发布 Markdown 时的原则

AI agent 发布的是完整 Markdown 版本，而不是零散片段：

- `content` 应该是完整可预览 Markdown
- 除非用户明确要求，否则不要只提交片段式草稿
- 更新已有文档时，优先保留未被批注否定的有效内容
- 不要把“下面是我给你的文档”“这是 AI 生成的版本”这类对话性文案写进正文
- 面向最终读者写 Markdown，而不是面向模型自述

### 3. 批注消费原则

AI agent 拉取批注后，不是机械逐条照抄，而是要做消费和归纳：

- 识别哪些批注是在指出错误、缺失、歧义、风险
- 合并重复或等价批注
- 区分必须修改项、建议修改项、待确认项
- 如果批注互相冲突，明确标出冲突点，不要擅自拍板
- 如果批注指向局部，但会影响全文一致性，修改时要同步检查相关章节

### 4. 版本策略

遵循“发布完整版本，保留人工反馈上下文”：

- 新文档首次发布：`POST /api/documents`，不传 `id`（**前提是已通过 `GET /api/documents` 确认该文档不存在**）
- 已有文档再次发布：`POST /api/documents`，**必须传原 `id`**
- 只拉取批注、不改正文：只读，不创建新版本
- 根据批注修改后再发布：生成完整新 Markdown，再追加版本（**必须传原 `id`**）

**常见错误**：AI agent 在对话上下文中丢失了文档 `id`，导致每次都不传 `id` 而创建新文档。
**避免方式**：每次发布前都先 `GET /api/documents` 查找已有文档并获取其 `id`。

在以下情况优先只读批注、不立即发新版本：

- 用户明确说先看批注结论
- 批注存在明显冲突，需要人工确认
- 当前批注不足以推导出可靠修改方案

在以下情况优先直接发新版本：

- 用户明确要求“按批注改完并发布”
- 批注结论清晰，修改范围明确
- 当前版本只需要常规整合，不涉及重大方向冲突

### 5. 文档读取顺序

任何涉及“继续修改”“拉取批注”“根据批注更新”的请求，都遵循先读后写：

1. `GET /api/documents`
2. 锁定目标文档
3. `GET /api/documents/{id}/content`
4. 必要时 `GET /api/documents/{id}/versions`
5. `GET /api/documents/{id}/annotations`
6. 再决定是否生成并发布下一版

不要在没读取当前文档和批注的情况下，凭聊天记忆直接覆盖发布。

## 标准调用序列

### A. 首次发布 Markdown 到预览服务

1. `GET /api/documents` 检查是否已有同名或相关文档
2. **如果已有文档**：走流程 C（追加版本），不要创建新文档
3. **如果确认不存在**：整理用户提供的内容，生成完整 Markdown
4. `POST /api/documents`（不传 `id`）
5. 确认返回的 `id`、`slug`、`currentVersion`
6. 告诉用户该文档现在可以在浏览器里继续批注，并记住 `id` 供后续追加版本使用

### B. 拉取人类批注并整理结论

1. `GET /api/documents`
2. `GET /api/documents/{id}/content`
3. `GET /api/documents/{id}/annotations`
4. 将批注归纳为问题清单、修改建议、待确认项
5. 返回结构化结论，必要时等待用户确认是否发布下一版

### C. 根据批注生成并发布下一版

1. 读取当前文档内容
2. 读取当前批注
3. 生成新的完整 Markdown
4. `POST /api/documents`，携带原 `id`
5. 如有需要，回查 `GET /api/documents/{id}/versions`

### D. 汇总整个协作过程

1. 读当前文档
2. 读版本链
3. 读当前或指定版本批注
4. 输出：当前版本状态、已吸收的批注、未处理批注、下一步建议

## 写操作安全规则

- 更新前必须先读当前文档和相关批注
- 不确定目标文档时，先根据标题、slug、summary 列出候选
- 追加版本时提交完整 Markdown，而不是只提交 diff
- 不要把未经确认的推断写成确定事实
- 如果批注之间存在冲突，要把冲突显式告诉用户
- 如果接口文档和运行时响应不一致，优先相信运行时响应
- 写入后要基于返回结果确认版本已创建成功

## 推荐输出模板

每轮完成后，优先按这个结构回复：

```markdown
# 本轮 Markdown 协作结果

## 目标
- ...

## 处理动作
- 首次发布 / 拉取批注 / 根据批注修订并发布 / 仅汇总

## 文档信息
- title: ...
- id: ...
- slug: ...
- version: ...

## 批注处理结果
- 已吸收: ...
- 待确认: ...
- 未处理: ...

## 当前结论
- ...

## 下一步建议
- ...
```

## Curl 示例

```bash
# 1) 健康检查
curl -s http://localhost:3180/api/health

# 2) 列出文档
curl -s http://localhost:3180/api/documents

# 3) 首次发布 Markdown
curl -s -X POST http://localhost:3180/api/documents \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "版本发布说明",
    "content": "# Release Notes\n\n## Highlights\n..."
  }'

# 4) 拉取文档内容
curl -s http://localhost:3180/api/documents/<document-id>/content

# 5) 拉取当前版本批注
curl -s http://localhost:3180/api/documents/<document-id>/annotations

# 6) 拉取指定版本批注
curl -s "http://localhost:3180/api/documents/<document-id>/annotations?version=2"

# 7) 根据批注发布新版本
curl -s -X POST http://localhost:3180/api/documents \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "<document-id>",
    "title": "版本发布说明",
    "content": "# Release Notes\n\n## Highlights\n...根据批注修订后的完整 Markdown..."
  }'
```

## 示例提示词

- “把下面这份 Markdown 发布到本地预览服务，给我返回文档信息，方便同事去浏览器批注。”
- “读取这篇文档最新版本的人类批注，整理成必须修改、建议修改、待确认三类。”
- “根据浏览器里的批注，把这份 README 改完并作为新版本重新发布。”
- “找出这篇文档当前版本还没吸收的批注，告诉我下一版应该怎么改。”
- “把这段聊天内容整理成 Markdown，发布到预览服务，后面我们按批注继续迭代。”
