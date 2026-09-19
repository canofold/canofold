# @canofold/vite

Canofold 官方 React + Vite Demo Engine。它复用组件项目已有的 Vite 配置、插件、别名和 CSS 依赖图，为普通 Markdown 中的组件示例提供开发预览、HMR 与生产构建。当前版本支持 React 18 和 React 19。

```ts
import { defineConfig } from 'canofold'
import { vite } from '@canofold/vite'

export default defineConfig({
  demos: {
    engine: vite()
  }
})
```

运行 `canofold dev` 即可。Canofold 与 Vite 共用一个 HTTP Server 和端口；同一开发会话只创建一个 Vite Server，组件、样式和 Demo 依赖由 Vite module graph 监听并通过 HMR 更新，Markdown 与 Canofold 配置仍由 Canofold 重建。

无需为文档单独维护 Vite 配置。`@canofold/vite` 会复用项目现有的 `vite.config`、插件、alias、React、TypeScript/JSX 与 CSS 配置。Demo 应像应用代码一样从组件包名或项目已有 alias 导入组件，组件 CSS 由组件或 Demo 自己 import；不要把每个组件样式登记到 Canofold 的 `styles`。

对于 `package.json` 有包名且 `build.lib.entry` 只有一个入口的标准组件库，Canofold 会在没有同名自定义 alias 时自动把包名解析到该源码入口，因此不需要把同一入口再写一遍 alias。多入口库和 workspace 不做推断，继续使用项目已有的 exports 或 alias。

生产构建中，Markdown 浏览器增强、Demo 运行时和项目组件进入同一 Vite 构建图。React 与 React DOM 由组件项目解析并去重，Demo 与 CSS 按需分块，不会把全部示例和样式无条件放进入口。同一构建图会输出轻量 Markdown 入口和 Demo 入口：没有 Demo 的页面不会因为原生 Markdown 交互而静态加载 React，有 Demo 的页面则复用 Demo 入口中的 Markdown 增强能力。

`demos.setup` 只用于所有 Demo 共享的 Provider、主题、国际化或路由环境；普通组件不需要设置。

Demo 默认渲染在文档页面中。`sandbox="iframe"` 会把可信的本地 Demo 放进受限 iframe，隔离 DOM 与全局样式；它不是运行不可信代码的安全边界。
