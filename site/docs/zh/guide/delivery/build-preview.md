---
title: 构建与预览
description: 检查内容、构建站点并预览生产产物
group: 指南
subgroup: 发布与运营
order: 41
---

# 构建与预览

::::steps[发布前检查]
:::step[检查内容]

```bash
pnpm docs:check
```

检查配置、Frontmatter、代码围栏、站内链接、静态资源、路由和翻译缺口。
:::

:::step[构建站点]

```bash
pnpm docs:build
```

静态文件默认生成到 `.canofold/dist/`。
:::

:::step[预览生产产物]

```bash
pnpm docs:preview
```

检查首页、深层路由、404、搜索、多语言、版本和静态资源。
:::
::::

需要排除旧缓存影响时运行 `pnpm exec canofold build --no-cache`。需要删除生成产物和构建状态时运行 `pnpm exec canofold clean`。

## 按能力验收

| 能力 | 验证内容 |
|---|---|
| Markdown 插件 | 页面显示转换后的公式、图表或 HTML；浏览器控制台没有脚本错误 |
| Search Provider | 搜索能找到新增页面，`/search/` 或 `/pagefind/` 资源可以访问 |
| Extension | 源码和页面修改已经生效，声明的文件存在于 `outputDir/extensions/{name}/` |
| 项目静态资源 | 深层路由中的图片、字体和下载文件没有 404 |

构建完成后，按[部署指南](/guide/delivery/deployment/)发布 `.canofold/dist/`。
