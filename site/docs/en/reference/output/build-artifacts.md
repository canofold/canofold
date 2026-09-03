---
title: Build artifacts
description: Understand generated pages, assets, search, SEO, AI, and redirect files
group: Reference
subgroup: Output and Quality
order: 71
---

# Build artifacts

`canofold build` writes `.canofold/dist` by default. A full build writes to a temporary directory and atomically replaces the existing output only after success, so a failed build preserves the last successful site.

:::file-tree
- .canofold/
  - dist/
    - index.html
    - 404.html
    - assets/
      - canofold.css
    - search/
      - {version}/
        - {locale}.json
    - ai/
      - manifest.json
      - content/
        - {version}/
          - {locale}/
            - *.jsonl
    - llms.txt
    - llms-full.txt
    - sitemap.xml
    - robots.txt
    - redirects.json
    - guide/
      - .../
        - index.html
        - index.md
:::

Every built page has static HTML and adjacent Markdown source. Native DOM owns basic interactions. React loads on demand for sortable tables, image previews, and galleries, while diagram clients are loaded by their plugins. KaTeX CSS and fonts are emitted only when the math plugin is enabled and a page contains math.

| Artifact | Condition | Purpose |
|---|---|---|
| Page `index.html` | Always | Static page containing the complete rendered body |
| Page `index.md` | Always | Markdown or MDX source used by the build after source extensions run |
| `assets/canofold.css` | Always | Site shell, semantic tokens, and configured styles |
| `assets/canofold-markdown/*` | A page needs browser behavior | Native enhancer and lazy rich interactions |
| `assets/fonts/*` | The math plugin is enabled and at least one page contains math | Complete KaTeX WOFF2 font set |
| `search/*` | The default compact provider is enabled | Version- and locale-scoped single-file indexes |
| `pagefind/*` | `pagefind()` is configured | Chunked locale/version-aware index |
| `robots.txt` | Always | Search crawler policy |
| `sitemap.xml` | `siteUrl` is configured | Absolute public URL list |
| `redirects.json` | Redirects are configured | Hosting-platform redirect manifest |
| `ai/pages.json` | Always | Basic AI page index scoped by `ai.versions` |
| `ai/manifest.json`, `ai/content/*` | Always for AI-included pages | Versioned and bounded AI corpus shards |
| Other `ai/*`, `llms*.txt` | Corresponding AI option is enabled | Optional AI and retrieval formats |

The built-in compact provider writes `search/`; the optional Pagefind plugin writes `pagefind/` instead. `robots.txt` and `ai/pages.json` are always generated. `sitemap.xml` requires
`siteUrl`; search indexes, redirects, the remaining compatibility AI files, and `llms*.txt` follow
their corresponding configuration. `ai/manifest.json` and bounded content shards are always
generated for included AI pages.
