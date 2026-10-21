# Contributing to Canofold

Thanks for helping improve Canofold. The repository is a pnpm workspace with five publishable packages:

- `@canofold/themes` — the public theme-definition contract, official visual themes, shared tokens, and site appearance.
- `@canofold/markdown` — Markdown/MDX React renderer, compiler, and client enhancer.
- `canofold` — static documentation CLI and site generator.
- `@canofold/vite` — official Vite Demo Engine for component documentation.
- `@canofold/plugins` — official Markdown plugins and search providers, plus server-only content adapters.

## Development

Runtime minimum: Node.js 22.12. Development with pnpm 11.9 requires Node.js 22.13+; the minimum-runtime CI job uses pnpm's official standalone distribution so project scripts still run on Node.js 22.12.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

Use `pnpm dev` to watch the local packages. For integrated Core source development with the sibling `../vite-component-playground` checkout, use `pnpm dev:playground`. This repository-only tool starts the package watchers, waits for completed output, and restarts or refreshes the preview when the relevant package changes. Its lifecycle check is `pnpm test:dev:playground`; stop other previews and package watchers before running it. Ordinary documentation and component authoring in the Playground uses `canofold dev` directly and does not require a separate startup script. After a fresh checkout, run `pnpm build` here before consuming linked packages.

Keep product behavior in its owning package. Repository scripts may orchestrate builds, development and verification, but must reuse package behavior rather than implement parallel configuration, validation, cache or server lifecycles. README files introduce the project or package and link to usage documentation; this file owns contributor workflows. User guides and configuration references live in Website, release behavior and migrations in `CHANGELOG.md`. Keep transient debugging and approval records out of these documents.

The repository builds and tests with Vite 8; `@canofold/vite` also supports Vite 6 and 7 in packed consumer projects, verified separately in CI. Keep generated output, coverage, and local preview artifacts out of commits. Website development and deployment live in the [`canofold/website`](https://github.com/canofold/website) repository.

## Changes

1. Create a focused branch from `main`.
   - Use a work-type prefix followed by a lowercase kebab-case summary.
   - Supported prefixes are `feature/`, `fix/`, `refactor/`, `docs/`, `test/`, `chore/`, and `ci/`.
   - For example: `feature/add-search-filter`, `fix/broken-anchor`, or `refactor/remove-monitoring`.
   - Branch names describe the change, not the contributor or tool; do not use personal or agent-specific prefixes.
2. Read the relevant [public documentation](https://canofold.dev) and inspect the affected package before changing package boundaries or exports.
3. Add or update a focused test before changing behavior.
4. Run the narrowest relevant checks, then the release checks for public API or build changes:

```bash
pnpm format:check
pnpm typecheck
pnpm test:architecture
pnpm test:browser-consumer
pnpm test:react-matrix
pnpm test:packed-cli
VITE_VERSION=8.0.0 pnpm test:packed-cli
pnpm audit:dependencies
pnpm report:bundles
pnpm report:package
pnpm benchmark:enterprise
pnpm benchmark:demos
```

`pnpm benchmark:demos` exercises a disposable component library with 76 pages and 456 Demos by default, using the built-in Compact search provider. It includes tables, forms, trees, Portal dialogs, Context, CSS Modules, lazy modules, icons, a shared export barrel and API documentation. `CANOFOLD_BENCHMARK_PAGES` and `CANOFOLD_BENCHMARK_DEMOS` select larger workloads (at least four pages and four Demos per page); use 150/8 and 300/8 for the larger regression tiers. Each run starts without Canofold/Vite caches and measures both server readiness and the first browser page, then restarts twice with caches retained. Chromium checks cover interactions, iframe isolation, highlighted source, immediate CSS HMR, consecutive document/Demo edits, burst saves and failure recovery. Server RSS and browser heap samples accompany the edit measurements. Cold here means application caches, not a cleared operating-system disk cache. A startup exceeding 60 seconds fails explicitly; it does not produce a cached-start result. Install Chromium before running it (`pnpm exec playwright install chromium`). Use this component workload alongside the enterprise text/search benchmark when changing development or Demo dependency processing; neither replaces the other.

For diagnosis only, `node scripts/benchmark-demos.mjs --observe-slow` continues an over-limit startup for at most 180 seconds to measure subsequent cached starts. It still exits with failure if any startup exceeded the unchanged 60-second limit; observational completion is not a passing performance result.

5. Use `type(scope): summary` commit messages and keep unrelated formatting or design changes out of the pull request.

Stable API changes require a compatibility note and a changelog entry. Internal compiler details, serialized HAST, `.cf-*` classes, and site-shell markup are not stable API unless explicitly documented.

Canofold is in stabilization mode. A new top-level configuration field, public export, plugin factory, or lifecycle hook requires a concrete current use case, focused contract tests, public documentation, and release-budget verification. Prefer improving reliability and diagnostics over expanding the capability surface.

For a release-impacting change, run `pnpm test:release`, update `CHANGELOG.md`, inspect the packed packages, and verify the published documentation in the Website repository’s current desktop and mobile browsers. The [public API policy](https://canofold.dev/en/reference/api/public-api/) defines the supported surface. A new dependency needs a trust, license, and size justification; executable configuration or extension changes need an explicit security-boundary review.

Before the first site-browser run, install the supported browser binaries with `pnpm exec playwright install chromium firefox webkit` (use `--with-deps` on Linux). `pnpm test:release` combines `pnpm test:release:checks` with the shared header suite against a clean consumer installed from the five candidate tarballs; `pnpm test:site-browser` runs that packed-consumer check independently. CI and tag releases run the Node checks and three browser projects as independent required jobs; `pnpm test:site-browser --project=webkit` selects a single project through Playwright's native CLI. Publishing requires every job to pass. `pnpm test:playground-navigation ../vite-component-playground` runs the same input and assertions against the Playground's linked packages, using a disposable directory beneath its ignored `.canofold/` without modifying its configuration or authored files. The suite covers both locales, home/document pages, every official appearance, responsive boundaries, all header menus, search and sidebar behavior. It has no automatic retries. Candidate regressions must pass before creating a release tag; Website checks after publication are an additional check, not the first browser gate.

## Release process

1. Set the same version in all five package manifests and add the matching section to `CHANGELOG.md`.
2. Merge the release change into `main` only after `pnpm test:release` and the pull-request checks pass.
3. Create and push a `v<version>` tag from the resulting `main` commit.
4. The `Release` workflow verifies metadata, rebuilds and tests the repository, and stages `@canofold/themes`, `@canofold/markdown`, `canofold`, `@canofold/vite`, and `@canofold/plugins` in dependency order with provenance.
5. Review the five staged packages on npm and approve them with 2FA. The workflow creates the GitHub release only after all five versions are publicly available.

All five package records use `release.yml` as their GitHub Actions Trusted Publisher with stage-only permission. CI authenticates through OIDC; a maintainer reviews and approves every staged package with npm 2FA before it becomes public.

## Pull requests

A pull request should explain the problem, the chosen design, compatibility impact, security implications, and the commands that passed. Do not include secrets, generated `dist/` output, screenshots from retired visual baselines, or user content that was not intended for publication.

Participation is governed by the [Code of Conduct](./CODE_OF_CONDUCT.md). Usage questions and reporting expectations are described in [SUPPORT.md](./SUPPORT.md).
