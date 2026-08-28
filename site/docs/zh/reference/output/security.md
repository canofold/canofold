---
title: 安全边界
description: 了解 Docfuse 对 Markdown、MDX、外部服务、密钥和私有站点的安全假设
group: 参考
subgroup: 产物与质量
order: 74
---

# 安全边界

Docfuse 在构建期执行仓库配置、扩展、MDX 和本地 TSX。构建必须只运行可信仓库内容。扩展路径和输出约束用于保护构建不变量，并不会隔离扩展代码或它导入的依赖。

## 内容信任级别

| 内容 | 建议 |
|---|---|
| 仓库内审核过的 Markdown | 保留默认 `sanitize`；确实需要原始 HTML 时再显式启用 `trusted` |
| 外部同步 Markdown | 保留 `sanitize`；不需要作者 HTML 时使用 `strip` |
| MDX 与本地 React 组件 | 仅可信内容；它们会执行代码 |
| 项目本地扩展 | 仅加载经过审核的模块并固定依赖；扩展拥有构建进程权限 |
| 外部 PR | 不在持有生产密钥的环境直接运行未审核构建 |

## 密钥

- 不要把密钥写入 Markdown、MDX、`docfuse.config.ts` 浏览器字段或 `docs/public/`。
- Sentry Loader URL 可公开，但组织令牌、上传令牌和服务端 DSN 管理仍放在 CI Secret。

## 私有托管

Docfuse 不提供 SSO/RBAC。身份层必须保护整个静态站点，包括 Markdown 原文、搜索、AI 文件、资源和重定向页面。

## HTML 与链接

`sanitize` 会删除脚本、事件属性和危险 URL，但不是 JavaScript 沙箱。外部链接、iframe、PlantUML 服务和 Mermaid 模块仍应通过 CSP、域名白名单和托管策略约束。

`mermaid()` 默认执行插件内置的固定版本运行时，不发起远程模块请求。`mermaid({ moduleUrl })` 可显式覆盖为自托管模块或 CDN；此时必须把该地址视为远程代码供应链，并只在 CSP 中放行确实需要的来源。`plantUml({ server })` 同样应只指向可信且受控的服务。
