---
title: Frontmatter 参考
description: 查询 Docfuse 页面元数据字段、默认值和生效范围
group: 参考
subgroup: 配置与命令
order: 52
---

# Frontmatter 参考

Frontmatter 位于 Markdown 或 MDX 文件顶部。通用页面字段适用于全部内容；`hero` 和 `features` 只用于各语言首页。

未知字段可以被解析，但不影响 Docfuse 行为，也不会自动写入公开 AI 索引。`ai/pages.json` 仅保留 `title`、`description`、`createdAt`、`updatedAt`、`order`、`group`、`subgroup`、`tags` 和 `owner`。

## 通用页面字段

普通内容页通常只需要标题、描述和排序：

```yaml
---
title: API 鉴权
seoTitle: API 鉴权与请求签名｜Acme Docs
description: 配置服务端 API Token 和请求签名
order: 20
---
```

| 字段 | 类型 | 默认值 | 作用 |
|---|---|---|---|
| `title` | `string` | 第一个标题或空 | 页面标题、侧栏和默认 SEO title |
| `seoTitle` | `string` | 由 `title` 和站点标题生成 | 仅覆盖浏览器与搜索结果标题，不改变页面标题、侧栏、搜索或 AI 数据 |
| `description` | `string` | 空 | SEO、搜索结果和确定性摘要 |
| `createdAt` | ISO 8601 日期 | 无 | 保存内容创建时间并写入公开页面元数据 |
| `updatedAt` | ISO 8601 日期 | 文件修改时间 | 固定页脚“最后更新”时间并写入公开页面元数据 |
| `group` | `string` | 一级目录名 | 顶级分区的兼容/显示覆盖字段 |
| `subgroup` | `string` | 二级目录名 | 第一层嵌套分组的兼容/显示覆盖字段 |
| `order` | `number` | 最后 | 页面、侧栏和上下篇顺序 |
| `collapsed` | `boolean` | `false` | 目录 `index.md` 对应分组的初始折叠状态 |
| `layout` | `document \| playground` | `document` | 使用标准文档布局，或为可编辑源码/预览页启用 Playground 布局 |
| `status` | `published \| draft` | `published` | `draft` 页面不进入构建 |
| `sidebar` | `boolean` | `true` | 是否出现在侧栏，不影响路由生成 |
| `search` | `boolean` | `true` | 是否进入搜索索引 |
| `ai` | `boolean` | `true` | 是否进入 AI 输出 |
| `tags` | `string[]` | 空 | 写入 `ai/pages.json` |
| `owner` | `string` | 空 | 写入 `ai/pages.json` |

### 导航字段

各级目录的 `index.md` 是分组名称和折叠状态的权威来源。同一目录声明不同的 `group` 或 `subgroup` 会使构建失败。

`group` 和 `subgroup` 不会把内容树限制为两层。递归导航应使用各级目录的 `index.md`；这两个字段主要用于兼容旧内容或覆盖显示名称。

### 日期字段

只有在创建时间或更新时间必须在不同机器上保持一致时，才需要显式填写 `createdAt` 或 `updatedAt`。日期使用 `YYYY-MM-DD`，带时间时必须包含 `Z` 或 `+08:00` 这样的时区偏移。未填写 `updatedAt` 时，Docfuse 回退到源文件的本地修改时间；该值可能因重新检出、复制文件或 CI 构建而变化。

## 首页字段

每种语言的首页都由该语言根目录的 `index.md` 配置。默认语言使用 `docs/index.md`，其他语言使用 `docs/{locale}/index.md`。`docfuse.config.ts` 只保存站点级配置，不保存首页文案。

```yaml
---
title: Acme Docs
seoTitle: Acme Docs｜从接口定义生成可部署的文档站
hero:
  accent: 从接口定义生成可部署的文档站
  tagline: 在仓库中维护内容和配置，构建结果可以直接部署。
  image: /banner.png
  imageAlt: Acme 文档构建流程
  actions:
    - text: 快速开始
      link: /guide/getting-started/
      primary: true
      icon: rocket
features:
  - image: /feature/api.png
    title: 接口参考
    details: 从版本化内容生成可搜索的接口文档。
---
```

### 页面结构

| 字段 | 类型 | 页面位置 | 说明 |
|---|---|---|---|
| `title` | `string` | Hero 主标题 | 首页唯一的可见主标题 |
| `seoTitle` | `string` | 不直接显示 | 仅覆盖浏览器与搜索结果标题；适合为简短品牌名补充产品定义 |
| `description` | `string` | 不直接显示 | SEO description 和搜索摘要 |
| `hero.accent` | `string` | 主标题下方 | 一句话说明首页的核心信息 |
| `hero.tagline` | `string` | Accent 下方 | 用一到两句话补充产品定义或使用范围 |
| `hero.image` | `string` | Hero 右侧 | 首页主视觉；省略后使用单栏布局 |
| `hero.imageAlt` | `string` | 不直接显示 | 图片的替代文本；纯装饰图片可写空字符串 |
| `hero.actions` | `array` | Hero 按钮组 | 按数组顺序从左到右显示 |
| `features` | `array` | Hero 下方 | 首页能力卡片 |

`hero.image` 和 `actions[].link` 接受以 `/` 开头的站内路径或 HTTPS URL。其他协议会使检查和构建失败。

### Hero 按钮

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `text` | `string` | 是 | 按钮文案 |
| `link` | `string` | 是 | 站内绝对路径或 HTTPS URL |
| `primary` | `boolean` | 否 | 使用主按钮样式；一个首页最多设置一个 |
| `icon` | `string` | 否 | 使用 Docfuse 内置 Lucide 图标 |

### 能力卡片

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `title` | `string` | 是 | 卡片标题 |
| `details` | `string` | 是 | 一句能力说明 |
| `image` | `string` | 否 | 使用 `{docsDir}/public/` 中的图片，例如 `/feature/api.svg` |
| `icon` | `string` | 否 | 使用与按钮相同的内置图标 |

同时填写 `image` 和 `icon` 时优先显示 `image`；两者都省略时显示纯文本卡片。

### 图片与内置图标

以 `/` 开头的图片路径映射到 `{docsDir}/public/`。例如 `/banner.png` 对应 `{docsDir}/public/banner.png`，`/feature/api.svg` 对应 `{docsDir}/public/feature/api.svg`。

按钮和能力卡片也可以使用 Docfuse 内置的 Lucide 图标，不需要安装图标包。可用值为 `ai`、`box`、`code`、`file`、`file-code`、`gauge`、`globe`、`layers`、`rocket`、`search`、`sparkles` 和 `terminal`。

首页字段会在内容扫描阶段校验。类型错误、未知子字段、不支持的图标或多个主按钮都会使检查和构建失败。
