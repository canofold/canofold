---
title: 管理文档版本
description: 发布当前文档并保留历史内容快照
group: 指南
subgroup: 站点能力
order: 34
---

# 管理文档版本

一个版本对应一套独立的文档源目录和 URL 前缀。当前版本通常使用 `/`，历史版本使用 `/v1/`、`/v2/` 等前缀。版本切换不会在运行时改写同一篇文章。

## 准备历史快照

下面的示例把中文作为默认语言，当前文档放在 `docs/`，旧版放在 `versions/v1/`：

:::file-tree
- canofold.config.ts
- docs/
  - index.md
  - en/
    - index.md
- versions/
  - v1/
    - index.md
    - en/
      - index.md
:::

当前中文首页映射到 `/`，当前英文首页映射到 `/en/`；v1 的两个首页分别映射到 `/v1/` 和 `/v1/en/`。

```ts title="canofold.config.ts"
import { defineConfig } from 'canofold'

export default defineConfig({
  versions: {
    current: 'v2',
    items: [
      {
        id: 'v2',
        label: '2.x',
        docsDir: 'docs',
        base: '/'
      },
      {
        id: 'v1',
        label: '1.x',
        docsDir: 'versions/v1',
        base: '/v1/'
      }
    ]
  }
})
```

`docsDir` 和 `base` 必须在各版本之间保持清晰边界，避免两个页面写入同一输出路径。

## 页面切换

切换版本时，Canofold 先查找目标版本中相同相对路径的页面。如果不存在，则返回目标版本当前语言的首页。历史版本删除页面或调整目录后，可以通过 redirects 保留常用入口。

## 搜索和 AI 输出

内置 Compact Search 为每个版本和语言写入独立 JSON 文件。Pagefind 使用一份索引，并通过 `version` 和 `locale` filter 限定结果。两种 provider 都不会把其他版本的结果混入当前页面的搜索结果。

AI 产物默认只包含 `versions.current`。需要把历史版本写入独立分区时，设置 `ai.versions: 'all'`：

```ts title="canofold.config.ts"
import { defineConfig } from 'canofold'

export default defineConfig({
  ai: {
    versions: 'all'
  }
})
```

## 何时保留快照

当新版存在不兼容配置、API 或操作流程，而且用户仍需要查询旧版时，再保留历史快照。是否按 major、minor 或其他发布节点切分，应由项目的兼容策略决定。
