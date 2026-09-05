---
title: 管理静态资源
description: 选择页面相对文件或 public 公共文件并获得稳定 URL
group: 指南
subgroup: 内容创作
order: 22
---

# 管理静态资源

静态资源只有两种归属：单页拥有的相对文件，或全站共享的 `docs/public/` 文件。

## 页面相对文件

:::file-tree
- docs/
  - guide/
    - install.md
    - images/
      - install.png
    - files/
      - schema.json
:::

```md
![安装界面](./images/install.png)
[下载 Schema](./files/schema.json)
```

相对文件随页面处理，`canofold check` 会检查引用是否存在。

## 公共文件

:::file-tree
- docs/
  - public/
    - logo.svg
    - files/
      - openapi.json
:::

`logo.svg` 的公开路径是 `/logo.svg`，`openapi.json` 的公开路径是 `/files/openapi.json`。

品牌资源、多个页面共享的附件和固定公开路径应放在 `public/`。不要在 `public/` 与页面目录保存同一份文件。

发布前压缩大图、移除截图中的密钥和内部地址，并为下载文件选择稳定路径。展示方式见 [Markdown Playground](/markdown/playground/#文件图片与可信媒体)。
