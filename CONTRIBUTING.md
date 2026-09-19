# Contributing to Canofold

Thanks for helping improve Canofold. The repository is a pnpm workspace with four publishable packages:

- `@canofold/markdown` — Markdown/MDX React renderer, client enhancer, and shared theme contract.
- `canofold` — static documentation CLI and site generator.
- `@canofold/vite` — official Vite Demo Engine for component documentation.
- `@canofold/plugins` — official Markdown plugins and search providers.

## Development

Requirements: Node.js 22+ and pnpm 11.9+.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

Use `pnpm dev` for local package development. It runs the existing pnpm, Vite, tsup, TypeScript, and Tailwind watch modes directly; the repository does not maintain a second process supervisor or polling build system. Keep generated output, coverage, and local preview artifacts out of commits. Website development and deployment live in the [`canofold/website`](https://github.com/canofold/website) repository.

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
```

5. Use `type(scope): summary` commit messages and keep unrelated formatting or design changes out of the pull request.

Stable API changes require a compatibility note and a changelog entry. Internal compiler details, serialized HAST, `.cf-*` classes, and site-shell markup are not stable API unless explicitly documented.

Canofold is in stabilization mode. A new top-level configuration field, public export, plugin factory, or lifecycle hook requires a concrete current use case, focused contract tests, public documentation, and release-budget verification. Prefer improving reliability and diagnostics over expanding the capability surface.

For a release-impacting change, run `pnpm test:release`, update `CHANGELOG.md`, inspect the packed packages, and verify the published documentation in the Website repository’s current desktop and mobile browsers. The [public API policy](https://canofold.dev/en/reference/api/public-api/) defines the supported surface. A new dependency needs a trust, license, and size justification; executable configuration or extension changes need an explicit security-boundary review.

## Release process

1. Set the same version in all four package manifests and add the matching section to `CHANGELOG.md`.
2. Merge the release change into `main` only after `pnpm test:release` and the pull-request checks pass.
3. Create and push a `v<version>` tag from the resulting `main` commit.
4. The `Release` workflow verifies metadata, rebuilds and tests the repository, and stages `@canofold/markdown`, `canofold`, `@canofold/vite`, and `@canofold/plugins` in dependency order with provenance.
5. Review the four staged packages on npm and approve them with 2FA. The workflow creates the GitHub release only after all four versions are publicly available.

The first `v0.1.0` publication used a temporary bypass-2FA token because npm cannot stage or configure Trusted Publishing for package records that do not yet exist. Bootstrap any newly introduced package, including `@canofold/vite`, the same way exactly once, then remove the token and repository secret immediately after verifying the package and provenance. Existing package records must use `release.yml` as their GitHub Actions Trusted Publisher with stage-only permission; CI authenticates through OIDC, and a maintainer must review and approve every staged package with npm 2FA before it becomes public.

## Pull requests

A pull request should explain the problem, the chosen design, compatibility impact, security implications, and the commands that passed. Do not include secrets, generated `dist/` output, screenshots from retired visual baselines, or user content that was not intended for publication.

Participation is governed by the [Code of Conduct](./CODE_OF_CONDUCT.md). Usage questions and reporting expectations are described in [SUPPORT.md](./SUPPORT.md).
