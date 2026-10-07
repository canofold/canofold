# Canofold

[English](./README.md) | 简体中文

`canofold` 是 Canofold 知识文档平台的 CLI。它读取 Markdown、MDX 和项目本地 React 组件，生成导航、搜索、多语言路由、版本页面和 AI-ready 知识输出，最终产出可直接部署的静态 HTML。

## 安装

要求 Node.js 22 或更高版本。建议把 Canofold 安装为项目本地开发依赖：

```bash
pnpm add -D canofold
pnpm exec canofold init
pnpm exec canofold dev
```

`init` 会创建 `docs/` 和带类型提示的 `canofold.config.ts`。常用命令应写进 `package.json`；临时调用本地版本时使用 `pnpm exec canofold ...`。

## 命令

- `init` 创建文档项目或接管已有文档。
- `dev` 启动开发服务器。
- `check` 检查配置、内容、路由和插件拥有的语法。
- `build` 把生产站点写入 `.canofold/dist/`。
- `preview` 在本地预览生产产物。
- `clean` 删除生成产物和持久化构建状态。
- `deploy` 根据当前项目生成部署说明。

## 产物控制与构建报告

默认值保留旧版本的全部产物；只需关闭不想发布的类别：

```ts
import { defineConfig } from 'canofold'

export default defineConfig({
  markdownMirror: false, // 每个 HTML 页面旁的 index.md
  ai: {
    pageIndex: false, // ai/pages.json
    fullContent: false // ai/manifest.json 与 ai/content/**/*.jsonl
  }
})
```

原有的 `search.enabled`、`ai.markdownIndex`、`ai.pageSummaries`、`ai.codeExamples`、`ai.llmsTxt` 和 `ai.llmsFullTxt` 仍可独立控制。关闭 Markdown Mirror 后，`ai/index.md` 改为链接 HTML 页面，AI 记录不再包含 `markdownPath`。关闭完整内容分片后，超出容量的 `llms-full.txt` 不能指向不存在的 Manifest：可以提高 `ai.llmsFullMaxBytes`、关闭 `ai.llmsFullTxt`，或开启 `ai.fullContent`。

每次 `build` 都会输出简短的终端摘要，并在 `.canofold/cache/build-report.json` 写入机器可读报告。报告包含页面、语言与版本数量，构建模式、缓存命中、原因、变更页面和耗时，以及各类内置逻辑产物的启用状态、规划路径、实际路径、文件数量、字节数和缺失路径。`removedPaths` 对比上一次有效构建清单；`removalBaseline: false` 表示没有可供比较的清单。报告存于部署目录之外，不包含文档正文或密钥。关闭某类产物不等于访问控制；私有内容仍需在托管层保护所有剩余的 HTML、搜索和 AI 文件。

Canofold 是构建工具，不是沙箱。MDX、本地组件、配置和 Extension 都会以构建进程的权限执行，只能使用经过审核的源码。

使用方法、配置、部署和故障排查见 [Canofold 文档](https://canofold.dev/guide/)。

许可证：MIT
