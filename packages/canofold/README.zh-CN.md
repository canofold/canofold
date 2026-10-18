# Canofold

[English](./README.md) | 简体中文

`canofold` 是 Canofold 知识文档平台的 CLI。它读取 Markdown、MDX 和项目本地 React 组件，生成导航、搜索、多语言路由、版本页面和 AI-ready 知识输出，最终产出可直接部署的静态 HTML。

## 安装

要求 Node.js 22 或更高版本。建议把 Canofold 安装为项目本地开发依赖：

```bash
pnpm add -D canofold @canofold/themes
pnpm exec canofold init
pnpm exec canofold dev
```

`init` 会创建 `docs/` 和带类型提示的 `canofold.config.ts`。常用命令应写进 `package.json`；临时调用本地版本时使用 `pnpm exec canofold ...`。

## 命令

- `init` 创建文档项目或接管已有文档。
- `dev` 启动开发服务器。
- `check` 检查配置、内容、路由和插件拥有的语法。
- `build` 把生产站点写入 `.canofold/dist/`。
- `preview` 在本地预览生产产物。
- `clean` 删除生成产物和持久化构建状态。
- `deploy` 根据当前项目生成部署说明。

## 视觉主题

在 `canofold.config.ts` 中导入并排列读者可以选择的主题：

```ts
import { canofold, neoBrutalist, neumorphism } from '@canofold/themes'
import { defineConfig } from 'canofold'
import aurora from '@acme/canofold-theme'

export default defineConfig({
  themes: [canofold, neoBrutalist, neumorphism, aurora]
})
```

数组第一项的第一个外观是默认选择。读者切换时无需刷新页面，选择会跨页面保留。每个主题定义自己拥有稳定 ID、本地化名称、CSS 入口和外观；`canofold` 提供浅色与深色，其余官方主题各提供一种外观。不配置 `themes` 时使用 `canofold`。全部官方主题定义见 [`@canofold/themes`](../themes/README.zh-CN.md)。

官方和第三方主题遵守同一份 `ThemeDefinition` 契约。Core 不导出或注册主题；官方主题来自 `@canofold/themes`，第三方主题来自各自的 npm 包，站点只负责把导入的定义放进 `themes`。主题名称属于主题定义，不属于站点通用 `i18n.messages`；后者只覆盖搜索、导航、快捷入口、Markdown 交互和 404 等界面文案。`branding` 只管理 `logo`、`logoDark` 和 `favicon`，`layout` 只管理站点几何尺寸，视觉变量与主题专属样式全部由主题包管理。第三方主题包的完整契约见 [`@canofold/themes`](../themes/README.zh-CN.md)。

## 导航

顶部导航通常按目录路由识别当前栏目。如果相关文档使用平级路由，可在导航项的 `activePaths` 中列出页面的精确路径；这些路径必须指向已生成的页面。例如 `{ text: '组件', link: '/button/', activePaths: ['/notice/', '/progress/'] }`，无需改动页面 URL，也能让所列页面保持“组件”选中。

## 文档版本与日期

`versions` 使用数组，第一项为当前主版本。省略或设为 `[]` 时不展示版本入口，仍从 `docsDir`（默认 `docs`）构建文档；一项显示 `label`，多项提供版本切换，不自动读取项目或 Canofold 包的版本。例如：`versions: [{ id: 'v2', label: 'Acme 2.4', docsDir: 'docs', base: '/' }]`。配置非空数组时，目录分别写在各项中，不再设置顶层 `docsDir`。历史文档需要先保存到独立目录；`canofold snapshot <id>` 复制执行时的当前文档，不会回溯 Git。

页面更新日期来自 `updatedAt` 或可靠的 Git 历史，统一按 UTC 展示，不随构建机器时区变化。两者都不可用时，不显示日期。

## 产物控制与构建报告

默认值保留旧版本的全部产物；只需关闭不想发布的类别：

```ts
import { defineConfig } from 'canofold'

export default defineConfig({
  markdownMirror: false, // 每个 HTML 页面旁的 index.md
  ai: {
    pageIndex: false, // ai/pages.json
    fullContent: false // ai/manifest.json 与 ai/content/**/*.jsonl
  }
})
```

原有的 `search.enabled`、`ai.markdownIndex`、`ai.pageSummaries`、`ai.codeExamples`、`ai.llmsTxt` 和 `ai.llmsFullTxt` 仍可独立控制。关闭 Markdown Mirror 后，`ai/index.md` 改为链接 HTML 页面，AI 记录不再包含 `markdownPath`。关闭完整内容分片后，超出容量的 `llms-full.txt` 不能指向不存在的 Manifest：可以提高 `ai.llmsFullMaxBytes`、关闭 `ai.llmsFullTxt`，或开启 `ai.fullContent`。

每次 `build` 都会输出简短的终端摘要，并在 `.canofold/cache/build-report.json` 写入机器可读报告。报告包含页面、语言与版本数量，构建模式、缓存命中、原因、变更页面和耗时，以及各类内置逻辑产物的启用状态、规划路径、实际路径、文件数量、字节数和缺失路径。`additionalOutputs` 统计不属于这些内置类型的实际文件，包括用户静态资源和 Extension 产物。`removedPaths` 对比上一次有效构建清单；`removalBaseline: false` 表示没有可供比较的清单，此时终端不会声称移除了多少文件。报告存于部署目录之外，不包含文档正文或密钥。关闭某类产物不等于访问控制；私有内容仍需在托管层保护所有剩余的 HTML、搜索和 AI 文件。

