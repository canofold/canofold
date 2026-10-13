# @canofold/plugins

English | [简体中文](./README.zh-CN.md)

`@canofold/plugins` contains the official Markdown plugins and search providers for Canofold. All factories share one package version; normal site configuration imports them from the package root.

## Install for a Canofold site

Install the package as a development dependency:

```bash
pnpm add -D @canofold/plugins
```

`mermaid` and `pagefind` are optional peers. Install either one only when its capability is enabled:

```bash
pnpm add -D mermaid pagefind
```

```ts
import { externalLinks, math, mermaid, pagefind } from '@canofold/plugins'
import { defineConfig } from 'canofold'

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

When using the plugins directly with `@canofold/markdown` in a React application, install them as regular application dependencies. A React host that enables `math()` must also import `@canofold/plugins/math.css`.

Package-root and focused factory entries such as `@canofold/plugins/math` are public. Generated sites load the browser and CSS entries automatically. Direct React or editor hosts may use the typed diagram client entries described below; they are lifecycle enhancers, not plugin factories.

## Host-provided local diagram rendering

PlantUML and Kroki can delegate rendering to a browser host without sending source to an external service. Select the client renderer while compiling Markdown, then pass one renderer function to the matching client enhancer after the Markdown DOM is mounted:

```ts
import { kroki } from '@canofold/plugins/kroki'
import { enhance, type DiagramRenderer } from '@canofold/plugins/client/kroki'

export const diagramPlugin = kroki({ renderer: 'client' })

const renderer: DiagramRenderer = async ({ diagramType, source, signal }) => {
  const svg = await renderLocally({ diagramType, source, signal })
  return { svg }
}

const diagrams = enhance(markdownRoot, { renderer })
await diagrams.ready

// Run when the mounted Markdown content is replaced or removed.
diagrams.dispose()
```

The renderer receives `kind`, the authored `language`, the mapped `diagramType`, `source`, and an `AbortSignal`. It must return a non-empty SVG string. The enhancer presents the SVG through a revocable `blob:` image URL, keeps the source and zoom controls working, displays a localized failure state, and restores the original DOM on disposal. A restrictive host CSP must therefore allow `blob:` in `img-src`.

The host owns any worker, native process, or editor messaging bridge. `@canofold/plugins` does not start executables or define a VS Code protocol, and `@canofold/markdown` remains unaware of diagram runtimes.

`kroki()` now keeps source local and renders a source-only shell by default. Configure a remote service only when sending diagram source is intentional:

```ts
kroki({ server: 'https://kroki.io' })
```

`plantUml({ renderer: 'client' })` uses the same client contract through `@canofold/plugins/client/plantuml`. For both factories, a remote `server` and `renderer: 'client'` cannot be enabled together.

### Math isolation and dependency boundaries

Macros are shared within one document, never across documents or with plugin configuration. `throwOnError: true` rejects invalid formulas; the default `false` preserves error markup.

Since 0.4.1, the published package includes the official Markdown math adapters and uses its directly declared KaTeX 0.18.x runtime, CSS, and fonts. Consumers do not need dependency overrides.

Optional Mermaid uses its own upstream runtime, not the `math()` renderer. Mermaid 11 still includes KaTeX 0.16.x and the low-severity [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7) advisory, which requires existing prototype pollution. This risk is not resolved; audit suppression and cross-version overrides do not fix it. The workspace's math-adapter build dependencies also report this upstream advisory, but their old KaTeX is not shipped to ordinary `math()` consumers.

Verified on 2026-10-08: the latest stable Mermaid, 12.1.0, still declares `katex: ^0.16.47`, whereas the advisory is fixed in KaTeX 0.18.2. The shipped Mermaid 11 browser distribution also embeds old KaTeX code, so changing a lockfile or overriding a dependency does not replace the code the browser executes. Canofold retains Mermaid's `securityLevel: 'strict'`; this does not mean the upstream vulnerability is eliminated.

Closing this risk requires an upstream browser runtime containing the fix, followed by diagram, formula-label, and security regression checks. Eliminating the advisory before an upstream fix would instead require maintaining and validating an alternative build and its dependencies, not a risk-free patch upgrade. This release does not use private patches, replace prebuilt chunks, or suppress audit results.

See the [official plugin guide](https://canofold.dev/en/guide/site/plugins/) for options, examples, lifecycle differences, and verification steps.

License: MIT
