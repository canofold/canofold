---
title: 定制主题
description: 配置 Canofold 的 Logo、配色、排版和项目样式
group: 指南
subgroup: 站点能力
order: 36
---

# 定制主题

先使用主题配置完成品牌定制；只有配置项不够时，再加载项目 CSS。字段和默认值见[站点配置参考](/reference/configuration/base-config/#主题与搜索)。

## Logo 与基础外观

把图片放入 `docs/public/`，再使用站点绝对路径：

```ts title="canofold.config.ts"
import { defineConfig } from 'canofold'

export default defineConfig({
  theme: {
    logo: '/logo-light.svg',
    logoDark: '/logo-dark.svg',
    favicon: '/favicon.svg',
    baseColor: 'paper',
    accentColor: 'canofold',
    darkMode: true,
    radius: 8
  }
})
```

`logo` 用于亮色主题，`logoDark` 用于暗色主题。两张图片应保持相同尺寸和轮廓，只调整暗色背景下需要变化的颜色。

## 配色

`baseColor` 控制页面和内容面的中性色，支持 `paper`、`neutral`、`slate`、`zinc` 和 `stone`。

`accentColor` 控制链接、按钮和焦点等主交互颜色，可以使用内置预设，也可以传入合法 CSS 颜色：

```ts title="canofold.config.ts"
import { defineConfig } from 'canofold'

export default defineConfig({
  theme: {
    baseColor: 'slate',
    accentColor: '#7c3aed'
  }
})
```

站点 Shell 与 `@canofold/markdown` 共用以下语义色：

| 角色 | Theme Token | 用途 |
|---|---|---|
| 主色 | `primary`、`primarySoft`、`primaryDeep` | 链接、按钮、焦点和当前状态 |
| 强调色 | `accent` | Badge 等次级强调内容 |
| 信息 | `info`、`infoDeep` | `info` 提示块和说明图标 |
| 成功 | `success`、`successDeep` | `tip` 提示块和成功状态 |
| 警告 | `warning`、`warningDeep` | `warning` 提示块和待确认状态 |
| 危险 | `danger`、`dangerDeep` | `danger` 提示块、错误和破坏性状态 |

默认信息色与 Canofold 主色使用同一蓝色锚点。`accentColor` 只改变主交互颜色；状态色保持固定，避免不同语义随品牌色变化。需要调整时再单独覆盖对应 Token。

需要覆盖具体语义色时，只写与预设不同的值：

```ts title="canofold.config.ts"
import { defineConfig } from 'canofold'

export default defineConfig({
  theme: {
    tokens: {
      colors: {
        light: {
          canvas: '#fafafa',
          primary: '#7c3aed'
        },
        dark: {
          canvas: '#18181b',
          primary: '#a78bfa'
        }
      }
    }
  }
})
```

## 排版与布局

```ts title="canofold.config.ts"
import { defineConfig } from 'canofold'

export default defineConfig({
  theme: {
    sidebarWidth: '18rem',
    outlineWidth: '16rem',
    tokens: {
      typography: {
        sansFont: 'Inter, sans-serif',
        monoFont: 'JetBrains Mono, monospace',
        bodyLineHeight: '1.65'
      },
      layout: {
        readingWidth: '72ch',
        gutter: '2rem'
      }
    }
  }
})
```

建议使用 `rem` 设置字号和主要布局尺寸，正文行高使用无单位数值。系统会自动遵循 `prefers-reduced-motion`。

## 项目 CSS

```ts title="canofold.config.ts"
import { defineConfig } from 'canofold'

export default defineConfig({
  styles: ['./docs/brand.css']
})
```

项目 CSS 在默认样式和主题变量之后加载。优先使用主题 Token、`classNames` 和项目自己的 class。只有公共 API 明确说明的语义属性才能作为选择器；不要依赖内部 `.cf-*` 类名或精确布局结构。
