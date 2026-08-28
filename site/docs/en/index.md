---
title: Docfuse
description: Add docs to an existing repository with minimal intrusion, then build the site, search, and AI data from one source
order: 0
hero:
  accent: One source for the site, search, and AI data
  tagline: Docfuse reads repository Markdown and MDX in place, leaves application source untouched, and builds the static site, local search, and AI-readable data together.
  image: /banner.png
  imageAlt: Documentation content flowing through Docfuse into a static site
  actions:
    - text: What is Docfuse
      link: /en/guide/introduction/what-is-docfuse/
      primary: true
      icon: file
    - text: Get started
      link: /en/guide/introduction/getting-started/
      icon: rocket
features:
  - image: /feature/cli.svg
    title: Add docs without a separate frontend
    details: Keep docs, configuration, and commands in the existing repository without changing application source.
  - image: /feature/ai.svg
    title: One source produces every output
    details: One build emits static pages, Markdown mirrors, llms.txt, and bounded content shards.
  - image: /feature/md.svg
    title: Rich content needs no handwritten HTML
    details: Code groups, file trees, tabs, media, math, and diagrams have dedicated Markdown syntax.
  - image: /feature/load.svg
    title: Static delivery needs no runtime service
    details: Host the generated files directly while diagrams, search, and interactions load only where used.
  - image: /feature/find.svg
    title: Local search separates locales and versions
    details: Indexes ship with the site, so results never mix another locale or version.
  - image: /feature/pkg.svg
    title: Use the renderer without the CLI
    details: Use @docfuse/markdown directly in React, SSR, and static generation pipelines.
---
