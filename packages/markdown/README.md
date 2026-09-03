# @canofold/markdown

English | [简体中文](./README.zh-CN.md)

`@canofold/markdown` is a standalone Markdown SDK. It provides React rendering, build or SSR support for Markdown and trusted MDX, content analysis, shared theme tokens, and behavior-based browser enhancement.

## Install and render

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

## Public entries

- `@canofold/markdown` provides the React renderer and plugin contract.
- `@canofold/markdown/server` provides the Markdown and trusted-MDX build or SSR renderer.
- `@canofold/markdown/server/analyze` analyzes document features without rendering.
- `@canofold/markdown/client` enhances generated static HTML.
- `@canofold/markdown/theme` provides the shared theme contract.
- `@canofold/markdown/base.css` and `@canofold/markdown/theme.css` provide the public style layers.

Optional syntax such as formulas is supplied by `@canofold/plugins`:

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

See the [Markdown SDK documentation](https://docfuse.dev/en/markdown/) for renderer options, MDX, syntax, theming, and browser enhancement.

License: MIT
