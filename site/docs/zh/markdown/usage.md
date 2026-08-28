---
title: 使用 Markdown 包
description: 在 React、SSR 和静态 HTML 中使用 @docfuse/markdown
group: Markdown
order: 81
---

# 使用 Markdown 包

## 安装

:::code-group[包管理器]

```bash title="pnpm"
pnpm add @docfuse/markdown react react-dom
```

```bash title="npm"
npm install @docfuse/markdown react react-dom
```

```bash title="yarn"
yarn add @docfuse/markdown react react-dom
```

:::

支持 React 18.2、18.3 和 19，需要 Node.js 22 或更高版本。

## 能力与加载边界

| 能力 | 核心包 | 使用方式 |
|---|---|---|
| 标题、链接、列表、任务、表格、脚注和定义列表 | 内置 | 直接编写 Markdown / GFM |
| Callout、Tabs、Code Group、Steps 和 Terminal | 内置 | 使用对应指令或代码围栏 |
| File Tree、Card Grid、API、Aside、Badge、Gallery 和复制片段 | 内置 | 使用对应 Markdown 指令；编译器生成结构与交互属性 |
| 图片、视频、音频和 iframe | 内置 | 图片使用 Markdown；其他媒体使用内置指令 |
| PDF、Word、PowerPoint 和 Excel 文件块 | 内置 | 让受支持扩展名的链接独占一行 |
| 数学、Mermaid、PlantUML、Kroki、链接卡片和阅读时长 | 官方插件 | 从 `@docfuse/plugins` 导入并加入 `options.plugins` |

代码高亮内置 Bash、C/C++/C#、CSS/SCSS、Diff、Dockerfile、dotenv、Go、GraphQL、HTML、Java、JavaScript/JSX、JSON/JSONC、Markdown/MDX、Nginx、PHP、Python、Ruby、Rust、SQL、TypeScript/TSX、Vue 和 YAML。其他语言通过 `code.languages` 注册；`unknownLanguage` 决定未知语言是警告、报错还是按纯文本处理。

核心只为当前文档声明需要的 behavior。图表客户端和图表样式按页面语法加载；数学样式在一次站点构建中只要有页面使用公式，就会并入站点样式表，但 KaTeX 转换仍只处理命中公式语法的页面。

## 内容语法

普通 Markdown 不需要接触 Docfuse 的内部类名和数据属性。标准 Markdown、GFM、Tabs、Steps、文件树、媒体等写法统一收录在 [Markdown 语法参考](/markdown/syntax/)；[Playground](/markdown/playground/)用于对照源码和实际效果。

MDX 可以使用同名 React 组件，适合需要动态属性的项目本地页面。

## React

```tsx
import { Markdown } from '@docfuse/markdown'
import '@docfuse/markdown/base.css'
import '@docfuse/markdown/theme.css'

export function Article({ source }: { source: string }) {
  return <Markdown source={source} fallback={<p>正在渲染…</p>} />
}
```

通过 `options` 配置 HTML、代码主题和内容功能：

```tsx
<Markdown
  source={source}
  options={{
    html: 'sanitize',
    code: {
      themes: { light: 'github-light', dark: 'github-dark' },
      fallbackLanguage: 'text'
    },
    features: { tables: false, terminals: false }
  }}
/>
```

`html` 支持 `trusted`、`sanitize` 和 `strip`。MDX 会执行 JSX，只应渲染可信内容。

## 数学公式

```tsx
import { math } from '@docfuse/plugins'
import '@docfuse/plugins/math.css'

<Markdown source={source} options={{ plugins: [math()] }} />
```

先安装 `@docfuse/plugins`。其他官方插件见[官方插件](/guide/site/plugins/)。

## 定制输出

```tsx
<Markdown
  source={source}
  classNames={{ root: 'article', heading: 'article-heading' }}
  components={{ a: AppLink, Callout: BrandCallout }}
  slots={{ CopyIcon, DownloadIcon }}
  urlTransform={(value) => value.startsWith('/') ? `/docs${value}` : value}
/>
```

`classNames` 追加样式，`components` 替换元素或复合组件，`slots` 替换局部视觉，`urlTransform` 处理链接和媒体 URL。交互型 React 替换组件会收到 Docfuse 提供的事件、ARIA 和行为属性；请继续透传这些 Props，不要在 Markdown 里重建内部结构。

## SSR

```tsx
import { createMarkdownRenderer } from '@docfuse/markdown/server'

const renderer = createMarkdownRenderer()
const { content, assets } = await renderer.render(source, {
  markdown: { html: 'trusted' }
})
```

`content` 用于 React SSR，`assets` 描述当前页面需要的客户端资源。

## 增强静态 HTML

```ts
import { enhanceMarkdown } from '@docfuse/markdown/client'

const enhancement = enhanceMarkdown(document, assets)
await enhancement.ready

// 页面卸载前
enhancement.dispose()
```

写作语法见 [Markdown 语法参考](/markdown/syntax/)，实际效果见 [Playground](/markdown/playground/)，精确 Props 与类型见 [React API](/reference/api/react-markdown/)。
