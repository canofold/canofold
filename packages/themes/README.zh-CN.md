# @canofold/themes

[English](./README.md)

Canofold 的主题契约与官方视觉主题包。主题负责本地化名称、视觉变量、主题专属样式和可选择外观；Canofold Core 负责布局、交互、无障碍、持久化和构建时 CSS 装配。

## 官方主题

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

`canofold` 包含浅色与深色两个外观，其余官方主题各包含一个固定外观。站点只启用导入并放进 `themes` 的定义；Core 不维护主题注册表。

| 导出名 | 主题 ID | 外观 |
| --- | --- | --- |
| `canofold` | `canofold` | 浅色、深色 |
| `glassmorphism` | `glassmorphism` | 深色 |
| `sketchStyle` | `sketch-style` | 浅色 |
| `handDrawnDoodle` | `hand-drawn-doodle` | 浅色 |
| `minimalistFlat` | `minimalist-flat` | 浅色 |
| `bauhaus` | `bauhaus` | 浅色 |
| `neoBrutalist` | `neo-brutalist` | 浅色 |
| `neumorphism` | `neumorphism` | 浅色 |
| `memphis` | `memphis` | 浅色 |
| `cyberChinese` | `cyber-chinese` | 深色 |
| `pixelAnime` | `pixel-anime` | 深色 |
| `dopamineDesign` | `dopamine-design` | 浅色 |
| `shoujoManga` | `shoujo-manga` | 浅色 |
| `outrun` | `outrun` | 深色 |

## 开发第三方主题包

第三方主题包把 `@canofold/themes` 声明为 peer dependency，并分别导出主题定义与 CSS。最小包结构如下：

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

包入口导出一份通过 `defineTheme` 创建的定义：

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

`id` 和外观 ID 使用小写 kebab-case；`name` 按 BCP 47 locale 或基础语言提供显示名称；`styles` 按级联顺序列出包导出的 CSS，也可在项目内主题中使用相对 `canofold.config.ts` 工作目录的路径；`appearances` 至少包含一个外观。CSS 使用 `html[data-cf-theme='aurora']` 作用域声明语义变量与主题专属外观；多外观主题还可以使用 `data-cf-theme-appearance`。

消费方直接导入第三方定义，不需要注册表或 Core 改动：

```ts
import { canofold } from '@canofold/themes'
import { defineConfig } from 'canofold'
import aurora from '@acme/canofold-theme'

export default defineConfig({
  themes: [canofold, aurora]
})
```

数组第一项的第一个外观是默认选择。Core 只把所选主题的 CSS 写入站点，并根据主题元数据生成切换菜单、首屏恢复状态和 iframe Demo 外观同步。布局、交互状态和无障碍样式不得由主题包重写。

### CSS 职责契约

`@canofold/themes/shared.css` 是主题与渲染层之间唯一稳定的 CSS 契约：Core 与 Markdown 负责 DOM 结构、布局尺寸、对齐、响应式规则、显隐、滚动、点击区域、焦点行为和无障碍；主题负责语义颜色、字体、圆角、阴影、材质、边框和纯视觉动效。

第三方主题应优先在自己的 `html[data-cf-theme='<id>']` 作用域覆盖 `shared.css` 中的 `--cf-*` 视觉 Hook。只有变量无法表达主题特征时，才使用同一作用域下的 `.cf-*` 组件选择器。主题 CSS 不得设置 `display`、`position`、尺寸、间距、网格或 Flex 布局、对齐、溢出、`z-index`、`pointer-events`、`visibility` 等结构或行为属性，也不得接管主题选择器的选中状态。这样同一份 Core/Markdown 结构在所有主题下具有一致的功能与可访问性。

主题专属页面视觉也遵循这一边界。例如首页插画的滤镜、透明度和动画使用 `--cf-hero-visual-*` Hook；插画的位置、宽高和响应式布局仍由 Core 管理。`shared.css` 为所有 Hook 提供安全默认值，因此第三方主题只需覆盖自己真正需要改变的部分。

独立渲染 Markdown 时，引入 `@canofold/markdown/base.css`，再按所选主题定义中 `styles` 的顺序引入 CSS。Markdown 基础样式已包含共享主题契约；实现同一契约的非 Markdown 界面仍可单独使用 `@canofold/themes/shared.css`。`canofold-site.css` 只包含默认站点首页的品牌化样式。
