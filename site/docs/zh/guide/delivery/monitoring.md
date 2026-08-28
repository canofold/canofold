---
title: 配置生产监控
description: 使用 Sentry Browser Loader 收集浏览器错误和性能数据
group: 指南
subgroup: 发布与运营
order: 44
---

# 配置生产监控

Docfuse 可以加载 Sentry Browser Loader，把浏览器错误和性能数据发送到你自己的 Sentry 项目。Docfuse 本身不接收或存储这些数据。

```ts title="docfuse.config.ts"
import { defineConfig } from 'docfuse'

export default defineConfig({
  monitoring: {
    provider: 'sentry',
    loaderUrl: 'https://js.sentry-cdn.com/PROJECT_KEY.min.js',
    environment: 'production',
    release: 'docs@2.4.0',
    tracesSampleRate: 0.05
  }
})
```

`loaderUrl` 必须使用 `https://js.sentry-cdn.com` 主机，其他 HTTPS 地址也会被配置校验拒绝。`environment` 区分预览和生产，`release` 应与文档版本或提交对应；`tracesSampleRate` 取 0–1，并应按流量、隐私和预算设置。

上线前主动触发一次受控客户端错误，确认事件进入正确 environment/release。使用外部 Loader 时把实际域名加入 CSP 的 `script-src` 与 `connect-src`；完整安全策略见[安全边界](/reference/output/security/)。
