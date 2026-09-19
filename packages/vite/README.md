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

Canofold and Vite share one HTTP server, and a development session creates only one long-lived Vite server. Vite's module graph watches components, styles, and Demo dependencies and delivers their HMR updates; Canofold continues to rebuild Markdown and Canofold configuration inputs.

No documentation-specific Vite configuration is required. `@canofold/vite` reuses the project's existing `vite.config`, plugins, aliases, React resolution, TypeScript/JSX settings, and CSS pipeline. Demos should import components through the package name or aliases the project already uses. Component CSS belongs in the component or Demo dependency graph, not in Canofold's site-level `styles` list.

For a standard component library with a package name and one `build.lib.entry`, Canofold resolves the package name to that source entry when no same-name alias exists, so the entry does not need to be repeated as an alias. Multi-entry libraries and workspaces are not inferred and keep using their existing exports or aliases.

Production uses one Vite graph for the Markdown browser enhancer, Demo runtime, and project components. The component project owns React and React DOM resolution, while Vite deduplicates them and splits Demo JavaScript and CSS on demand instead of placing every example in the entry chunk. That graph emits a lightweight Markdown entry and a Demo entry: pages without Demos do not statically load React for native Markdown behavior, while Demo pages reuse the enhancer from the Demo entry.

Use `demos.setup` only for shared providers, themes, internationalization, or routing context. Ordinary components do not need it.

Demos render inline by default. `sandbox="iframe"` places trusted local demo code in a restricted iframe for DOM and global-style isolation; it is not a security boundary for untrusted code.
