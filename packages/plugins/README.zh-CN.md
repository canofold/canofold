# @canofold/plugins

[English](./README.md) | 简体中文

`@canofold/plugins` 提供 Canofold 官方维护的 Markdown 插件和搜索 Provider。所有工厂共用一个包版本，常规站点配置从包根导入。

## 在 Canofold 站点中安装

把插件包安装为开发依赖：

```bash
pnpm add -D @canofold/plugins
```

`mermaid` 和 `pagefind` 是可选 Peer，只在启用对应能力时安装：

```bash
pnpm add -D mermaid pagefind
```

支持 Mermaid 11 和 12，新项目建议使用 Mermaid 12；它要求 Node 22.12+ 和 Safari 17.4+ 或具备同等 ES2024 支持的浏览器。Canofold 默认保留 Dagre 布局和 Classic 外观，作者仍可在图表配置中选择其他布局或外观。运行时从站点安装的 `mermaid` 包构建，不内置于 `@canofold/plugins`。

```ts
import { externalLinks, math, mermaid, pagefind } from '@canofold/plugins'
import { defineConfig } from 'canofold'

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

在 React 应用中直接配合 `@canofold/markdown` 使用时，应把插件安装为普通应用依赖。启用 `math()` 的 React 宿主还需要导入 `@canofold/plugins/math.css`。

包根入口和 `@canofold/plugins/math` 等工厂子路径属于公共 API。生成站点会自动加载浏览器与 CSS 入口。直接使用 React 或编辑器的宿主可以调用下文带类型的图表客户端入口；它们是生命周期增强器，不是插件工厂。

## 由宿主提供本地图表渲染

PlantUML 和 Kroki 可以把渲染交给浏览器宿主，而不把源码发送给外部服务。编译 Markdown 时选择客户端 renderer，并在 Markdown DOM 挂载后把一个 renderer 函数传给对应的客户端增强器：

```ts
import { kroki } from '@canofold/plugins/kroki'
import { enhance, type DiagramRenderer } from '@canofold/plugins/client/kroki'

export const diagramPlugin = kroki({ renderer: 'client' })

const renderer: DiagramRenderer = async ({ diagramType, source, signal }) => {
  const svg = await renderLocally({ diagramType, source, signal })
  return { svg }
}

const diagrams = enhance(markdownRoot, { renderer })
await diagrams.ready

// Markdown 内容被替换或卸载时执行。
diagrams.dispose()
```

renderer 会收到 `kind`、原始围栏 `language`、映射后的 `diagramType`、`source` 和 `AbortSignal`，并且必须返回非空 SVG 字符串。增强器通过可回收的 `blob:` 图片 URL 展示 SVG，保留源码切换、缩放和放大预览，在失败时显示本地化状态，并在销毁时还原原始 DOM。因此，使用严格 CSP 的宿主需要在 `img-src` 中允许 `blob:`。

即使 Canofold 页面运行时已经先执行过不带 renderer 的增强，再传入 renderer 也会升级现有图表壳，不会重复绑定控件。宿主仍然拥有新返回的生命周期，并且必须在替换或卸载渲染内容时执行 dispose。

Worker、本地进程或编辑器消息桥由宿主负责。`@canofold/plugins` 不启动可执行程序，也不定义 VS Code 协议；`@canofold/markdown` 不感知具体图表运行时。

`kroki()` 默认把图表源码留在本地。远程渲染必须显式配置可信的 Kroki 兼容服务；需要由宿主在本地渲染时使用上文的 renderer：

```ts
kroki()
kroki({ server: 'https://kroki.example' })
kroki({ renderer: 'client' })
```

`plantUml({ renderer: 'client' })` 通过 `@canofold/plugins/client/plantuml` 使用同一套客户端契约。两个工厂都不允许同时设置远程 `server` 和 `renderer: 'client'`。server 必须是没有查询参数或片段的 HTTP(S) 基础 URL。

### 公式隔离与依赖边界

`math()` 的宏只在当前文档内共享，不会修改插件配置或泄漏到下一篇文档。`throwOnError: true` 会使无效公式编译失败；默认值 `false` 保留错误标记。

从 0.4.1 起，发布包包含官方 Markdown 公式适配器，并统一使用直接声明的 KaTeX 0.18.x 渲染器及配套 CSS、字体。消费方不需要添加依赖覆盖规则。

可选 Mermaid 使用其自身的上游运行时，不与 `math()` 共用 KaTeX。Mermaid 12.2.0 已声明 KaTeX 0.18.x，应使用它或更新的受支持版本，不跨版本强制覆盖依赖。Canofold 从安装的包入口构建运行时，并保留 `securityLevel: 'strict'`。

Mermaid 11 的 API 仍受支持，但它包含 KaTeX 0.16.x，存在 [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7) 低危告警（利用前提是已经发生原型污染）。仅升级 `@canofold/plugins` 不会升级站点的可选 Mermaid Peer；需要安装 `mermaid@^12.2.0` 才能离开受影响的依赖范围，并满足前述浏览器和 Node 要求。

选项、完整示例、生命周期区别和验证方法见[官方插件指南](https://canofold.dev/guide/site/plugins/)。

许可证：MIT
