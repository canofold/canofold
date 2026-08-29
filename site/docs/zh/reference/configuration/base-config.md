---
title: 站点配置参考
description: 查询 docfuse.config 的字段、默认值、取值边界和相关指南
group: 参考
subgroup: 配置与命令
order: 51
---

# 站点配置参考

Docfuse 从项目根目录加载一个 `docfuse.config.ts`、`.mts`、`.cts`、`.js`、`.mjs` 或 `.cjs`。多个同名变体会被视为歧义，未知字段和非法值会直接报错。

```ts
import { defineConfig } from 'docfuse'

export default defineConfig({
  title: 'Acme Docs',
  description: 'Acme 平台开发文档',
  siteUrl: 'https://docs.acme.com',
  basePath: '/',
  requiredVersion: '^0.1.0'
})
```

`defineConfig()` 不会改写配置，只为整个对象及其嵌套字段提供类型检查和编辑器补全。直接导出对象仍然受构建期 Schema 校验。

## 站点与目录

| 字段 | 默认值 | 说明 |
|---|---|---|
| `title` | `Docfuse` | 站点名称和默认页签标题 |
| `description` | `Technical documentation` | 页面未写 `description` 时的站点描述 |
| `siteUrl` | 未设置 | canonical、`hreflang` 和 sitemap 使用的 HTTP(S) origin，不包路径、查询和哈希 |
| `basePath` | `/` | 子路径部署前缀，必须以 `/` 开头和结尾 |
| `editUrl` | 未设置 | “编辑此页”的 HTTP(S) URL 前缀，不允许查询和哈希 |
| `github` | 未设置 | 页头 GitHub 入口的 HTTP(S) URL |
| `requiredVersion` | 未设置 | 当前 CLI 必须满足的 semver 范围 |
| `docsDir` | `docs` | 单版本内容目录；不能与 `versions` 同时配置 |
| `outputDir` | `.docfuse/dist` | 静态站点输出目录 |
| `styles` | `[]` | 在默认样式之后加载的项目 CSS 文件 |
| `layout.header` | `true` | 是否渲染品牌、顶部导航、搜索入口和语言/版本控件 |

`siteUrl` 只写 origin，子目录由 `basePath` 表达。`editUrl` 和 `github` 未确定时直接省略。关闭 `layout.header` 不会移除正文侧栏、页内导航或搜索快捷键。

## Markdown

| 字段 | 默认值 | 说明 |
|---|---|---|
| `markdown.html` | `sanitize` | 普通 Markdown 的 Raw HTML 策略：`trusted`、`sanitize` 或 `strip`；MDX 仍是可执行的可信代码 |
| `markdown.code.themes` | 内置亮色/暗色主题 | 替换 Shiki 主题名 |
| `markdown.code.fallbackLanguage` | `text` | 未声明语言时的围栏标签 |
| `markdown.code.unknownLanguage` | `warn` | 遇到未知围栏语言时使用 `warn`、`error` 或 `plain-text` |
| `markdown.features` | 各项启用 | 分别关闭 Callout、Tabs、Code Group、Steps、Terminal、文档块、表格或代码块 |
| `markdown.labels` | 按 locale 使用内置文案 | 覆盖 Markdown 交互的可访问性文案 |
| `markdown.plugins` | `[]` | 受信任的构建期 Markdown 插件，按数组顺序执行 |

独立使用 `<Markdown>` 时，HTML 默认值是 `strip`，与 Docfuse 站点配置的 `sanitize` 不同。接入方法见 [Markdown](/markdown/)，插件配置见[官方插件](/guide/site/plugins/)。

## 主题与搜索

| 字段 | 默认值 | 说明 |
|---|---|---|
| `theme.logo` / `logoDark` | 未设置 | 亮色和暗色品牌图片；`logoDark` 需要同时设置 `logo` 和 `darkMode: true` |
| `theme.favicon` | 内置图标 | 站点 favicon |
| `theme.accentColor` | `docfuse` | 预设名或合法 CSS 颜色 |
| `theme.baseColor` | `paper` | `paper`、`neutral`、`slate`、`zinc` 或 `stone` |
| `theme.darkMode` | `false` | 生成暗色主题和切换控件 |
| `theme.radius` | `8` | 小、中、大圆角的站点快捷值 |
| `theme.sidebarWidth` | `17.5rem` | 桌面端侧栏宽度 |
| `theme.outlineWidth` | `18.75rem` | 桌面端页内导航宽度 |
| `theme.tokens` | `{}` | 亮暗色、排版、阅读宽度、圆角和动效的语义 Token 覆盖 |
| `search.enabled` | `true` | 生成搜索索引和客户端入口 |
| `search.provider` | `compact` | 内置 `compact` 或实现 `SearchProvider` 的对象，如 `pagefind()` |

主题覆盖示例见[定制主题](/guide/site/customization/)，搜索选择见[配置搜索](/guide/site/search/)。

## 站点能力

| 字段 | 默认值 | 说明 |
|---|---|---|
| `extensions` | `[]` | `{ resolve, options }` 列表；`resolve` 必须以 `./` 开头，`options` 必须可 JSON 序列化 |
| `navigation` | `{}` | 按 locale 配置的 `{ text, link }[]`；未配置时从一级内容分区生成 |
| `versions` | 当前版本 `current` | `{ current, items }`；当前版本必须使用 `/`，每个 id 和 base 唯一 |
| `redirects` | `{}` | 旧路由到现有站内路由的映射；链、环和覆盖真实页面都会失败 |
| `advertising` | 未设置 | `{ image, href, alt, label? }` 右侧图片位 |

对应流程见[导航](/guide/site/navigation/)、[版本](/guide/site/versions/)、[重定向](/guide/site/redirects/)、[扩展](/guide/site/extensions/)和[广告](/guide/delivery/advertising/)。

## 多语言与 AI 输出

| 字段 | 默认值 | 说明 |
|---|---|---|
| `i18n.defaultLocale` | `zh` | 无 URL 前缀的默认语言 |
| `i18n.locales` | `['zh']` | 需要构建的 locale 列表 |
| `i18n.localeNames` | `{}` | 语言切换器显示名 |
| `i18n.messages` | `{}` | 按 locale 覆盖站点和 Markdown 界面文案 |
| `ai.llmsTxt` | `true` | 生成 `llms.txt` |
| `ai.llmsFullTxt` | `true` | 生成 `llms-full.txt` 或 Manifest 指针 |
| `ai.markdownIndex` | `true` | 生成 `ai/index.md` |
| `ai.pageSummaries` | `true` | 生成 `ai/summaries.json` |
| `ai.codeExamples` | `true` | 生成 `ai/code-examples.json` |
| `ai.chunkSizeBytes` | `262144` | 单个 JSONL 内容记录的编码字节上限 |
| `ai.llmsFullMaxBytes` | `10485760` | 兼容单文件的容量上限 |
| `ai.llmsFullOverflow` | `manifest` | 超限时写 Manifest 指针或使用 `error` 停止构建 |
| `ai.versions` | `current` | 只发布当前版本，或使用 `all` 发布全部版本 |

添加语言见[配置多语言](/guide/site/internationalization/)，文件结构与收录规则见 [AI 友好输出](/reference/output/ai-output/)。
