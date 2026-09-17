# @canofold/vite

The official React + Vite Demo Engine for Canofold. It reuses the component project's Vite configuration, plugins, aliases, and CSS dependency graph to provide live previews, HMR, and production bundles for component examples in ordinary Markdown. The current release supports React 18 and React 19.

```ts
import { defineConfig } from 'canofold'
import { vite } from '@canofold/vite'

export default defineConfig({
  demos: {
    engine: vite()
  }
})
```

Run `canofold dev`; Vite is mounted on the same development server and port.

Demos render inline by default. `sandbox="iframe"` places trusted local demo code in a restricted iframe for DOM and global-style isolation; it is not a security boundary for untrusted code.
