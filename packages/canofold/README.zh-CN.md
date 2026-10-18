# Canofold

[English](./README.md) | 简体中文

`canofold` 是 Canofold 知识文档平台的 CLI。它读取 Markdown、MDX、项目本地 React 组件和显式配置的内容来源，生成导航、搜索、多语言路由、版本页面和 AI-ready 知识输出，最终产出可直接部署的静态 HTML。

## 安装

要求 Node.js 22.12 或更高版本。建议把 Canofold 安装为项目本地开发依赖：

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

## 文档版本与日期

`versions` 使用数组，第一项为当前主版本。省略或设为 `[]` 时不展示版本入口，仍从 `docsDir`（默认 `docs`）构建文档；一项显示 `label`，多项提供版本切换，不自动读取项目或 Canofold 包的版本。例如：`versions: [{ id: 'v2', label: 'Acme 2.4', docsDir: 'docs', base: '/' }]`。配置非空数组时，目录分别写在各项中，不再设置顶层 `docsDir`。历史文档需要先保存到独立目录；`canofold snapshot <id>` 复制执行时的当前文档，不会回溯 Git。

页面更新日期来自 `updatedAt` 或可靠的 Git 历史，统一按 UTC 展示，不随构建机器时区变化。两者都不可用时，不显示日期。

## 产物控制与构建报告

`canofold dev` 默认使用 3333 端口，`canofold preview` 默认使用 4173。`--port <number>` 指定起始端口；占用时依次尝试后续端口，直到 65535，并打印包含站点 `basePath` 的实际地址。其他监听错误立即报错。开发中的缓存命中不重复打印构建摘要；交互终端用颜色区分状态，重定向输出或设置 `NO_COLOR` 时保持纯文本。

默认生成站点、搜索、Markdown 和 AI 产物，可按需关闭：

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

## 机器消费契约（0.8）

`ai/pages.json` 和 `ai/manifest.json` 使用 schema 3，涵盖作者 Markdown/MDX 与 OpenAPI 派生页面。Manifest 和经校验的 JSONL 分片提供完整正文，页面索引提供元数据，各输出开关独立。

同一内容集合需要跨目录或地址迁移时，声明 `ai.contentSpace`。消费者在更新状态前校验文件、范围和快照完整性；文档缺席表示退出该集合，不直接等同于源文件删除。

字段、身份、表示、完整性和快照比较规则以 [AI 输出参考](https://canofold.dev/reference/output/ai-output/)为准。[OpenAPI 接入指南](https://canofold.dev/guide/writing/openapi/)说明本地规范配置、生成页面与支持边界。

### 从 schema 1/2 升级

Canofold 0.6.x 使用 schema 1，0.7.x 使用 schema 2。生产者各包与 Reader 同步升级后，重新构建并建立可信基线。schema 3 Reader 拒绝旧格式，不能把格式切换当成批量删除。操作见[升级指南](https://canofold.dev/guide/delivery/upgrading/)。

Canofold 是构建工具，不是沙箱。MDX、本地组件、配置和 Extension 都会以构建进程的权限执行，只能使用经过审核的源码。

使用方法、配置、部署和故障排查见 [Canofold 文档](https://canofold.dev/guide/)。

许可证：MIT
