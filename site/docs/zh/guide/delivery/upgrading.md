---
title: 升级 Canofold
description: 更新项目依赖，核对兼容变化并验证构建与部署
group: 指南
subgroup: 发布与运营
order: 45
---

# 升级 Canofold

升级前先查看 [Changelog](https://github.com/canofold/canofold/blob/main/CHANGELOG.md) 中当前版本的兼容变化和升级步骤。如果项目直接使用 `@canofold/markdown` 或 `@canofold/plugins`，也要一起核对它们的版本和公开入口。

将 CLI 更新为明确版本，提交锁文件，并让 `requiredVersion` 包含该版本：

```bash
pnpm add -D canofold@<version>
pnpm exec canofold check
pnpm exec canofold build --no-cache
pnpm exec canofold build
```

第一次构建绕过旧缓存，用来确认新版本可以从源文件生成完整产物；第二次构建用来验证持久缓存。

## 发布前核对

- 首页、深层路由、404 和静态资源可以从生产预览中打开。
- 搜索结果按当前语言和文档版本过滤。
- 重定向、canonical、`hreflang` 和 sitemap 与部署域名一致。
- 需要 AI 产物时，消费方能读取 `ai/manifest.json` 及其声明的分片。
- 亮色、暗色、键盘导航和移动端布局没有回归。

验证完成后再部署新产物。如果新版本需要迁移，以对应版本 Changelog 给出的步骤为准。
