import { describe, expect, it } from 'vitest'
import {
  bauhaus,
  canofold,
  cyberChinese,
  defineTheme,
  dopamineDesign,
  glassmorphism,
  handDrawnDoodle,
  memphis,
  minimalistFlat,
  neoBrutalist,
  neumorphism,
  outrun,
  pixelAnime,
  sketchStyle,
  shoujoManga
} from './src/index'
import type { ThemeDefinition } from './src/types'

function defineUncheckedTheme(theme: unknown) {
  return defineTheme(theme as ThemeDefinition)
}

describe('@canofold/themes', () => {
  it('publishes complete official definitions through the public contract', () => {
    expect([
      canofold.id,
      glassmorphism.id,
      sketchStyle.id,
      handDrawnDoodle.id,
      minimalistFlat.id,
      bauhaus.id,
      neoBrutalist.id,
      neumorphism.id,
      memphis.id,
      cyberChinese.id,
      pixelAnime.id,
      dopamineDesign.id,
      shoujoManga.id,
      outrun.id
    ]).toEqual([
      'canofold',
      'glassmorphism',
      'sketch-style',
      'hand-drawn-doodle',
      'minimalist-flat',
      'bauhaus',
      'neo-brutalist',
      'neumorphism',
      'memphis',
      'cyber-chinese',
      'pixel-anime',
      'dopamine-design',
      'shoujo-manga',
      'outrun'
    ])
    expect(canofold.appearances.map((appearance) => appearance.colorScheme)).toEqual(['light', 'dark'])
    expect(glassmorphism.appearances[0]?.colorScheme).toBe('dark')
    expect(sketchStyle.appearances[0]?.colorScheme).toBe('light')
    expect(handDrawnDoodle.appearances[0]?.colorScheme).toBe('light')
    expect(minimalistFlat.appearances[0]?.colorScheme).toBe('light')
    expect(bauhaus.appearances[0]?.colorScheme).toBe('light')
    expect(neumorphism.styles).toEqual(['@canofold/themes/neumorphism.css'])
    expect(memphis.styles).toEqual(['@canofold/themes/expressive.css', '@canofold/themes/memphis.css'])
    expect(cyberChinese.appearances[0]?.colorScheme).toBe('dark')
    expect(pixelAnime.appearances[0]?.colorScheme).toBe('dark')
    expect(dopamineDesign.appearances[0]?.colorScheme).toBe('light')
    expect(shoujoManga.appearances[0]?.colorScheme).toBe('light')
    expect(outrun.appearances[0]?.colorScheme).toBe('dark')
    expect([
      canofold.name,
      glassmorphism.name,
      sketchStyle.name,
      handDrawnDoodle.name,
      minimalistFlat.name,
      bauhaus.name,
      neoBrutalist.name,
      neumorphism.name,
      memphis.name,
      cyberChinese.name,
      pixelAnime.name,
      dopamineDesign.name,
      shoujoManga.name,
      outrun.name
    ]).toEqual([
      { zh: 'Canofold', en: 'Canofold' },
      { zh: '玻璃拟态', en: 'Glassmorphism' },
      { zh: '铅笔手绘风', en: 'Sketch Style' },
      { zh: '手绘涂鸦风', en: 'Hand-Drawn Doodle' },
      { zh: '极简扁平风', en: 'Minimalist Flat' },
      { zh: '包豪斯风格', en: 'Bauhaus' },
      { zh: '新野兽派', en: 'Neo-Brutalist' },
      { zh: '新拟物派', en: 'Neumorphism' },
      { zh: '孟菲斯', en: 'Memphis' },
      { zh: '赛博中华', en: 'Cyber Chinese' },
      { zh: '像素动漫', en: 'Pixel Anime' },
      { zh: '多巴胺设计', en: 'Dopamine Design' },
      { zh: '少女漫画', en: 'Shoujo Manga' },
      { zh: 'Outrun 复古未来', en: 'Outrun' }
    ])
  })

  it('normalizes and deeply freezes third-party definitions', () => {
    const theme = defineTheme({
      id: 'aurora',
      name: { 'en-us': ' Aurora ' },
      styles: [' @acme/canofold-theme/aurora.css '],
      appearances: [{ id: 'default', name: { en: 'Default' }, colorScheme: 'light' }]
    })

    expect(theme.name['en-US']).toBe('Aurora')
    expect(theme.styles[0]).toBe('@acme/canofold-theme/aurora.css')
    expect(Object.isFrozen(theme)).toBe(true)
    expect(Object.isFrozen(theme.name)).toBe(true)
    expect(Object.isFrozen(theme.styles)).toBe(true)
    expect(Object.isFrozen(theme.appearances)).toBe(true)
    expect(Object.isFrozen(theme.appearances[0])).toBe(true)
    expect(Object.isFrozen(theme.appearances[0]?.name)).toBe(true)
  })

  it.each([
    ['invalid theme id', { id: 'Aurora' }, 'theme.id'],
    ['empty theme names', { name: {} }, 'theme.name'],
    ['invalid locale', { name: { en_US: 'Aurora' } }, 'invalid locale'],
    ['empty styles', { styles: [] }, 'theme.styles'],
    ['duplicate styles', { styles: ['./theme.css', ' ./theme.css '] }, 'duplicate entries'],
    ['empty appearances', { appearances: [] }, 'theme.appearances'],
    [
      'invalid color scheme',
      { appearances: [{ id: 'default', name: { en: 'Default' }, colorScheme: 'auto' }] },
      'colorScheme'
    ],
    ['unknown theme field', { label: 'Aurora' }, 'unknown field'],
    [
      'unknown appearance field',
      { appearances: [{ id: 'default', name: { en: 'Default' }, colorScheme: 'light', label: 'Default' }] },
      'unknown field'
    ]
  ])('rejects %s', (_label, override, message) => {
    expect(() =>
      defineUncheckedTheme({
        id: 'aurora',
        name: { en: 'Aurora' },
        styles: ['./theme.css'],
        appearances: [{ id: 'default', name: { en: 'Default' }, colorScheme: 'light' }],
        ...override
      })
    ).toThrow(message)
  })

  it('rejects duplicate appearance ids and canonicalized locales', () => {
    expect(() =>
      defineTheme({
        id: 'aurora',
        name: { en: 'Aurora' },
        styles: ['./theme.css'],
        appearances: [
          { id: 'default', name: { en: 'Default' }, colorScheme: 'light' },
          { id: 'default', name: { en: 'Duplicate' }, colorScheme: 'dark' }
        ]
      })
    ).toThrow('duplicate id')

    expect(() =>
      defineTheme({
        id: 'aurora',
        name: { 'en-us': 'Aurora', 'en-US': 'Duplicate' },
        styles: ['./theme.css'],
        appearances: [{ id: 'default', name: { en: 'Default' }, colorScheme: 'light' }]
      })
    ).toThrow('duplicate locale')
  })
})
