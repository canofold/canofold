---
title: Static assets
description: Choose page-relative files or shared public files and keep stable URLs
group: Guide
subgroup: Writing
order: 22
---

# Static assets

Every asset has one owner: a page-relative file, or a site-wide file under `docs/public/`.

## Page-relative files

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
![Installation UI](./images/install.png)
[Download the schema](./files/schema.json)
```

Relative files follow the page, and `docfuse check` validates that references exist.

## Public files

:::file-tree
- docs/
  - public/
    - logo.svg
    - files/
      - openapi.json
:::

The public paths are `/logo.svg` and `/files/openapi.json`.

Use `public/` for brand assets, shared downloads, and intentionally fixed public URLs. Do not keep the same file in both locations.

Before release, compress large images, remove secrets and internal addresses from screenshots, and choose stable download paths. Image, gallery, video, and audio behavior is consolidated in the [Markdown Playground](/en/markdown/playground/#files-images-and-trusted-media).
