---
title: Public API and compatibility
description: Know which Canofold interfaces follow compatibility and deprecation guarantees
group: Reference
subgroup: API
order: 63
---

# Public API and compatibility

Canofold keeps its supported surface intentionally small. Use documented package exports, CLI commands, configuration fields, semantic Markdown APIs, theme tokens, and extension API v1. Do not deep-import generated chunks or depend on build-cache files, serialized AST/HAST, Pagefind internals, `.cf-*` shell classes, or exact layout markup.

The [Markdown syntax reference](/en/markdown/syntax/) defines the authoring contract for semantic Markdown. Internal class names and compiled node structures are not authoring APIs.

## Package contracts

Canofold publishes three packages. `canofold` exports `canofoldVersion`, `defineConfig`, `CANOFOLD_EXTENSION_API_VERSION`, `defineExtension`, `defineSearchProvider`, and the documented configuration, search, and extension types from its root. `@canofold/markdown` supports only the subpaths declared in its package export map: React, client enhancement, server rendering, analysis, theme, and CSS layers. `@canofold/plugins` exposes official Markdown plugin and search-provider factories through its aggregate root and focused subpaths; generated sites load its browser and CSS subpaths on demand.

Generated AI Manifests and extension descriptors carry explicit versions. Reject versions your consumer does not understand.

## Version policy

During `0.x`, patch releases remain compatible. A minor release may make a breaking correction only when the Changelog states its impact and upgrade path. When possible, a non-security removal is deprecated for at least one minor release.

From `1.0`, incompatible public changes require a major release. Deprecations stay available for at least two minor releases or 90 days, whichever is longer, unless retaining the behavior would preserve a security vulnerability.
