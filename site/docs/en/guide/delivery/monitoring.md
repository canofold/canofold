---
title: Production monitoring
description: Collect browser errors and performance data with the Sentry Browser Loader
group: Guide
subgroup: Delivery and operations
order: 44
---

# Production monitoring

Docfuse can load the Sentry Browser Loader and send browser errors and performance data to your Sentry project. Docfuse does not receive or store that data.

```ts title="docfuse.config.ts"
import { defineConfig } from 'docfuse'

export default defineConfig({
  monitoring: {
    provider: 'sentry',
    loaderUrl: 'https://js.sentry-cdn.com/PROJECT_KEY.min.js',
    environment: 'production',
    release: 'docs@2.4.0',
    tracesSampleRate: 0.05
  }
})
```

`loaderUrl` must use the `https://js.sentry-cdn.com` host; configuration validation rejects other HTTPS origins. Use `environment` to separate previews and production, align `release` with the documentation version or commit, and set `tracesSampleRate` from traffic, privacy, and budget constraints.

Before launch, trigger one controlled client error and confirm the correct environment and release. Add the loader host to CSP `script-src` and `connect-src`. See [Security boundaries](/en/reference/output/security/) for the complete policy.
