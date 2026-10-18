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

Mermaid 11 and 12 are supported. Prefer Mermaid 12 for new installations; it requires Node 22.12+ and Safari 17.4+ or equivalent ES2024 browser support. Canofold keeps Dagre layout and the Classic look by default; authored Mermaid configuration can select another layout or look. The runtime is bundled from the site's installed `mermaid` package, not shipped inside `@canofold/plugins`.

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

## Local OpenAPI content source

Use the separate server-only entry, not `markdown.plugins`:

```ts
import { openapi } from '@canofold/plugins/openapi'

export default {
  i18n: { defaultLocale: 'en', locales: ['en'] },
  sources: [openapi({
    id: 'pet-api', root: 'docs/api', entry: 'docs/api/openapi.yaml',
    version: 'current', locale: 'en', base: '/api/'
  })]
}
```

Local OpenAPI 3.0.x/3.1.x JSON/YAML creates an overview and one page per selected path operation, alongside a normal Markdown/MDX homepage. `root` and `entry` are project-relative, all references must stay inside `root`, and version/locale must be configured. `base` is a locale-relative prefix; `info.version` is the API version, not the documentation version. Optional exact `include.paths` and any-matching `include.tags` intersect when both are set. Empty, duplicate or unmatched selectors fail.

URLs use lowercase method and lossless UTF-8 hexadecimal path segments, at most 64 characters each; `GET /pets` under `/api/` is `/api/get/2f70657473/`. Path input is limited to 1,024 UTF-8 bytes. Tags affect display grouping, never duplicate identity. Parameters, request/response media types, examples, authentication, servers, deprecation and original schema composition feed the same site/search/machine outputs. Descriptions/examples are inert data, not executable Markdown or requests.

No remote reference is fetched; local URI schema identifiers do not authorize network access. Symlinks, traversal, missing references and ambiguous Path Item siblings fail. Limits: 16 MiB/file, 64 MiB and 512 files/source, JSON depth 128 and one million nodes, YAML alias expansion 50, 10,000 operations plus overview, 64 MiB generated bodies/facts and 16 MiB referenced schemas/page. Failures preserve the prior complete build, not truncated facts. Swagger 2.0/3.2, remote sync, Try-it-out, SDK generation and independent callback/webhook pages are outside this adapter.

Historical entry/ref inputs must remain inside that version's `docsDir`; snapshots copy version-local files but do not rewrite source bindings. Browser/Markdown imports do not load the parsers. Strict JSON validation uses Microsoft's MIT-licensed `jsonc-parser` visitor with comments/trailing commas disabled and duplicate keys rejected; YAML uses `yaml`, and grammar validation uses MIT-licensed Redocly 2.x. Canofold 0.8 requires Node 22.12 or newer. See [OpenAPI integration](https://canofold.dev/en/guide/writing/openapi/) for complete setup and boundaries.

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

Calling the enhancer with a renderer also upgrades diagram shells that the Canofold page runtime already enhanced without one; controls are not duplicated. The host still owns the returned lifecycle and must dispose it when replacing or unmounting the rendered content.

The host owns any worker, native process, or editor messaging bridge. `@canofold/plugins` does not start executables or define a VS Code protocol, and `@canofold/markdown` remains unaware of diagram runtimes.

`kroki()` keeps diagram source local by default. Remote rendering must be enabled explicitly with a trusted Kroki-compatible server; use the host renderer when the host should render locally:

```ts
kroki()
kroki({ server: 'https://kroki.example' })
kroki({ renderer: 'client' })
```

`plantUml({ renderer: 'client' })` uses the same client contract through `@canofold/plugins/client/plantuml`. For both factories, a remote `server` and `renderer: 'client'` cannot be enabled together. A server must be an HTTP(S) base URL without a query or fragment.

Configuring `server` embeds remote image URLs: the browser sends diagram source to that service when loading the image. Use a trusted self-hosted service for private content, or select a local client renderer. This explicit configuration is not repeated as a warning on each build.

### Math isolation and dependency boundaries

Macros are shared within one document, never across documents or with plugin configuration. `throwOnError: true` rejects invalid formulas; the default `false` preserves error markup.

Since 0.4.1, the published package includes the official Markdown math adapters and uses its directly declared KaTeX 0.18.x runtime, CSS, and fonts. Consumers do not need dependency overrides.

Optional Mermaid uses its own upstream runtime, not the `math()` renderer. Mermaid 12.2.0 declares KaTeX 0.18.x; use it or a newer supported release rather than forcing a cross-version dependency override. Canofold bundles the installed package entry and retains `securityLevel: 'strict'`.

Mermaid 11 remains API-supported but includes KaTeX 0.16.x and the low-severity [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7) advisory, which requires existing prototype pollution. Upgrading `@canofold/plugins` alone does not upgrade the site's optional Mermaid peer; install `mermaid@^12.2.0` to leave that affected dependency range. Browser and Node requirements above apply.

See the [official plugin guide](https://canofold.dev/en/guide/site/plugins/) for options, examples, lifecycle differences, and verification steps.

License: MIT
