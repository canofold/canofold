import { analyzeMarkdown } from '@docfuse/markdown/server/analyze'
import matter from 'gray-matter'
import { join, posix } from 'node:path'
import type { DocfuseConfig, DocfuseNavigationItem, DocfuseVersionItem } from '../config/types'
import type { ExtensionHost } from '../extensions/host'
import { portablePathKey, resolveProjectPath } from '../utils/paths'
import { isMarkdownIndexName, isMdxPath } from './fileKinds'
import { frontmatterSchema } from './frontmatter'
import { htmlOutputPathFor, localeRelativePathFor, markdownOutputPathFor, routePathFor } from './routes'
import { scanMarkdownFiles } from './scan'
import type {
  ContentGraph,
  DocPage,
  NavItem,
  SidebarGroup,
  SidebarItem,
  SidebarLink,
  SidebarTreeGroup
} from './types'

function humanize(segment: string) {
  return segment
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function isLocaleHome(page: DocPage) {
  return isMarkdownIndexName(localeRelativePathFor(page.relativePath, page.locale))
}

function sidebarLink(page: DocPage): SidebarLink {
  return { type: 'link', title: page.title || page.routePath, routePath: page.routePath }
}

function pageSegments(page: DocPage) {
  return localeRelativePathFor(page.relativePath, page.locale).split('/')
}

function pageDirectorySegments(page: DocPage) {
  return pageSegments(page).slice(0, -1)
}

function isDirectoryIndex(page: DocPage) {
  return isMarkdownIndexName(pageSegments(page).at(-1) ?? '')
}

/** Build a recursive sidebar while keeping the first directory as the active section. */
function buildSidebar(localePages: DocPage[]): SidebarGroup[] {
  const groups = new Map<string, SidebarGroup>()
  const directoryIndexes = new Map<string, DocPage>()
  const explicitGroupTitles = new Map<string, string>()
  for (const page of localePages) {
    if (isDirectoryIndex(page)) directoryIndexes.set(pageDirectorySegments(page).join('/'), page)
    if (page.group && typeof page.frontmatter.group === 'string') {
      const existing = explicitGroupTitles.get(page.group)
      if (existing && existing !== page.frontmatter.group) {
        throw new Error(
          `Inconsistent group name for locale "${page.locale}" directory "${page.group}": ` +
            `"${existing}" and "${page.frontmatter.group}"`
        )
      }
      explicitGroupTitles.set(page.group, page.frontmatter.group)
    }
  }

  for (const page of localePages) {
    if (isLocaleHome(page) || page.frontmatter.sidebar === false) continue
    const directorySegments = pageDirectorySegments(page)
    const groupSegment = directorySegments[0] ?? ''
    const groupIndex = directoryIndexes.get(groupSegment)
    const groupTitle = groupSegment
      ? typeof groupIndex?.frontmatter.group === 'string'
        ? groupIndex.frontmatter.group
        : groupIndex?.title || explicitGroupTitles.get(groupSegment) || humanize(groupSegment)
      : ''
    if (typeof page.frontmatter.group === 'string' && page.frontmatter.group !== groupTitle) {
      throw new Error(
        `Inconsistent group name for locale "${page.locale}" directory "${page.group}": ` +
          `"${groupTitle}" and "${page.frontmatter.group}"`
      )
    }
    let group = groups.get(groupSegment)
    if (!group) {
      group = {
        segment: groupSegment,
        title: groupTitle,
        items: []
      }
      groups.set(groupSegment, group)
    } else if (group.title !== groupTitle) {
      throw new Error(
        `Inconsistent group name for locale "${page.locale}" directory "${page.group}": ` +
          `"${group.title}" and "${groupTitle}"`
      )
    }

    let items = group.items
    for (let index = 1; index < directorySegments.length; index += 1) {
      const segment = directorySegments[index]
      if (!segment) continue
      const directoryPath = directorySegments.slice(0, index + 1).join('/')
      const directoryIndex = directoryIndexes.get(directoryPath)
      const compatibilityTitle =
        index === 1 && typeof page.frontmatter.subgroup === 'string' ? page.frontmatter.subgroup : undefined
      const title =
        (index === 1 && typeof directoryIndex?.frontmatter.subgroup === 'string'
          ? directoryIndex.frontmatter.subgroup
          : undefined) ??
        directoryIndex?.title ??
        compatibilityTitle ??
        humanize(segment)
      if (compatibilityTitle && compatibilityTitle !== title) {
        throw new Error(`Inconsistent subgroup name for locale "${page.locale}" directory "${directoryPath}"`)
      }
      const existing = items.find(
        (item): item is SidebarTreeGroup => item.type === 'group' && item.segment === segment
      )
      const nestedGroup =
        existing ??
        ({
          type: 'group',
          segment,
          title,
          collapsed: directoryIndex?.frontmatter.collapsed === true,
          items: []
        } satisfies SidebarTreeGroup)
      if (!existing) items.push(nestedGroup)
      items = nestedGroup.items
    }
    items.push(sidebarLink(page))
  }
  return [...groups.values()]
}

function firstSidebarLink(item: SidebarItem): SidebarLink | undefined {
  if (item.type === 'link') return item
  for (const child of item.items) {
    const link = firstSidebarLink(child)
    if (link) return link
  }
  return undefined
}

/** Top navigation: one entry per non-root section, pointing at its first page. */
function buildAutomaticNav(sidebar: SidebarGroup[]): NavItem[] {
  return sidebar.flatMap((group) => {
    const first = group.items[0] ? firstSidebarLink(group.items[0]) : undefined
    return group.title && first ? [{ title: group.title, routePath: first.routePath }] : []
  })
}

function versionedNavLink(link: string, version: DocfuseVersionItem) {
  if (!link.startsWith('/') || version.base === '/') return link
  return `${version.base}${link.replace(/^\//, '')}`
}

function buildConfiguredNav(items: DocfuseNavigationItem[], version: DocfuseVersionItem): NavItem[] {
  return items.map((item) => ({ title: item.text, routePath: versionedNavLink(item.link, version) }))
}

/** Keep configured section links useful when the section landing page is hidden
 * from the sidebar: a top-level section click opens its first visible menu item. */
function anchorConfiguredNavToSidebar(items: NavItem[], sidebar: SidebarGroup[]): NavItem[] {
  return items.map((item) => {
    if (!item.routePath.startsWith('/')) return item
    const segments = item.routePath.split('/').filter(Boolean)
    const group = sidebar.find(
      (candidate) => candidate.segment && segments.at(-1) === candidate.segment && segments.length > 0
    )
    const first = group?.items[0] ? firstSidebarLink(group.items[0]) : undefined
    return first ? { ...item, routePath: first.routePath } : item
  })
}

function assertUniquePageTargets(pages: DocPage[]) {
  const seen = new Map<string, DocPage>()
  for (const page of pages) {
    for (const [kind, value] of [
      ['route', page.routePath],
      ['output', page.outputPath],
      ['markdown output', page.markdownOutputPath]
    ] as const) {
      const key = `${kind}:${portablePathKey(value)}`
      const existing = seen.get(key)
      if (existing) {
        throw new Error(
          `Duplicate ${kind} target ${value} for ${existing.sourceRelativePath} and ${page.sourceRelativePath}`
        )
      }
      seen.set(key, page)
    }
  }
}

async function scanVersionPages(
  cwd: string,
  config: DocfuseConfig,
  version: DocfuseVersionItem,
  extensions?: ExtensionHost
): Promise<DocPage[]> {
  const docsRoot = resolveProjectPath(cwd, version.docsDir, `versions.items[${version.id}].docsDir`)
  const scanned = await scanMarkdownFiles(docsRoot)
  const pages: DocPage[] = []

  for (const file of scanned) {
    const parts = file.path.split(/[\\/]/)
    if (parts[0] === 'public') continue
    const explicitLocale = parts[0] && config.i18n.locales.includes(parts[0]) ? parts[0] : undefined
    const locale = explicitLocale ?? config.i18n.defaultLocale
    const rest = explicitLocale ? parts.slice(1) : parts
    if (rest.length === 0) continue
    const pagePath = rest.join('/')
    const sourceRelativePath = posix.join(version.docsDir.replace(/\\/g, '/'), file.path.replace(/\\/g, '/'))
    const transformedSource = extensions
      ? await extensions.transformSource({
          source: file.raw,
          sourceRelativePath,
          relativePath: file.path.replace(/\\/g, '/'),
          kind: isMdxPath(file.path) ? 'mdx' : 'markdown',
          version: version.id,
          locale
        })
      : file.raw
    const parsed = matter(transformedSource)
    const data = frontmatterSchema.parse(parsed.data)
    const status = data.status ?? 'published'
    if (status === 'draft') continue
    const analysis = analyzeMarkdown(parsed.content)
    const order =
      typeof data.order === 'number' && Number.isFinite(data.order) ? data.order : Number.MAX_SAFE_INTEGER
    const relativePath = file.path.replace(/\\/g, '/')

    const page: DocPage = {
      sourcePath: join(docsRoot, file.path),
      transformedSource,
      sourceRelativePath,
      relativePath,
      version: version.id,
      versionBase: version.base,
      docsDir: version.docsDir,
      locale,
      routePath: routePathFor(locale, config.i18n.defaultLocale, pagePath, version.base),
      outputPath: htmlOutputPathFor(locale, config.i18n.defaultLocale, pagePath, version.base),
      markdownOutputPath: markdownOutputPathFor(locale, config.i18n.defaultLocale, pagePath, version.base),
      title: typeof data.title === 'string' ? data.title : (analysis.headings[0]?.text ?? ''),
      description: typeof data.description === 'string' ? data.description : '',
      order,
      group: rest.length > 1 ? (rest[0] ?? '') : '',
      status,
      search: data.search !== false,
      ai: data.ai !== false,
      body: parsed.content,
      headings: analysis.headings,
      searchText: analysis.text,
      codeExamples: analysis.codeExamples,
      lastUpdated: data.updatedAt ?? new Date(file.mtimeMs).toISOString(),
      frontmatter: data
    }
    pages.push(extensions ? await extensions.extendPage(page) : page)
  }
  return pages
}

export async function buildContentGraph(
  cwd: string,
  config: DocfuseConfig,
  extensions?: ExtensionHost
): Promise<ContentGraph> {
  const pages: DocPage[] = []
  for (const version of config.versions.items) {
    for (const page of await scanVersionPages(cwd, config, version, extensions)) pages.push(page)
  }

  const versionOrder = new Map(config.versions.items.map((item, index) => [item.id, index]))
  const localeOrder = new Map(config.i18n.locales.map((locale, index) => [locale, index]))
  pages.sort((a, b) => {
    const versionDelta = (versionOrder.get(a.version) ?? 0) - (versionOrder.get(b.version) ?? 0)
    if (versionDelta !== 0) return versionDelta
    const localeDelta = (localeOrder.get(a.locale) ?? 0) - (localeOrder.get(b.locale) ?? 0)
    if (localeDelta !== 0) return localeDelta
    const aIndex = isLocaleHome(a)
    const bIndex = isLocaleHome(b)
    if (aIndex !== bIndex) return aIndex ? -1 : 1
    if (a.order !== b.order) return a.order - b.order
    return a.routePath.localeCompare(b.routePath)
  })
  assertUniquePageTargets(pages)

  for (const version of config.versions.items) {
    for (const locale of config.i18n.locales) {
      if (
        !pages.some((page) => page.version === version.id && page.locale === locale && isLocaleHome(page))
      ) {
        throw new Error(`Missing published home page for version "${version.id}" locale "${locale}"`)
      }
    }
  }

  for (const version of config.versions.items) {
    for (const locale of config.i18n.locales) {
      const contentPages = pages.filter(
        (page) => page.version === version.id && page.locale === locale && !isLocaleHome(page)
      )
      contentPages.forEach((page, index) => {
        const previous = contentPages[index - 1]
        const next = contentPages[index + 1]
        if (previous)
          page.previous = { title: previous.title || previous.routePath, routePath: previous.routePath }
        if (next) page.next = { title: next.title || next.routePath, routePath: next.routePath }
      })
    }
  }

  const sidebar: ContentGraph['sidebar'] = {}
  const nav: ContentGraph['nav'] = {}
  for (const version of config.versions.items) {
    const versionSidebar: Record<string, SidebarGroup[]> = {}
    const versionNav: Record<string, NavItem[]> = {}
    sidebar[version.id] = versionSidebar
    nav[version.id] = versionNav
    for (const locale of config.i18n.locales) {
      const localeSidebar = buildSidebar(
        pages.filter((page) => page.version === version.id && page.locale === locale)
      )
      versionSidebar[locale] = localeSidebar
      versionNav[locale] = config.navigation[locale]
        ? anchorConfiguredNavToSidebar(buildConfiguredNav(config.navigation[locale], version), localeSidebar)
        : buildAutomaticNav(localeSidebar)
    }
  }
  const pageRoutes = new Set(pages.map((page) => page.routePath))
  for (const versionNav of Object.values(nav)) {
    for (const items of Object.values(versionNav)) {
      for (const item of items) {
        if (item.routePath.startsWith('/') && !pageRoutes.has(item.routePath)) {
          throw new Error(`Navigation target is not a generated page: "${item.routePath}"`)
        }
      }
    }
  }

  return {
    pages,
    sidebar,
    nav,
    locales: config.i18n.locales,
    defaultLocale: config.i18n.defaultLocale,
    versions: config.versions.items.map((item) => ({ ...item })),
    currentVersion: config.versions.current
  }
}
