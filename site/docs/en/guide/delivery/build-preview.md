---
title: Build and preview
description: Check content, build the site, and preview production output
group: Guide
subgroup: Delivery and operations
order: 41
---

# Build and preview

::::steps[Pre-deployment checks]
:::step[Check content]

```bash
pnpm docs:check
```

Checks config, frontmatter, code fences, internal links, static assets, routes, and translation gaps.
:::

:::step[Build the site]

```bash
pnpm docs:build
```

Static files are written to `.docfuse/dist/` by default.
:::

:::step[Preview production output]

```bash
pnpm docs:preview
```

Check the home page, deep routes, 404 page, search, locales, versions, and static assets.
:::
::::

Run `pnpm exec docfuse build --no-cache` to rule out stale cache state. Run `pnpm exec docfuse clean` to delete generated output and build state.

## Verify each capability

| Capability | What to verify |
|---|---|
| Markdown plugin | Pages show transformed math, diagrams, or HTML, with no browser console errors |
| Search provider | Search finds a new page, and `/search/` or `/pagefind/` assets are reachable |
| Extension | Source and page changes are visible, and declared files exist under `outputDir/extensions/{name}/` |
| Project assets | Images, fonts, and downloads work from deep routes without 404 responses |

When the build is ready, publish `.docfuse/dist/` using the [deployment guide](/en/guide/delivery/deployment/).
