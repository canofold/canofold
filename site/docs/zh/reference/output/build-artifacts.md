---
title: 构建产物参考
description: 了解 Canofold 输出目录中的页面、资源、搜索、SEO、AI 和重定向文件
group: 参考
subgroup: 产物与质量
order: 71
---

# 构建产物参考

`canofold build` 把文档编译成可以直接部署的静态站点，默认写入 `.canofold/dist`。每个页面都有包含完整正文的 HTML 和相邻的 Markdown 原文；目录中还包括主题样式、交互资源、搜索索引以及按配置生成的 SEO 和 AI 文件。

完整重建先在临时目录生成产物，成功后再原子替换现有输出；构建失败时保留上一次成功结果。

:::file-tree
- .canofold/
  - dist/
    - index.html
    - 404.html
    - assets/
      - canofold.css
    - search/
      - {version}/
        - {locale}.json
    - ai/
      - manifest.json
      - content/
        - {version}/
          - {locale}/
            - *.jsonl
    - llms.txt
    - llms-full.txt
    - sitemap.xml
    - robots.txt
    - redirects.json
    - guide/
      - .../
        - index.html
        - index.md
:::

| 产物 | 条件 | 用途 |
|---|---|---|
| 页面 `index.html` | 始终 | 包含完整正文的静态页面 |
| 页面 `index.md` | 始终 | 构建时使用的页面 Markdown/MDX 源文 |
| `assets/canofold.css` | 始终 | 默认主题、Token 和用户样式 |
| `assets/canofold-markdown/*` | 页面存在交互 behavior | 原生增强入口与按需富交互代码 |
| `assets/fonts/*` | 启用 math 插件且至少一页包含数学 | KaTeX 的完整 WOFF2 字体集 |
| `search/*` | 默认 compact Provider 启用 | 按版本和语言生成的单文件索引 |
| `pagefind/*` | 配置 `pagefind()` | 按查询加载、按语言和版本过滤的分块索引 |
| `robots.txt` | 始终 | 搜索引擎抓取策略 |
| `sitemap.xml` | 配置 `siteUrl` | 站点绝对 URL 清单 |
| `redirects.json` | 配置重定向 | 托管平台规则清单 |
| `ai/pages.json` | 始终 | 按 `ai.versions` 范围生成的基础 AI 页面索引 |
| `ai/manifest.json` / `ai/content/*` | 始终 | 有版本、有语言分区且单分片有大小上限的完整 AI 语料 |
| 其他 `ai/*` / `llms*.txt` | 对应 AI 开关启用 | AI 与 RAG 消费 |

标题、段落和普通列表不依赖客户端 JavaScript。复制、Tabs、Details 和文件树等基础行为使用原生 DOM；可排序表格、图片预览和画廊按需加载 React，图表客户端由对应插件按页加载。未配置 math 插件或没有数学内容的站点不输出 KaTeX CSS 或字体。
