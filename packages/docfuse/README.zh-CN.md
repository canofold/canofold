# Docfuse

[English](./README.md) | 简体中文

Docfuse 是一个面向 Markdown、MDX 和项目本地 React 组件的静态文档 CLI。它负责生成导航、搜索、多语言路由、版本页面和 AI 可读产物，最终输出可直接部署的静态 HTML。

## 安装

要求 Node.js 22 或更高版本。建议把 Docfuse 安装为项目本地开发依赖：

```bash
pnpm add -D docfuse
pnpm exec docfuse init
pnpm exec docfuse dev
```

`init` 会创建 `docs/` 和带类型提示的 `docfuse.config.ts`。常用命令应写进 `package.json`；临时调用本地版本时使用 `pnpm exec docfuse ...`。

## 命令

- `init` 创建文档项目或接管已有文档。
- `dev` 启动开发服务器。
- `check` 检查配置、内容、路由和插件拥有的语法。
- `build` 把生产站点写入 `.docfuse/dist/`。
- `preview` 在本地预览生产产物。
- `clean` 删除生成产物和持久化构建状态。
- `deploy` 根据当前项目生成部署说明。

Docfuse 是构建工具，不是沙箱。MDX、本地组件、配置和 Extension 都会以构建进程的权限执行，只能使用经过审核的源码。

使用方法、配置、部署和故障排查见 [Docfuse 文档](https://docfuse.dev/guide/)。

许可证：MIT
