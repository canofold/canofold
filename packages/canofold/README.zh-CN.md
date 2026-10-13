# Canofold

[English](./README.md) | 简体中文

`canofold` 是 Canofold 知识文档平台的 CLI。它读取 Markdown、MDX 和项目本地 React 组件，生成导航、搜索、多语言路由、版本页面和 AI-ready 知识输出，最终产出可直接部署的静态 HTML。

## 安装

要求 Node.js 22 或更高版本。建议把 Canofold 安装为项目本地开发依赖：

```bash
pnpm add -D canofold @canofold/themes
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

## 视觉主题

在 `canofold.config.ts` 中导入并排列读者可以选择的主题：

```ts
import { canofold, neoBrutalist, neumorphism } from '@canofold/themes'
import { defineConfig } from 'canofold'
import aurora from '@acme/canofold-theme'

export default defineConfig({
  themes: [canofold, neoBrutalist, neumorphism, aurora]
})
```

数组第一项的第一个外观是默认选择。读者切换时无需刷新页面，选择会跨页面保留。每个主题定义自己拥有稳定 ID、本地化名称、CSS 入口和外观；`canofold` 提供浅色与深色，其余官方主题各提供一种外观。不配置 `themes` 时使用 `canofold`。全部官方主题定义见 [`@canofold/themes`](../themes/README.zh-CN.md)。

官方和第三方主题遵守同一份 `ThemeDefinition` 契约。Core 不导出或注册主题；官方主题来自 `@canofold/themes`，第三方主题来自各自的 npm 包，站点只负责把导入的定义放进 `themes`。主题名称属于主题定义，不属于站点通用 `i18n.messages`；后者只覆盖搜索、导航、快捷入口、Markdown 交互和 404 等界面文案。`branding` 只管理 `logo`、`logoDark` 和 `favicon`，`layout` 只管理站点几何尺寸，视觉变量与主题专属样式全部由主题包管理。第三方主题包的完整契约见 [`@canofold/themes`](../themes/README.zh-CN.md)。

## 导航

顶部导航通常按目录路由识别当前栏目。如果相关文档使用平级路由，可在导航项的 `activePaths` 中列出页面的精确路径；这些路径必须指向已生成的页面。例如 `{ text: '组件', link: '/button/', activePaths: ['/notice/', '/progress/'] }`，无需改动页面 URL，也能让所列页面保持“组件”选中。

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

每次 `build` 都会输出简短的终端摘要，并在 `.canofold/cache/build-report.json` 写入机器可读报告。报告包含页面、语言与版本数量，构建模式、缓存命中、原因、变更页面和耗时，以及各类内置逻辑产物的启用状态、规划路径、实际路径、文件数量、字节数和缺失路径。`additionalOutputs` 统计不属于这些内置类型的实际文件，包括用户静态资源和 Extension 产物。`removedPaths` 对比上一次有效构建清单；`removalBaseline: false` 表示没有可供比较的清单，此时终端不会声称移除了多少文件。报告存于部署目录之外，不包含文档正文或密钥。关闭某类产物不等于访问控制；私有内容仍需在托管层保护所有剩余的 HTML、搜索和 AI 文件。

Canofold 是构建工具，不是沙箱。MDX、本地组件、配置和 Extension 都会以构建进程的权限执行，只能使用经过审核的源码。

使用方法、配置、部署和故障排查见 [Canofold 文档](https://canofold.dev/guide/)。

许可证：MIT
