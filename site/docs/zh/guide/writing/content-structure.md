---
title: 组织文档内容
description: 用目录和 index.md 建立递归内容树与侧栏
group: 指南
subgroup: 内容创作
order: 21
---

# 组织文档内容

Docfuse 从文件目录生成 URL、分区和递归侧栏。本页只说明内容树；页面元数据见 [Frontmatter](/reference/configuration/frontmatter/)。

## 目录规则

:::file-tree
- docs/
  - index.md
  - guide/
    - index.md
    - getting-started.md
    - advanced/
      - index.md
      - performance/
        - index.md
        - cache.md
  - en/
    - index.md
:::

- `docs/index.md` 是默认语言首页。
- 已配置的非默认语言位于 `docs/{locale}/`。
- locale 下第一层目录是顶部导航分区，后续目录递归成为侧栏分组，没有硬编码深度限制。
- 同目录页面按 `order` 排序，再按路由稳定排序。

## 用目录首页命名分组

任意目录都可放置 `index.md`：

```yaml
---
title: 性能
description: 性能诊断与优化
collapsed: true
---
```

`title` 是该层侧栏标题，`collapsed` 控制初始折叠状态。顶层分区可继续使用 `group`，第一层嵌套目录可继续使用 `subgroup`，更深层统一读取目录首页标题。视觉缩进会封顶，但目录结构不会被压平。

## 稳定 URL

文件和目录名进入公开 URL。已经发布的路径需要调整时，先配置 [重定向](/guide/site/redirects/)，再移动文件。运行 `pnpm docs:check` 检查重复路由、缺失首页和无效内部链接。
