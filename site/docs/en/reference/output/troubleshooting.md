---
title: Troubleshooting
description: Diagnose configuration, routes, Markdown, MDX, diagrams, search, and deployment
group: Reference
subgroup: Output and Quality
order: 73
---

# Troubleshooting

## Pages or navigation are missing

- Navigation links must target generated absolute routes and end in `/`.
- The default locale has no URL prefix; alternate locales keep their prefix.
- Sidebars follow directories recursively. Nesting is not rejected; only visual indentation is capped.
- Symbolic links in documentation content are rejected instead of being followed silently.

## Markdown or MDX fails

- Declare fenced-code languages. `fallbackLanguage` labels fences without a language; `unknownLanguage` controls unknown languages.
- MDX imports are limited to `react`, `react/jsx-runtime`, and project-relative files that stay inside the project.
- MDX always executes trusted code. `markdown.html: sanitize` and `strip` apply to Markdown, not MDX.

## A plugin has no effect

- Put Markdown plugins in `markdown.plugins`; put `pagefind()` in `search.provider`.
- Mermaid requires `mermaid`, and Pagefind requires `pagefind`. Restart the development server after installing a dependency.
- Make sure the syntax is page content rather than example source nested inside an outer `markdown` fence.
- `docfuse check` validates config and plugin declarations. Use `docfuse dev` or `docfuse build` to verify the transform itself.
- Custom plugin names must be unique. Bump `version` when transform code changes and include resolved options in `cacheKey`.

If checks and rendered output disagree, run `pnpm exec docfuse build --no-cache`. For browser-side failures, inspect the console and Network panel for missing plugin scripts, missing styles, or CSP blocks.

## An extension fails to load or generate output

- `resolve` must begin with `./` and target a file inside the project. The module must default-export the result of `defineExtension(...)`.
- `apiVersion` must currently be `1`, extension names must be unique, and `options` must be JSON-serializable.
- `transformSource` must return a string. `extendPage` may only return fields allowed by the Extension API.
- Every path written by `generate` must be listed in `outputs`. Missing, duplicate, and undeclared writes fail the build.
- `docfuse check` does not run `generate`. Run `docfuse build` and inspect `outputDir/extensions/{name}/` when verifying extra files.

Extension errors include the extension name, hook, and related page when applicable. Fix the innermost error first, then rebuild.

## Mermaid reports a syntax error

Inspect the source and verify that the bundled Mermaid version supports the syntax. `mermaid()` uses its bundled browser runtime and makes no remote module request. CSP module access matters only when `moduleUrl` overrides that runtime.

## PlantUML shows source only

This is expected with `plantUml({ server: false })`. Configure a trusted PlantUML SVG service through `server`, then allow it in the network and CSP policy.

## Kroki diagrams do not load

`kroki()` requests `https://kroki.io` by default. Allow that origin in the browser network and CSP policy, or configure `server` to use a trusted self-hosted Kroki service.

## Search has no results

- Check whether the page sets `search: false`.
- With the default compact provider, verify `/search/<version>/<locale>.json`.
- After configuring `pagefind()`, verify `/pagefind/pagefind.js` and its index chunks.
- When an extension changes `searchText` through `extendPage`, rebuild the search index. `docfuse check` does not write an index.

## Deployment returns 404

Publish the configured `outputDir` and serve directory `index.html` files instead of an SPA fallback. Confirm that `basePath` matches the hosting path.
