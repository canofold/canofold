---
title: Redirects
description: Preserve stable entry points when public pages move
group: Guide
subgroup: Site capabilities
order: 35
---

# Redirects

Once a page is public, configure its old URL before moving the file:

```ts title="docfuse.config.ts"
import { defineConfig } from 'docfuse'

export default defineConfig({
  redirects: {
    '/getting-started/': '/guide/introduction/getting-started/',
    '/v1/install/': '/v1/guide/install/'
  }
})
```

Sources and targets are absolute internal routes before `basePath` is applied. A build rejects a source that shadows a real page, a missing target, a redirect loop, or a redirect chain.

Output includes a static fallback page and `redirects.json`. The page works on generic static hosting, but production should translate the manifest into platform 301/308 rules to avoid a browser-side hop. Before deleting old content, run `pnpm docs:check` and verify the old URL, final status, and canonical URL.
