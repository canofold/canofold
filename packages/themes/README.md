# @canofold/themes

[简体中文](./README.zh-CN.md)

The theme contract and official visual themes for Canofold. A theme owns localized names, visual tokens, theme-specific styles, and selectable appearances. Canofold Core owns layout, behavior, accessibility, persistence, and build-time CSS assembly.

## Official themes

```ts
import {
  bauhaus,
  canofold,
  cyberChinese,
  dopamineDesign,
  glassmorphism,
  handDrawnDoodle,
  memphis,
  minimalistFlat,
  neoBrutalist,
  neumorphism,
  outrun,
  pixelAnime,
  sketchStyle,
  shoujoManga
} from '@canofold/themes'
```

`canofold` provides light and dark appearances. Every other official theme provides one fixed appearance. A site enables only the imported definitions it places in `themes`; Core keeps no theme registry.

| Export | Theme id | Appearance |
| --- | --- | --- |
| `canofold` | `canofold` | Light and dark |
| `glassmorphism` | `glassmorphism` | Dark |
| `sketchStyle` | `sketch-style` | Light |
| `handDrawnDoodle` | `hand-drawn-doodle` | Light |
| `minimalistFlat` | `minimalist-flat` | Light |
| `bauhaus` | `bauhaus` | Light |
| `neoBrutalist` | `neo-brutalist` | Light |
| `neumorphism` | `neumorphism` | Light |
| `memphis` | `memphis` | Light |
| `cyberChinese` | `cyber-chinese` | Dark |
| `pixelAnime` | `pixel-anime` | Dark |
| `dopamineDesign` | `dopamine-design` | Light |
| `shoujoManga` | `shoujo-manga` | Light |
| `outrun` | `outrun` | Dark |

## Build a third-party theme package

A third-party theme package declares `@canofold/themes` as a peer dependency and exports its definition and CSS separately. A minimal package manifest looks like this:

```json
{
  "name": "@acme/canofold-theme",
  "type": "module",
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./index.js"
    },
    "./aurora.css": "./aurora.css"
  },
  "peerDependencies": {
    "@canofold/themes": "^0.6.0"
  }
}
```

The package entry exports a definition created with `defineTheme`:

```ts
import { defineTheme } from '@canofold/themes'

export default defineTheme({
  id: 'aurora',
  name: { zh: '极光', en: 'Aurora' },
  styles: ['@acme/canofold-theme/aurora.css'],
  appearances: [
    {
      id: 'default',
      name: { zh: '默认', en: 'Default' },
      colorScheme: 'light'
    }
  ]
})
```

Theme and appearance ids use lowercase kebab-case. `name` maps BCP 47 locales or base languages to display names. `styles` lists exported CSS entries in cascade order; a project-local theme may instead use paths relative to the `canofold.config.ts` working directory. `appearances` must contain at least one entry. Scope CSS with `html[data-cf-theme='aurora']`; themes with multiple appearances can additionally target `data-cf-theme-appearance`.

Consumers import the third-party definition directly, with no registry or Core change:

```ts
import { canofold } from '@canofold/themes'
import { defineConfig } from 'canofold'
import aurora from '@acme/canofold-theme'

export default defineConfig({
  themes: [canofold, aurora]
})
```

The first appearance of the first entry is the default. Core includes only the selected themes' CSS and derives the switcher, pre-paint restoration, and iframe Demo synchronization from theme metadata. Theme packages must not redefine layout, interaction state, or accessibility behavior.

### CSS responsibility contract

`@canofold/themes/shared.css` is the only stable CSS contract between themes and the rendering layers. Core and Markdown own DOM structure, layout dimensions, alignment, responsive rules, visibility, scrolling, hit areas, focus behavior, and accessibility. Themes own semantic colors, typography, radii, shadows, material treatment, borders, and purely visual motion.

A third-party theme should first override the `--cf-*` visual hooks from `shared.css` inside its own `html[data-cf-theme='<id>']` scope. Use scoped `.cf-*` component selectors only when variables cannot express a distinctive treatment. Theme CSS must not set `display`, `position`, dimensions, spacing, grid or flex layout, alignment, overflow, `z-index`, `pointer-events`, `visibility`, or other structural and behavioral properties, and it must not take ownership of the theme picker's selected state. This keeps one Core/Markdown structure functionally and accessibly consistent across themes.

Theme-specific page visuals follow the same boundary. For example, homepage illustration filters, opacity, and animation use the `--cf-hero-visual-*` hooks, while Core continues to own the illustration's position, dimensions, and responsive layout. `shared.css` supplies safe defaults for every hook, so third-party themes only override the visual decisions they actually change.

For standalone Markdown rendering, import `@canofold/markdown/base.css` plus the selected definition's CSS entries in their declared order. The Markdown base already includes the shared theme contract; `@canofold/themes/shared.css` remains available to non-Markdown surfaces that implement the same contract. `canofold-site.css` contains only the default site's branded homepage styling.
