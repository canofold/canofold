---
title: Upgrading Docfuse
description: Update project dependencies, review compatibility changes, and verify build and deployment output
group: Guide
subgroup: Delivery and operations
order: 45
---

# Upgrading Docfuse

Before upgrading, read the compatibility changes and upgrade steps for the target version in the [Changelog](https://github.com/jiangxinlei/docfuse/blob/main/CHANGELOG.md). If your project directly depends on `@docfuse/markdown` or `@docfuse/plugins`, review their versions and public entries as well.

Install an explicit project-local CLI release, commit the lockfile, and make sure `requiredVersion` includes that release:

```bash
pnpm add -D docfuse@<version>
pnpm exec docfuse check
pnpm exec docfuse build --no-cache
pnpm exec docfuse build
```

The first build bypasses old cache state and proves that the new release can generate a complete site from source. The second build verifies the persistent cache path.

## Pre-release checks

- Open the home page, deep routes, the 404 page, and static assets in the production preview.
- Confirm that search results are filtered by the current locale and documentation version.
- Verify redirects, canonical URLs, `hreflang`, and the sitemap against the deployment origin.
- If you publish AI artifacts, make sure consumers can read `ai/manifest.json` and its declared shards.
- Check light and dark modes, keyboard navigation, and the mobile layout for regressions.

Deploy the new output only after these checks pass. Follow the target version's Changelog when a release requires migration steps.
