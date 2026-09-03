---
title: Use the Markdown package
description: Use @canofold/markdown with React, SSR, and static HTML
group: Markdown SDK
order: 81
---

# Use the Markdown package

## Install

:::code-group[Package manager]

```bash title="pnpm"
pnpm add @canofold/markdown react react-dom
```

```bash title="npm"
npm install @canofold/markdown react react-dom
```

```bash title="yarn"
yarn add @canofold/markdown react react-dom
```

:::

React 18.2, 18.3, and 19 are supported. Node.js 22 or newer is required.

## Capabilities and loading boundaries

| Capability | Core package | Authoring path |
|---|---|---|
| Headings, links, lists, tasks, tables, footnotes, and definition lists | Built in | Write Markdown / GFM directly |
| Callouts, Tabs, Code Groups, Steps, and Terminal | Built in | Use the corresponding directive or fence |
| File Tree, Card Grid, API, Aside, Badge, Gallery, and copy snippets | Built in | Use the matching Markdown directive; the compiler creates structure and interaction attributes |
| Images, video, audio, and iframes | Built in | Use Markdown images and the built-in media directives |
| PDF, Word, PowerPoint, and Excel file blocks | Built in | Put a supported document link on its own line |
| Math, Mermaid, PlantUML, Kroki, link cards, and reading time | Official plugins | Import factories from `@canofold/plugins` and add them to `options.plugins` |

Built-in highlighting covers Bash, C/C++/C#, CSS/SCSS, Diff, Dockerfile, dotenv, Go, GraphQL, HTML, Java, JavaScript/JSX, JSON/JSONC, Markdown/MDX, Nginx, PHP, Python, Ruby, Rust, SQL, TypeScript/TSX, Vue, and YAML. Register other languages through `code.languages`; `unknownLanguage` chooses warning, failure, or plain-text fallback.

The core emits only behaviors required by the current document. Diagram clients and styles are linked per page. If any page in a site build uses math, the math styles are included in the site stylesheet, while the KaTeX transform still runs only for pages that contain math syntax.

## Content syntax

Ordinary Markdown does not need Canofold's internal class names or data attributes. The [Markdown syntax reference](/en/markdown/syntax/) covers standard Markdown, GFM, tabs, steps, file trees, media, and every built-in directive. Use the [Playground](/en/markdown/playground/) to compare source with rendered output.

MDX can still use the matching React components when project-local content needs dynamic props.

## React

```tsx
import { Markdown } from '@canofold/markdown'
import '@canofold/markdown/base.css'
import '@canofold/markdown/theme.css'

export function Article({ source }: { source: string }) {
  return <Markdown source={source} fallback={<p>Rendering…</p>} />
}
```

Use `options` to configure HTML, code themes, and content features:

```tsx
<Markdown
  source={source}
  options={{
    html: 'sanitize',
    code: {
      themes: { light: 'github-light', dark: 'github-dark' },
      fallbackLanguage: 'text'
    },
    features: { tables: false, terminals: false }
  }}
/>
```

`html` accepts `trusted`, `sanitize`, or `strip`. MDX executes JSX and should only render trusted content.

## Math

```tsx
import { math } from '@canofold/plugins'
import '@canofold/plugins/math.css'

<Markdown source={source} options={{ plugins: [math()] }} />
```

Install `@canofold/plugins` first. See [Official plugins](/en/guide/site/plugins/) for other capabilities.

## Customize output

```tsx
<Markdown
  source={source}
  classNames={{ root: 'article', heading: 'article-heading' }}
  components={{ a: AppLink, Callout: BrandCallout }}
  slots={{ CopyIcon, DownloadIcon }}
  urlTransform={(value) => value.startsWith('/') ? `/docs${value}` : value}
/>
```

`classNames` adds styles, `components` replaces elements or composites, `slots` replaces focused visuals, and `urlTransform` rewrites link and media URLs. Interactive React replacements receive events, ARIA, and behavior attributes from Canofold; forward those props instead of recreating them in Markdown.

## SSR

```tsx
import { createMarkdownRenderer } from '@canofold/markdown/server'

const renderer = createMarkdownRenderer()
const { content, assets } = await renderer.render(source, {
  markdown: { html: 'trusted' }
})
```

`content` is ready for React SSR. `assets` describes the client resources required by the page.

## Enhance static HTML

```ts
import { enhanceMarkdown } from '@canofold/markdown/client'

const enhancement = enhanceMarkdown(document, assets)
await enhancement.ready

// Before unmounting the page
enhancement.dispose()
```

See the [Markdown syntax reference](/en/markdown/syntax/) for authoring, the [Playground](/en/markdown/playground/) for rendered examples, and the [React API](/en/reference/api/react-markdown/) for exact props and types.
