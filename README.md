# Canofold

English | [简体中文](./README.zh-CN.md)

Canofold is a static-first, minimally invasive, and extensible knowledge and documentation platform. It uses a unified content model to turn Markdown, MDX, and explicitly configured local OpenAPI specifications into multilingual, versioned websites, search indexes, and AI-ready knowledge outputs.

## Packages

| Package | Use it when |
|---|---|
| `canofold` | You want to build and publish a complete documentation site |
| `@canofold/markdown` | You want to render Canofold Markdown inside a React application |
| `@canofold/themes` | You want official visual themes or the shared third-party theme contract |
| `@canofold/vite` | You want live component demos powered by an existing Vite project |
| `@canofold/plugins` | You need official Markdown plugins, Pagefind search, or a local OpenAPI content source |

## Quick start

Node.js 22.12 or newer is required. Install the CLI as a project-local development dependency for teams and CI:

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

The package manager resolves bare `canofold` inside scripts from `node_modules/.bin`. Use `pnpm exec canofold ...` for an ad-hoc local command. A bare command in an arbitrary shell requires a global install and a global bin directory on PATH. See [Installation and invocation](https://canofold.dev/en/guide/introduction/installation/) for the complete model.

## Documentation

- [Guide](https://canofold.dev/en/guide/): installation, authoring, site configuration, build, and delivery workflows.
- [Reference](https://canofold.dev/en/reference/): site fields, frontmatter, CLI, React API, build output, and project resources.
- [Markdown SDK](https://canofold.dev/en/markdown/): `@canofold/markdown` boundaries, integration, and authoring syntax.
- [Markdown Playground](https://canofold.dev/en/markdown/playground/): compare Markdown source with standard elements and extension-component output.
- [Editor Extension](https://canofold.dev/en/vscode/): preview Markdown in VS Code.
- [Skills](https://canofold.dev/en/skills/): experimental authoring, maintenance and knowledge-reading workflows.
- [Security boundaries](https://canofold.dev/en/reference/output/security/): trusted Markdown, MDX, extensions, and private sites.

Canofold emits complete static HTML, uses its built-in compact local search by default, and offers Pagefind through `@canofold/plugins`. It can also generate `llms.txt`, Markdown sources, page indexes, and bounded corpus shards. The default output directory is `.canofold/dist/`, ready for any static host.

The 0.8 machine format uses schema 3 for Markdown/MDX and OpenAPI-derived pages. It separates document identity, authored input revisions, declared dependencies and generated representations. Local OpenAPI 3.0/3.1 sources feed the same site, search and machine-output pipeline without generating files in your authoring tree. See the [machine-consumption contract](./packages/canofold/README.md#machine-consumption-contract-08) and [OpenAPI source](./packages/plugins/README.md#local-openapi-content-source). Upgrade readers and rebuild their trusted baseline when moving from schema 1/2; never treat a format change as content deletion.

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
