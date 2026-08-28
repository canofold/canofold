import type { MarkdownAssets } from '@docfuse/markdown/server'
import type { DocfuseConfig, DocfuseLayoutLabels } from '../../config/types'
import { localeRelativePathFor, localeRootPath } from '../../content/routes'
import type { ContentGraph, DocPage, NavItem, SidebarGroup, SidebarItem } from '../../content/types'
import { docfuseVersion } from '../../version'
import { publicPathFor } from '../../seo/urls'
import { searchProviderClient } from '../../search'
import {
  layoutContentFor,
  type LayoutContent,
  type MarkdownElementGroup,
  type MarkdownElementGroupId
} from '../layoutContent'

interface LayoutLanguageOption {
  locale: string
  routePath: string
}

interface LayoutVersionOption {
  id: string
  label: string
  routePath: string
}

export interface LayoutModel {
  config: DocfuseConfig
  page: DocPage
  home: boolean
  assets: MarkdownAssets
  title: string
  description: string
  editHref?: string
  alternatePages: DocPage[]
  languageOptions: LayoutLanguageOption[]
  versionOptions: LayoutVersionOption[]
  navItems: NavItem[]
  content: LayoutContent
  labels: DocfuseLayoutLabels
  brandTagline: string
  versionLabel: string
  localeRoot: string
  markdownShowcaseHref: string
  hasMarkdownShowcase: boolean
  sidebarGroups: SidebarGroup[]
  hasSidebarItems: boolean
  outlineHeadings: DocPage['headings']
  markdownClientScript: string
  searchProvider: string
  searchIndexUrl: string
  searchBundleUrl: string
  rawSource: string
}

function subPath(page: DocPage) {
  return localeRelativePathFor(page.relativePath, page.locale)
}

export function markdownGroupHash(
  groups: readonly MarkdownElementGroup[],
  id: MarkdownElementGroupId
): string {
  const group = groups.find((candidate) => candidate.id === id)
  if (!group) throw new Error(`Missing Markdown element group: ${id}`)
  return group.hash
}

