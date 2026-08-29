---
title: Site configuration reference
description: Look up docfuse.config fields, defaults, accepted values, and related guides
group: Reference
subgroup: Configuration and CLI
order: 51
---

# Site configuration reference

Docfuse loads one `docfuse.config.ts`, `.mts`, `.cts`, `.js`, `.mjs`, or `.cjs` from the project root. Multiple variants are ambiguous, and unknown fields or invalid values fail validation.

```ts
import { defineConfig } from 'docfuse'

export default defineConfig({
  title: 'Acme Docs',
  description: 'Acme platform documentation',
  siteUrl: 'https://docs.acme.com',
  basePath: '/',
  requiredVersion: '^0.1.0'
})
```

`defineConfig()` leaves the value unchanged while providing type checking and editor completion for the complete object and its nested fields. A directly exported object still goes through the build-time schema.

## Site and directories

| Field | Default | Purpose |
|---|---|---|
| `title` | `Docfuse` | Site name and default browser title |
| `description` | `Technical documentation` | Site description used when a page has no description |
| `siteUrl` | unset | HTTP(S) origin used by canonical URLs, `hreflang`, and the sitemap; no path, query, or hash |
| `basePath` | `/` | Subpath deployment prefix, beginning and ending with `/` |
| `editUrl` | unset | HTTP(S) prefix for “Edit this page”; queries and hashes are rejected |
| `github` | unset | HTTP(S) URL for the header GitHub link |
| `requiredVersion` | unset | Semver range that the running CLI must satisfy |
| `docsDir` | `docs` | Content directory for a single-version site; cannot be combined with `versions` |
| `outputDir` | `.docfuse/dist` | Static site output directory |
| `styles` | `[]` | Project CSS files loaded after the default stylesheet |
| `layout.header` | `true` | Render brand, top navigation, search entry, and locale/version controls |

Keep `siteUrl` as the origin and express a deployment subdirectory with `basePath`. Omit unresolved `editUrl` and `github` values. Disabling `layout.header` leaves the content sidebar, page outline, and search shortcut available.

## Markdown

| Field | Default | Purpose |
|---|---|---|
| `markdown.html` | `sanitize` | Raw HTML policy: `trusted`, `sanitize`, or `strip`; MDX remains trusted executable code |
| `markdown.code.themes` | built-in light/dark themes | Replace the Shiki theme names |
| `markdown.code.fallbackLanguage` | `text` | Fence label used when no language is declared |
| `markdown.code.unknownLanguage` | `warn` | Handle an unknown fence language with `warn`, `error`, or `plain-text` |
| `markdown.features` | all enabled | Disable callouts, tabs, code groups, steps, terminals, document blocks, tables, or code blocks independently |
| `markdown.labels` | built-in by locale | Override accessible labels for Markdown interactions |
| `markdown.plugins` | `[]` | Trusted build-time Markdown plugins, applied in array order |

The standalone `<Markdown>` component defaults to `html: 'strip'`, unlike the Docfuse site default. See [Markdown](/en/markdown/) for integration and [Official plugins](/en/guide/site/plugins/) for plugin setup.

## Theme and search

| Field | Default | Purpose |
|---|---|---|
| `theme.logo` / `logoDark` | unset | Light and dark brand images; `logoDark` requires `logo` and `darkMode: true` |
| `theme.favicon` | built-in icon | Site favicon |
| `theme.accentColor` | `docfuse` | Preset name or valid CSS color |
| `theme.baseColor` | `paper` | `paper`, `neutral`, `slate`, `zinc`, or `stone` |
| `theme.darkMode` | `false` | Generate the dark theme and its switch |
| `theme.radius` | `8` | Site shortcut for small, medium, and large radii |
| `theme.sidebarWidth` | `17.5rem` | Desktop sidebar width |
| `theme.outlineWidth` | `18.75rem` | Desktop page-outline width |
| `theme.tokens` | `{}` | Semantic color, typography, layout, geometry, and motion overrides |
| `search.enabled` | `true` | Generate a search index and browser entry |
| `search.provider` | `compact` | Built-in `compact` or a `SearchProvider` object such as `pagefind()` |

See [Theme customization](/en/guide/site/customization/) and [Search](/en/guide/site/search/) for task workflows.

## Site capabilities

| Field | Default | Purpose |
|---|---|---|
| `extensions` | `[]` | `{ resolve, options }` entries; `resolve` starts with `./` and options are JSON-serializable |
| `navigation` | `{}` | Locale-keyed `{ text, link }[]`; derived from top-level content sections when omitted |
| `versions` | current version `current` | `{ current, items }`; current uses `/`, and every id and base is unique |
| `redirects` | `{}` | Old-to-current route map; chains, cycles, and real-page collisions fail validation |
| `advertising` | unset | `{ image, href, alt, label? }` image slot beside the page outline |

See [navigation](/en/guide/site/navigation/), [versions](/en/guide/site/versions/), [redirects](/en/guide/site/redirects/), [extensions](/en/guide/site/extensions/), and [advertising](/en/guide/delivery/advertising/) for workflows.

## Internationalization and AI output

| Field | Default | Purpose |
|---|---|---|
| `i18n.defaultLocale` | `zh` | Default locale without a URL prefix |
| `i18n.locales` | `['zh']` | Locales included in the build |
| `i18n.localeNames` | `{}` | Display names in the locale switcher |
| `i18n.messages` | `{}` | Site and Markdown UI overrides by locale |
| `ai.llmsTxt` | `true` | Emit `llms.txt` |
| `ai.llmsFullTxt` | `true` | Emit `llms-full.txt` or its Manifest pointer |
| `ai.markdownIndex` | `true` | Emit `ai/index.md` |
| `ai.pageSummaries` | `true` | Emit `ai/summaries.json` |
| `ai.codeExamples` | `true` | Emit `ai/code-examples.json` |
| `ai.chunkSizeBytes` | `262144` | Encoded byte budget for one JSONL content record |
| `ai.llmsFullMaxBytes` | `10485760` | Budget for the legacy aggregate file |
| `ai.llmsFullOverflow` | `manifest` | Write a Manifest pointer on overflow, or use `error` to fail the build |
| `ai.versions` | `current` | Publish only the current version, or use `all` for every version |

See [Internationalization](/en/guide/site/internationalization/) and [AI-friendly output](/en/reference/output/ai-output/) for setup and artifact details.
