# Canofold

English | [简体中文](./README.zh-CN.md)

`canofold` is the CLI for the Canofold knowledge and documentation platform. It reads Markdown, MDX, and project-local React components, then builds navigation, search, multilingual routes, versioned pages, and AI-ready knowledge output into deployable static HTML.

## Install

Node.js 22 or newer is required. Install Canofold as a project-local development dependency:

```bash
pnpm add -D canofold
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

Every `build` writes a concise terminal summary and a machine-readable `.canofold/cache/build-report.json`. The report includes page, locale and version counts; build mode, cache hit, reason, changed pages and duration; and each built-in logical output's enabled state, planned and actual paths, file count, bytes and missing paths. `removedPaths` compares the current artifacts with the preceding valid manifest; `removalBaseline: false` means no such comparison was available. The report is build metadata outside the deployable output and contains no document bodies or secrets. Disabling an output is not access control: protect all remaining HTML, search and AI files at the hosting layer when content is private.

Canofold is a build tool, not a sandbox. MDX, local components, configuration, and extensions execute with build-process permissions and must come from reviewed sources.

See the [Canofold documentation](https://canofold.dev/en/guide/) for authoring, configuration, deployment, and troubleshooting.

License: MIT
