# @docfuse/markdown

English | [简体中文](./README.zh-CN.md)

`@docfuse/markdown` renders Markdown in React and provides build or SSR rendering for Markdown and trusted MDX. It also publishes shared theme tokens and behavior-based browser enhancement.

## Install and render

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

## Public entries

- `@docfuse/markdown` provides the React renderer and plugin contract.
- `@docfuse/markdown/server` provides the Markdown and trusted-MDX build or SSR renderer.
- `@docfuse/markdown/server/analyze` analyzes document features without rendering.
- `@docfuse/markdown/client` enhances generated static HTML.
- `@docfuse/markdown/theme` provides the shared theme contract.
- `@docfuse/markdown/base.css` and `@docfuse/markdown/theme.css` provide the public style layers.

Optional syntax such as formulas is supplied by `@docfuse/plugins`:

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

See the [Markdown documentation](https://docfuse.dev/en/markdown/) for renderer options, MDX, syntax, theming, and browser enhancement.

License: MIT
