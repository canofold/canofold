# Docfuse

[English](./README.md) | 简体中文

Docfuse 是一个静态优先、低侵入、可扩展的知识文档平台。它使用统一的内容模型，将 Markdown 和 MDX 构建成多语言、多版本的网站、搜索索引和 AI-ready 知识输出。

## 包与用途

| 包 | 适用场景 |
|---|---|
| `docfuse` | 构建并发布完整文档站点 |
| `@docfuse/markdown` | 在 React 应用中渲染 Docfuse Markdown |
| `@docfuse/plugins` | 使用官方 Markdown 插件或 Pagefind 搜索 Provider |

## 快速开始

要求 Node.js 22 或更高版本。团队项目推荐把 CLI 安装为项目本地开发依赖：

```bash
pnpm add -D docfuse
pnpm exec docfuse init
```

把日常命令放进项目脚本：

```json
{
  "scripts": {
    "docs:dev": "docfuse dev",
    "docs:check": "docfuse check",
    "docs:build": "docfuse build",
    "docs:preview": "docfuse preview"
  }
}
```

```bash
pnpm docs:dev
```

脚本中的裸 `docfuse` 会由包管理器从 `node_modules/.bin` 解析。临时执行本地版本时使用 `pnpm exec docfuse ...`；只有全局安装且全局 bin 在 PATH 中时，才可以在任意 Shell 直接运行裸 `docfuse ...`。完整说明见[安装与运行](https://docfuse.dev/guide/introduction/installation/)。

## 文档入口

- [指南](https://docfuse.dev/guide/)：安装、内容创作、站点配置、构建与发布流程。
- [参考](https://docfuse.dev/reference/)：站点字段、Frontmatter、CLI、React API、构建产物和项目资源。
- [Markdown SDK](https://docfuse.dev/markdown/)：`@docfuse/markdown` 的能力边界、接入方式和写作语法。
- [Playground](https://docfuse.dev/markdown/playground/)：对照查看 Markdown 源码、标准元素和扩展组件的渲染效果。
- [安全边界](https://docfuse.dev/reference/output/security/)：可信 Markdown、MDX、扩展和私有站点要求。

Docfuse 构建的是完整静态 HTML，默认使用内置 compact 本地搜索，也可通过 `@docfuse/plugins` 启用 Pagefind；同时可生成 `llms.txt`、Markdown 原文、页面索引和分片语料。输出目录默认是 `.docfuse/dist/`，可发布到任意静态托管平台。

## 开发与贡献

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

- [贡献指南](./CONTRIBUTING.md)
- [安全策略](./SECURITY.md)
- [支持](./SUPPORT.md)
- [变更记录](./CHANGELOG.md)

## 许可证

[MIT](./LICENSE)
