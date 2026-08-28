import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { semanticOverrideProps } from './semanticOverrideProps'

describe('semanticOverrideProps', () => {
  it('normalizes public props for code, copy, table, and terminal overrides', () => {
    const code = semanticOverrideProps(
      'code-block',
      {
        'data-df-language': 'ts',
        dataDfCopyLabel: 'Copy code',
        'data-df-copy-failure-label': 'Copy failed'
      },
      createElement('code', null, 'const ready = true')
    )
    expect(code).toMatchObject({
      source: 'const ready = true',
      language: 'ts',
      copyLabel: 'Copy code',
      copyFailureLabel: 'Copy failed'
    })

    const snippet = semanticOverrideProps(
      'copy-snippet',
      { dataDfValue: 'pnpm test', 'data-df-copy-label': 'Copy command' },
      'fallback'
    )
    expect(snippet).toMatchObject({ value: 'pnpm test', copyLabel: 'Copy command' })

    const table = semanticOverrideProps(
      'table',
      {
        dataDfTableTitle: 'Results',
        'data-df-download-label': 'Download CSV',
        dataDfSortLabel: 'Sort rows'
      },
      createElement('table')
    )
    expect(table).toMatchObject({
      tableTitle: 'Results',
      downloadLabel: 'Download CSV',
      sortLabel: 'Sort rows'
    })

    const terminal = semanticOverrideProps(
      'terminal',
      { 'data-df-title': 'Shell', dataDfSource: 'pnpm build' },
      null
    )
    expect(terminal).toMatchObject({ title: 'Shell', source: 'pnpm build' })
  })

  it('extracts image semantics from rendered children and ignores invalid dimensions', () => {
    const children = [
      'ignored text',
      createElement('img', {
        key: 'image',
        src: '/cover.png',
        alt: 'Cover',
        title: 'Release cover',
        width: 640,
        height: '360',
        loading: 'lazy',
        srcSet: '/cover.png 1x, /cover@2x.png 2x',
        sizes: '100vw'
      }),
      createElement('span', { key: 'caption', 'data-df-slot': 'caption' }, 'A release cover')
    ]
    const image = semanticOverrideProps(
      'image',
      { dataDfZoomLabel: 'Zoom image', 'data-df-close-label': 'Close image' },
      children
    )

    expect(image).toMatchObject({
      src: '/cover.png',
      alt: 'Cover',
      caption: 'A release cover',
      title: 'Release cover',
      width: 640,
      height: '360',
      loading: 'lazy',
      srcSet: '/cover.png 1x, /cover@2x.png 2x',
      sizes: '100vw',
      zoomLabel: 'Zoom image',
      closeLabel: 'Close image'
    })

    const invalid = semanticOverrideProps(
      'image',
      {},
      createElement('img', { src: '/invalid.png', width: true, height: {}, loading: 'auto' })
    )
    expect(invalid).toMatchObject({
      src: '/invalid.png',
      width: undefined,
      height: undefined,
      loading: undefined
    })
  })

  it('builds gallery items and labels for named replacements', () => {
    const gallery = semanticOverrideProps(
      'gallery',
      {
        dataDfGalleryLabel: 'Screenshots',
        'data-df-previous-label': 'Previous screenshot',
        dataDfNextLabel: 'Next screenshot',
        'data-df-image-label': 'Screenshot'
      },
      createElement(
        'figure',
        null,
        createElement('img', {
          src: '/screen.png',
          alt: 'Dashboard',
          width: 800,
          height: 450
        }),
        createElement('figcaption', null, 'Dashboard preview')
      )
    )

    expect(gallery.items).toEqual([
      {
        src: '/screen.png',
        alt: 'Dashboard',
        caption: 'Dashboard preview',
        title: undefined,
        srcSet: undefined,
        sizes: undefined,
        width: 800,
        height: 450
      }
    ])
    expect(gallery.labels).toMatchObject({
      gallery: 'Screenshots',
      previous: 'Previous screenshot',
      next: 'Next screenshot',
      image: 'Screenshot'
    })
  })

  it('preserves base props and children for components without semantic normalization', () => {
    const children = createElement('span', null, 'Stable')
    expect(semanticOverrideProps('badge', { className: 'custom' }, children)).toEqual({
      className: 'custom',
      children
    })
  })
})
