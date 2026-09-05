---
title: Quick start
description: Create and preview a first Canofold site
group: Guide
subgroup: Introduction
order: 4
---

# Quick start

First, [install Canofold](/en/guide/introduction/installation/) in your project.

::::steps[Create the site]
:::step[Initialize]

Run this command from the project root:

```bash
pnpm exec canofold init --locale en
```

It creates `canofold.config.ts`, `docs/index.md`, and a type declaration without overwriting existing content.
:::

:::step[Add scripts]

```json title="package.json"
{
  "scripts": {
    "docs:dev": "canofold dev",
    "docs:check": "canofold check",
    "docs:build": "canofold build",
    "docs:preview": "canofold preview"
  }
}
```
:::

:::step[Start the development server]

```bash
pnpm docs:dev
```

Open the printed URL and edit `docs/index.md`.
:::
::::

## Build the site

```bash
pnpm docs:check
pnpm docs:build
pnpm docs:preview
```

Static files are written to `.canofold/dist/`. Continue with [content structure](/en/guide/writing/content-structure/), [theming](/en/guide/site/customization/), or [deployment](/en/guide/delivery/deployment/).
