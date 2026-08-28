# @docfuse/plugins

[English](./README.md) | 简体中文

`@docfuse/plugins` 提供 Docfuse 官方维护的 Markdown 插件和搜索 Provider。所有工厂共用一个包版本，常规站点配置从包根导入。

## 在 Docfuse 站点中安装

把插件包安装为开发依赖：

```bash
pnpm add -D @docfuse/plugins
```

`mermaid` 和 `pagefind` 是可选 Peer，只在启用对应能力时安装：

```bash
pnpm add -D mermaid pagefind
```

```ts
import { externalLinks, math, mermaid, pagefind } from '@docfuse/plugins'
import { defineConfig } from 'docfuse'

export default defineConfig({
  search: { provider: pagefind() },
  markdown: {
    plugins: [math(), mermaid(), externalLinks()]
  }
})
```

## 可用工厂

| 工厂 | 契约 | 作用 |
|---|---|---|
| `externalLinks(options?)` | Markdown 插件 | 为站外 HTTP(S) 链接添加安全属性 |
| `readingTime(options?)` | Markdown 插件 | 添加本地化阅读时长 |
| `linkCard(options?)` | Markdown 插件 | 把独占段落的链接转换为链接卡片 |
| `kroki(options?)` | Markdown 插件 | 渲染 Graphviz、D2 和其他 Kroki 图表 |
| `math(options?)` | Markdown 插件 | 使用 remark-math 和 KaTeX 渲染公式 |
| `mermaid(options?)` | Markdown 插件 | 在浏览器中渲染 Mermaid 围栏 |
| `plantUml(options?)` | Markdown 插件 | 配置可信服务后渲染 PlantUML |
| `pagefind(options?)` | Search Provider | 根据最终静态 HTML 生成 Pagefind 索引 |

在 React 应用中直接配合 `@docfuse/markdown` 使用时，应把插件安装为普通应用依赖。启用 `math()` 的 React 宿主还需要导入 `@docfuse/plugins/math.css`。

包根入口和 `@docfuse/plugins/math` 等工厂子路径属于公共 API。浏览器与 CSS 入口由生成站点消费，不是插件工厂。

选项、完整示例、生命周期区别和验证方法见[官方插件指南](https://docfuse.dev/guide/site/plugins/)。

许可证：MIT
