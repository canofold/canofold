---
title: React Markdown API
description: 查询 @docfuse/markdown 的公开入口、属性和返回类型
group: 参考
subgroup: API
order: 61
---

# React Markdown API

本页只记录公开代码契约。安装与接入见[使用 Markdown 包](/markdown/usage/)，写作方式见 [Markdown 语法参考](/markdown/syntax/)。

## 公开入口

| 入口 | 契约 |
|---|---|
| `@docfuse/markdown` | React `Markdown` 组件及其类型 |
| `@docfuse/markdown/server` | 构建与 SSR renderer |
| `@docfuse/markdown/client` | 静态 HTML 交互增强 |
| `@docfuse/markdown/server/analyze` | 服务端资源分析 |
| `@docfuse/markdown/theme` | 主题类型、预设与 CSS 变量契约 |
| `@docfuse/markdown/base.css` | 必需的结构样式 |
| `@docfuse/markdown/theme.css` | 默认主题 |

深层 `dist/` Chunk、内部组件、Unified/HAST 处理器、Islands、React root 和缓存文件都不是公共 API。

## `MarkdownProps`

```ts
interface MarkdownProps extends MarkdownRootProps {
  source: string
  options?: RenderMarkdownOptions
  components?: MarkdownComponents
  onError?: (error: unknown) => void
  onReady?: () => void
  fallback?: ReactNode
  retainPrevious?: boolean
}
```

`MarkdownRootProps` 还包含：

| 属性 | 类型 | 说明 |
|---|---|---|
| `as` | `React.ElementType` | 根元素，默认 `div` |
| `className` | `string` | 根元素 class |
| `classNames` | `MarkdownClassNames` | 向稳定语义位置追加 class |
| `slots` | `MarkdownSlots` | 替换图标和图注等视觉槽位 |
| `urlTransform` | `(value, property) => string` | 转换真实 `href`、`src`、`poster` 和 `srcSet` |
| 其他安全根元素属性 | `HTMLAttributes<HTMLElement>` | 传给根元素，不包含 `children` 和 `dangerouslySetInnerHTML` |

`urlTransform` 的返回值仍会经过协议安全检查。相对 URL 以及 `http`、`https`、`irc`、`ircs`、`mailto`、`tel`、`xmpp` 可用；`javascript`、`vbscript`、`data`、`file`、`blob` 等协议会被移除。

独立 React 入口的 HTML 默认策略是 `strip`。Mermaid 与 PlantUML 语法不属于核心入口，需要通过 `@docfuse/plugins` 的 `mermaid()`、`plantUml()` 显式启用。

## `RenderMarkdownOptions`

| 分组 | 类型 | 用途 |
|---|---|---|
| `html` | `trusted \| sanitize \| strip` | Raw HTML 策略 |
| `code` | `MarkdownCodeOptions` | Shiki 主题、未知语言策略和自定义语言 |
| `features` | `MarkdownFeatureOptions` | 按能力启停复合组件 |
| `labels` | `Partial<MarkdownLabels>` | 交互可访问性文案 |
| `locale` | `string` | 供插件生成本地化内容的 BCP 47 locale |
| `plugins` | `readonly MarkdownPlugin[]` | 按需启用 Mermaid、PlantUML、数学等官方或自定义插件 |

如果自定义插件需要在 Docfuse Playground 的实时预览中运行，还要声明 `browserCompiler`，提供浏览器安全的包导出、命名工厂和可序列化工厂参数。普通静态文档不会加载该入口。

自定义插件使用指令时，必须在 `MarkdownPlugin.directiveNames` 中声明名称。名称采用小写 kebab-case，且同一个名称只能由一个插件拥有。`fenceLanguages` 对代码围栏执行同样的所有权检查。

`components` 支持原生标签以及 `Callout`、`Tabs`、`CodeGroup`、`Steps`、`CodeBlock`、`CopySnippet`、`Table`、`Image`、`Terminal`、`Details`、`FileTree`、`Gallery`、`CardGrid`、`Api`、`Aside` 和 `Badge`。图表由插件拥有，不是核心 React 命名覆盖。覆盖交互组件时应透传全部 Props，让 Docfuse 保留事件、ARIA 和行为属性。

## 服务端接口

```ts
interface MarkdownRenderer {
  render(source: string, options?: MarkdownRenderOptions): Promise<RenderedMarkdown>
  renderMdx(source: string, options?: MdxRenderOptions): Promise<RenderedMarkdown>
  clear(): void
}

interface RenderedMarkdown {
  content: ReactNode
  assets: MarkdownAssets
}

function createMarkdownRenderer(options?: { maxEntries?: number }): MarkdownRenderer
```

`maxEntries` 限制单个 renderer 保留的编译缓存条目，默认为 64。`renderMdx()` 只接受可信 MDX；传入 `sanitize` 或 `strip` 会失败。

`@docfuse/markdown/server/analyze` 公开不执行渲染的源码分析：

```ts
interface MarkdownAnalysis {
  text: string
  headings: MarkdownHeading[]
  codeExamples: MarkdownCodeExample[]
  links: string[]
  images: string[]
  missingCodeBlockLanguages: number
  directiveIssues: Array<{ message: string; line?: number; column?: number }>
}

interface AnalyzeMarkdownOptions {
  plugins?: readonly MarkdownPlugin[]
}

function analyzeMarkdown(source: string, options?: AnalyzeMarkdownOptions): MarkdownAnalysis
```

它适合搜索索引、链接检查和编辑器诊断。传入 `plugins` 后，分析器会接受当前文档中已激活插件声明的 `directiveNames`；其他未知指令会出现在 `directiveIssues` 中。

## 客户端增强接口

```ts
interface MarkdownEnhancement {
  ready: Promise<void>
  dispose(): void
}

function enhanceMarkdown(
  root?: ParentNode,
  assets?: Pick<MarkdownAssets, 'behaviors'>
): MarkdownEnhancement
```

宿主在页面卸载或替换前必须调用 `dispose()`。
