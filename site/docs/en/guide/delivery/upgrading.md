---
title: Upgrading Canofold
description: Update project dependencies, review compatibility changes, and verify build and deployment output
group: Guide
subgroup: Delivery and operations
order: 45
---

# Upgrading Canofold

Before upgrading, read the compatibility changes and upgrade steps for the target version in the [Changelog](https://github.com/canofold/docfuse/blob/main/CHANGELOG.md). If your project directly depends on `@canofold/markdown` or `@canofold/plugins`, review their versions and public entries as well.

Install an explicit project-local CLI release, commit the lockfile, and make sure `requiredVersion` includes that release:

```bash
pnpm add -D canofold@<version>
pnpm exec canofold check
pnpm exec canofold build --no-cache
pnpm exec canofold build
```

The first build bypasses old cache state and proves that the new release can generate a complete site from source. The second build verifies the persistent cache path.

## Migrating from Docfuse 0.1

Canofold 0.2 is the renamed successor to Docfuse. Update all project-owned names together:

| Docfuse 0.1 | Canofold 0.2 |
| --- | --- |
| `docfuse` | `canofold` |
| `@docfuse/markdown` | `@canofold/markdown` |
| `@docfuse/plugins` | `@canofold/plugins` |
| `docfuse.config.*` | `canofold.config.*` |
| `.docfuse/` | `.canofold/` |

Install the successor packages, rename the configuration file, and run a clean build before deleting the old generated directory. The former npm packages remain available temporarily and will show a deprecation notice after the successor packages are published and verified.

## Pre-release checks

- Open the home page, deep routes, the 404 page, and static assets in the production preview.
- Confirm that search results are filtered by the current locale and documentation version.
- Verify redirects, canonical URLs, `hreflang`, and the sitemap against the deployment origin.
- If you publish AI artifacts, make sure consumers can read `ai/manifest.json` and its declared shards.
- Check light and dark modes, keyboard navigation, and the mobile layout for regressions.

Deploy the new output only after these checks pass. Follow the target version's Changelog when a release requires migration steps.
