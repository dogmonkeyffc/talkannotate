---
name: talkannotate-client
description: >-
  与 TalkAnnotate 文档批注服务交互。当用户要求推送 Markdown 文档、
  查询文档列表或版本、创建/删除批注、备份或恢复数据时，使用此 skill。
  也适用于需要将设计文档、会议纪要等内容发布到 TalkAnnotate 进行评审的场景。
---

# TalkAnnotate Client Skill

通过 REST API 与 TalkAnnotate 服务交互，完成文档推送、批注管理和数据备份恢复。

## When to use

- 用户要求把 Markdown 内容推送到 TalkAnnotate 供评审
- 用户要求查询文档列表、某个文档的版本历史或批注
- 用户要求在文档上创建或删除批注
- 用户要求备份或恢复 TalkAnnotate 数据

## Configuration

| 变量                    | 默认值                  | 说明     |
| ----------------------- | ----------------------- | -------- |
| `TALKANNOTATE_BASE_URL` | `http://localhost:3180` | 服务地址 |

下文中 `$BASE` 代表该地址。

## API Reference

### 健康检查

```
GET $BASE/api/health → { "status": "ok" }
```

### 文档

**列表**

```
GET $BASE/api/documents → { "items": [DocumentListItem] }
```

DocumentListItem 字段：`id`, `slug`, `title`, `summary`, `currentVersion`, `versionsCount`, `updatedAt`

**推送文档**（新建或追加版本）

```
POST $BASE/api/documents
Content-Type: application/json

{
  "title": "文档标题",
  "content": "# Markdown 正文\n...",
  "slug": "optional-slug"
}
```

- `slug` 可选；省略时由服务端根据 title 生成
- 如果 slug 已存在，则追加新版本
- 返回 `201` + DocumentDetail

**获取文档内容**

```
GET $BASE/api/documents/:slug/content
GET $BASE/api/documents/:slug/content?version=2
```

**获取版本列表**

```
GET $BASE/api/documents/:slug/versions → { "items": [{ version, title, summary, createdAt }] }
```

### 批注

**查询批注**

```
GET $BASE/api/documents/:slug/annotations
GET $BASE/api/documents/:slug/annotations?version=2
```

**创建批注**

```
POST $BASE/api/documents/:slug/annotations
Content-Type: application/json

{
  "anchor": {
    "blockId": "heading-xxx",
    "quote": "选中的原文",
    "selectedText": "选中的原文",
    "startOffset": 0,
    "endOffset": 10,
    "contextBefore": "前文",
    "contextAfter": "后文"
  },
  "note": "批注内容",
  "color": "violet",
  "version": 1
}
```

- `anchor` 中必填：`blockId`, `quote`, `selectedText`, `startOffset`, `endOffset`
- 返回 `201` + AnnotationRecord

**删除批注**

```
DELETE $BASE/api/annotations/:id → 204
```

### 备份与恢复

**导出备份**

```bash
curl -o backup.tar.gz $BASE/api/backup
```

返回 `application/gzip` 流。

**导入恢复**

```bash
curl -X POST --data-binary @backup.tar.gz \
  -H "Content-Type: application/octet-stream" \
  $BASE/api/restore
```

返回 `{ "ok": true }`。

## Workflow Examples

### 推送设计文档供评审

```bash
# 将本地 Markdown 文件推送到 TalkAnnotate
CONTENT=$(cat design.md)
curl -s -X POST $BASE/api/documents \
  -H "Content-Type: application/json" \
  -d "{\"title\": \"系统设计文档\", \"content\": $(echo "$CONTENT" | jq -Rs .)}"
```

### 查看某文档的所有批注

```bash
curl -s "$BASE/api/documents/system-design/annotations" | jq '.items[] | {note, quote: .selectedText}'
```

### 定期备份

```bash
curl -o "backup-$(date +%Y%m%d).tar.gz" $BASE/api/backup
```
