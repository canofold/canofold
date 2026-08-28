import { visit } from 'unist-util-visit'
import type { Element, ElementContent, Root as HastRoot, RootContent as HastContent, Text } from 'hast'
import type { BlockContent, Code, Paragraph, PhrasingContent, Root, RootContent } from 'mdast'
import type { ContainerDirective, Directives } from 'mdast-util-directive'
import type { State } from 'mdast-util-to-hast'
import type { Node, Parent } from 'unist'
import type { NormalizedMarkdownOptions } from '../normalizeOptions'
import type { CalloutPart, StepGroup, StepItem, TabGroup, TabItem } from '../ast'
import { markdownFileIconName, markdownFileKind } from '../../shared/fileKinds'

const CALLOUTS = new Set(['info', 'tip', 'warning', 'danger'])
const BADGE_TONES = new Set(['accent', 'success', 'warning', 'danger'])

function nodeText(node: Node): string {
  if ('value' in node && typeof node.value === 'string') return node.value
  return 'children' in node && Array.isArray(node.children)
    ? node.children.map((child) => nodeText(child)).join('')
    : ''
}

function isParent(node: Node): node is Node & Parent {
  return 'children' in node && Array.isArray(node.children)
}

function directiveLabel(node: Parent): string {
  const label = node.children.find((child) => child.data?.directiveLabel)
  return label ? nodeText(label).trim() : ''
}

function withoutDirectiveLabel(node: ContainerDirective): BlockContent[] {
  return node.children.filter((child) => !child.data?.directiveLabel) as BlockContent[]
}

