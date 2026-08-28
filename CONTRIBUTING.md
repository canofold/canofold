# Contributing to Docfuse

Thanks for helping improve Docfuse. The repository is a pnpm workspace with three publishable packages:

- `@docfuse/markdown` — Markdown/MDX React renderer, client enhancer, and shared theme contract.
- `docfuse` — static documentation CLI and site generator.
- `@docfuse/plugins` — official Markdown plugins and search providers.

## Development

Requirements: Node.js 22+ and pnpm 11.9+.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build:site
```

Use `pnpm dev` for package/site integration work and `pnpm dev:site` for documentation-only changes. Keep generated output, coverage, and local preview artifacts out of commits.

## Changes

1. Create a focused branch from `main`.
2. Read the relevant [public documentation](./site/docs/en/index.md) and inspect the affected package before changing package boundaries or exports.
3. Add or update a focused test before changing behavior.
4. Run the narrowest relevant checks, then the release checks for public API or build changes:

```bash
pnpm format:check
pnpm typecheck
pnpm test:architecture
pnpm test:browser-consumer
pnpm test:e2e
pnpm test:packed-cli
pnpm audit:dependencies
pnpm build:site:clean
pnpm audit:site
pnpm report:site
pnpm report:bundles
pnpm report:package
pnpm benchmark:enterprise
```

`pnpm test:e2e` builds and previews the documentation site automatically. Before the first local run, install the test browser with `pnpm exec playwright install chromium`; CI installs it automatically.

5. Use `type(scope): summary` commit messages and keep unrelated formatting or design changes out of the pull request.

Stable API changes require a compatibility note and a changelog entry. Internal compiler details, serialized HAST, `.df-*` classes, and site-shell markup are not stable API unless explicitly documented.

Docfuse is in stabilization mode. A new top-level configuration field, public export, plugin factory, or lifecycle hook requires a concrete current use case, focused contract tests, public documentation, and release-budget verification. Prefer improving reliability and diagnostics over expanding the capability surface.

For a release-impacting change, run `pnpm test:release`, update `CHANGELOG.md`, inspect the packed packages, and verify the generated site in current desktop and mobile browsers. The [public API policy](https://docfuse.dev/en/reference/api/public-api/) defines the supported surface. A new dependency needs a trust, license, and size justification; executable configuration or extension changes need an explicit security-boundary review.

## Pull requests

A pull request should explain the problem, the chosen design, compatibility impact, security implications, and the commands that passed. Do not include secrets, generated `dist/` output, screenshots from retired visual baselines, or user content that was not intended for publication.

Participation is governed by the [Code of Conduct](./CODE_OF_CONDUCT.md). Usage questions and reporting expectations are described in [SUPPORT.md](./SUPPORT.md).
