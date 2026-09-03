---
title: Search
description: Build multilingual indexes with built-in search or Pagefind
group: Guide
subgroup: Site capabilities
order: 32
---

# Search

Search is enabled by default with the built-in `compact` provider. Small and medium sites need no additional configuration.

## Use Pagefind

For larger sites, install the official plugin package and Pagefind:

:::code-group[Package manager]

```bash title="pnpm"
pnpm add -D @canofold/plugins pagefind
```

```bash title="npm"
npm install --save-dev @canofold/plugins pagefind
```

```bash title="yarn"
yarn add --dev @canofold/plugins pagefind
```

:::

Then configure the search provider:

```ts title="canofold.config.ts"
import { pagefind } from '@canofold/plugins'
import { defineConfig } from 'canofold'

export default defineConfig({
  search: { provider: pagefind() }
})
```

Pagefind indexes final HTML and filters results by the active locale and version.

## Exclude content

Set `search: false` in page frontmatter to exclude one page:

```yaml
---
search: false
---
```

Use `search: { enabled: false }` to disable search for the entire site. Private sites should protect search indexes with the same access policy as page content.
