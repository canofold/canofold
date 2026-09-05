---
title: Theme customization
description: Configure Canofold logos, colors, typography, and project styles
group: Guide
subgroup: Site capabilities
order: 36
---

# Theme customization

Start with theme configuration. Load project CSS only when the configuration does not cover a requirement. See the [site configuration reference](/en/reference/configuration/base-config/#theme-and-search) for fields and defaults.

## Logo and base appearance

Put images in `docs/public/` and reference them with site-absolute paths:

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

`logo` is used in the light theme and `logoDark` in the dark theme. Keep both files the same size and shape, changing only colors that need more contrast on a dark background.

## Colors

`baseColor` controls neutral page and surface colors. It supports `paper`, `neutral`, `slate`, `zinc`, and `stone`.

`accentColor` controls links, buttons, focus states, and other primary interactions. Use a preset or any valid CSS color:

```ts title="canofold.config.ts"
import { defineConfig } from 'canofold'

export default defineConfig({
  theme: {
    baseColor: 'slate',
    accentColor: '#7c3aed'
  }
})
```

The site shell and `@canofold/markdown` share these semantic colors:

| Role | Theme tokens | Used for |
|---|---|---|
| Primary | `primary`, `primarySoft`, `primaryDeep` | Links, buttons, focus, and current states |
| Accent | `accent` | Secondary emphasis such as badges |
| Info | `info`, `infoDeep` | `info` callouts and explanatory icons |
| Success | `success`, `successDeep` | `tip` callouts and success states |
| Warning | `warning`, `warningDeep` | `warning` callouts and states that need review |
| Danger | `danger`, `dangerDeep` | `danger` callouts, errors, and destructive states |

The default info color uses the same blue anchor as Canofold's default primary color. `accentColor` changes primary interactions only; status colors stay stable so their meaning does not shift with the brand color. Override a status token only when needed.

Override only semantic colors that need to differ from the preset:

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

## Typography and layout

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

Use `rem` for font sizes and major layout dimensions, and unitless values for body line height. Canofold respects `prefers-reduced-motion`.

## Project CSS

```ts title="canofold.config.ts"
import { defineConfig } from 'canofold'

export default defineConfig({
  styles: ['./docs/brand.css']
})
```

Project CSS loads after defaults and theme variables. Prefer theme tokens, `classNames`, and project-owned classes. Use a semantic attribute as a selector only when the public API documents it; do not depend on internal `.cf-*` classes or exact layout structure.
