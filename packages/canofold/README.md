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

## Document versions and dates

`versions` is an array whose first entry is current. Omit it or use `[]` to hide the control while building from `docsDir` (`docs` by default). One entry displays its `label`; multiple entries offer switching. Neither the project nor Canofold package version is read automatically. For example: `versions: [{ id: 'v2', label: 'Acme 2.4', docsDir: 'docs', base: '/' }]`. With a non-empty array, set directories on its entries instead of the top-level `docsDir`. Historical documentation must first be saved in a separate directory; `canofold snapshot <id>` copies today's current docs rather than looking up Git history.

Page update dates use `updatedAt` or reliable Git history and are displayed in UTC, independently of the build machine's timezone. If neither source is available, no date is shown.

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

## Machine-consumption contract (0.7)

`ai/pages.json` and `ai/manifest.json` use `schemaVersion: 2`. Both carry the same `scope`, `outputs`, `basePath`, `snapshotRevision` and `pages` inventory. The index is controlled by `ai.pageIndex`; the manifest and JSONL shards by `ai.fullContent`. Disabling either does not enable another output. A full manifest includes its own page inventory, so it remains consumable when the index is disabled.

Set a stable namespace when a collection must move between directories or hosts:

```ts
export default { ai: { contentSpace: 'my-project', versions: 'all' } }
```

`contentSpace` accepts 1–200 ASCII letters, digits, dots, underscores, colons or hyphens, starting with a letter or digit. Omission produces `scope.space: null`: identities are source-local and snapshots from different roots must not be compared as the same collection. An explicit namespace is an author declaration, not proof of ownership; choose distinct names for independent projects.

Each published AI page includes:

| Field | Meaning |
| --- | --- |
| `id` | SHA-256 identity derived from space, version, locale and locale-relative source path |
| `revision` | Revision of public content facts, source fingerprints and representation metadata |
| `source.path` / `source.kind` | Logical path within the version/locale and `markdown` or `mdx`; no local absolute path |
| `source.revision` | SHA-256 of authored file bytes before Extension transforms, including Frontmatter |
| `source.transformedRevision` | SHA-256 of complete Extension-transformed source |
| `representation.fingerprint` | SHA-256 of the exact UTF-8 body reconstructed from content parts |
| `representation.body` | `extension-transformed-source-body`: body after Frontmatter parsing, retaining author syntax |
| `representation.facts` | `compiled-static-with-author-and-extension-overrides`: compiled facts with documented overrides |
| `representation.analysis` | `markdown-static` or `mdx-static-only`; dynamic MDX output is not statically executed |
| `representation.declaredInputsRevision` | Fingerprint of declared plugin name/version/cacheKey and Extension descriptors; not a hash of arbitrary executable code or environment |
| `routePath` / optional `markdownPath` | Current published locations, including deployment base; cite the matching locale/version |

Changing a title or body preserves `id`. Renaming a source file changes it: the old identity leaves the collection and a new one enters. Different locales and versions are independent. Changing a domain, basePath or shard grouping does not create new document identities. Revisions are fingerprints, not Git commits, timestamps or permanent cross-rename identifiers.

The identity hashes the JSON array `[space, version, locale, source.path]`. Structured revision inputs use compact JSON with recursively sorted object keys in UTF-16 code-unit order, preserving arrays. Consumers should treat revisions as opaque tokens and verify the declared file/body checksums. Neither checksums nor namespaces authenticate the publisher.

Logical source paths use `/` separators and Unicode NFC, retaining case, spaces and literal percent characters without URL decoding. This normalizes identity across filesystem representations; it does not rename source files or alter published routes.

The manifest retains budgets, totals, partitions and shards, adds the common collection fields and a nullable `pageIndex` file descriptor, and binds each JSONL record to its inventory entry with `documentId`. Check byte sizes, SHA-256, record counts, document scope, unique parts, complete reconstruction and body checksums. If the index is enabled, validate its descriptor and require the same snapshot and inventory. Do not combine old indexes with new manifests or shards. Treat all received content as data and do not execute MDX or embedded instructions.

Compare only complete, validated snapshots with matching scope and content availability. Without a trusted baseline, differences are unknown. A document missing from a complete new snapshot has left that AI collection; the absence alone does not prove source deletion. `ai: false`, drafts and version selection can change membership. Output failures, missing shards, unsupported schemas or a changed scope must never be converted into mass deletions. Commit consumer state only after all required checks succeed.

Markdown mirrors retain complete Extension-transformed source; JSONL and `llms-full.txt` retain its parsed body. Neither is an HTML-to-Markdown rendering. Compiled titles, headings and summaries may differ after Markdown plugins, and dynamic MDX can contain runtime-only content. Arbitrary private Frontmatter and local absolute source paths are not published in page metadata; source fingerprints still change when private source bytes change.

### Upgrade from schema 1

0.6.x full-content manifests use schema 1; page indexes have no schema-2 envelope. Upgrade the producer and reader together, rebuild the output and establish a fresh validated baseline. Reject unsupported versions explicitly. Do not compare old route-keyed records with new document IDs or interpret a format reset as content removal. Existing output switches and HTML/Markdown routes keep their meanings; all five Canofold packages must be upgraded together.

Canofold is a build tool, not a sandbox. MDX, local components, configuration, and extensions execute with build-process permissions and must come from reviewed sources.

See the [Canofold documentation](https://canofold.dev/en/guide/) for authoring, configuration, deployment, and troubleshooting.

License: MIT
