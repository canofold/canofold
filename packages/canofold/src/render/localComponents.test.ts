import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { createElement, type ElementType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { analyzeMdxModuleBoundary } from '@canofold/markdown/server/analyze'
import { trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { loadLocalComponentBundle } from './localComponents'

function importsFor(source: string) {
  return analyzeMdxModuleBoundary(source).imports
}

describe('local MDX components', () => {
  it('does not expose component runtimes through process-global state', () => {
    expect((globalThis as Record<PropertyKey, unknown>)[Symbol.for('canofold.local-component-runtime')]).toBe(
      undefined
    )
  })

  it('loads trusted local TSX components', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-local-component-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    const pagePath = join(cwd, 'docs/zh/index.mdx')
    await writeFile(
      join(cwd, 'docs/zh/LocalBadge.tsx'),
      `export function LocalBadge() {
  return <strong>Local</strong>
}
`
    )

    const { components } = await loadLocalComponentBundle(
      importsFor("import { LocalBadge } from './LocalBadge'"),
      pagePath,
      cwd
    )

    expect(components.LocalBadge).toBeTypeOf('function')
  })

  it('requires a source path when MDX imports local components', async () => {
    await expect(loadLocalComponentBundle(importsFor("import { Badge } from './Badge'"))).rejects.toThrow(
      'Local MDX component imports require the Markdown source file path'
    )
  })

  it('reports missing local exports before React rendering', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-local-missing-export-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    const pagePath = join(cwd, 'docs/index.mdx')
    await writeFile(join(cwd, 'docs/Badge.tsx'), 'export const Existing = () => <span>Existing</span>')

    await expect(
      loadLocalComponentBundle(importsFor("import { Missing } from './Badge'"), pagePath, cwd)
    ).rejects.toThrow('Local module "./Badge" does not export "Missing"')
  })

  it('renders hook-based local components with the host React instance', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-local-hooks-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    const pagePath = join(cwd, 'docs/zh/index.mdx')
    await writeFile(
      join(cwd, 'docs/zh/Counter.tsx'),
      `import { useState } from 'react'

export function Counter() {
  const [count] = useState(1)
  return <strong>Count: {count}</strong>
}
`
    )

    const { components } = await loadLocalComponentBundle(
      importsFor("import { Counter } from './Counter'"),
      pagePath,
      cwd
    )

    expect(renderToStaticMarkup(createElement(components.Counter as ElementType))).toBe(
      '<strong>Count: 1</strong>'
    )
  })

  it('detects optional assets across the local component graph', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-local-component-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    const pagePath = join(cwd, 'docs/zh/index.mdx')
    await writeFile(
      join(cwd, 'docs/zh/LocalGallery.tsx'),
      `import { LocalImage } from './LocalImage'

function Gallery({ children }) {
  return <div data-cf-component="gallery">{children}</div>
}

export function LocalGallery() {
  return <><Gallery><figure><img src="gallery.png" alt="Gallery" /></figure></Gallery><LocalImage /></>
}
`
    )
    await writeFile(
      join(cwd, 'docs/zh/LocalImage.tsx'),
      `function Image() {
  return <figure data-cf-component="image"><img src="image.png" alt="Preview" /></figure>
}

export function LocalImage() {
  return <Image />
}
`
    )

    await expect(
      loadLocalComponentBundle(importsFor("import { LocalGallery } from './LocalGallery'"), pagePath, cwd)
    ).resolves.toMatchObject({
      assets: {
        behaviors: ['gallery', 'image'],
        math: false
      }
    })
  })

  it('does not expose retired package component runtimes to local components', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-local-component-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    const pagePath = join(cwd, 'docs/zh/index.mdx')
    await writeFile(
      join(cwd, 'docs/zh/LocalGallery.tsx'),
      `import { MarkdownGallery } from '@canofold/markdown'

export function LocalGallery() {
  return <MarkdownGallery><figure><img src="gallery.png" alt="Gallery" /></figure></MarkdownGallery>
}
`
    )

    await expect(
      loadLocalComponentBundle(importsFor("import { LocalGallery } from './LocalGallery'"), pagePath, cwd)
    ).rejects.toThrow('External import is not allowed in local docs components: @canofold/markdown')
  })

  it('follows local re-exports when collecting component assets', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-local-component-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    const pagePath = join(cwd, 'docs/zh/index.mdx')
    await writeFile(
      join(cwd, 'docs/zh/LocalBlocks.tsx'),
      `export { LocalGallery } from './LocalGallery'
`
    )
    await writeFile(
      join(cwd, 'docs/zh/LocalGallery.tsx'),
      `function Gallery({ children }) {
  return <div data-cf-component="gallery">{children}</div>
}

export function LocalGallery() {
  return <Gallery><img src="gallery.png" alt="Gallery" /></Gallery>
}
`
    )

    await expect(
      loadLocalComponentBundle(importsFor("import { LocalGallery } from './LocalBlocks'"), pagePath, cwd)
    ).resolves.toMatchObject({
      assets: {
        behaviors: ['gallery'],
        math: false
      }
    })
  })

  it('rejects external imports inside local components', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-local-component-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    const pagePath = join(cwd, 'docs/zh/index.mdx')
    await writeFile(
      join(cwd, 'docs/zh/Chart.tsx'),
      `import Chart from 'third-party-chart'

export function LocalChart() {
  return <Chart />
}
`
    )

    await expect(
      loadLocalComponentBundle(importsFor("import { LocalChart } from './Chart'"), pagePath, cwd)
    ).rejects.toThrow('External import is not allowed in local docs components: third-party-chart')
  })

  it('keeps React DOM as a Markdown package runtime instead of an author import', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-local-component-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    const pagePath = join(cwd, 'docs/zh/index.mdx')
    await writeFile(
      join(cwd, 'docs/zh/Portal.tsx'),
      `import { createPortal } from 'react-dom'

export function Portal() {
  return createPortal(<span>Portal</span>, document.body)
}
`
    )

    await expect(
      loadLocalComponentBundle(importsFor("import { Portal } from './Portal'"), pagePath, cwd)
    ).rejects.toThrow('External import is not allowed in local docs components: react-dom')
  })

  it('rejects relative imports that escape the project root', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-local-component-'))
    const outside = await mkdtemp(join(tmpdir(), 'canofold-outside-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    const pagePath = join(cwd, 'docs/zh/index.mdx')
    await writeFile(
      join(outside, 'Outside.tsx'),
      `export function Outside() {
  return <span>Outside</span>
}
`
    )

    const relativeSpecifier = relative(dirname(pagePath), join(outside, 'Outside')).replace(/\\/g, '/')
    await expect(
      loadLocalComponentBundle(importsFor(`import { Outside } from '${relativeSpecifier}'`), pagePath, cwd)
    ).rejects.toThrow('Local component import escapes the project root')
  })

  it('rejects absolute imports from nested local components that escape the project root', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-local-component-'))
    const outside = await mkdtemp(join(tmpdir(), 'canofold-outside-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    const pagePath = join(cwd, 'docs/zh/index.mdx')
    await writeFile(
      join(outside, 'Outside.tsx'),
      `export function Outside() {
  return <span>Outside</span>
}
`
    )
    await writeFile(
      join(cwd, 'docs/zh/Local.tsx'),
      `import { Outside } from ${JSON.stringify(join(outside, 'Outside'))}

export function Local() {
  return <Outside />
}
`
    )

    await expect(
      loadLocalComponentBundle(importsFor("import { Local } from './Local'"), pagePath, cwd)
    ).rejects.toThrow('Local component import escapes the project root')
  })

  it('allows local component directories whose names begin with two dots', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-local-component-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await mkdir(join(cwd, '..cache'), { recursive: true })
    const pagePath = join(cwd, 'docs/index.mdx')
    await writeFile(
      join(cwd, '..cache/Badge.tsx'),
      `export function Badge() {
  return <span>Local badge</span>
}
`
    )

    const { components } = await loadLocalComponentBundle(
      importsFor("import { Badge } from '../..cache/Badge'"),
      pagePath,
      cwd
    )

    expect(components.Badge).toBeTypeOf('function')
  })
})
