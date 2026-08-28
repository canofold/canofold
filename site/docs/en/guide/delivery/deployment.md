---
title: Deploy the static site
description: Publish the Docfuse output directory to any static hosting platform
group: Guide
subgroup: Delivery and operations
order: 42
---

# Deploy the static site

Docfuse is host-independent. The build command is `pnpm docs:build` and the default publish directory is `.docfuse/dist/`.

## Generate host guidance

```bash
pnpm exec docfuse deploy
```

This writes platform examples and instructions under `.docfuse/deploy/`. It does not create an account, upload files, or modify a remote environment.

## Platform settings

| Platform | Build command | Output directory |
|---|---|---|
| GitHub Pages | `pnpm docs:build` | `.docfuse/dist` |
| Cloudflare Pages | `pnpm docs:build` | `.docfuse/dist` |
| Vercel | `pnpm docs:build` | `.docfuse/dist` |
| Netlify | `pnpm docs:build` | `.docfuse/dist` |
| Nginx / object storage | Upload after CI build | `.docfuse/dist` |

The host must serve directory `index.html` files and must not use an SPA fallback. For a subpath deployment, set a matching `basePath`, such as `/project/`, in both Docfuse and the CDN or reverse proxy.

Translate generated `redirects.json` into platform 301/308 rules. See [Security boundaries](/en/reference/output/security/) for private documentation and CSP.
