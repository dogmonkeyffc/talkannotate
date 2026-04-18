# TalkAnnotate

自托管的 Markdown 文档批注系统。

## 技术栈

- 前端：React + Mantine
- 后端：Fastify + TypeScript
- 数据库：SQLite

## 部署

```bash
git clone <本项目地址>
cd talkannotate
cp ./skills/markdown-preview-approved $path/to/your/skills-dir/
docker compose up -d --build
```

启动后访问 `http://localhost:3180`。

如需修改端口：

```bash
TALKANNOTATE_HOST_PORT=8080 docker compose up -d --build
```
## API

查阅 api 在线文档：http://localhost:3180/documentation/json

