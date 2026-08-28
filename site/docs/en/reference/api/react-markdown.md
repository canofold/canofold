---
title: React Markdown API
description: Look up @docfuse/markdown public entries, props, and return types
group: Reference
subgroup: API
order: 61
---

# React Markdown API

This page contains code contracts only. See [Use the Markdown package](/en/markdown/usage/) for installation and integration, and the [Markdown syntax reference](/en/markdown/syntax/) for authoring.

## Public entries

| Entry | Contract |
|---|---|
| `@docfuse/markdown` | React `Markdown` component and types |
| `@docfuse/markdown/server` | Build and SSR renderer |
| `@docfuse/markdown/client` | Static HTML behavior enhancement |
| `@docfuse/markdown/server/analyze` | Server-side resource analysis |
| `@docfuse/markdown/theme` | Theme types, presets, and CSS variable contract |
| `@docfuse/markdown/base.css` | Required structural styles |
| `@docfuse/markdown/theme.css` | Default theme |

Deep `dist/` chunks, internal components, Unified/HAST processors, Islands, React roots, and cache files are not public API.

## `MarkdownProps`

```ts
interface MarkdownProps extends MarkdownRootProps {
  source: string
  options?: RenderMarkdownOptions
  components?: MarkdownComponents
  onError?: (error: unknown) => void
  onReady?: () => void
  fallback?: ReactNode
  retainPrevious?: boolean
}
```

`MarkdownRootProps` also contains:

| Prop | Type | Meaning |
|---|---|---|
| `as` | `React.ElementType` | Root element; defaults to `div` |
| `className` | `string` | Root class |
| `classNames` | `MarkdownClassNames` | Append classes at stable semantic positions |
| `slots` | `MarkdownSlots` | Replace local visuals such as icons and captions |
| `urlTransform` | `(value, property) => string` | Transform real `href`, `src`, `poster`, and `srcSet` values |
| other safe root props | `HTMLAttributes<HTMLElement>` | Forwarded except `children` and `dangerouslySetInnerHTML` |

The result of `urlTransform` still passes through protocol safety checks. Relative URLs and `http`, `https`, `irc`, `ircs`, `mailto`, `tel`, and `xmpp` are allowed; protocols such as `javascript`, `vbscript`, `data`, `file`, and `blob` are removed.

The standalone React entry defaults to `html: 'strip'`. Mermaid and PlantUML fenced syntax is provided by the opt-in `mermaid()` and `plantUml()` plugins from `@docfuse/plugins`.

## `RenderMarkdownOptions`

| Group | Type | Purpose |
|---|---|---|
| `html` | `trusted \| sanitize \| strip` | Raw HTML policy |
| `code` | `MarkdownCodeOptions` | Shiki themes, unknown-language policy, and custom languages |
| `features` | `MarkdownFeatureOptions` | Enable or disable composite capabilities |
| `labels` | `Partial<MarkdownLabels>` | Accessible interaction labels |
| `locale` | `string` | BCP 47 locale available to plugins that emit localized content |
| `plugins` | `readonly MarkdownPlugin[]` | Compiler plugins applied to Markdown and MDX pipelines |

Custom plugins that must run in Docfuse Playground realtime preview also declare `browserCompiler` with a browser-safe package export, named factory, and serializable factory options. Ordinary static pages do not load that entry.

A custom plugin that uses directives must list them in `MarkdownPlugin.directiveNames`. Names use lowercase kebab-case, and one directive may have only one owner. `fenceLanguages` applies the same ownership rule to code fences.

`components` accepts intrinsic tags plus `Callout`, `Tabs`, `CodeGroup`, `Steps`, `CodeBlock`, `CopySnippet`, `Table`, `Image`, `Terminal`, `Details`, `FileTree`, `Gallery`, `CardGrid`, `Api`, `Aside`, and `Badge`. Diagrams are plugin-owned rather than a core named React override. Interactive replacements should forward every supplied prop so Docfuse can retain events, ARIA, and behavior attributes.

## Server interface

```ts
interface MarkdownRenderer {
  render(source: string, options?: MarkdownRenderOptions): Promise<RenderedMarkdown>
  renderMdx(source: string, options?: MdxRenderOptions): Promise<RenderedMarkdown>
  clear(): void
}

interface RenderedMarkdown {
  content: ReactNode
  assets: MarkdownAssets
}

function createMarkdownRenderer(options?: { maxEntries?: number }): MarkdownRenderer
```

`maxEntries` bounds the prepared-document cache retained by one renderer and defaults to 64. `renderMdx()` accepts trusted MDX only and rejects `sanitize` or `strip`.

`@docfuse/markdown/server/analyze` inspects source without rendering it:

```ts
interface MarkdownAnalysis {
  text: string
  headings: MarkdownHeading[]
  codeExamples: MarkdownCodeExample[]
  links: string[]
  images: string[]
  missingCodeBlockLanguages: number
  directiveIssues: Array<{ message: string; line?: number; column?: number }>
}

interface AnalyzeMarkdownOptions {
  plugins?: readonly MarkdownPlugin[]
}

function analyzeMarkdown(source: string, options?: AnalyzeMarkdownOptions): MarkdownAnalysis
```

Use it for search indexing, link checks, and editor diagnostics. When `plugins` is supplied, the analyzer accepts `directiveNames` declared by plugins active for this source. Other unknown directives are returned in `directiveIssues`.

## Client enhancement interface

```ts
interface MarkdownEnhancement {
  ready: Promise<void>
  dispose(): void
}

function enhanceMarkdown(
  root?: ParentNode,
  assets?: Pick<MarkdownAssets, 'behaviors'>
): MarkdownEnhancement
```

Call `dispose()` before the host unmounts or replaces the page.
