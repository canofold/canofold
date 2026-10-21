# @canofold/markdown

English | [简体中文](./README.zh-CN.md)

`@canofold/markdown` is a standalone Markdown SDK. It provides React rendering, build or SSR support for Markdown and trusted MDX, content analysis, structural styles, and behavior-based browser enhancement. Visual themes are supplied by `@canofold/themes`.

## Install and render

```bash
pnpm add @canofold/markdown @canofold/themes react react-dom
```

```tsx
import { Markdown } from '@canofold/markdown'
import '@canofold/markdown/base.css'
import '@canofold/themes/canofold.css'

export function Article({ source }: { source: string }) {
  return <Markdown source={source} />
}
```

## Public entries

- `@canofold/markdown` provides the React renderer and plugin contract.
- `@canofold/markdown/server` provides the Markdown and trusted-MDX build or SSR renderer.
- The server renderer's `analyze()` returns compiled content facts and `assets` requirements without executing author MDX components. Hosts can prepare interaction scripts and styles before rendering pages.
- `@canofold/markdown/server/analyze` analyzes document features without rendering.
- `@canofold/markdown/client` enhances generated static HTML.
- `@canofold/markdown/base.css` provides structural Markdown and interaction styles.
- `@canofold/themes` provides the theme contract and official visual themes; import one of its CSS entries after `base.css`.

When `@canofold/markdown/client` is imported by Vite or another bundler, React and React DOM remain host-provided peer dependencies instead of hiding another bundled React copy. When the Canofold CLI emits a standalone static site that has no host bundler, it automatically selects a self-contained local browser asset. Both modes use the same public entry and require no user-managed alias, import map, or runtime path.

Optional syntax such as formulas is supplied by `@canofold/plugins`:

```bash
pnpm add @canofold/plugins
```

```tsx
import { Markdown } from '@canofold/markdown'
import { math } from '@canofold/plugins'
import '@canofold/markdown/base.css'
import '@canofold/themes/canofold.css'
import '@canofold/plugins/math.css'

<Markdown source={source} options={{ plugins: [math()] }} />
```

See the [Markdown SDK documentation](https://canofold.dev/en/markdown/) for renderer options, MDX, syntax, theming, and browser enhancement.

Authoring previews can set `options={{ directives: { invalid: 'literal' } }}` to display malformed or unknown rich directives as escaped source while rendering the rest of the document. The default is `error`, so builds still catch directive typos. Bare colon words such as `format:check` remain text unless the directive name is built in or explicitly owned by a plugin. This policy does not suppress plugin failures or relax HTML sanitization, media URL validation, or MDX execution boundaries.

License: MIT
