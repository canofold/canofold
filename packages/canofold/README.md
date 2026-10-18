# Canofold

English | [简体中文](./README.zh-CN.md)

`canofold` is the CLI for the Canofold knowledge and documentation platform. It reads Markdown, MDX, project-local React components and explicitly configured content sources, then builds navigation, search, multilingual routes, versioned pages, and AI-ready knowledge output into deployable static HTML.

## Install

Node.js 22.12 or newer is required. Install Canofold as a project-local development dependency:

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

## Document versions and dates

`versions` is an array whose first entry is current. Omit it or use `[]` to hide the control while building from `docsDir` (`docs` by default). One entry displays its `label`; multiple entries offer switching. Neither the project nor Canofold package version is read automatically. For example: `versions: [{ id: 'v2', label: 'Acme 2.4', docsDir: 'docs', base: '/' }]`. With a non-empty array, set directories on its entries instead of the top-level `docsDir`. Historical documentation must first be saved in a separate directory; `canofold snapshot <id>` copies today's current docs rather than looking up Git history.

Page update dates use `updatedAt` or reliable Git history and are displayed in UTC, independently of the build machine's timezone. If neither source is available, no date is shown.

## Output control and build report

`canofold dev` defaults to port 3333 and `canofold preview` to 4173. `--port <number>` selects the starting port; if occupied, the server tries higher ports up to 65535 and prints the actual address, including the site's `basePath`. Other listen errors fail immediately. Development cache hits do not print repeated summaries. Interactive terminals distinguish status levels with color; redirected output and `NO_COLOR` remain plain text.

Site, search, Markdown and AI outputs are enabled by default. Turn off the artifacts you do not want to publish:

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

## Machine-consumption contract (0.8)

`ai/pages.json` and `ai/manifest.json` use schema 3 for authored Markdown/MDX and source-derived OpenAPI pages. The manifest and verified JSONL shards provide complete content; the page index provides metadata. Their output switches are independent.

Declare `ai.contentSpace` when the same collection must move between directories or hosts. Consumers validate checksums, scope and a complete snapshot before updating state; a missing document means it left that collection, not necessarily that its source was deleted.

The authoritative [AI output reference](https://canofold.dev/en/reference/output/ai-output/) defines fields, identities, representations, integrity checks and snapshot comparison. [OpenAPI integration](https://canofold.dev/en/guide/writing/openapi/) covers local source setup, generated pages and supported boundaries.

### Upgrade from schema 1/2

Canofold 0.6.x uses schema 1 and 0.7.x uses schema 2. Upgrade the producer packages and Reader together, rebuild and establish a fresh trusted baseline. Schema 3 readers reject the older formats; do not interpret a format change as mass deletion. See [Upgrading](https://canofold.dev/en/guide/delivery/upgrading/).

Canofold is a build tool, not a sandbox. MDX, local components, configuration, and extensions execute with build-process permissions and must come from reviewed sources.

See the [Canofold documentation](https://canofold.dev/en/guide/) for authoring, configuration, deployment, and troubleshooting.

License: MIT
