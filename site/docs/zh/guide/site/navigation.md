---
title: 配置导航与路由
description: 配置 URL、顶部导航、递归侧栏和页面顺序
group: 指南
subgroup: 站点能力
order: 31
---

# 配置导航与路由

Canofold 从目录生成 URL 和递归侧栏，顶部导航可按语言显式配置。本页说明导航与路由配置；目录设计见 [组织内容](/guide/writing/content-structure/)。

## URL 映射

```text
docs/index.md                                  → /
docs/guide/getting-started.md                  → /guide/getting-started/
docs/en/index.md                               → /en/
docs/en/guide/getting-started.md               → /en/guide/getting-started/
```

每个页面同时生成目录式 `index.html` 和 Markdown 镜像。默认语言没有 locale 前缀，其他语言保留前缀；`basePath` 会统一加在站内路由前。

## 顶部导航

```ts title="canofold.config.ts"
import { defineConfig } from 'canofold'

export default defineConfig({
  navigation: {
    zh: [
      { text: '指南', link: '/guide/' },
      { text: '参考', link: '/reference/' },
      { text: 'Markdown SDK', link: '/markdown/' }
    ],
    en: [
      { text: 'Guide', link: '/en/guide/' },
      { text: 'Reference', link: '/en/reference/' },
      { text: 'Markdown SDK', link: '/en/markdown/' }
    ]
  }
})
```

`link` 可以是站内绝对路由或 HTTP(S) 外链。缺少某语言配置时，Canofold 从一级内容分区生成导航；不存在的站内目标会在检查或构建时失败。

## 递归侧栏

locale 下第一层目录对应顶部导航分区，后续目录递归成为分组。任意目录的 `index.md` 可提供标题与 `collapsed` 初始状态；当前页的祖先分组自动展开。内容树没有深度上限，只有视觉缩进封顶。

## 页面顺序

同一版本和语言内先按 Frontmatter `order`，再按 URL 稳定排序，并据此生成上一篇/下一篇。建议使用 10、20、30 等留有间隔的值。

嵌入其他系统时可设置 `layout: { header: false }`，只隐藏 Header，不改变正文、侧栏和 Outline。
