import { describe, expect, it } from 'vitest'
import { detectMarkdownAssets } from './assets'

describe('MDX asset detection', () => {
  it('keeps simple MDX pages free of optional Markdown assets', () => {
    expect(detectMarkdownAssets('# Hello\n\nA short page.')).toEqual({
      behaviors: [],
      math: false,
      pluginClients: [],
      pluginStyles: []
    })
  })

  it('detects optional resources from known MDX syntax', () => {
    expect(
      detectMarkdownAssets(
        ['# Diagram', '', '<MarkdownDiagram source="flowchart LR" />', '', '$x^2$', '', '<Gallery />'].join(
          '\n'
        )
      )
    ).toEqual({
      behaviors: ['gallery'],
      math: false,
      pluginClients: [],
      pluginStyles: []
    })
  })

  it('detects tilde fences and React Markdown extension components', () => {
    expect(
      detectMarkdownAssets(
        [
          '<MarkdownDiagram source="flowchart LR" />',
          '',
          '<MarkdownGallery />',
          '<MarkdownDetails><summary>More</summary>Body</MarkdownDetails>'
        ].join('\n')
      )
    ).toEqual({
      behaviors: ['gallery', 'details'],
      math: false,
      pluginClients: [],
      pluginStyles: []
    })
  })

  it('does not treat visual classes or hand-authored data markers as React behavior', () => {
    expect(
      detectMarkdownAssets(
        [
          '<div data-cf-component="gallery">Gallery</div>',
          '<div className="cf-image-gallery">Gallery</div>',
          '<div className={cx(ready && "mermaid")}>flowchart LR</div>'
        ].join('\n')
      )
    ).toEqual({
      behaviors: [],
      math: false,
      pluginClients: [],
      pluginStyles: []
    })
  })
})
