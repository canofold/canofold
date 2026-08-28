---
title: Quick start
description: Create and preview a first Docfuse site
group: Guide
subgroup: Introduction
order: 3
---

# Quick start

First, [install Docfuse](/en/guide/introduction/installation/) in your project.

::::steps[Create the site]
:::step[Initialize]

Run this command from the project root:

```bash
pnpm exec docfuse init --locale en
```

It creates `docfuse.config.ts`, `docs/index.md`, and a type declaration without overwriting existing content.
:::

:::step[Add scripts]

```json title="package.json"
{
  "scripts": {
    "docs:dev": "docfuse dev",
    "docs:check": "docfuse check",
    "docs:build": "docfuse build",
    "docs:preview": "docfuse preview"
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

Static files are written to `.docfuse/dist/`. Continue with [content structure](/en/guide/writing/content-structure/), [theming](/en/guide/site/customization/), or [deployment](/en/guide/delivery/deployment/).
