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

Demo 默认渲染在文档页面中。`sandbox="iframe"` 会把可信的本地 Demo 放进受限 iframe，隔离 DOM 与全局样式；它不是运行不可信代码的安全边界。
