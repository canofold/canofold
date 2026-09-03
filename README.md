# Canofold

English | [简体中文](./README.zh-CN.md)

Canofold is a static-first, minimally invasive, and extensible knowledge and documentation platform. It uses a unified content model to turn Markdown and MDX into multilingual, versioned websites, search indexes, and AI-ready knowledge outputs.

> **Migrating from Docfuse?** Canofold is its successor. Replace `docfuse` with `canofold`, `@docfuse/*` with `@canofold/*`, `docfuse.config.*` with `canofold.config.*`, and `.docfuse/` with `.canofold/`. The Docfuse packages remain available temporarily and will be deprecated only after the Canofold packages are published and verified.

## Packages

| Package | Use it when |
|---|---|
| `canofold` | You want to build and publish a complete documentation site |
| `@canofold/markdown` | You want to render Canofold Markdown inside a React application |
| `@canofold/plugins` | You need official Markdown plugins or the Pagefind search provider |

## Quick start

Node.js 22 or newer is required. Install the CLI as a project-local development dependency for teams and CI:

```bash
pnpm add -D canofold
pnpm exec canofold init --locale en
```

Put daily commands in project scripts:

```json
{
  "scripts": {
    "docs:dev": "canofold dev",
    "docs:check": "canofold check",
    "docs:build": "canofold build",
    "docs:preview": "canofold preview"
  }
}
```

```bash
pnpm docs:dev
```

The package manager resolves bare `canofold` inside scripts from `node_modules/.bin`. Use `pnpm exec canofold ...` for an ad-hoc local command. A bare command in an arbitrary shell requires a global install and a global bin directory on PATH. See [Installation and invocation](https://docfuse.dev/en/guide/introduction/installation/) for the complete model.

## Documentation

- [Guide](https://docfuse.dev/en/guide/): installation, authoring, site configuration, build, and delivery workflows.
- [Reference](https://docfuse.dev/en/reference/): site fields, frontmatter, CLI, React API, build output, and project resources.
- [Markdown SDK](https://docfuse.dev/en/markdown/): `@canofold/markdown` boundaries, integration, and authoring syntax.
- [Markdown Playground](https://docfuse.dev/en/markdown/playground/): compare Markdown source with standard elements and extension-component output.
- [Security boundaries](https://docfuse.dev/en/reference/output/security/): trusted Markdown, MDX, extensions, and private sites.

Canofold emits complete static HTML, uses its built-in compact local search by default, and offers Pagefind through `@canofold/plugins`. It can also generate `llms.txt`, Markdown sources, page indexes, and bounded corpus shards. The default output directory is `.canofold/dist/`, ready for any static host.

## Development and contribution

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

- [Contributing](./CONTRIBUTING.md)
- [Security policy](./SECURITY.md)
- [Support](./SUPPORT.md)
- [Changelog](./CHANGELOG.md)

## License

[MIT](./LICENSE)
