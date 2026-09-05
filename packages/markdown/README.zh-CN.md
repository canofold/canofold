# @canofold/markdown

[English](./README.md) | 简体中文

`@canofold/markdown` 是可独立使用的 Markdown SDK。它提供 React 渲染、Markdown 与可信 MDX 的构建或 SSR、内容分析、共享主题 Token 和按行为加载的浏览器增强。

## 安装与渲染

```bash
pnpm add @canofold/markdown react react-dom
```

```tsx
import { Markdown } from '@canofold/markdown'
import '@canofold/markdown/base.css'
import '@canofold/markdown/theme.css'

export function Article({ source }: { source: string }) {
  return <Markdown source={source} />
}
```

## 公开入口

- `@canofold/markdown` 提供 React 渲染器和插件契约。
- `@canofold/markdown/server` 提供 Markdown 与可信 MDX 的构建或 SSR 渲染器。
- `@canofold/markdown/server/analyze` 只分析文档能力，不执行渲染。
- `@canofold/markdown/client` 增强已经生成的静态 HTML。
- `@canofold/markdown/theme` 提供共享主题契约。
- `@canofold/markdown/base.css` 和 `@canofold/markdown/theme.css` 是公开样式入口。

数学公式等可选语法由 `@canofold/plugins` 提供：

```bash
pnpm add @canofold/plugins
```

```tsx
import { Markdown } from '@canofold/markdown'
import { math } from '@canofold/plugins'
import '@canofold/markdown/base.css'
import '@canofold/markdown/theme.css'
import '@canofold/plugins/math.css'

<Markdown source={source} options={{ plugins: [math()] }} />
```

渲染选项、MDX、写作语法、主题和浏览器增强见 [Markdown SDK 文档](https://canofold.dev/markdown/)。

许可证：MIT
