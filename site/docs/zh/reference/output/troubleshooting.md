---
title: 故障排查
description: 诊断 Docfuse 配置、路由、Markdown、MDX、图表、搜索和部署问题
group: 参考
subgroup: 产物与质量
order: 73
---

# 故障排查

## 构建找不到页面或导航

- 确认 `navigation` 的站内链接指向真实生成路由，并以 `/` 开始和结束。
- 默认语言无 locale 前缀，其他语言必须带前缀。
- 侧栏按目录递归生成，没有内容深度限制；只有视觉缩进会封顶。
- 文档内容中的符号链接会被明确拒绝，不会静默跳过或自动跟随。

## Markdown 或 MDX 失败

- 为代码围栏声明语言；`fallbackLanguage` 处理未声明语言的围栏，`unknownLanguage` 决定如何处理未知语言。
- MDX 只能导入 `react`、`react/jsx-runtime` 和允许的项目内相对文件；其他包导入会被安全边界拒绝。
- `markdown.html: sanitize` 或 `strip` 不适用于 MDX；MDX 始终是可信代码。

## 插件没有生效

- 确认插件已经放入 `markdown.plugins`；`pagefind()` 应放在 `search.provider`。
- Mermaid 需要安装 `mermaid`，Pagefind 需要安装 `pagefind`。安装新依赖后重启开发服务。
- 确认语法是页面内容，而不是包在另一个 `markdown` 代码围栏中的示例源码。
- `docfuse check` 只校验配置和插件声明。使用 `docfuse dev` 或 `docfuse build` 验证实际转换。
- 自定义插件的 `name` 必须唯一。转换代码变化时提升 `version`，选项变化必须反映到 `cacheKey`。

如果检查结果与页面不一致，运行 `pnpm exec docfuse build --no-cache` 排除旧构建状态。浏览器端能力仍失败时检查控制台和 Network 面板，确认插件脚本及样式没有 404 或被 CSP 拦截。

## 扩展加载或生成失败

- `resolve` 必须以 `./` 开头并指向项目内文件；模块需要默认导出 `defineExtension(...)` 的结果。
- `apiVersion` 当前必须为 `1`，`name` 不能与其他扩展重复，`options` 必须可以 JSON 序列化。
- `transformSource` 必须返回字符串；`extendPage` 只能返回 Extension API 允许的页面字段。
- `generate` 写出的每个路径都必须提前列入 `outputs`。声明后漏写、重复写或写出未声明路径都会使构建失败。
- `docfuse check` 不执行 `generate`。检查附加文件时运行 `docfuse build`，并到 `outputDir/extensions/{name}/` 查看结果。

错误信息会包含扩展名、Hook 名以及相关页面。先处理最内层错误，再重新构建。

## Mermaid 显示语法错误

点击源码按钮检查原文，确认内置 Mermaid 版本支持对应语法。`mermaid()` 默认使用随插件打包的浏览器运行时，不会请求远程模块；只有通过 `moduleUrl` 显式覆盖为 CDN 或自托管模块时，才需要同步配置 CSP。

## PlantUML 只显示源码

`plantUml({ server: false })` 时这是预期行为。需要图像时通过 `plantUml({ server: '...' })` 配置可用的 PlantUML SVG 服务，并确认 CSP 和网络允许访问。

## Kroki 图表无法加载

`kroki()` 默认请求 `https://kroki.io`。确认浏览器网络和 CSP 允许访问；私有环境应通过 `server` 改用可信的自托管 Kroki 服务。

## 搜索没有结果

- 检查页面是否设置 `search: false`。
- 默认 compact 模式确认 `/search/<version>/<locale>.json` 可访问。
- 配置 `pagefind()` 后确认 `/pagefind/pagefind.js` 及查询分片可访问。
- Extension 通过 `extendPage` 修改 `searchText` 后，需要重新构建搜索索引；只运行 `docfuse check` 不会写入索引。

## 部署后 404

静态主机必须按目录提供 `index.html`。确认发布目录与 `outputDir` 一致，且没有把站点配置成 SPA fallback。运行 `docfuse deploy` 查看平台示例。
