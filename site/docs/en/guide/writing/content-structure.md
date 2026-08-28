---
title: Content structure
description: Build a recursive content tree and sidebar with directories and index.md
group: Guide
subgroup: Writing
order: 21
---

# Content structure

Docfuse derives URLs, sections, and a recursive sidebar from the file tree. This page owns the tree model; see [Frontmatter](/en/reference/configuration/frontmatter/) for page metadata.

## Directory rules

:::file-tree
- docs/
  - index.md
  - guide/
    - index.md
    - getting-started.md
    - advanced/
      - index.md
      - performance/
        - index.md
        - cache.md
  - zh/
    - index.md
:::

This layout assumes the default locale lives at `docs/` and Chinese is an alternate locale. A symmetric `docs/en/` + `docs/zh/` layout is also supported; see [Internationalization](/en/guide/site/internationalization/).

- `docs/index.md` is the default-locale home.
- Configured non-default locales live under `docs/{locale}/`.
- The first directory below a locale is a top navigation section. Later directories recursively become sidebar groups, with no hard-coded depth limit.
- Pages are ordered by `order`, then by a stable route sort.

## Name a directory with its index

Any directory can provide an `index.md`:

```yaml
---
title: Performance
description: Diagnose and improve performance
collapsed: true
---
```

`title` names that sidebar level and `collapsed` controls its initial state. Top sections may still use `group`, and the first nested level may still use `subgroup`; deeper levels use the directory index title. Visual indentation is capped, but the content structure is never flattened.

## Keep URLs stable

File and directory names enter the public URL. Before moving a published path, add a [redirect](/en/guide/site/redirects/). Run `pnpm docs:check` to detect duplicate routes, missing homes, and invalid internal links.
