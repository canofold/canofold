# Docfuse

English | [简体中文](./README.zh-CN.md)

Docfuse is a static documentation CLI for Markdown, MDX, and project-local React components. It builds navigation, search, multilingual routes, versioned pages, and AI-readable artifacts into deployable static HTML.

## Install

Node.js 22 or newer is required. Install Docfuse as a project-local development dependency:

```bash
pnpm add -D docfuse
pnpm exec docfuse init --locale en
pnpm exec docfuse dev
```

`init` creates `docs/` and a typed `docfuse.config.ts`. Add the commands you use regularly to `package.json`; use `pnpm exec docfuse ...` for an ad-hoc local invocation.

## Commands

- `init` creates or adopts a documentation project.
- `dev` starts the development server.
- `check` validates configuration, content, routes, and plugin-owned syntax.
- `build` writes the production site to `.docfuse/dist/`.
- `preview` serves the production output locally.
- `clean` removes generated output and persistent build state.
- `deploy` writes deployment guidance for the current project.

Docfuse is a build tool, not a sandbox. MDX, local components, configuration, and extensions execute with build-process permissions and must come from reviewed sources.

See the [Docfuse documentation](https://docfuse.dev/en/guide/) for authoring, configuration, deployment, and troubleshooting.

License: MIT
