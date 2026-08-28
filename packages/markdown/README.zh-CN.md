# @docfuse/markdown

[English](./README.md) | 简体中文

`@docfuse/markdown` 在 React 中渲染 Markdown，并为 Markdown 与可信 MDX 提供构建或 SSR 渲染器。包内还提供共享主题 Token 和按行为加载的浏览器增强。

## 安装与渲染

```bash
pnpm add @docfuse/markdown react react-dom
```

```tsx
import { Markdown } from '@docfuse/markdown'
import '@docfuse/markdown/base.css'
import '@docfuse/markdown/theme.css'

export function Article({ source }: { source: string }) {
  return <Markdown source={source} />
}
```

## 公开入口

- `@docfuse/markdown` 提供 React 渲染器和插件契约。
- `@docfuse/markdown/server` 提供 Markdown 与可信 MDX 的构建或 SSR 渲染器。
- `@docfuse/markdown/server/analyze` 只分析文档能力，不执行渲染。
- `@docfuse/markdown/client` 增强已经生成的静态 HTML。
- `@docfuse/markdown/theme` 提供共享主题契约。
- `@docfuse/markdown/base.css` 和 `@docfuse/markdown/theme.css` 是公开样式入口。

数学公式等可选语法由 `@docfuse/plugins` 提供：

```bash
pnpm add @docfuse/plugins
```

```tsx
import { Markdown } from '@docfuse/markdown'
import { math } from '@docfuse/plugins'
import '@docfuse/markdown/base.css'
import '@docfuse/markdown/theme.css'
import '@docfuse/plugins/math.css'

<Markdown source={source} options={{ plugins: [math()] }} />
```

渲染选项、MDX、写作语法、主题和浏览器增强见 [Markdown 文档](https://docfuse.dev/markdown/)。

许可证：MIT
