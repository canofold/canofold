---
title: What is Canofold?
description: Learn what Canofold is for, what it provides, and which package to use
group: Guide
subgroup: Introduction
order: 1
---

# What is Canofold?

One canonical source. Unfolded.

Canofold is a static-first, minimally invasive, and extensible knowledge and documentation platform. It treats one Markdown and MDX tree as the canonical source, then unfolds it into multilingual, versioned websites, search indexes, and AI-ready knowledge outputs.

It fits teams that version knowledge alongside code, configuration, or other project assets. Adoption does not require changes to application source or a separate documentation frontend. One CLI handles development, checks, builds, and previews.

## Add docs with minimal intrusion

Docs, configuration, and commands stay in the existing repository. `canofold init` adds only missing files; existing Markdown and MDX remain in place and are not overwritten.

The build output is static. Production does not require a Canofold service, a Node.js server, or a database.

## Unfold one source into multiple outputs

The same Markdown and MDX unfold into the complete static site, local search indexes, Markdown mirrors, `llms.txt`, and bounded content shards. The website, search, and AI tools read one canonical source instead of separately maintained copies.

Navigation, sidebars, locale routes, and version routes are generated from the content structure and configuration as well.

## Main capabilities

| Task | What Canofold provides |
|---|---|
| Write content | Markdown, MDX, local React components, code, tables, file trees, media, math, and diagrams |
| Organize the site | Routes, navigation, sidebars, page outlines, search, SEO, locales, and versions |
| Check content | Configuration, frontmatter, links, static assets, and missing translations |
| Build and publish | Complete static HTML, redirects, search indexes, and deployable output |
| Serve AI tools | Markdown mirrors, `llms.txt`, page indexes, and chunked data |

See the [Markdown SDK](/en/markdown/) for content syntax, [Quick start](/en/guide/introduction/getting-started/) for the site workflow, and [Reference](/en/reference/) for configuration fields.

## Choose a package

| Package | Responsibility |
|---|---|
| `canofold` | Build a complete documentation site |
| `@canofold/markdown` | Render Markdown and MDX in an existing React, SSR, or static generation project |
| `@canofold/plugins` | Provide math, diagrams, link handling, reading time, and Pagefind plugins |

Building a site only requires `canofold`. The other packages render content independently or add optional plugins.

## Scope

Canofold fits product documentation, developer documentation, team knowledge bases, operating manuals, and open-source projects, especially when the project needs locales, version management, or AI-ready knowledge output.

Canofold is not an online CMS or a hosted service. It does not provide collaborative editing, accounts, permissions, review comments, or a dynamic content API. Protect the complete output directory at the hosting layer for private documentation.

MDX, local components, and build extensions execute code and should only process trusted content. See [Security boundaries](/en/reference/output/security/) for details.

Read [Why choose Canofold?](/en/guide/introduction/why-canofold/) for its design tradeoffs. When you are ready, [install Canofold](/en/guide/introduction/installation/). To inspect the rendered content first, open the [Markdown Playground](/en/markdown/playground/).