function tabValue(label: string, index: number): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'tab'}-${index + 1}`
}

function indexedLabel(template: string, index: number): string {
  return template.replace('{index}', String(index + 1))
}

function codeGroupLabel(node: Code, index: number, fallback: string): string {
  const meta = String(node.meta ?? '')
  const match = meta.match(/(?:title|filename)\s*=\s*["']([^"']+)["']|\[([^\]]+)\]/i)
  const explicitLabel = match?.[1] ?? match?.[2]
  if (explicitLabel?.trim()) return explicitLabel.trim()
  const language = String(node.lang ?? '').trim()
  return language || indexedLabel(fallback, index)
}

function escapeDirectiveLabel(label: string) {
  return label.replace(/[\\[\]]/g, (character) => `\\${character}`)
}

function directiveAttributes(node: Directives) {
  return node.attributes ?? {}
}

function directiveAttribute(node: Directives, name: string) {
  const value = directiveAttributes(node)[name]
  return typeof value === 'string' ? value.trim() : ''
}

function labelParagraph(node: ContainerDirective): Paragraph | undefined {
  const label = node.children.find((child) => child.data?.directiveLabel)
  if (!label || !isParent(label)) return undefined
  return {
    type: 'paragraph',
    children: [
      {
        type: 'strong',
        children: label.children as PhrasingContent[]
      }
    ]
  }
}

function summaryParagraph(node: ContainerDirective): Paragraph | undefined {
  const label = node.children.find((child) => child.data?.directiveLabel)
  if (!label || !isParent(label)) return undefined
  return {
    type: 'paragraph',
    data: { hName: 'summary', hProperties: { dataDfSlot: 'summary' } },
    children: label.children as PhrasingContent[]
  }
}

function componentData(
  node: Directives,
  hName: string,
  component: string,
  properties: Record<string, unknown> = {}
) {
  node.data = {
    ...node.data,
    hName,
    hProperties: {
      ...node.data?.hProperties,
      dataDfComponent: component,
      ...properties
    }
  }
}

function intrinsicData(node: Directives, hName: string, properties: Element['properties']) {
  node.data = {
    ...node.data,
    hName,
    hProperties: {
      ...node.data?.hProperties,
      ...properties
    }
  }
}

/**
 * Keep the authoring interface small: directives describe intent and the
 * compiler owns every `df-*` class, data attribute, slot, and ARIA detail.
 */
export const remarkRichDirectives = () => {
  return (tree: Root) => {
    visit(tree, (candidate) => {
      if (
        candidate.type !== 'containerDirective' &&
        candidate.type !== 'leafDirective' &&
        candidate.type !== 'textDirective'
      ) {
        return
      }
      const node = candidate as Directives

      if (node.type === 'textDirective' && node.name === 'badge') {
        const tone = directiveAttribute(node, 'tone').toLowerCase()
        componentData(node, 'span', 'badge', {
          className: tone && BADGE_TONES.has(tone) ? [`df-badge-${tone}`] : []
        })
        return
      }

      if (node.type === 'textDirective' && node.name === 'copy') {
        componentData(node, 'span', 'copy-snippet', { dataDfValue: nodeText(node).trim() })
        return
      }

      if (node.type === 'leafDirective' && (node.name === 'audio' || node.name === 'video')) {
        const label = nodeText(node).trim()
        const preload = directiveAttribute(node, 'preload')
        intrinsicData(node, node.name, {
          src: directiveAttribute(node, 'src'),
          controls: true,
          preload: preload || (node.name === 'video' ? 'metadata' : 'none'),
          title: label,
          ariaLabel: label,
          dataDfElement: node.name,
          ...(node.name === 'video' && directiveAttribute(node, 'poster')
            ? { poster: directiveAttribute(node, 'poster') }
            : {})
        })
        return
      }

      if (node.type === 'leafDirective' && node.name === 'embed') {
        const label = nodeText(node).trim()
        const attributes = directiveAttributes(node)
        intrinsicData(node, 'iframe', {
          src: directiveAttribute(node, 'src'),
          title: label,
          loading: directiveAttribute(node, 'loading') || 'lazy',
          sandbox: directiveAttribute(node, 'sandbox'),
          referrerPolicy: directiveAttribute(node, 'referrerpolicy') || 'no-referrer',
          dataDfElement: 'embed',
          ...(directiveAttribute(node, 'allow') ? { allow: directiveAttribute(node, 'allow') } : {}),
          ...(Object.hasOwn(attributes, 'allowfullscreen') ? { allowFullScreen: true } : {})
        })
        return
      }

      if (node.type !== 'containerDirective') return
      const label = labelParagraph(node)
      const body = withoutDirectiveLabel(node)

      if (node.name === 'details') {
        const summary = summaryParagraph(node)
        componentData(node, 'details', 'details', {
          ...(Object.hasOwn(directiveAttributes(node), 'open') ? { open: true } : {})
        })
        node.children = [...(summary ? [summary] : []), ...body]
        return
      }

      if (node.name === 'aside') {
        componentData(node, 'aside', 'aside')
        node.children = [...(label ? [label] : []), ...body]
        return
      }

      if (node.name === 'file-tree') {
        componentData(node, 'div', 'file-tree')
        node.children = body
        return
      }

      if (node.name === 'gallery') {
        componentData(node, 'div', 'gallery', {
          ...(directiveLabel(node) ? { dataDfGalleryLabel: directiveLabel(node) } : {})
        })
        node.children = body
        return
      }

      if (node.name === 'card-grid') {
        componentData(node, 'div', 'card-grid')
        node.children = body
        return
      }

      if (node.name === 'card') {
        const href = directiveAttribute(node, 'href')
        if (!href) return
        node.data = {
          ...node.data,
          hName: 'a',
          hProperties: {
            ...node.data?.hProperties,
            className: ['df-link-card'],
            href,
            dataDfSlot: 'card'
          }
        }
        node.children = [...(label ? [label] : []), ...body]
        return
      }

      if (node.name === 'api') {
        componentData(node, 'section', 'api', {
          dataDfApiMethod: directiveAttribute(node, 'method').toUpperCase(),
          dataDfApiPath: directiveAttribute(node, 'path')
        })
        node.children = body
        return
      }

      if (node.name === 'response') {
        node.data = {
          ...node.data,
          hName: 'div',
          hProperties: {
            ...node.data?.hProperties,
            dataDfApiResponse: directiveLabel(node)
          }
        }
        node.children = body
      }
    })
  }
}

function element(
  tagName: string,
  properties: Element['properties'] = {},
  children: ElementContent[] = []
): Element {
  return { type: 'element', tagName, properties, children }
}

function hastText(node: HastRoot | HastContent | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.value
  return 'children' in node ? node.children.map((child) => hastText(child)).join('') : ''
}

function classes(node: Element) {
  const raw = node.properties.className ?? node.properties.class
  return Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(/\s+/) : []
}

function addClass(node: Element, className: string) {
  node.properties = {
    ...node.properties,
    className: [...new Set([...classes(node), className])]
  }
}

function normalizeFileTreeList(list: Element) {
  if (list.tagName !== 'ul') return
  for (const child of list.children) {
    if (child.type !== 'element' || child.tagName !== 'li') continue
    const nested = child.children.find(
      (item): item is Element => item.type === 'element' && item.tagName === 'ul'
    )
    const label = hastText({
      type: 'root',
      children: child.children.filter((item) => item !== nested)
    }).trim()
    if (nested) {
      normalizeFileTreeList(nested)
      child.properties = { ...child.properties, dataDfFileTreeBranch: '' }
      child.children = [
        element('button', { type: 'button', ariaExpanded: 'true' }, [
          { type: 'text', value: label.replace(/\/$/, '') }
        ]),
        nested
      ]
    } else {
      child.properties = { ...child.properties, dataDfFileTreeFile: '' }
      child.children = [{ type: 'text', value: label }]
    }
  }
}

function normalizeFileTree(node: Element) {
  const list = node.children.find(
    (child): child is Element => child.type === 'element' && child.tagName === 'ul'
  )
  if (list) normalizeFileTreeList(list)
}

function normalizeGallery(node: Element) {
  node.children = node.children.flatMap((child) => {
    if (child.type !== 'element' || child.tagName !== 'p') return [child]
    const onlyContainsImage = child.children.every(
      (item) =>
        (item.type === 'element' && item.tagName === 'img') ||
        (item.type === 'text' && item.value.trim() === '')
    )
    if (!onlyContainsImage) return [child]
    const image = child.children.find(
      (item): item is Element => item.type === 'element' && item.tagName === 'img'
    )
    if (!image) return [child]
    const caption = typeof image.properties.title === 'string' ? image.properties.title.trim() : ''
    return [
      element('figure', {}, [
        image,
        ...(caption ? [element('figcaption', {}, [{ type: 'text', value: caption }])] : [])
      ])
    ]
  })
}

function apiPath(path: string): ElementContent[] {
  const parts = path.split(/(:[A-Za-z0-9_-]+)/g).filter(Boolean)
  return parts.map((part) =>
    part.startsWith(':')
      ? element('span', { className: ['df-api-path-param'] }, [{ type: 'text', value: part }])
      : ({ type: 'text', value: part } as Text)
  )
}

function responseTone(status: string) {
  const code = Number.parseInt(status, 10)
  if (code >= 200 && code < 300) return 'df-badge-success'
  if (code >= 400) return 'df-badge-danger'
  return ''
}

function normalizeApi(node: Element) {
  const method = String(node.properties.dataDfApiMethod ?? '').trim()
  const path = String(node.properties.dataDfApiPath ?? '').trim()
  delete node.properties.dataDfApiMethod
  delete node.properties.dataDfApiPath
  const children: ElementContent[] = []
  if (method || path) {
    children.push(
      element('div', { className: ['df-api-endpoint'] }, [
        ...(method
          ? [element('span', { className: ['df-api-method'] }, [{ type: 'text', value: method }])]
          : []),
        ...(path ? [element('span', {}, apiPath(path))] : [])
      ])
    )
  }
  for (const child of node.children) {
    if (child.type !== 'element') {
      children.push(child)
      continue
    }
    const status = String(child.properties.dataDfApiResponse ?? '').trim()
    if (status) {
      delete child.properties.dataDfApiResponse
      addClass(child, 'df-api-response')
      const tone = responseTone(status)
      child.children.unshift(
        element('span', { className: ['df-badge', ...(tone ? [tone] : [])], dataDfComponent: 'badge' }, [
          { type: 'text', value: status }
        ])
      )
      children.push(child)
      continue
    }
    if (child.tagName === 'table') {
      children.push(element('div', { className: ['df-api-params'] }, [child]))
      continue
    }
    children.push(child)
  }
  node.children = children
}

/** Finish rich directive structure after Markdown has become semantic HTML. */
export const rehypeRichDirectives = () => {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node) => {
      const component = String(node.properties.dataDfComponent ?? '')
      if (component === 'file-tree') normalizeFileTree(node)
      if (component === 'gallery') normalizeGallery(node)
      if (component === 'api') normalizeApi(node)
    })
  }
}

/** Allow the friendly `:::tip 标题` authoring syntax. */
export function normalizeCallouts(markdown: string): string {
  let fence: { marker: string; size: number } | undefined
  return markdown
    .split('\n')
    .map((line) => {
      const candidate = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
      const marker = candidate?.[1]
      const markerType = marker?.[0]
      const remainder = candidate?.[2] ?? ''
      if (fence) {
        if (
          marker &&
          markerType === fence.marker &&
          marker.length >= fence.size &&
          /^[ \t]*$/.test(remainder)
        ) {
          fence = undefined
        }
        return line
      }

      if (marker && markerType && (markerType !== '`' || !remainder.includes('`'))) {
        fence = { marker: markerType, size: marker.length }
        return line
      }
      return line.replace(
        /^(:{3,}\s*)(info|tip|warning|danger)[ \t]+(.+?)[ \t]*$/,
        (_match, open, name, title) => `${open}${name}[${escapeDirectiveLabel(title)}]`
      )
    })
    .join('\n')
}

/** Convert stable Tabs and Code Group directives into the shared tab model. */
export const remarkTabGroups = (options: NormalizedMarkdownOptions) => {
  return (tree: Root) => {
    visit(tree, 'containerDirective', (node, index, parent) => {
      if (!parent || index === undefined) return
      const isTabs = node.name === 'tabs' && options.features.tabs
      const isCodeGroup = node.name === 'code-group' && options.features.codeGroups
      if (!isTabs && !isCodeGroup) return

      const label =
        directiveLabel(node) || (isCodeGroup ? options.labels.codeGroupTitle : options.labels.tabsTitle)
      const body = withoutDirectiveLabel(node)
      const items = isTabs
        ? body
            .filter(
              (child): child is ContainerDirective =>
                child.type === 'containerDirective' && child.name === 'tab'
            )
            .map((child, index) => ({
              type: 'tabItem' as const,
              data: {
                tabLabel: directiveLabel(child) || indexedLabel(options.labels.tabItem, index),
                tabValue: '',
                tabIndex: index
              },
              children: withoutDirectiveLabel(child)
            }))
        : body
            .filter((child): child is Code => child.type === 'code')
            .map((child, index) => ({
              type: 'tabItem' as const,
              data: {
                tabLabel: codeGroupLabel(child, index, options.labels.codeGroupItem),
                tabLanguage: String(child.lang ?? '')
                  .trim()
                  .toLowerCase(),
                tabValue: '',
                tabIndex: index
              },
              children: [child]
            }))

      if (!items.length) return

      items.forEach((item, index) => {
        const value = tabValue(item.data.tabLabel, index)
        item.data = {
          ...item.data,
          tabValue: value,
          tabIndex: index
        }
      })

      const group: TabGroup = {
        type: 'tabGroup',
        data: { tabGroupLabel: label, tabGroupKind: isCodeGroup ? 'code-group' : 'tabs' },
        children: items,
        position: node.position
      }
      parent.children[index] = group
    })
  }
}

/** Convert Steps directives into the shared ordered-list visual contract. */
export const remarkSteps = (options: NormalizedMarkdownOptions) => {
  return (tree: Root) => {
    visit(tree, 'containerDirective', (node, index, parent) => {
      if (!parent || index === undefined) return
      if (node.name !== 'steps' || !options.features.steps) return
      const items = withoutDirectiveLabel(node)
        .filter(
          (child): child is ContainerDirective => child.type === 'containerDirective' && child.name === 'step'
        )
        .map((child, index) => ({
          type: 'stepItem' as const,
          data: { stepTitle: directiveLabel(child), stepIndex: index + 1 },
          children: withoutDirectiveLabel(child)
        }))
      if (!items.length) return
      const group: StepGroup = {
        type: 'stepGroup',
        data: { stepLabel: directiveLabel(node) },
        children: items,
        position: node.position
      }
      parent.children[index] = group
    })
  }
}

export function rehypeStepItem(state: State, node: StepItem): Element {
  const children: ElementContent[] = node.data.stepTitle
    ? [
        {
          type: 'element',
          tagName: 'strong',
          properties: { className: ['df-step-title'] },
          children: [{ type: 'text', value: node.data.stepTitle }]
        },
        ...state.all(node)
      ]
    : state.all(node)
  return {
    type: 'element',
    tagName: 'li',
    properties: { dataDfSlot: 'item' },
    children
  }
}

export function rehypeStepGroup(state: State, node: StepGroup): Element {
  const label = node.data.stepLabel.trim()
  return {
    type: 'element',
    tagName: 'ol',
    properties: {
      className: ['df-steps'],
      dataDfComponent: 'steps',
      dataDfSlot: 'root',
      ...(label ? { ariaLabel: label } : {})
    },
    children: state.all(node)
  }
}

export function rehypeTabItem(state: State, node: TabItem): Element {
  const data = node.data
  const content = state.all(node)
  return {
    type: 'element',
    tagName: 'div',
    properties: {
      className: ['df-tabs-content'],
      role: 'tabpanel',
      dataDfTabPanel: data.tabValue,
      dataDfSlot: 'panel',
      tabIndex: 0,
      hidden: data.tabIndex !== 0
    },
    children: content
  }
}

export function rehypeTabGroup(state: State, node: TabGroup): Element {
  const data = node.data
  const isCodeGroup = data.tabGroupKind === 'code-group'
  const triggers: Element[] = node.children.map((item) => {
    const itemData = item.data
    const active = itemData.tabIndex === 0
    const tabLabel = String(itemData.tabLabel ?? '')
    const tabLanguage = String(itemData.tabLanguage ?? '')
    return {
      type: 'element',
      tagName: 'button',
      properties: {
        type: 'button',
        role: 'tab',
        className: ['df-tabs-trigger'],
        ariaSelected: active ? 'true' : 'false',
        tabIndex: active ? 0 : -1,
        dataDfTab: itemData.tabValue,
        ...(isCodeGroup && itemData.tabLanguage ? { dataDfLanguage: itemData.tabLanguage } : {}),
        dataDfSlot: 'tab',
        title: tabLabel
      },
      children: isCodeGroup
        ? [
            {
              type: 'element',
              tagName: 'span',
              properties: {
                className: ['df-code-file-icon'],
                dataDfFileIcon: markdownFileIconName(tabLabel, tabLanguage),
                dataDfFileKind: markdownFileKind(tabLabel, tabLanguage),
                ariaHidden: 'true'
              },
              children: []
            },
            {
              type: 'element',
              tagName: 'span',
              properties: { className: ['df-code-tab-label'] },
              children: [{ type: 'text', value: tabLabel }]
            }
          ]
        : [{ type: 'text', value: tabLabel }]
    }
  })

  return {
    type: 'element',
    tagName: 'div',
    properties: {
      className: ['df-tabs', ...(isCodeGroup ? ['df-code-group'] : [])],
      dataDfComponent: isCodeGroup ? 'code-group' : 'tabs',
      dataDfSlot: 'root',
      dataDfBehavior: 'tabs'
    },
    children: [
      {
        type: 'element',
        tagName: 'div',
        properties: {
          className: ['df-tabs-list'],
          role: 'tablist',
          ariaLabel: String(data.tabGroupLabel ?? 'Tabs'),
          dataDfSlot: 'tab-list'
        },
        children: triggers
      },
      ...state.all(node)
    ]
  }
}

/** Map `:::tip` containers onto the shared callout markup. */
export const remarkCallouts = () => {
  return (tree: Root) => {
    visit(tree, (node) => {
      if (node.type !== 'containerDirective' || !CALLOUTS.has(node.name)) return
      const className = ['df-callout', `df-callout-${node.name}`]
      const labelChild = node.children.find(
        (child): child is typeof child & Parent => Boolean(child.data?.directiveLabel) && isParent(child)
      )
      const rest = node.children.filter((child) => child !== labelChild)
      const body: CalloutPart = {
        type: 'calloutBody',
        data: { hName: 'div', hProperties: { className: ['df-callout-body'], dataDfSlot: 'content' } },
        children: rest
      }
      const children: CalloutPart[] = labelChild
        ? [
            {
              type: 'calloutTitle' as const,
              data: { hName: 'div', hProperties: { className: ['df-callout-title'], dataDfSlot: 'title' } },
              children: labelChild.children as RootContent[]
            },
            body
          ]
        : [body]
      node.data = {
        hName: 'div',
        hProperties: { className, dataCallout: node.name, dataDfComponent: 'callout', dataDfSlot: 'root' }
      }
      node.children = children
    })
  }
}
