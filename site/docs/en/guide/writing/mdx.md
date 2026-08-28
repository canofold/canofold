---
title: Project-local MDX components
description: Import a project-local React component in a trusted page
group: Guide
subgroup: Writing
order: 35
---

# Project-local MDX components

Use `.mdx` only when built-in Markdown cannot express the content. Keep the component inside the same project boundary as its page:

:::file-tree
- docs/
  - guide/
    - StatusBadge.tsx
    - status.mdx
:::

```tsx title="StatusBadge.tsx"
export function StatusBadge({ stable }: { stable: boolean }) {
  return <span data-status={stable ? 'stable' : 'preview'}>{stable ? 'Stable' : 'Preview'}</span>
}
```

```mdx title="status.mdx"
import { StatusBadge } from './StatusBadge'

# Release status

<StatusBadge stable />
```

MDX may import only `react`, `react/jsx-runtime`, and project-relative files that remain inside the project. Other npm packages, external paths, and Docfuse internal component entries fail the build. When a component changes, the pages that use it are rebuilt.

MDX executes JSX and JavaScript and must be treated as trusted build code. `markdown.html: 'sanitize'` cannot provide a sandbox. Use screenshots, recordings, or a dependency-free local wrapper for complex application demos.
