---
title: 配置搜索
description: 使用内置搜索或 Pagefind 建立多语言索引
group: 指南
subgroup: 站点能力
order: 32
---

# 配置搜索

搜索默认启用，并使用内置 `compact` Provider。小型和中型站点无需额外配置。

## 使用 Pagefind

内容较多时，可以改用 Pagefind。先安装官方插件包和 Pagefind：

:::code-group[包管理器]

```bash title="pnpm"
pnpm add -D @docfuse/plugins pagefind
```

```bash title="npm"
npm install --save-dev @docfuse/plugins pagefind
```

```bash title="yarn"
yarn add --dev @docfuse/plugins pagefind
```

:::

然后配置搜索 Provider：

```ts title="docfuse.config.ts"
import { pagefind } from '@docfuse/plugins'
import { defineConfig } from 'docfuse'

export default defineConfig({
  search: { provider: pagefind() }
})
```

Pagefind 会索引最终 HTML，并按当前语言和版本过滤结果。

## 排除内容

在页面 Frontmatter 中设置 `search: false`，可以排除单个页面：

```yaml
---
search: false
---
```

关闭全站搜索时使用 `search: { enabled: false }`。私有站点应让搜索索引与正文使用相同的访问控制。
