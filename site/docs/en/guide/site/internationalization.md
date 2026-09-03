---
title: Configure localization
description: Configure locales, source directories, navigation, and interface messages
group: Guide
subgroup: Site capabilities
order: 33
---

# Configure localization

The default locale uses root URLs. Other locales use a `/<locale>/` prefix. Canofold does not redirect visitors based on browser language, so `/` always serves `defaultLocale`.

## Source layout

`canofold init` places the default locale at the root of `docs/` and creates subdirectories only for other locales. With English as the default, the source tree can look like this:

:::file-tree
- canofold.config.ts
- docs/
  - index.md
  - guide/
    - install.md
  - zh/
    - index.md
    - guide/
      - install.md
:::

The English home maps to `/` and the English installation page maps to `/guide/install/`; the Chinese pages map to `/zh/` and `/zh/guide/install/`.

The default locale may also use an explicit directory such as `docs/en/index.md`. The Canofold website uses this symmetrical layout. Both forms are supported, but do not create `docs/index.md` and `docs/en/index.md` together. They would both map to `/`, and checks and builds report a route conflict.

## Configure locales and navigation

```ts title="canofold.config.ts"
import { defineConfig } from 'canofold'

export default defineConfig({
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh'],
    localeNames: {
      en: 'English',
      zh: '简体中文'
    }
  },
  navigation: {
    en: [{ text: 'Guide', link: '/guide/install/' }],
    zh: [{ text: '指南', link: '/zh/guide/install/' }]
  }
})
```

Links for the default locale have no locale prefix. Links for every other locale must include one.

## Add a locale and interface messages

To add Japanese, include `ja` in `locales` and create the matching pages under `docs/ja/`. Chinese and English interface messages are built in. Other locales can override `i18n.messages`, with omitted fields falling back to English.

```ts title="canofold.config.ts"
import { defineConfig } from 'canofold'

export default defineConfig({
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh', 'ja'],
    localeNames: {
      en: 'English',
      zh: '简体中文',
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
    en: [{ text: 'Guide', link: '/guide/' }],
    zh: [{ text: '指南', link: '/zh/guide/' }],
    ja: [{ text: 'ガイド', link: '/ja/guide/' }]
  }
})
```

## Check translation coverage

`canofold check` compares page-relative paths across locales and reports missing pages. Titles, body text, sidebar labels, and screenshots are not translated automatically and must be maintained for each locale.

The generated root `404.html` selects its message and home link from the locale prefix in the requested URL.
