# Canofold

[English](./README.md) | 简体中文

Canofold 是一个静态优先、低侵入、可扩展的知识文档平台。它使用统一的内容模型，将 Markdown、MDX 和显式接入的本地 OpenAPI 规范构建成多语言、多版本的网站、搜索索引和 AI-ready 知识输出。

## 包与用途

| 包 | 适用场景 |
|---|---|
| `canofold` | 构建并发布完整文档站点 |
| `@canofold/markdown` | 在 React 应用中渲染 Canofold Markdown |
| `@canofold/themes` | 使用官方视觉主题，或开发遵循共同契约的第三方主题 |
| `@canofold/vite` | 在已有 Vite 项目中运行实时组件示例 |
| `@canofold/plugins` | 使用官方 Markdown 插件、Pagefind 搜索或本地 OpenAPI 内容来源 |

## 快速开始

要求 Node.js 22.12 或更高版本。团队项目推荐把 CLI 安装为项目本地开发依赖：

```bash
pnpm add -D canofold
pnpm exec canofold init
```

把日常命令放进项目脚本：

```json
{
  "scripts": {
    "docs:dev": "canofold dev",
    "docs:check": "canofold check",
    "docs:build": "canofold build",
    "docs:preview": "canofold preview"
  }
}
```

```bash
pnpm docs:dev
```

脚本中的裸 `canofold` 会由包管理器从 `node_modules/.bin` 解析。临时执行本地版本时使用 `pnpm exec canofold ...`；只有全局安装且全局 bin 在 PATH 中时，才可以在任意 Shell 直接运行裸 `canofold ...`。完整说明见[安装与运行](https://canofold.dev/guide/introduction/installation/)。

## 文档入口

- [指南](https://canofold.dev/guide/)：安装、内容创作、站点配置、构建与发布流程。
- [参考](https://canofold.dev/reference/)：站点字段、Frontmatter、CLI、React API、构建产物和项目资源。
- [Markdown SDK](https://canofold.dev/markdown/)：`@canofold/markdown` 的能力边界、接入方式和写作语法。
- [Playground](https://canofold.dev/markdown/playground/)：对照查看 Markdown 源码、标准元素和扩展组件的渲染效果。
- [编辑器扩展](https://canofold.dev/vscode/)：在 VS Code 中预览 Markdown。
- [Skills](https://canofold.dev/skills/)：实验中的内容创作、维护和知识读取工作流。
- [安全边界](https://canofold.dev/reference/output/security/)：可信 Markdown、MDX、扩展和私有站点要求。

Canofold 构建的是完整静态 HTML，默认使用内置 compact 本地搜索，也可通过 `@canofold/plugins` 启用 Pagefind；同时可生成 `llms.txt`、Markdown 原文、页面索引和分片语料。输出目录默认是 `.canofold/dist/`，可发布到任意静态托管平台。

0.8 机器格式统一使用 schema 3，覆盖 Markdown/MDX 与 OpenAPI 派生页面，分开记录文档身份、原始输入修订、声明依赖和生成表示。本地 OpenAPI 3.0/3.1 来源进入同一条站点、搜索和机器输出链，不往作者目录写生成文件。详见[机器消费契约](./packages/canofold/README.zh-CN.md#机器消费契约08)与 [OpenAPI 来源](./packages/plugins/README.zh-CN.md#本地-openapi-内容来源)。从 schema 1/2 升级时同步升级 Reader、重建可信基线，不把格式切换当成内容删除。

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
