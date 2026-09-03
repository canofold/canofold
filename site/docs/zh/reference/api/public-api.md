---
title: 公共 API 与兼容策略
description: 了解哪些 Canofold 接口受兼容与弃用承诺保护
group: 参考
subgroup: API
order: 63
---

# 公共 API 与兼容策略

Canofold 有意保持较小的公共面。请只使用文档明确说明的 Package exports、CLI 命令、配置字段、语义 Markdown API、主题 Token 和扩展 API v1。不要深层导入生成 Chunk，也不要依赖构建缓存、序列化 AST/HAST、Pagefind 内部文件、`.cf-*` Shell 类名或精确布局结构。

语义 Markdown API 的作者语法以 [Markdown 语法参考](/markdown/syntax/) 为准；内部类名和编译后的节点结构不属于写作接口。

## Package 契约

Canofold 发布三个包。`canofold` 根入口公开 `canofoldVersion`、`defineConfig`、`CANOFOLD_EXTENSION_API_VERSION`、`defineExtension`、`defineSearchProvider` 以及文档化的配置、搜索和扩展类型。`@canofold/markdown` 只支持 package export map 中声明的 React、客户端增强、服务端渲染、分析、主题和 CSS 入口。`@canofold/plugins` 通过聚合根入口和按能力子路径公开官方 Markdown 插件与搜索 Provider 工厂；浏览器和 CSS 子路径由生成站点按需加载。

AI Manifest 与扩展描述符带有独立版本；消费者遇到不支持的版本应明确拒绝，不能猜测兼容。

## 版本策略

在 `0.x` 阶段，Patch 版本保持向后兼容。Minor 版本只有在 Changelog 明确说明影响和升级路径时才允许做破坏性修正；可平滑迁移的非安全删除至少弃用一个 Minor 版本。

从 `1.0` 起，不兼容的公共变化必须提升 Major 版本。弃用项至少保留两个 Minor 版本或 90 天，以时间更长者为准；若保留旧行为会继续暴露安全漏洞，可缩短窗口。
