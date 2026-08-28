import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const diagramStylesUrl = new URL('./diagram.css', import.meta.url)

describe('diagram styles', () => {
  it('keeps the toolbar flush with the diagram shell', async () => {
    const styles = await readFile(diagramStylesUrl, 'utf8')

    expect(styles).toMatch(/\.df-diagram-window > \.df-diagram-toolbar\s*\{[^}]*margin:\s*0;/)
  })

  it('keeps generic inline-code styles out of the diagram source', async () => {
    const styles = await readFile(diagramStylesUrl, 'utf8')
    const sourceRule = styles.match(/\.df-diagram-source\s*\{([^}]*)\}/)?.[1]

    expect(sourceRule).toBeDefined()
    expect(sourceRule).not.toMatch(/\bpadding\s*:/)
    expect(sourceRule).not.toMatch(/\bbackground\s*:/)
    expect(styles).toMatch(
      /\.df-diagram-source > code\s*\{[^}]*padding:\s*0;[^}]*background:\s*transparent;[^}]*font:\s*inherit;/
    )
  })

  it('reserves layout space for zoom controls instead of overlaying the diagram', async () => {
    const styles = await readFile(diagramStylesUrl, 'utf8')
    const controlsRule = styles.match(/\.df-diagram-zoom-controls\s*\{([^}]*)\}/)?.[1]

    expect(controlsRule).toBeDefined()
    expect(controlsRule).not.toMatch(/position:\s*absolute/)
    expect(controlsRule).toMatch(/justify-self:\s*start/)
  })
})
