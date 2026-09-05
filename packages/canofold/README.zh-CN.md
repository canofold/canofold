# Canofold

[English](./README.md) | 简体中文

`canofold` 是 Canofold 知识文档平台的 CLI。它读取 Markdown、MDX 和项目本地 React 组件，生成导航、搜索、多语言路由、版本页面和 AI-ready 知识输出，最终产出可直接部署的静态 HTML。

## 安装

要求 Node.js 22 或更高版本。建议把 Canofold 安装为项目本地开发依赖：

```bash
pnpm add -D canofold
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

Canofold 是构建工具，不是沙箱。MDX、本地组件、配置和 Extension 都会以构建进程的权限执行，只能使用经过审核的源码。

使用方法、配置、部署和故障排查见 [Canofold 文档](https://canofold.dev/guide/)。

许可证：MIT
