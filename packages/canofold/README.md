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

Canofold is a build tool, not a sandbox. MDX, local components, configuration, and extensions execute with build-process permissions and must come from reviewed sources.

See the [Canofold documentation](https://canofold.dev/en/guide/) for authoring, configuration, deployment, and troubleshooting.

License: MIT
