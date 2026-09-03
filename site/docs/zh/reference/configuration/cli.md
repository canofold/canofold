---
title: CLI 命令参考
description: 查看 canofold init、dev、check、build、preview 和 deploy 的输入、输出与失败条件
group: 参考
subgroup: 配置与命令
order: 53
---

# CLI 命令参考

本页用裸 `canofold` 表示命令签名。项目脚本可直接使用这个写法；临时执行本地依赖时在前面加 `pnpm exec`。安装方式见[安装](/guide/introduction/installation/)。

```bash
canofold --help
```

Canofold 0.2 提供七个命令。`dev`、`check`、`build`、`clean`、`preview` 和 `deploy` 从当前工作目录加载配置；支持 `canofold.config.ts`、`.mts`、`.cts`、`.js`、`.mjs` 和 `.cjs`。`init` 在目标目录创建或读取配置，`--help` 不加载项目配置。

| 命令 | 用途 | 默认输出 |
|---|---|---|
| `canofold init [dir] [options]` | 创建文档或接入已有内容 | 内容目录、`canofold.config.ts` |
| `canofold dev [--port]` | 启动本地开发服务 | `http://127.0.0.1:3333/` |
| `canofold check` | 输出内容质量问题 | 终端报告 |
| `canofold build [--no-cache]` | 生成静态站点 | `.canofold/dist` |
| `canofold clean` | 删除生成产物和构建状态 | — |
| `canofold preview [--port]` | 预览已构建产物 | 本地 HTTP 服务 |
| `canofold deploy` | 生成托管平台配置示例 | `.canofold/deploy` |

## `canofold init [dir] [options]`

```bash
canofold init
canofold init my-docs
canofold init --locale en
canofold init --locale zh --locales zh,en
canofold init --locale zh --docs-dir handbook
```

- 不传 `dir` 时，在当前目录创建文档文件。
- 传入 `dir` 时，在子目录中创建独立项目。
- 全新项目默认创建中文单语言内容，直接位于 `docs/`，不创建 `zh/` 或 `en/`。
- 已有 Markdown/MDX 时原地接入，只补充缺失的配置与 `canofold-env.d.ts`，不移动、覆盖或自动补写内容。
- 已有 `canofold.config.ts` 时以配置为准；重复运行是成功的无操作。

| 选项 | 说明 |
|---|---|
| `--locale <locale>` | 设置默认语言；单语言项目只需要该选项 |
| `--locales <locale,...>` | 设置全部语言；未传 `--locale` 时第一项为默认语言 |
| `--docs-dir <path>` | 使用项目内的其他相对内容目录 |

单语言不使用 locale 目录。多语言时默认语言仍位于内容目录根部，只有非默认语言使用 `{docsDir}/{locale}/`。中文和英文 locale（包括 `zh-CN`、`en-US` 等区域变体）按基础语言复用本地化示例；其他语言生成语言中性的最小首页。

已有内容但没有配置或语言参数时，交互式终端会询问 locale。脚本和 CI 不会猜测语言，而是停止并要求传入 `--locale` 或 `--locales`。绝对 `docsDir`、项目外路径、重复 locale、无效 locale，以及与现有配置冲突的参数都会在写入前失败。

## `canofold dev [--port <number>]`

```bash
canofold dev
canofold dev --port 3334
```

`--port` 与 `preview` 使用同一校验规则，必须是 1–65535 之间的整数。

启动时先构建一次，然后监听项目输入。监听范围覆盖配置的内容目录、本地样式、组件、Extension，以及六种受支持的配置文件；自动排除 `.git`、`node_modules`、`.canofold`、构建输出和临时交换目录。

单篇 Markdown/MDX 且导航元数据未改变时，开发服务可做单页重建；配置、新增文件或导航结构变化会回退到完整构建。

## `canofold check`

```bash
canofold check
```

报告格式：

```txt
WARNING: guide/install.md Frontmatter description is missing
ERROR: guide/install.md Link target does not exist: /reference/missing/
```

检查内容包括：

- 代码块是否声明语言。
- `title` 和 `description` 是否缺失。
- 内部链接与相对图片是否存在。
- 同页标题是否重复。
- 各语言是否存在对应文件。

`check` 会在加载内容图时拒绝非法配置和路由，但不会替代完整编译。生产构建仍是 MDX、本地组件和扩展产物的最终门禁。CI 如果要将警告升级为失败，应根据终端输出添加团队自己的规则。

## `canofold build [--no-cache]`

```bash
canofold build
canofold build --no-cache
```

下列问题会使命令失败：

- `canofold.config.ts` 无法加载或不符合配置 schema。
- `requiredVersion` 与当前 Canofold 版本不匹配。
- Markdown、MDX 或本地 React 组件编译失败。
- 路由、输出文件、顶部导航或分组元数据冲突。
- 版本、重定向或语言配置不成立。

Canofold 在 `.canofold/cache` 保存版本化 Manifest。缓存命中前会同时校验输入和生成文件；
安全时只重建失效页面，Manifest 损坏、版本不兼容或输出被修改时自动回退为完整构建。
所有构建都通过临时目录原子替换 `outputDir`，失败时保留上一次成功产物。

使用 `--no-cache` 可以强制完整构建，并写入新的 Manifest。

## `canofold clean`

```bash
canofold clean
```

`clean` 删除配置的 `outputDir` 和持久构建 Manifest。它与 `build` 使用相同的路径安全校验和
构建锁，输入目录与输出目录重叠时会拒绝删除。

## `canofold preview [--port <number>]`

```bash
canofold preview
canofold preview --port 4174
```

`--port` 必须是 1–65535 之间的整数。命令只服务 `outputDir`，不监听源文件。

## `canofold deploy`

```bash
canofold build
canofold deploy
```

没有构建产物时 `deploy` 会失败。它生成 GitHub Pages、Cloudflare Pages、Vercel、Netlify 和 Nginx 的配置示例，但不执行登录、上传或发布。
