# Changelog

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
