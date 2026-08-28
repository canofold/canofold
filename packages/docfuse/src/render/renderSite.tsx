import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import type { DocfuseConfig } from '../config/types'
import { isMdxPath } from '../content/fileKinds'
import type { ContentGraph, DocPage } from '../content/types'
import { localeRootPath } from '../content/routes'
import { publicPathFor } from '../seo/urls'
import { resolveOutputPath, resolveOutputRoot } from '../utils/paths'
import { escapeHtml } from '../utils/html'
import {
  createMarkdownRenderer,
  type MarkdownAssets,
  type MarkdownPluginClientAsset,
  type MarkdownPluginStyleAsset,
  type MarkdownRenderer
} from '@docfuse/markdown/server'
import { detectMarkdownAssets } from '@docfuse/markdown/server/analyze'
import { buildCssCached, markdownFileIconsDir, mathFontsDir } from './buildCss'
import { HomeHero } from './HomeHero'
import { Layout } from './Layout'
import { DEFAULT_FAVICON, markdownLabelsFor, notFoundContentFor } from './layoutContent'
import { renderMdxResult } from './renderMdx'
import { buildSearchBundle } from './searchBundle'
import { noFlashScript } from './shellScripts'
import { buildThemeVariables } from './theme'
import { generatedOutputPaths } from '../output/plan'
import { mapConcurrent } from '../utils/concurrency'
import { createBasePathUrlTransform } from './transformUrls'
import { buildPlaygroundBundle } from './playgroundBundle'
import {
  collectPageAssets,
  collectPublicAssets,
  copyMarkdownClient,
  copyMarkdownPluginAssets,
  copyRequiredMathFonts,
  copyStaticAssets,
  readCustomStyles,
  registerPluginAssets,
  removeStalePageAssets,
  type AssetCopy,
  type PreviousPageOutput
} from './siteAssets'

export { copyRequiredMathFonts, pageAssetOutputPathsFor } from './siteAssets'
export type { PreviousPageOutput } from './siteAssets'

const emptyMarkdownAssets: MarkdownAssets = {
  behaviors: [],
  math: false,
  pluginClients: [],
  pluginStyles: []
}

function playgroundMarkdownAssets(
  initial: MarkdownAssets,
  plugins: DocfuseConfig['markdown']['plugins']
): MarkdownAssets {
  const clients = new Map<string, MarkdownPluginClientAsset>()
  const styles = new Map<string, MarkdownPluginStyleAsset>()
  registerPluginAssets(initial, clients, styles)
  for (const plugin of plugins) {
    registerPluginAssets(
      {
        behaviors: [],
        math: plugin.assets?.math === true,
        pluginClients: [...(plugin.assets?.clients ?? [])],
        pluginStyles: [...(plugin.assets?.styles ?? [])]
      },
      clients,
      styles
    )
  }
  return {
    behaviors: initial.behaviors,
    math: initial.math || plugins.some((plugin) => plugin.assets?.math === true),
    pluginClients: [...clients.values()],
    pluginStyles: [...styles.values()]
  }
}

function jsonForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function render404Page(config: DocfuseConfig, graph: ContentGraph): string {
  const defaultLocale = graph.defaultLocale
  const content = notFoundContentFor(defaultLocale, config.i18n.messages)
  const title = escapeHtml(config.title)
  const favicon = escapeHtml(publicPathFor(config, config.theme.favicon ?? DEFAULT_FAVICON))
  const stylesheet = escapeHtml(publicPathFor(config, '/assets/docfuse.css'))
  const currentVersion = graph.versions.find((version) => version.id === graph.currentVersion)
  const defaultHome = publicPathFor(
    config,
    localeRootPath(defaultLocale, graph.defaultLocale, currentVersion?.base ?? '/')
  )
  const home = escapeHtml(defaultHome)
  const notFoundTitle = escapeHtml(content.title)
  const notFoundDescription = escapeHtml(content.description)
  const homeLabel = escapeHtml(content.home)
  const presentations = graph.versions
    .flatMap((version) =>
      graph.locales.map((locale) => {
        const localized = notFoundContentFor(locale, config.i18n.messages)
        const localeHome = publicPathFor(config, localeRootPath(locale, graph.defaultLocale, version.base))
        return {
          locale,
          prefix: localeHome,
          home: localeHome,
          title: localized.title,
          description: localized.description,
          homeLabel: localized.home,
          documentTitle: `404 - ${localized.title} | ${config.title}`
        }
      })
    )
    .sort((left, right) => right.prefix.length - left.prefix.length)
  const localeScript = `(function(){var p=${jsonForInlineScript(presentations)},n=location.pathname,m=p.find(function(x){var r=x.prefix.replace(/\/$/,'');return n===r||n.indexOf(x.prefix)===0});if(!m)return;document.documentElement.lang=m.locale;document.title=m.documentTitle;var t=document.getElementById('docfuse-404-title'),d=document.getElementById('docfuse-404-description'),h=document.getElementById('docfuse-404-home');if(t)t.textContent=m.title;if(d)d.textContent=m.description;if(h){h.textContent=m.homeLabel;h.setAttribute('href',m.home)}})()`

  return `<!doctype html><html lang="${escapeHtml(defaultLocale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>404 - ${notFoundTitle} | ${title}</title><meta name="robots" content="noindex"><link rel="icon" href="${favicon}"><link rel="stylesheet" href="${stylesheet}"><script>${noFlashScript}</script></head><body><div class="df-not-found"><span class="df-not-found-code">404</span><h1 id="docfuse-404-title" class="df-not-found-title">${notFoundTitle}</h1><p id="docfuse-404-description" class="df-not-found-desc">${notFoundDescription}</p><a id="docfuse-404-home" href="${home}" class="df-not-found-link">${homeLabel}</a></div><script>${localeScript}</script></body></html>`
}

