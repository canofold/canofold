# @docfuse/plugins

English | [简体中文](./README.zh-CN.md)

`@docfuse/plugins` contains the official Markdown plugins and search providers for Docfuse. All factories share one package version; normal site configuration imports them from the package root.

## Install for a Docfuse site

Install the package as a development dependency:

```bash
pnpm add -D @docfuse/plugins
```

`mermaid` and `pagefind` are optional peers. Install either one only when its capability is enabled:

```bash
pnpm add -D mermaid pagefind
```

```ts
import { externalLinks, math, mermaid, pagefind } from '@docfuse/plugins'
import { defineConfig } from 'docfuse'

export default defineConfig({
  search: { provider: pagefind() },
  markdown: {
    plugins: [math(), mermaid(), externalLinks()]
  }
})
```

## Available factories

| Factory | Contract | Purpose |
|---|---|---|
| `externalLinks(options?)` | Markdown plugin | Adds safe attributes to external HTTP(S) links |
| `readingTime(options?)` | Markdown plugin | Adds localized reading time |
| `linkCard(options?)` | Markdown plugin | Converts a standalone link into a link card |
| `kroki(options?)` | Markdown plugin | Renders Graphviz, D2, and other Kroki languages |
| `math(options?)` | Markdown plugin | Renders formulas with remark-math and KaTeX |
| `mermaid(options?)` | Markdown plugin | Renders Mermaid fences in the browser |
| `plantUml(options?)` | Markdown plugin | Renders PlantUML when a trusted server is configured |
| `pagefind(options?)` | Search provider | Builds a Pagefind index from final static HTML |

When using the plugins directly with `@docfuse/markdown` in a React application, install them as regular application dependencies. A React host that enables `math()` must also import `@docfuse/plugins/math.css`.

Package-root and focused factory entries such as `@docfuse/plugins/math` are public. Browser and CSS entries are consumed by generated sites and should not be treated as plugin factories.

See the [official plugin guide](https://docfuse.dev/en/guide/site/plugins/) for options, examples, lifecycle differences, and verification steps.

License: MIT