## 机器消费契约（0.7）

`ai/pages.json` 和 `ai/manifest.json` 使用 `schemaVersion: 2`，共享 `scope`、`outputs`、`basePath`、`snapshotRevision` 和 `pages` 清单。页面索引由 `ai.pageIndex` 控制，Manifest 与 JSONL 分片由 `ai.fullContent` 控制；关闭某项不会暗中开启另一项。完整 Manifest 自带页面清单，关闭索引后仍可独立消费。

需要跨目录或跨站点地址迁移同一内容集合时，声明稳定命名空间：

```ts
export default { ai: { contentSpace: 'my-project', versions: 'all' } }
```

`contentSpace` 为 1–200 个 ASCII 字母、数字、点、下划线、冒号或连字符，以字母或数字开头。省略时 `scope.space: null`，身份只在当前读取来源内成立，不将不同根目录或地址的快照自动合并。显式命名空间是作者声明，不证明所有权；独立项目应使用不同名称。

每篇被 AI 收录的已发布文档包含：

| 字段 | 含义 |
| --- | --- |
| `id` | 由空间、版本、语言及语言内源路径生成的 SHA-256 文档身份 |
| `revision` | 公开内容事实、来源指纹和表示元数据的修订 |
| `source.path` / `source.kind` | 当前版本/语言内的逻辑路径，以及 `markdown` 或 `mdx`；不含本机绝对路径 |
| `source.revision` | Extension 转换前作者文件字节的 SHA-256，包含 Frontmatter |
| `source.transformedRevision` | 完整 Extension 转换后源文的 SHA-256 |
| `representation.fingerprint` | 内容分段重组后精确 UTF-8 正文的 SHA-256 |
| `representation.body` | `extension-transformed-source-body`：转换后再解析 Frontmatter 的正文，保留作者语法 |
| `representation.facts` | `compiled-static-with-author-and-extension-overrides`：编译静态事实及明确的作者/Extension 覆盖 |
| `representation.analysis` | `markdown-static` 或 `mdx-static-only`，不执行动态 MDX 推测最终内容 |
| `representation.declaredInputsRevision` | 已声明的插件 name/version/cacheKey 和 Extension 描述符指纹；不代表任意执行代码或环境的完整哈希 |
| `routePath` / 可选 `markdownPath` | 带部署前缀的当前发布位置；引用必须匹配语言和版本 |

修改标题或正文保留 `id`；源文件改名按旧身份退出、新身份加入处理。不同语言、版本独立定位。域名、basePath 或分片重组不会创建新的文档身份。修订是指纹，不是 Git 提交、时间戳或跨改名永久 ID。

身份按 JSON 数组 `[space, version, locale, source.path]` 计算 SHA-256；结构化修订输入采用对象键递归按 UTF-16 code unit 排序、数组顺序不变的紧凑 JSON。消费者应将修订视为不透明标识，核验声明的文件/正文校验和。校验和与命名空间本身不能认证发布者。

逻辑源路径统一使用 `/` 分隔符和 Unicode NFC，保留大小写、空格及字面的百分号，不做 URL 解码。这只统一不同文件系统表示下的身份，不重命名源文件，也不改变发布路由。

Manifest 保留预算、总量、分区与分片，增加共同集合字段以及可为 null 的 `pageIndex` 文件描述；每条 JSONL 记录用 `documentId` 关联文档。读取时核验字节数、SHA-256、记录数、版本语言范围、分段唯一性、正文完整性和正文指纹。索引启用时还需校验其文件描述、快照及文档清单相同，不能混用新旧索引、Manifest 和分片。获取的内容只作为数据，不执行 MDX 或其中的指令。

只有完整、校验通过且范围与内容可用性匹配的快照可以比较。没有可信旧基线，差异为未知。完整新清单缺少一篇文档只证明它退出该 AI 集合，不能证明源文件被删除：`ai: false`、草稿和版本选择都会影响收录。缺片、请求失败、不支持的格式或范围变化不能转成批量删除；全部校验成功后才提交新的消费状态。

Markdown Mirror 保留完整 Extension 转换后源文，JSONL 与 `llms-full.txt` 保留其解析后的正文；两者都不是 HTML 反向转换的结果。Markdown 插件可以改变编译标题、目录和摘要，动态 MDX 还可能有仅运行时可知的内容。页面元数据不公开任意私有 Frontmatter 和本机绝对路径；私有源文字节变化仍会改变来源指纹。

### 从 schema 1 升级

0.6.x 完整内容 Manifest 使用 schema 1，页面索引没有 schema 2 信封字段。生产者与 Reader 一起升级，重新构建并建立新的可信基线；不支持的版本明确报错。不能把旧路由记录直接与新文档 ID 比较，也不能把格式重置当作内容删除。既有输出开关、HTML 和 Markdown 路由语义保留；Canofold 五包需要整套升级。

Canofold 是构建工具，不是沙箱。MDX、本地组件、配置和 Extension 都会以构建进程的权限执行，只能使用经过审核的源码。

使用方法、配置、部署和故障排查见 [Canofold 文档](https://canofold.dev/guide/)。

许可证：MIT
