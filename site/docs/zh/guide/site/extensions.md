---
title: 编写构建扩展
description: 用 Extension API 转换源码、补充页面信息或生成附加文件
group: 指南
subgroup: 站点能力
order: 37
---

# 编写构建扩展

Extension 是项目本地的 Node.js 构建模块。它可以在 Markdown 解析前替换源码、在页面进入搜索和 AI 输出前补充元数据，或者随站点构建生成额外文件。

Extension 不会创建新的 Markdown 语法，也不会给页面增加浏览器组件。它解决的是整个仓库的构建规则，例如替换发布渠道占位符、给全部页面追加检索文本，或生成供其他系统读取的清单。

| 需求 | 使用方式 |
|---|---|
| 新 Markdown 语法、数学或图表 | Markdown 插件 |
| 搜索索引 | Search Provider |
| 主题和浏览器交互 | 主题配置、CSS 或 React 组件 |
| 源码占位符、页面信息、附加产物 | Extension |

扩展文件由项目维护，并从站点配置注册：

:::file-tree
- docfuse.config.ts
- extensions/
  - release-notes.ts
:::

## 扩展何时运行

`docfuse check`、`docfuse build` 和 `docfuse dev` 都会加载扩展。`transformSource` 和 `extendPage` 参与内容检查与构建；`generate` 只在 `build` 和 `dev` 生成站点产物时执行。`docfuse preview` 只提供已有产物，不运行扩展。

::::steps[构建生命周期]
:::step[转换源码]
Docfuse 读取每篇 Markdown 或 MDX 后调用 `transformSource`，返回值继续进入 Markdown 分析和渲染。
:::
:::step[补充页面]
页面的标题、描述、正文和路由确定后调用 `extendPage`。它可以修改公开页面信息以及搜索、AI 收录状态。
:::
:::step[生成文件]
全部页面处理完成后调用 `generate`。扩展只能通过 `emitFile` 写入提前声明的输出。
:::
::::

多个 Extension 按 `extensions` 数组顺序执行，前一个扩展返回的源码和页面信息会传给后一个。

## 创建扩展

```ts title="extensions/release-notes.ts"
import { defineExtension } from 'docfuse'

export default defineExtension((options) => {
  const channel = typeof options.channel === 'string' ? options.channel : 'stable'

  return {
    apiVersion: 1,
    name: 'release-notes',
    outputs: ['manifest.json'],
    transformSource({ source }) {
      return source.replaceAll('{{channel}}', channel)
    },
    extendPage(page) {
      return { searchText: `${page.searchText} ${channel} release` }
    },
    async generate({ pages, emitFile }) {
      await emitFile('manifest.json', JSON.stringify({ channel, pages: pages.length }))
    }
  }
})
```

## 注册扩展

```ts title="docfuse.config.ts"
import { defineConfig } from 'docfuse'

export default defineConfig({
  extensions: [
    {
      resolve: './extensions/release-notes.ts',
      options: { channel: 'stable' }
    }
  ]
})
```

`resolve` 必须是项目内相对路径，`options` 必须可以 JSON 序列化。

在任意文档中加入占位符：

```markdown title="docs/releases.md"
# 发布说明

当前发布渠道：{{channel}}
```

## 运行并验证

```bash
pnpm docs:check
pnpm docs:build
pnpm docs:preview
```

依次确认以下结果：

1. `/releases/` 显示“当前发布渠道：stable”。
2. 搜索 `stable release` 可以找到该页面。
3. `/extensions/release-notes/manifest.json` 返回扩展生成的 JSON；对应文件位于 `.docfuse/dist/extensions/release-notes/manifest.json`。

`docs:check` 会执行前两个 Hook，但不会写入 `manifest.json`。验证 `generate` 时必须运行 `docs:build` 或 `docs:dev`。

## Hook

| Hook | 输入 | 返回或输出 |
|---|---|---|
| `transformSource` | 当前源码、路径、版本、语言和文件类型 | 继续进入编译器的完整源码字符串 |
| `extendPage` | 已分析页面的标题、描述、正文、路由和 Frontmatter | 标题、描述、搜索文本、搜索或 AI 收录状态的局部修改 |
| `generate` | 全部已完成页面和 `emitFile` | `outputs` 中提前声明的文件 |

扩展只能写入 `extensions/{name}/` 下声明过的输出，少写、多写或重复写都会使构建失败。Extension 拥有构建进程权限，不是沙箱；只注册经过审查的本地模块和依赖。加载或输出失败时，按[故障排查](/reference/output/troubleshooting/#扩展加载或生成失败)检查。
