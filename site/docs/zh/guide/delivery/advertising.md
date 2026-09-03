---
title: 配置广告位
description: 在页面目录下方展示一个可访问的赞助图片位
group: 指南
subgroup: 发布与运营
order: 43
sidebar: false
---

# 配置广告位

Canofold 提供一个位于右侧页内导航下方的图片广告位，不包含广告后台、投放计划或统计系统。

```ts title="canofold.config.ts"
import { defineConfig } from 'canofold'

export default defineConfig({
  advertising: {
    image: '/sponsors/acme.png',
    href: 'https://acme.example',
    alt: 'Acme 开发者平台',
    label: '赞助商'
  }
})
```

`image`、`href`、`alt` 必填，`label` 可选。不配置时不会渲染空容器。外链自动使用 `rel="sponsored noopener noreferrer"`。图片需要可读替代文本，且应与正文、搜索、AI 和附件使用相同的私有访问策略。
