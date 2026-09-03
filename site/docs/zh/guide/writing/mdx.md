---
title: 使用 MDX 本地组件
description: 在可信页面中导入项目本地 React 组件
group: 指南
subgroup: 内容创作
order: 35
---

# 使用 MDX 本地组件

仅当内置 Markdown 无法表达内容时使用 `.mdx`。组件与页面放在同一项目边界内：

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

# 发布状态

<StatusBadge stable />
```

MDX 只允许导入 `react`、`react/jsx-runtime` 和项目目录内的相对文件。其他 npm 包、项目外路径和 Canofold 内部组件入口会使构建失败。组件变化后，引用它的页面会重新构建。

MDX 执行 JSX 与 JavaScript，必须视为可信构建代码；`markdown.html: 'sanitize'` 不能提供沙箱。复杂应用演示应使用截图、录屏或无业务依赖的本地 wrapper。
