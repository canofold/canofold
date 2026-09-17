import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMarkdownRenderer } from '@canofold/markdown/server'
import { createMockPage } from '../../test/fixtures'
import { createDemoMarkdownPlugin } from './markdown'
import type { CanofoldDemoManifest, CanofoldPreparedDemo } from './types'

const labels = {
  openPreview: '在新窗口打开',
  showSource: '查看代码',
  hideSource: '收起代码',
  loading: '正在加载示例…',
  failed: '示例加载失败。'
}

describe('createDemoMarkdownPlugin', () => {
  it('renders one prepared module as an interactive preview and collapsible source card', async () => {
    const source = '::demo[基础用法]{src="/src/button/demo/basic.tsx"}'
    const prepared: CanofoldPreparedDemo = {
      id: 'demo-id',
      title: '基础用法',
      description: '展示主要按钮和次要按钮。',
      specifier: '/src/button/demo/basic.tsx',
      sandbox: 'inline',
      pageSourcePath: '/project/docs/button.md',
      pageSourceRelativePath: 'docs/button.md',
      routePath: '/button/',
      locale: 'zh',
      line: 1,
      column: 1,
      modulePath: '/project/src/button/demo/basic.tsx',
      moduleUrl: '/@fs/project/src/button/demo/basic.tsx',
      source: 'export default function Demo() { return <button>保存</button> }',
      language: 'tsx'
    }
    const page = createMockPage({
      body: source,
      demos: [prepared],
      sourcePath: '/project/docs/button.md',
      sourceRelativePath: 'docs/button.md'
    })
    const manifest: CanofoldDemoManifest = {
      clientUrl: '/assets/demos.js',
      demos: { [prepared.id]: prepared }
    }
    const renderer = createMarkdownRenderer()
    const rendered = await renderer.render(source, {
      markdown: {
        plugins: [createDemoMarkdownPlugin({ page, manifest, labels })]
      }
    })
    const html = renderToStaticMarkup(rendered.content)

    expect(html).toContain('data-cf-component="demo"')
    expect(html).toContain('data-cf-demo-id="demo-id"')
    expect(html).toContain('class="cf-demo-title"')
    expect(html).toContain('>基础用法</strong>')
    expect(html).toContain('class="cf-demo-description"')
    expect(html).toContain('>展示主要按钮和次要按钮。</p>')
    expect(html).toContain('href="?canofold-demo=demo-id"')
    expect(html).toContain('aria-label="在新窗口打开"')
    expect(html).toContain('class="cf-demo-action-icon cf-demo-source-icon"')
    expect(html).toContain(
      'class="cf-demo-tooltip" aria-hidden="true" data-cf-demo-tooltip="">查看代码</span>'
    )
    expect(html).not.toContain('title="查看代码"')
    expect(html).not.toContain('data-cf-tooltip=')
    expect(html).toContain('data-cf-demo-source-toggle=""')
    expect(html).toContain('aria-controls="cf-demo-source-demo-id"')
    expect(html).toContain('保存')
    expect(html).toContain('language-tsx')
    expect(html).toContain('class="shiki')
    expect(html).toContain('--shiki-dark:')
  })

  it('invalidates rendered source when the prepared demo changes', async () => {
    const source = '::demo[基础用法]{src="/src/button/demo/basic.tsx"}'
    const prepared: CanofoldPreparedDemo = {
      id: 'demo-id',
      title: '基础用法',
      specifier: '/src/button/demo/basic.tsx',
      sandbox: 'inline',
      pageSourcePath: '/project/docs/button.md',
      pageSourceRelativePath: 'docs/button.md',
      routePath: '/button/',
      locale: 'zh',
      line: 1,
      column: 1,
      modulePath: '/project/src/button/demo/basic.tsx',
      source: 'export default function Demo() { return <button>Before</button> }',
      language: 'tsx'
    }
    const page = createMockPage({
      body: source,
      demos: [prepared],
      sourcePath: '/project/docs/button.md',
      sourceRelativePath: 'docs/button.md'
    })
    const renderer = createMarkdownRenderer()
    const render = async (demo: CanofoldPreparedDemo) => {
      const rendered = await renderer.render(source, {
        markdown: {
          plugins: [
            createDemoMarkdownPlugin({
              page,
              manifest: { clientUrl: '/demos.js', demos: { [demo.id]: demo } },
              labels
            })
          ]
        }
      })
      return renderToStaticMarkup(rendered.content)
    }

    expect(await render(prepared)).toContain('Before')
    expect(await render({ ...prepared, source: prepared.source.replace('Before', 'After') })).toContain(
      'After'
    )
  })

  it('renders an untitled demo without an empty title element', async () => {
    const prepared: CanofoldPreparedDemo = {
      id: 'untitled',
      specifier: './demo.tsx',
      sandbox: 'iframe',
      pageSourcePath: '/project/docs/button.md',
      pageSourceRelativePath: 'docs/button.md',
      routePath: '/button/',
      locale: 'zh',
      line: 1,
      column: 1,
      modulePath: '/project/docs/demo.tsx',
      source: 'export default () => null',
      language: 'tsx'
    }
    const source = '::demo{src="./demo.tsx" sandbox="iframe"}'
    const page = createMockPage({ body: source, demos: [prepared] })
    const renderer = createMarkdownRenderer()
    const rendered = await renderer.render(source, {
      markdown: {
        plugins: [
          createDemoMarkdownPlugin({
            page,
            manifest: { clientUrl: '/demos.js', demos: { untitled: prepared } },
            labels: { ...labels, showSource: 'Source' }
          })
        ]
      }
    })
    const html = renderToStaticMarkup(rendered.content)
    expect(html).not.toContain('cf-demo-title')
    expect(html).not.toContain('cf-demo-details')
    expect(html).toContain('data-cf-demo-sandbox="iframe"')
  })
})