export function createLayoutModel({
  config,
  graph,
  page,
  home,
  assets,
  rawSource
}: {
  config: DocfuseConfig
  graph: ContentGraph
  page: DocPage
  home: boolean
  assets: MarkdownAssets
  rawSource: string
}): LayoutModel {
  const alternatePages = graph.pages.filter(
    (candidate) => candidate.version === page.version && subPath(candidate) === subPath(page)
  )
  const languageOptions = graph.locales.map((locale) => {
    const match = alternatePages.find((candidate) => candidate.locale === locale)
    return {
      locale,
      routePath: match?.routePath ?? localeRootPath(locale, graph.defaultLocale, page.versionBase)
    }
  })
  const versionOptions = graph.versions.map((version) => {
    const match = graph.pages.find(
      (candidate) =>
        candidate.version === version.id &&
        candidate.locale === page.locale &&
        subPath(candidate) === subPath(page)
    )
    return {
      id: version.id,
      label: version.label,
      routePath: match?.routePath ?? localeRootPath(page.locale, graph.defaultLocale, version.base)
    }
  })
  const allGroups = graph.sidebar[page.version]?.[page.locale] ?? []
  const content = layoutContentFor(page.locale, config.i18n.messages)
  const localeRoot = localeRootPath(page.locale, graph.defaultLocale, page.versionBase)
  const rawMarkdownShowcaseHref = `${localeRoot}markdown/playground/`
  const hasMarkdownShowcase = graph.pages.some(
    (candidate) => candidate.locale === page.locale && candidate.routePath === rawMarkdownShowcaseHref
  )
  const isActiveItem = (item: SidebarItem): boolean =>
    item.type === 'link' ? item.routePath === page.routePath : item.items.some(isActiveItem)
  const isActiveGroup = (group: SidebarGroup) => group.items.some(isActiveItem)
  const sidebarGroups = allGroups.filter(
    (group) => group.title === '' || group.segment === page.group || isActiveGroup(group)
  )

  return {
    config,
    page,
    home,
    assets,
    title: page.title && page.title !== config.title ? `${page.title} | ${config.title}` : config.title,
    description: page.description || config.description,
    ...(config.editUrl && page.version === graph.currentVersion
      ? { editHref: `${config.editUrl.replace(/\/$/, '')}/${page.relativePath}` }
      : {}),
    alternatePages,
    languageOptions,
    versionOptions,
    navItems: graph.nav[page.version]?.[page.locale] ?? [],
    content,
    labels: content.labels,
    brandTagline:
      config.i18n.messages?.[page.locale]?.brandTagline || config.description || content.brandTagline,
    versionLabel:
      graph.versions.length === 1 && page.version === 'current'
        ? `v${docfuseVersion}`
        : (graph.versions.find((version) => version.id === page.version)?.label ?? page.version),
    localeRoot: publicPathFor(config, localeRoot),
    markdownShowcaseHref: publicPathFor(config, rawMarkdownShowcaseHref),
    hasMarkdownShowcase,
    sidebarGroups,
    hasSidebarItems: sidebarGroups.some((group) => group.items.length > 0),
    outlineHeadings: page.headings.filter((heading) => heading.level >= 1 && heading.level <= 6),
    searchProvider: searchProviderClient(config.search.provider),
    searchIndexUrl:
      page.version === graph.currentVersion
        ? publicPathFor(config, `/search/${page.locale}.json`)
        : publicPathFor(config, `/search/${page.version}/${page.locale}.json`),
    searchBundleUrl: publicPathFor(config, '/pagefind/pagefind.js'),
    markdownClientScript: `window.__docfuseEnhanceMarkdown = async (target) => {
  const pageRoot = document.querySelector('[data-docfuse-page-root]')
  if (!pageRoot) return () => {}
  const root = target || pageRoot
  const behaviors = JSON.parse(pageRoot.getAttribute('data-markdown-behaviors') || '[]')
  const pluginClients = JSON.parse(pageRoot.getAttribute('data-markdown-plugin-clients') || '[]')
  const disposers = []
  try {
    if (behaviors.length) {
      const clientUrl = pageRoot.getAttribute('data-markdown-client-url')
      if (clientUrl) {
        const { enhanceMarkdown } = await import(clientUrl)
        const enhancement = enhanceMarkdown(root, { behaviors })
        disposers.push(() => enhancement.dispose())
        await enhancement.ready
      }
    }
    for (const pluginUrl of pluginClients) {
      const plugin = await import(pluginUrl)
      const enhancement = await plugin.enhance?.(root)
      if (typeof enhancement === 'function') disposers.push(enhancement)
      else if (enhancement?.dispose) disposers.push(() => enhancement.dispose())
      await enhancement?.ready
    }
    return () => disposers.reverse().forEach((dispose) => dispose())
  } catch (error) {
    disposers.reverse().forEach((dispose) => dispose())
    throw error
  }
}
const bootstrapMarkdown = async () => {
  window.__docfuseMarkdownDispose?.()
  const generation = (window.__docfuseMarkdownGeneration || 0) + 1
  window.__docfuseMarkdownGeneration = generation
  const root = document.querySelector('[data-docfuse-page-root]')
  if (!root) return
  const dispose = await window.__docfuseEnhanceMarkdown(root)
  if (window.__docfuseMarkdownGeneration !== generation || !root.isConnected) {
    dispose()
    return
  }
  window.__docfuseMarkdownDispose = () => {
    window.__docfuseMarkdownGeneration += 1
    dispose()
  }
}
window.__docfuseBootstrapMarkdown = () => {
  const ready = bootstrapMarkdown()
  window.__docfuseMarkdownReady = ready
  return ready
}
window.__docfuseBootstrapMarkdown()`,
    rawSource
  }
}
