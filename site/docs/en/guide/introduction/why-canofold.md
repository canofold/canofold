---
title: Why choose Canofold?
description: Evaluate Canofold through its static delivery, repository adoption, unified content model, and extension boundaries
group: Guide
subgroup: Introduction
order: 2
---

# Why choose Canofold?

Canofold is for teams that want to manage knowledge in source files without maintaining a separate documentation frontend. Markdown and MDX are the canonical source; one build unfolds them into the website, search indexes, and AI-ready knowledge outputs.

Its delivery layer combines a static documentation generator with a standalone Markdown SDK. The platform itself is not limited to technical documentation; it also fits product guides, team knowledge bases, and operating manuals.

## Keep knowledge in the existing workflow

Documentation can live beside code, product specifications, operating manuals, or other project assets, or it can use a dedicated repository. Existing branches, reviews, CI, and release history continue to govern changes.

When adopting an existing repository, `canofold init` adds only the required configuration and files. It does not move existing content or require changes to application source, so the team does not inherit a second frontend project for documentation.

## Keep deployment static

Canofold renders pages and builds navigation, search indexes, and AI data during the build. Production only needs to serve static files; it does not require a Canofold service, Node.js server, or database.

Static delivery leaves caching, rollback, and access control with the hosting platform. A private knowledge base must still protect the complete output directory at that layer.

## One canonical source for every entry point

Canofold parses one Markdown and MDX source. Page structure, navigation, search text, locale and version routes, Markdown mirrors, `llms.txt`, and bounded content shards are unfolded from that canonical source.

The website, site search, and AI tools therefore read the same titles, body content, and metadata. A content change happens once instead of being copied through separate pipelines.

## Separate the CLI from the Markdown SDK

Use the `canofold` CLI for a complete knowledge site. Use the `@canofold/markdown` SDK directly when an existing React, SSR, or static generation project only needs content rendering. They share content semantics and theme contracts but can be adopted independently.

`@canofold/plugins` adds optional math, diagrams, link handling, reading time, and Pagefind support. A project installs only the capabilities it uses.

## Extend one responsibility at a time

| Requirement | Extension point |
|---|---|
| Add Markdown syntax, math, or diagrams | Markdown plugin |
| Change repository-wide build rules or emit extra files | Extension |
| Replace indexing and querying | Search Provider |
| Change presentation only | Theme tokens, CSS, and component slots |

Each entry point owns content, builds, search, or presentation instead of letting one plugin control the complete pipeline.

## When it fits

Canofold is a good fit when:

- Knowledge is maintained in Markdown or MDX and reviewed through Git.
- The project needs locales, versions, site search, or AI-ready knowledge output.
- Generated output must deploy to any static host.
- The team needs a complete site and the option to use the Markdown SDK independently.

Choose an online CMS or hosted knowledge base when browser-based collaborative editing, per-page permissions, review comments, or a dynamic content API are core requirements. Canofold should also not execute MDX, local components, or build extensions from untrusted sources.

## Validate it with a small pilot

Start with a few real documents from an existing repository:

1. [Install Canofold](/en/guide/introduction/installation/) and initialize the configuration.
2. Add three to five pages containing links, code, and static assets.
3. Run `canofold check`, `canofold build`, and `canofold preview`.
4. Inspect navigation, search, locale or version routes, and the generated AI output.

If the pilot matches the team workflow, bring the remaining knowledge into the same structure. See the [Quick start](/en/guide/introduction/getting-started/) for the commands.
