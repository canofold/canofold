# Changelog

## 0.2.0 - Unreleased

- Rename the project from Docfuse to Canofold, including the CLI, configuration file, generated output directory, environment variables, DOM/CSS prefixes, and package names.
- Publish the successor packages as `canofold`, `@canofold/markdown`, and `@canofold/plugins`; the previously published Docfuse packages will remain available with migration notices.
- Transfer the living repository to `canofold/docfuse` without deleting the previous Docfuse repository. npm publishing continues through OIDC staged releases of `canofold`, `@canofold/markdown`, and `@canofold/plugins`.
- Use `https://canofold.dev` as the canonical site origin; `docfuse.dev` remains available for redirects until the cutover.

## 0.1.2 - 2026-08-30

- Update the production dependency stack, including Zod 4, Shiki 4, Chokidar 5, and current React patch releases.
- Preserve Markdown class names and iframe sandbox tokens with the stricter HAST property types used by the updated syntax-highlighting stack.
- Migrate configuration records and custom search-provider validation to the Zod 4 schema contract.

## 0.1.1 - 2026-08-30

- Add a validated `seoTitle` frontmatter field that overrides the browser and search-result title without changing the visible page heading, sidebar label, search index, or AI output.
- Keep the GitHub header action visible on narrow mobile viewports by compacting the logo and search control without removing language or theme controls.
- Give the Docfuse home pages descriptive Chinese and English search-result titles.

## 0.1.0 - 2026-08-29

First public release.

- Build a static documentation site from repository Markdown, MDX, and local React components without maintaining a separate frontend application.
- Produce static HTML, searchable Markdown mirrors, `llms.txt`, and AI-ready page data from the same source content.
- Keep search results isolated by language and version, with local indexing and no required hosted search service.
- Render technical content with code blocks, tabs, file trees, media, diagrams, math, and other interactive Markdown components.
- Load interactive assets only when a page needs them, while keeping the generated site deployable to any static host.
- Extend rendering and content processing through the official `@docfuse/plugins` package.
