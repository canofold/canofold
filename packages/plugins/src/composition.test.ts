import { createMarkdownRenderer } from '@docfuse/markdown/server'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { math } from './math/index'
import { mermaid } from './mermaid/index'
import { plantUml } from './plantuml/index'

describe('official plugin composition', () => {
  it('preserves diagrams and display math beside highlighted code', async () => {
    const source = [
      '```ts',
      'const enabled = true',
      '```',
      '',
      '```mermaid',
      'flowchart LR',
      'A --> B',
      '```',
      '',
      '```plantuml',
      '@startuml',
      'A -> B',
      '@enduml',
      '```',
      '',
      '$$',
      String.raw`\int_{0}^{1} x^2 \, dx = \frac{1}{3}`,
      '$$'
    ].join('\n')

    const rendered = await createMarkdownRenderer().render(source, {
      markdown: {
        plugins: [math(), mermaid(), plantUml({ server: 'https://plantuml.example/svg' })]
      }
    })
    const html = renderToStaticMarkup(rendered.content)

    expect(html).toContain('class="language-ts"')
    expect(html).toContain('data-df-plugin-diagram="mermaid"')
    expect(html).toContain('data-df-plugin-diagram="plantuml"')
    expect(html).toContain('class="katex-display"')
    expect(html).not.toContain('class="language-text"')
  })
})
