---
title: 部署静态站点
description: 把 Docfuse 生成目录发布到任意静态托管平台
group: 指南
subgroup: 发布与运营
order: 42
---

# 部署静态站点

Docfuse 不绑定托管平台。构建命令是 `pnpm docs:build`，发布目录默认是 `.docfuse/dist/`。

## 生成平台提示

```bash
pnpm exec docfuse deploy
```

该命令在 `.docfuse/deploy/` 生成平台配置示例和说明，不创建账号、不上传文件，也不修改远端环境。

## 平台参数

| 平台 | Build command | Output directory |
|---|---|---|
| GitHub Pages | `pnpm docs:build` | `.docfuse/dist` |
| Cloudflare Pages | `pnpm docs:build` | `.docfuse/dist` |
| Vercel | `pnpm docs:build` | `.docfuse/dist` |
| Netlify | `pnpm docs:build` | `.docfuse/dist` |
| Nginx / 对象存储 | CI 构建后上传 | `.docfuse/dist` |

托管服务必须按目录提供 `index.html`，不能把站点配置为 SPA fallback。部署到子路径时设置 `basePath`，例如 `/project/`，并确保 CDN/反向代理使用相同前缀。

平台级 301/308 应消费生成的 `redirects.json`。私有文档访问控制和 CSP 见[安全边界](/reference/output/security/)。
