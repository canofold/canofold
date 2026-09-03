---
title: 配置多语言
description: 配置语言、目录、导航和界面文案
group: 指南
subgroup: 站点能力
order: 33
---

# 配置多语言

默认语言使用根路径，其他语言使用 `/<locale>/` 前缀。Canofold 不会根据浏览器语言自动跳转，访问 `/` 时始终显示 `defaultLocale`。

## 目录结构

`canofold init` 把默认语言放在 `docs/` 根目录，只为其他语言创建子目录。以中文为默认语言时，目录可以这样组织：

:::file-tree
- canofold.config.ts
- docs/
  - index.md
  - guide/
    - install.md
  - en/
    - index.md
    - guide/
      - install.md
:::

这里的中文首页映射到 `/`，中文安装页映射到 `/guide/install/`；英文页面分别映射到 `/en/` 和 `/en/guide/install/`。

也可以把默认语言放在显式目录中，例如 `docs/zh/index.md`。Canofold 官网采用这种对称布局。两种结构都受支持，但不能同时创建 `docs/index.md` 和 `docs/zh/index.md`，否则它们都会映射到 `/`，检查和构建会报告路由冲突。

## 配置语言和导航

```ts title="canofold.config.ts"
import { defineConfig } from 'canofold'

export default defineConfig({
  i18n: {
    defaultLocale: 'zh',
    locales: ['zh', 'en'],
    localeNames: {
      zh: '简体中文',
      en: 'English'
    }
  },
  navigation: {
    zh: [{ text: '指南', link: '/guide/install/' }],
    en: [{ text: 'Guide', link: '/en/guide/install/' }]
  }
})
```

默认语言的导航链接不带语言前缀；其他语言必须带上对应前缀。

## 添加语言和界面文案

添加日语时，把 `ja` 加入 `locales`，再创建 `docs/ja/` 下的页面。中文和英文有内置界面文案，其他语言可以通过 `i18n.messages` 覆盖；没有填写的字段回退到英文。

```ts title="canofold.config.ts"
import { defineConfig } from 'canofold'

export default defineConfig({
  i18n: {
    defaultLocale: 'zh',
    locales: ['zh', 'en', 'ja'],
    localeNames: {
      zh: '简体中文',
      en: 'English',
      ja: '日本語'
    },
    messages: {
      ja: {
        labels: { search: 'ドキュメントを検索', next: '次へ' },
        notFound: { title: 'ページが見つかりません', home: 'ホームへ戻る' },
        markdown: { copyCode: 'コードをコピー' }
      }
    }
  },
  navigation: {
    zh: [{ text: '指南', link: '/guide/' }],
    en: [{ text: 'Guide', link: '/en/guide/' }],
    ja: [{ text: 'ガイド', link: '/ja/guide/' }]
  }
})
```

## 检查翻译页面

运行 `canofold check` 后，Canofold 会按相对路径比较各语言的页面并报告缺失项。页面标题、正文、侧边栏文案和截图不会自动翻译，需要在每种语言中分别维护。

生成的根级 `404.html` 会根据 URL 中的语言前缀选择提示文案和返回首页的链接。
