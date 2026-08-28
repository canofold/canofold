---
title: 快速开始
description: 创建并预览第一个 Docfuse 站点
group: 指南
subgroup: 入门
order: 3
---

# 快速开始

开始前，请先在项目中[安装 Docfuse](/guide/introduction/installation/)。

::::steps[创建站点]
:::step[初始化]

在项目根目录运行：

```bash
pnpm exec docfuse init
```

命令会创建 `docfuse.config.ts`、`docs/index.md` 和类型声明，不会覆盖已有内容。
:::

:::step[添加脚本]

```json title="package.json"
{
  "scripts": {
    "docs:dev": "docfuse dev",
    "docs:check": "docfuse check",
    "docs:build": "docfuse build",
    "docs:preview": "docfuse preview"
  }
}
```
:::

:::step[启动开发服务]

```bash
pnpm docs:dev
```

打开终端显示的地址，然后编辑 `docs/index.md`。
:::
::::

## 构建站点

```bash
pnpm docs:check
pnpm docs:build
pnpm docs:preview
```

静态文件生成到 `.docfuse/dist/`。接下来可以[组织内容](/guide/writing/content-structure/)、[定制主题](/guide/site/customization/)或[部署站点](/guide/delivery/deployment/)。
