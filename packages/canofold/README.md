# Canofold

English | [简体中文](./README.zh-CN.md)

`canofold` is the CLI for the Canofold knowledge and documentation platform. It reads Markdown, MDX, and project-local React components, then builds navigation, search, multilingual routes, versioned pages, and AI-ready knowledge output into deployable static HTML.

## Install

Node.js 22 or newer is required. Install Canofold as a project-local development dependency:

```bash
pnpm add -D canofold @canofold/themes
pnpm exec canofold init --locale en
pnpm exec canofold dev
```

`init` creates `docs/` and a typed `canofold.config.ts`. Add the commands you use regularly to `package.json`; use `pnpm exec canofold ...` for an ad-hoc local invocation.

## Commands

- `init` creates or adopts a documentation project.
- `dev` starts the development server.
- `check` validates configuration, content, routes, and plugin-owned syntax.
- `build` writes the production site to `.canofold/dist/`.
- `preview` serves the production output locally.
- `clean` removes generated output and persistent build state.
- `deploy` writes deployment guidance for the current project.

## Visual themes

Import and order the themes readers can use in `canofold.config.ts`:

```ts
import { canofold, neoBrutalist, neumorphism } from '@canofold/themes'
import { defineConfig } from 'canofold'
import aurora from '@acme/canofold-theme'

export default defineConfig({
  themes: [canofold, neoBrutalist, neumorphism, aurora]
})
```

The first appearance of the first entry is the default. Readers can switch without reloading, and their selection persists across pages. Each definition owns its stable id, localized name, CSS entries, and appearances. `canofold` provides light and dark appearances; every other official theme provides one. Omitting `themes` uses `canofold`. The [`@canofold/themes`](../themes/README.md) package lists all official definitions.

Official and third-party themes implement the same `ThemeDefinition` contract. Core neither exports nor registers themes: official definitions come from `@canofold/themes`, third-party definitions come from their own npm packages, and the site only places imported definitions in `themes`. Theme names belong to the definition rather than general `i18n.messages`; the latter only overrides interface copy for search, navigation, quick actions, Markdown interactions, and not-found pages. `branding` owns only `logo`, `logoDark`, and `favicon`; `layout` owns site geometry; visual tokens and theme-specific styles belong to the theme package. See [`@canofold/themes`](../themes/README.md) for the complete third-party contract.

## Navigation

Top navigation normally follows directory routes. For related documents kept at flat routes, add their exact paths to the navigation item's `activePaths`; those paths must point to generated pages. For example, `{ text: 'Components', link: '/button/', activePaths: ['/notice/', '/progress/'] }` keeps “Components” selected on the listed pages without changing their URLs.

## Output control and build report

The defaults retain all outputs from earlier releases. Turn off only the artifacts you do not want to publish:

```ts
import { defineConfig } from 'canofold'

export default defineConfig({
  markdownMirror: false, // per-page index.md beside the HTML page
  ai: {
    pageIndex: false, // ai/pages.json
    fullContent: false // ai/manifest.json and ai/content/**/*.jsonl
  }
})
```

The existing `search.enabled` and `ai.markdownIndex`, `ai.pageSummaries`, `ai.codeExamples`, `ai.llmsTxt`, and `ai.llmsFullTxt` switches remain independent. When Markdown mirrors are off, `ai/index.md` links to HTML pages and AI records omit `markdownPath`. When full-content shards are off, an overflowing `llms-full.txt` cannot point to a missing manifest: increase `ai.llmsFullMaxBytes`, disable `ai.llmsFullTxt`, or enable `ai.fullContent`.

Every `build` writes a concise terminal summary and a machine-readable `.canofold/cache/build-report.json`. The report includes page, locale and version counts; build mode, cache hit, reason, changed pages and duration; and each built-in logical output's enabled state, planned and actual paths, file count, bytes and missing paths. `additionalOutputs` accounts for actual files outside those built-in types, including user static assets and Extension outputs. `removedPaths` compares the current artifacts with the preceding valid manifest; `removalBaseline: false` means no such comparison was available, so the terminal does not claim a removal count. The report is build metadata outside the deployable output and contains no document bodies or secrets. Disabling an output is not access control: protect all remaining HTML, search and AI files at the hosting layer when content is private.

Canofold is a build tool, not a sandbox. MDX, local components, configuration, and extensions execute with build-process permissions and must come from reviewed sources.

See the [Canofold documentation](https://canofold.dev/en/guide/) for authoring, configuration, deployment, and troubleshooting.

License: MIT
