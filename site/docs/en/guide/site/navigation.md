---
title: Navigation and routing
description: Configure URLs, top navigation, recursive sidebars, and page order
group: Guide
subgroup: Site capabilities
order: 31
---

# Navigation and routing

Docfuse derives URLs and recursive sidebars from directories and accepts explicit top navigation per locale. This is the canonical navigation and routing page; see [Content structure](/en/guide/writing/content-structure/) for directory design.

## URL mapping

```text
docs/index.md                                  → /
docs/guide/getting-started.md                  → /guide/getting-started/
docs/zh/index.md                               → /zh/
docs/zh/guide/getting-started.md               → /zh/guide/getting-started/
```

Each page produces a directory-style `index.html` and a Markdown mirror. The default locale has no prefix; other locales keep one. `basePath` prefixes every internal route.

## Top navigation

```ts title="docfuse.config.ts"
import { defineConfig } from 'docfuse'

export default defineConfig({
  i18n: { defaultLocale: 'en', locales: ['en', 'zh'] },
  navigation: {
    en: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Reference', link: '/reference/' },
      { text: 'Markdown SDK', link: '/markdown/' }
    ],
    zh: [
      { text: '指南', link: '/zh/guide/' },
      { text: '参考', link: '/zh/reference/' },
      { text: 'Markdown SDK', link: '/zh/markdown/' }
    ]
  }
})
```

This example assumes English is the default locale. If `zh` is the default, remove `/zh/` from Chinese routes and add `/en/` to English routes.

A `link` is either an absolute site route or an HTTP(S) URL. When a locale has no explicit navigation, Docfuse derives it from first-level content sections. A missing internal target fails checks or builds.

## Recursive sidebar

The first directory below a locale maps to a top navigation section; later directories recursively become groups. Any directory `index.md` can provide its title and initial `collapsed` state. Ancestors of the current page open automatically. The content tree has no depth limit; only visual indentation is capped.

## Page order

Within one version and locale, pages sort by Frontmatter `order` and then a stable URL order. Previous/next links use the same sequence. Prefer spaced values such as 10, 20, and 30.

For embedded documentation, `layout: { header: false }` removes only the header while retaining content, sidebar, and outline.
