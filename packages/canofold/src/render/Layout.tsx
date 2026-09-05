import type { CSSProperties, ReactNode } from 'react'
import type { MarkdownAssets } from '@canofold/markdown/server'
import type { CanofoldConfig } from '../config/types'
import type { ContentGraph, DocPage } from '../content/types'
import { publicPathFor, siteUrlFor } from '../seo/urls'
import { LayoutDocument } from './layout/LayoutDocument'
import { LayoutHeader } from './layout/LayoutHeader'
import { createLayoutModel } from './layout/model'
import { LayoutOverlays } from './layout/LayoutOverlays'
import { DEFAULT_FAVICON } from './layoutContent'
import { noFlashScript, outlineScript, shellScript } from './shellScripts'

export function Layout({
  config,
  graph,
  page,
  home = false,
  markdownAssets,
  rawSource,
  children
}: {
  config: CanofoldConfig
  graph: ContentGraph
  page: DocPage
  home?: boolean
  markdownAssets: MarkdownAssets
  rawSource: string
  children: ReactNode
}) {
  const model = createLayoutModel({ config, graph, page, home, assets: markdownAssets, rawSource })
  const hasMarkdownBehaviors = model.assets.behaviors.length > 0
  const pluginClientUrls = model.assets.pluginClients.map((asset) =>
    publicPathFor(config, `/assets/canofold-plugins/${asset.id}.js`)
  )
  const canonicalUrl = siteUrlFor(config, page.routePath)
  const faviconPath = publicPathFor(config, config.theme.favicon ?? DEFAULT_FAVICON)
  const documentClassName = [
    config.layout.header ? undefined : 'cf-header-hidden',
    page.frontmatter.layout === 'playground' ? 'cf-playground-page' : undefined
  ]
    .filter(Boolean)
    .join(' ')
  const isPlayground = page.frontmatter.layout === 'playground'

  return (
    <html lang={page.locale} className={documentClassName || undefined}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{model.title}</title>
        <meta name="description" content={model.description} data-canofold-page-head="" />
        <meta property="og:title" content={model.title} data-canofold-page-head="" />
        <meta property="og:description" content={model.description} data-canofold-page-head="" />
        {config.search.enabled && page.search ? (
          <>
            <meta data-pagefind-meta="title[content]" content={page.title} data-canofold-page-head="" />
            <meta
              data-pagefind-meta="description[content]"
              content={page.description}
              data-canofold-page-head=""
            />
            <meta data-pagefind-filter={`version:${page.version}`} data-canofold-page-head="" />
            <meta data-pagefind-filter={`locale:${page.locale}`} data-canofold-page-head="" />
            <meta data-pagefind-filter={`status:${page.status}`} data-canofold-page-head="" />
            {(Array.isArray(page.frontmatter.tags) ? page.frontmatter.tags : [])
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => (
                <meta key={tag} data-pagefind-filter={`tag:${tag}`} data-canofold-page-head="" />
              ))}
          </>
        ) : null}
        {canonicalUrl ? <meta property="og:url" content={canonicalUrl} data-canofold-page-head="" /> : null}
        <meta name="twitter:card" content="summary" />
        <link rel="icon" href={faviconPath} />
        {canonicalUrl ? <link rel="canonical" href={canonicalUrl} data-canofold-page-head="" /> : null}
        {config.siteUrl
          ? model.alternatePages.map((alternate) => (
              <link
                key={alternate.locale}
                rel="alternate"
                hrefLang={alternate.locale}
                href={siteUrlFor(config, alternate.routePath)}
                data-canofold-page-head=""
              />
            ))
          : null}
        <link rel="stylesheet" href={publicPathFor(config, '/assets/canofold.css')} />
        {model.assets.pluginStyles.map((asset) => (
          <link
            key={asset.id}
            rel="stylesheet"
            href={publicPathFor(config, `/assets/canofold-plugins/${asset.id}.css`)}
            data-canofold-page-head=""
          />
        ))}
        {config.theme.darkMode ? <script dangerouslySetInnerHTML={{ __html: noFlashScript }} /> : null}
      </head>
      <body>
        <div
          className="cf-page-root"
          style={{ '--cf-canofold-config-icon': `url(${JSON.stringify(faviconPath)})` } as CSSProperties}
          data-canofold-page-root=""
          data-markdown-behaviors={hasMarkdownBehaviors ? JSON.stringify(model.assets.behaviors) : undefined}
          data-markdown-client-url={
            hasMarkdownBehaviors ? publicPathFor(config, '/assets/canofold-markdown/index.js') : undefined
          }
          data-markdown-plugin-clients={
            pluginClientUrls.length > 0 ? JSON.stringify(pluginClientUrls) : undefined
          }
          data-canofold-playground-client-url={
            isPlayground ? publicPathFor(config, '/assets/canofold-playground/index.js') : undefined
          }
        >
          <a className="cf-skip-link" href="#canofold-main">
            {model.labels.skipToContent}
          </a>
          {config.layout.header ? <LayoutHeader model={model} /> : null}
          {home ? (
            <main
              id="canofold-main"
              className="cf-home"
              tabIndex={-1}
              data-pagefind-body={page.search ? '' : undefined}
            >
              {children}
            </main>
          ) : (
            <LayoutDocument model={model}>{children}</LayoutDocument>
          )}
          <LayoutOverlays model={model} />
        </div>
        <script type="module" dangerouslySetInnerHTML={{ __html: model.markdownClientScript }} />
        {isPlayground ? (
          <script type="module" src={publicPathFor(config, '/assets/canofold-playground/index.js')} />
        ) : null}
        <script dangerouslySetInnerHTML={{ __html: shellScript }} />
        <script dangerouslySetInnerHTML={{ __html: outlineScript }} />
        {config.search.enabled ? (
          <script type="module" src={publicPathFor(config, '/assets/canofold-search.js')} />
        ) : null}
      </body>
    </html>
  )
}
