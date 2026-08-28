import { externalLinks, kroki, linkCard, math, mermaid, pagefind, plantUml } from '@docfuse/plugins'
import { defineConfig } from 'docfuse'

export default defineConfig({
  title: 'Docfuse',
  description: '用一个 CLI 构建 React、Markdown 和 MDX 静态文档站',
  siteUrl: 'https://docfuse.dev',
  github: 'https://github.com/jiangxinlei/docfuse',
  editUrl: 'https://github.com/jiangxinlei/docfuse/edit/main/site/docs',
  requiredVersion: '^0.1.0',
  theme: {
    logo: '/logo-light.svg',
    logoDark: '/logo-dark.svg',
    favicon: '/favicon.svg',
    darkMode: true
  },
  search: {
    provider: pagefind()
  },
  markdown: {
    code: {
      unknownLanguage: 'error'
    },
    plugins: [
      math(),
      mermaid(),
      plantUml({ server: 'https://www.plantuml.com/plantuml/svg' }),
      kroki(),
      externalLinks({ internalHosts: ['docfuse.dev'] }),
      linkCard({ internalHosts: ['docfuse.dev'] })
    ]
  },
  navigation: {
    zh: [
      { text: '指南', link: '/guide/' },
      { text: '参考', link: '/reference/' },
      { text: 'Markdown', link: '/markdown/' }
    ],
    en: [
      { text: 'Guide', link: '/en/guide/' },
      { text: 'Reference', link: '/en/reference/' },
      { text: 'Markdown', link: '/en/markdown/' }
    ]
  },
  i18n: {
    locales: ['zh', 'en'],
    messages: {
      en: {
        brandTagline: 'A static documentation CLI for Markdown, MDX, and React'
      }
    }
  }
})
