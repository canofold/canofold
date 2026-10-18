import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

// Shared test input for linked Playground packages and installed tarballs.
export async function writeNavigationFixture(root) {
  const navigation = [
    ['guide', '指南', 'Guide'],
    ['reference', '参考', 'Reference'],
    ['sdk', 'Markdown SDK', 'Markdown SDK'],
    ['extension', '编辑器扩展', 'Editor Extension'],
    ['skills', 'Skills', 'Skills']
  ]
  const write = async (path, source) => {
    const target = join(root, path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, source)
  }
  await write(
    'canofold.config.mts',
    `import { defineConfig } from 'canofold'
import { canofold, glassmorphism, sketchStyle, handDrawnDoodle, minimalistFlat, bauhaus, neoBrutalist, neumorphism, memphis, cyberChinese, pixelAnime, dopamineDesign, shoujoManga, outrun } from '@canofold/themes'
export default defineConfig({
  title: 'Navigation acceptance',
  github: 'https://github.com/canofold/canofold',
  themes: [canofold, glassmorphism, sketchStyle, handDrawnDoodle, minimalistFlat, bauhaus, neoBrutalist, neumorphism, memphis, cyberChinese, pixelAnime, dopamineDesign, shoujoManga, outrun],
  i18n: { defaultLocale: 'zh', locales: ['zh', 'en'] },
  versions: [
    { id: 'current', label: 'Current documentation with a deliberately long version label', docsDir: 'navigation-current', base: '/' },
    { id: 'archive', label: 'Archived documentation with a deliberately long version label', docsDir: 'navigation-archive', base: '/archive/', status: 'archived' }
  ],
  navigation: Object.fromEntries(['zh', 'en'].map(locale => [locale, ${JSON.stringify(navigation)}.map(([name, zh, en]) => ({ text: locale === 'en' ? en : zh, link: (locale === 'en' ? '/en' : '') + '/' + name + '/' }))]))
})
`
  )
  for (const directory of ['navigation-current', 'navigation-archive']) {
    for (const locale of ['', 'en/']) {
      await write(
        `${directory}/${locale}index.md`,
        `---
title: Navigation acceptance
hero:
  accent: Header boundary fixture
  tagline: Test fixture, not a historical release snapshot.
---

## Navigation boundary

${'Scrollable home content. '.repeat(160)}
`
      )
      for (const [name, zh, en] of navigation) {
        const title = locale ? en : zh
        await write(
          `${directory}/${locale}${name}.md`,
          `---
title: ${title}
---

# ${title}

Navigation boundary acceptance. ${'Readable document content. '.repeat(80)}
`
        )
      }
    }
  }
}
