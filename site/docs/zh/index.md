---
title: Docfuse
description: 低侵入接入代码仓库，从一份 Markdown 和 MDX 生成网站、搜索与 AI 数据
order: 0
hero:
  accent: 一份内容，同时交付网站、搜索与 AI 数据
  tagline: Docfuse 直接读取仓库中的 Markdown 和 MDX，不改业务源码，一次构建生成静态站点、本地搜索和 AI 可读数据。
  image: /banner.png
  imageAlt: Docfuse 构建产物示意图
  actions:
    - text: 什么是 Docfuse
      link: /guide/introduction/what-is-docfuse/
      primary: true
      icon: file
    - text: 快速开始
      link: /guide/introduction/getting-started/
      icon: rocket
features:
  - image: /feature/cli.svg
    title: 低侵入接入现有仓库
    details: 文档、配置和命令脚本留在原仓库，不改业务源码，也不必另建文档前端。
  - image: /feature/ai.svg
    title: 一份内容生成多种产物
    details: 一次构建同时生成静态页面、Markdown 镜像、llms.txt 和分片语料。
  - image: /feature/md.svg
    title: 丰富内容不必手写 HTML
    details: 代码组、文件树、Tabs、媒体、数学公式和图表都有专用 Markdown 语法。
  - image: /feature/load.svg
    title: 静态交付不依赖运行时服务
    details: 生成结果可直接托管，图表、搜索和交互资源按页面实际使用加载。
  - image: /feature/find.svg
    title: 本地搜索隔离语言与版本
    details: 索引随站点生成，查询结果不会混入其他语言或版本。
  - image: /feature/pkg.svg
    title: 渲染器可脱离 CLI 使用
    details: '@docfuse/markdown 可直接接入 React、SSR 和静态生成流程。'
---