export async function renderSite({
  cwd,
  config,
  graph,
  pages = graph.pages,
  previousPages = [],
  renderer = createMarkdownRenderer(),
  writeSharedAssets = true
}: {
  cwd: string
  config: DocfuseConfig
  graph: ContentGraph
  /** Optional page subset for dev-mode incremental rendering. */
  pages?: DocPage[]
  /** Previous revisions of incrementally rendered pages, used to remove stale assets. */
  previousPages?: PreviousPageOutput[]
  /** Build-scoped renderer; the dev server reuses it across incremental builds. */
  renderer?: MarkdownRenderer
  /** Shared shell assets are stable during a single-page dev rebuild. */
  writeSharedAssets?: boolean
}) {
  const outputRoot = resolveOutputRoot(cwd, config.outputDir)
  const generatedPaths = generatedOutputPaths(config, graph)
  const hasPlayground = graph.pages.some((page) => page.frontmatter.layout === 'playground')
  let publicAssets: AssetCopy[] = []
  await mkdir(join(outputRoot, 'assets'), { recursive: true })
  if (writeSharedAssets) {
    const needsMath =
      (hasPlayground && config.markdown.plugins.some((plugin) => plugin.assets?.math === true)) ||
      graph.pages.some(
        (page) =>
          detectMarkdownAssets(
            page.body,
            config.markdown.plugins,
            isMdxPath(page.relativePath) ? 'mdx' : 'markdown'
          ).math
      )
    const [css, customStyles] = await Promise.all([
      buildCssCached({ math: needsMath }),
      readCustomStyles(cwd, config.styles)
    ])
    await writeFile(
      join(outputRoot, 'assets/docfuse.css'),
      `${css}\n${buildThemeVariables(config)}\n${customStyles}\n`
    )
    await cp(markdownFileIconsDir(), join(outputRoot, 'assets/file-icons'), {
      recursive: true,
      force: true
    })
    const outputFonts = join(outputRoot, 'assets/fonts')
    if (needsMath) {
      const fontsDir = mathFontsDir()
      await copyRequiredMathFonts(fontsDir, outputFonts)
    } else {
      await rm(outputFonts, { recursive: true, force: true })
    }
    if (config.search.enabled) {
      await buildSearchBundle(outputRoot)
    }
    if (hasPlayground) {
      await buildPlaygroundBundle(cwd, outputRoot, config)
    } else {
      await rm(join(outputRoot, 'assets/docfuse-playground'), { recursive: true, force: true })
    }
    const [collectedPublicAssets, pageAssets] = await Promise.all([
      collectPublicAssets(cwd, config),
      collectPageAssets(cwd, graph.pages)
    ])
    publicAssets = collectedPublicAssets
    await copyStaticAssets(outputRoot, [...publicAssets, ...pageAssets], generatedPaths)
    await writeFile(join(outputRoot, '404.html'), render404Page(config, graph))
  } else {
    const [collectedPublicAssets, pageAssets] = await Promise.all([
      collectPublicAssets(cwd, config),
      collectPageAssets(cwd, pages)
    ])
    publicAssets = collectedPublicAssets
    await copyStaticAssets(outputRoot, pageAssets, generatedPaths)
  }

  const behaviorPages = writeSharedAssets ? pages : graph.pages
  const pluginClients = new Map<string, MarkdownPluginClientAsset>()
  const pluginStyles = new Map<string, MarkdownPluginStyleAsset>()
  const markdownBehaviors = new Set<MarkdownAssets['behaviors'][number]>()
  behaviorPages.forEach((page) => {
    const assets = detectMarkdownAssets(
      page.body,
      config.markdown.plugins,
      isMdxPath(page.relativePath) ? 'mdx' : 'markdown'
    )
    registerPluginAssets(assets, pluginClients, pluginStyles)
    assets.behaviors.forEach((behavior) => markdownBehaviors.add(behavior))
  })
  const RENDER_CONCURRENCY = 8
  const urlTransform = createBasePathUrlTransform(config.basePath)
  await mapConcurrent(pages, RENDER_CONCURRENCY, async (page) => {
    const isHome = page.routePath === localeRootPath(page.locale, graph.defaultLocale, page.versionBase)
    let markdownContent: ReactNode | undefined
    let markdownAssets = emptyMarkdownAssets
    const markdownOptions = {
      ...config.markdown,
      locale: page.locale,
      labels: {
        ...markdownLabelsFor(page.locale, config.i18n.messages),
        ...config.markdown.labels
      }
    }

    if (isMdxPath(page.relativePath)) {
      const mdxOptions = { ...markdownOptions, html: 'trusted' as const }
      const rendered = await renderMdxResult(
        page.body,
        page.sourcePath,
        cwd,
        mdxOptions,
        undefined,
        urlTransform,
        renderer
      )
      markdownContent = rendered.content
      markdownAssets = rendered.assets
    } else {
      const rendered = await renderer.render(page.body, {
        markdown: markdownOptions,
        as: 'article',
        urlTransform
      })
      markdownContent = rendered.content
      markdownAssets = rendered.assets
    }
    if (page.frontmatter.layout === 'playground') {
      markdownAssets = playgroundMarkdownAssets(markdownAssets, config.markdown.plugins)
    }
    registerPluginAssets(markdownAssets, pluginClients, pluginStyles)
    markdownAssets.behaviors.forEach((behavior) => markdownBehaviors.add(behavior))

    const hasLandingContent = Boolean(page.frontmatter.hero || page.frontmatter.features?.length)
    const hasAuthoredBody = page.body.trim().length > 0
    const content = isHome ? (
      <>
        {hasLandingContent ? <HomeHero page={page} config={config} /> : null}
        {hasAuthoredBody ? markdownContent : null}
      </>
    ) : (
      (markdownContent ?? <article className="df-content" />)
    )

    const markdownPath = resolveOutputPath(
      outputRoot,
      page.markdownOutputPath,
      `page ${page.sourceRelativePath}`
    )
    const rawSource = page.transformedSource

    const html =
      '<!doctype html>' +
      renderToStaticMarkup(
        <Layout
          config={config}
          graph={graph}
          page={page}
          home={isHome}
          markdownAssets={markdownAssets}
          rawSource={rawSource}
        >
          {content}
        </Layout>
      )

    const htmlPath = resolveOutputPath(outputRoot, page.outputPath, `page ${page.sourceRelativePath}`)
    await mkdir(dirname(htmlPath), { recursive: true })
    await writeFile(htmlPath, html)

    await mkdir(dirname(markdownPath), { recursive: true })
    await writeFile(markdownPath, rawSource)
  })

  if (markdownBehaviors.size > 0) {
    await copyMarkdownClient(outputRoot)
  } else {
    await rm(join(outputRoot, 'assets/docfuse-markdown'), { recursive: true, force: true })
  }
  await copyMarkdownPluginAssets(outputRoot, pluginClients, pluginStyles)
  await removeStalePageAssets(outputRoot, previousPages, graph.pages, [
    ...generatedPaths,
    ...publicAssets.map((asset) => asset.outputPath)
  ])
}
