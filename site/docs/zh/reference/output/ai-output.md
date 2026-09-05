---
title: AI 友好输出
description: 了解 Canofold 生成的 llms.txt、Markdown 原文、页面索引、摘要和代码示例数据
group: 参考
subgroup: 产物与质量
order: 72
---

# AI 友好输出

Canofold 在构建站点时同时生成机器可读文件。这些文件不会调用外部模型，也不需要 API Key。

## 产物清单

:::file-tree
- .canofold/
  - dist/
    - llms.txt
    - llms-full.txt
    - ai/
      - manifest.json
      - index.md
      - pages.json
      - summaries.json
      - code-examples.json
      - content/
        - current/
          - zh/
            - 0001.jsonl
    - guide/
      - getting-started/
        - index.html
        - index.md
    - en/
      - guide/
        - getting-started/
          - index.html
          - index.md
:::

| 文件 | 内容 | 常见用途 |
|---|---|---|
| `llms.txt` | `ai.versions` 选中页面的标题和站内 URL | 给抓取器提供站点入口 |
| `llms-full.txt` | 预算内为完整 Markdown，超预算后指向分片 Manifest | 大小站点通用的兼容入口 |
| `ai/manifest.json` | Schema 版本、预算、总量、分区、分片路径、大小、记录数和 SHA-256 | 完整语料的稳定发现入口 |
| `ai/content/{version}/{locale}/*.jsonl` | 带 `part` / `parts` 的有界内容记录 | 无需下载巨型单文件的流式 RAG 导入 |
| `ai/index.md` | 标题到 Markdown 原文地址的列表 | 通用 Markdown 索引 |
| `ai/pages.json` | 路由、语言、标题树、tags、owner、Frontmatter 和更新时间 | RAG 切分前的页面元数据 |
| `ai/summaries.json` | 每个页面的确定性摘要 | 结果预览与路由筛选 |
| `ai/code-examples.json` | 路由、语言和代码块内容 | 代码示例搜索 |
| 页面旁的 `index.md` | 构建时使用的 Markdown/MDX 源文 | 按页抓取和引用 |

## 摘要如何生成

Canofold 不会为摘要发起网络请求。生成顺序是：

1. 使用 Frontmatter `description`。
2. 如果没有 `description`，使用正文的第一个非标题、非代码段落。
3. 如果页面没有可用段落，摘要为空字符串。

因此，公开页面应写明确的 `description`，不要把它当成营销口号。

## 收录规则

- 默认收录当前版本的所有已发布页面。
- 历史版本不进入默认 AI 产物，避免一个问题出现多份过时答案。
- `status: draft` 的页面不参与构建。
- `ai: false` 可排除某个页面。
- `tags` 和 `owner` 会保留到 `pages.json`。

```yaml
---
title: 内部故障处理
description: 只在内网运行的故障流程
ai: false
---
```

## 配置开关

```ts
export default {
  ai: {
    llmsTxt: true,
    llmsFullTxt: true,
    markdownIndex: true,
    pageSummaries: true,
    codeExamples: true,
    chunkSizeBytes: 262144,
    llmsFullMaxBytes: 10485760,
    llmsFullOverflow: 'manifest',
    versions: 'current'
  }
}
```

`pages.json` 和版本化分片 Manifest 始终生成；其他文件按开关生成。每条内容记录都不超过
`chunkSizeBytes`，单页过大时按 Unicode code point 切分并按 `part` 重组。完整语料超过
`llmsFullMaxBytes` 时，`manifest` 策略让 `llms-full.txt` 保持很小并指向无损分片；`error`
策略则让原子构建失败。`versions: 'all'` 会把历史快照写入独立的版本/语言分区，默认
`current` 可避免过时答案重复出现。

## 私有文档注意事项

AI 文件和页面旁的 Markdown 原文都是静态公开产物的一部分。如果站点需要身份验证，托管层必须保护 `/*.md`、`/ai/*`、`/llms*.txt` 和搜索索引，不能只限制 HTML 页面。
