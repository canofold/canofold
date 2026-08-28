---
title: 配置重定向
description: 移动公开页面时保留稳定入口并生成托管规则清单
group: 指南
subgroup: 站点能力
order: 35
---

# 配置重定向

页面一旦公开，移动文件前先为旧 URL 配置目标：

```ts title="docfuse.config.ts"
import { defineConfig } from 'docfuse'

export default defineConfig({
  redirects: {
    '/getting-started/': '/guide/introduction/getting-started/',
    '/v1/install/': '/v1/guide/install/'
  }
})
```

来源和目标都使用包含 `basePath` 之前的站内绝对路由。构建会拒绝来源覆盖真实页面、目标不存在、重定向循环和链式跳转。

输出包含静态 fallback 页面与 `redirects.json`。静态页面可在普通托管中工作，但正式生产环境应读取 Manifest 生成平台 301/308 规则，避免先返回 HTML 再由浏览器跳转。删除旧内容前运行 `pnpm docs:check` 并验证旧 URL、最终状态码和 canonical。
