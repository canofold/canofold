import { externalLinks, kroki, linkCard, math, mermaid, pagefind, plantUml } from '@canofold/plugins'
import { defineConfig } from 'canofold'

export default defineConfig({
  title: 'Canofold',
  description: '静态优先、低侵入、可扩展的知识文档平台',
  siteUrl: 'https://canofold.dev',
  github: 'https://github.com/canofold/canofold',
  editUrl: 'https://github.com/canofold/canofold/edit/main/site/docs',
  requiredVersion: '^0.2.0',
  theme: {
    logo: '/logo-light.png',
    logoDark: '/logo-dark.png',
    favicon: '/favicon.png',
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
      externalLinks({ internalHosts: ['canofold.dev'] }),
      linkCard({ internalHosts: ['canofold.dev'] })
    ]
  },
  navigation: {
    zh: [
      { text: '指南', link: '/guide/' },
      { text: '参考', link: '/reference/' },
      { text: 'Markdown SDK', link: '/markdown/' }
    ],
    en: [
      { text: 'Guide', link: '/en/guide/' },
      { text: 'Reference', link: '/en/reference/' },
      { text: 'Markdown SDK', link: '/en/markdown/' }
    ]
  },
  i18n: {
    locales: ['zh', 'en'],
    messages: {
      en: {
        brandTagline: 'A static-first knowledge and documentation platform'
      }
    }
  }
})
