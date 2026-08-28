---
title: Build extensions
description: Use the Extension API to transform source, enrich pages, or emit extra files
group: Guide
subgroup: Site capabilities
order: 37
---

# Build extensions

An extension is a project-local Node.js build module. It can replace source before Markdown parsing, adjust page metadata before search and AI output, or emit extra files while the site is built.

Extensions do not add Markdown syntax or browser components. They are for repository-wide build rules such as replacing release-channel placeholders, adding search terms to every page, or writing a manifest for another system.

| Requirement | Use |
|---|---|
| New Markdown syntax, math, or diagrams | Markdown plugin |
| Search index | Search provider |
| Theme and browser interaction | Theme config, CSS, or React components |
| Source placeholders, page metadata, or extra artifacts | Extension |

The project owns extension files and registers them from the site configuration:

:::file-tree
- docfuse.config.ts
- extensions/
  - release-notes.ts
:::

## When an extension runs

`docfuse check`, `docfuse build`, and `docfuse dev` all load extensions. `transformSource` and `extendPage` take part in checking and building content. `generate` runs only when `build` or `dev` writes site output. `docfuse preview` serves existing output and does not run extensions.

::::steps[Build lifecycle]
:::step[Transform source]
After reading each Markdown or MDX file, Docfuse calls `transformSource`. The returned source continues into Markdown analysis and rendering.
:::
:::step[Extend the page]
After title, description, body, and route are known, Docfuse calls `extendPage`. The hook can change public metadata and search or AI inclusion.
:::
:::step[Generate files]
After all pages are complete, Docfuse calls `generate`. The extension can write only predeclared outputs through `emitFile`.
:::
::::

Multiple extensions run in configuration order. Source and page changes returned by one extension are passed to the next.

## Create an extension

```ts title="extensions/release-notes.ts"
import { defineExtension } from 'docfuse'

export default defineExtension((options) => {
  const channel = typeof options.channel === 'string' ? options.channel : 'stable'

  return {
    apiVersion: 1,
    name: 'release-notes',
    outputs: ['manifest.json'],
    transformSource({ source }) {
      return source.replaceAll('{{channel}}', channel)
    },
    extendPage(page) {
      return { searchText: `${page.searchText} ${channel} release` }
    },
    async generate({ pages, emitFile }) {
      await emitFile('manifest.json', JSON.stringify({ channel, pages: pages.length }))
    }
  }
})
```

## Register the extension

```ts title="docfuse.config.ts"
import { defineConfig } from 'docfuse'

export default defineConfig({
  extensions: [
    {
      resolve: './extensions/release-notes.ts',
      options: { channel: 'stable' }
    }
  ]
})
```

`resolve` must be a project-relative path and `options` must be JSON-serializable.

Add the placeholder to a document:

```markdown title="docs/releases.md"
# Release notes

Current channel: {{channel}}
```

## Run and verify

```bash
pnpm docs:check
pnpm docs:build
pnpm docs:preview
```

Verify these results:

1. `/releases/` displays `Current channel: stable`.
2. Searching for `stable release` finds the page.
3. `/extensions/release-notes/manifest.json` returns the generated JSON. The file is stored at `.docfuse/dist/extensions/release-notes/manifest.json`.

`docs:check` runs the first two hooks but does not write `manifest.json`. Run `docs:build` or `docs:dev` to verify `generate`.

## Hooks

| Hook | Input | Return or output |
|---|---|---|
| `transformSource` | Current source, path, version, locale, and file kind | The complete source string passed to the compiler |
| `extendPage` | Analyzed title, description, body, route, and frontmatter | A partial change to title, description, search text, or search/AI inclusion |
| `generate` | All completed pages and `emitFile` | Files predeclared in `outputs` |

An extension can only write declared output beneath `extensions/{name}/`; missing, extra, or duplicate writes fail the build. Extensions have the build process's permissions and are not a sandbox, so register only reviewed local modules and dependencies. For loading and output errors, see [Troubleshooting](/en/reference/output/troubleshooting/#an-extension-fails-to-load-or-generate-output).
