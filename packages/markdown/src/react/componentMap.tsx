import { createElement, type ComponentType, type ElementType, type JSX, type ReactNode } from 'react'
import {
  MarkdownApiBlock,
  MarkdownAside,
  MarkdownBadge,
  MarkdownCardGrid,
  MarkdownCallout,
  MarkdownCodeBlock,
  MarkdownCopySnippet,
  MarkdownDetails,
  MarkdownFileTree,
  MarkdownGallery,
  MarkdownImage,
  MarkdownTable,
  MarkdownTerminal,
  MarkdownSteps,
  MarkdownTabs
} from '../components/composite/MarkdownComposite'
import { MarkdownHeading } from '../components/blocks/MarkdownHeading'
import type { MarkdownCodeBlockProps } from '../components/blocks/MarkdownCodeBlock'
import type { MarkdownCopySnippetProps } from '../components/blocks/MarkdownCopySnippet'
import type { MarkdownImageProps } from '../components/blocks/MarkdownImage'
import type { MarkdownTableProps } from '../components/blocks/MarkdownTable'
import type { MarkdownTerminalProps } from '../components/blocks/MarkdownTerminal'
import type { MarkdownCompositeProps, MarkdownDetailsProps } from '../components/composite/MarkdownComposite'
import type { MarkdownFileTreeProps } from '../components/composite/MarkdownFileTree'
import type { MarkdownTabsProps } from '../components/composite/MarkdownTabs'
import type { ImageGalleryProps } from '../components/gallery/ImageGallery'
import {
  getMarkdownCaptionSlot,
  getMarkdownIconSlot,
  type MarkdownIconName,
  type MarkdownSlots
} from './slots'
import { semanticOverrideProps } from './semanticOverrideProps'
import { transformMarkdownUrlProps, type MarkdownUrlTransform } from './urlTransform'

export type MarkdownComponentMap = Record<string, ElementType>

/**
 * Host overrides for intrinsic tags and named Markdown composites.
 * Composite names are semantic so callers do not depend on wrapper classes.
 */
export interface MarkdownNamedComponentProps {
  Callout: MarkdownCompositeProps
  Tabs: MarkdownTabsProps
  CodeGroup: MarkdownTabsProps
  Steps: MarkdownCompositeProps
  CodeBlock: MarkdownCodeBlockProps
  CopySnippet: MarkdownCopySnippetProps
  Table: MarkdownTableProps
  Image: MarkdownImageProps
  Terminal: MarkdownTerminalProps
  Details: MarkdownDetailsProps
  FileTree: MarkdownFileTreeProps
  Gallery: ImageGalleryProps
  CardGrid: MarkdownCompositeProps
  Api: MarkdownCompositeProps
  Aside: MarkdownCompositeProps
  Badge: MarkdownCompositeProps
}

export type MarkdownIntrinsicComponents = {
  [Tag in keyof JSX.IntrinsicElements]?: ComponentType<JSX.IntrinsicElements[Tag]>
}

export type MarkdownComponents = MarkdownIntrinsicComponents & {
  [Name in keyof MarkdownNamedComponentProps]?: ComponentType<MarkdownNamedComponentProps[Name]>
}

/** Additional classes for stable Markdown element/component slots. */
export interface MarkdownClassNames {
  root?: string
  heading?: string
  paragraph?: string
  link?: string
  list?: string
  listItem?: string
  blockquote?: string
  horizontalRule?: string
  strong?: string
  emphasis?: string
  strikethrough?: string
  highlight?: string
  keyboard?: string
  superscript?: string
  subscript?: string
  inlineCode?: string
  code?: string
  codeBlock?: string
  copySnippet?: string
  table?: string
  tableHead?: string
  tableBody?: string
  tableRow?: string
  tableHeader?: string
  tableCell?: string
  taskCheckbox?: string
  callout?: string
  tabs?: string
  steps?: string
  image?: string
  video?: string
  audio?: string
  embed?: string
  definitionList?: string
  definitionTerm?: string
  definitionDescription?: string
  summary?: string
  footnotes?: string
  terminal?: string
  details?: string
  fileTree?: string
  gallery?: string
  cardGrid?: string
  api?: string
  aside?: string
  badge?: string
}

export interface MarkdownElementProps {
  children?: ReactNode
  node?: unknown
  [key: string]: unknown
}

function classNameText(value: unknown): string {
  return Array.isArray(value) ? value.join(' ') : typeof value === 'string' ? value : ''
}

function mergeClassNames(existing: unknown, extra?: string): string | undefined {
  const values = [classNameText(existing), extra].filter(Boolean)
  return values.length ? values.join(' ') : undefined
}

const componentDescriptors = {
  callout: { className: 'callout', override: 'Callout' },
  tabs: { className: 'tabs', override: 'Tabs' },
  'code-group': { className: 'tabs', override: 'CodeGroup' },
  steps: { className: 'steps', override: 'Steps' },
  'code-block': { className: 'codeBlock', override: 'CodeBlock' },
  'copy-snippet': { className: 'copySnippet', override: 'CopySnippet' },
  table: { className: 'table', override: 'Table' },
  image: { className: 'image', override: 'Image' },
  terminal: { className: 'terminal', override: 'Terminal' },
  details: { className: 'details', override: 'Details' },
  'file-tree': { className: 'fileTree', override: 'FileTree' },
  gallery: { className: 'gallery', override: 'Gallery' },
  'card-grid': { className: 'cardGrid', override: 'CardGrid' },
  api: { className: 'api', override: 'Api' },
  aside: { className: 'aside', override: 'Aside' },
  badge: { className: 'badge', override: 'Badge' }
} as const satisfies Record<
  string,
  { className: keyof MarkdownClassNames; override: keyof MarkdownNamedComponentProps }
>

export type MarkdownComponentName = keyof typeof componentDescriptors

function componentFromDataAttribute(value: unknown): MarkdownComponentName | undefined {
  const normalized = typeof value === 'string' ? value : ''
  return Object.hasOwn(componentDescriptors, normalized) ? (normalized as MarkdownComponentName) : undefined
}

function componentFromProps(props: MarkdownElementProps): MarkdownComponentName | undefined {
  return (
    componentFromDataAttribute(props['data-df-component']) ??
    componentFromDataAttribute(props.dataDfComponent)
  )
}

function componentClassName(component: MarkdownComponentName, classNames: MarkdownClassNames) {
  return classNames[componentDescriptors[component].className]
}

function componentOverride(
  components: MarkdownComponents,
  component: MarkdownComponentName
): ElementType | undefined {
  return components[componentDescriptors[component].override] as ElementType | undefined
}

function intrinsicOverride(components: MarkdownComponents, tagName: string): ElementType | undefined {
  return components[tagName as keyof MarkdownIntrinsicComponents] as ElementType | undefined
}

function createExtensionComponent(
  component: MarkdownComponentName,
  props: MarkdownElementProps,
  children: ReactNode,
  classNames: MarkdownClassNames,
  components: MarkdownComponents,
  urlTransform?: MarkdownUrlTransform
) {
  const className = mergeClassNames(props.className, componentClassName(component, classNames))
  const Override = componentOverride(components, component)
  if (Override) {
    const semanticProps = semanticOverrideProps(component, { ...props, className }, children)
    return createElement(Override, transformComponentUrlProps(component, semanticProps, urlTransform))
  }
  if (component === 'file-tree') return createElement(MarkdownFileTree, { ...props, className, children })
  if (component === 'gallery') return createElement(MarkdownGallery, { ...props, className, children })
  if (component === 'terminal') return createElement(MarkdownTerminal, { ...props, className, children })
  if (component === 'copy-snippet')
    return createElement(MarkdownCopySnippet, { ...props, className, children })
  if (component === 'card-grid') return createElement(MarkdownCardGrid, { ...props, className, children })
  if (component === 'api') return createElement(MarkdownApiBlock, { ...props, className, children })
  if (component === 'aside') return createElement(MarkdownAside, { ...props, className, children })
  if (component === 'badge') return createElement(MarkdownBadge, { ...props, className, children })
  return undefined
}

function transformComponentUrlProps(
  component: MarkdownComponentName,
  props: Record<string, unknown>,
  urlTransform?: MarkdownUrlTransform
) {
  const transformed = transformMarkdownUrlProps(props, urlTransform)
  if (component !== 'gallery' || !Array.isArray(transformed.items)) return transformed
  return {
    ...transformed,
    items: transformed.items.map((item) =>
      item && typeof item === 'object'
        ? transformMarkdownUrlProps(item as Record<string, unknown>, urlTransform)
        : item
    )
  }
}

function createMarkdownElement(
  tagName: string,
  elementName: keyof MarkdownClassNames,
  classNames: MarkdownClassNames,
  components: MarkdownComponents,
  urlTransform?: MarkdownUrlTransform
) {
  const dataElementName = elementName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
  function MarkdownElement({ children, node: _node, ...props }: MarkdownElementProps) {
    const Component: ElementType = intrinsicOverride(components, tagName) ?? (tagName as ElementType)
    const transformedProps = transformMarkdownUrlProps(props, urlTransform)
    if (elementName === 'heading' && /^h[1-6]$/.test(tagName)) {
      const anchor = props['data-df-anchor'] ?? props.dataDfAnchor
      const anchorLabel = props['data-df-anchor-label'] ?? props.dataDfAnchorLabel
      const copyFailureLabel = props['data-df-copy-failure-label'] ?? props.dataDfCopyFailureLabel
      return createElement(MarkdownHeading, {
        ...transformedProps,
        as: Component,
        level: Number(tagName.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6,
        anchor: typeof anchor === 'string' ? anchor : undefined,
        anchorLabel: typeof anchorLabel === 'string' ? anchorLabel : undefined,
        copyFailureLabel: typeof copyFailureLabel === 'string' ? copyFailureLabel : undefined,
        className: mergeClassNames(transformedProps.className, classNames[elementName]),
        'data-df-element': dataElementName,
        children
      })
    }
    return createElement(
      Component,
      {
        ...transformedProps,
        className: mergeClassNames(transformedProps.className, classNames[elementName]),
        'data-df-element': dataElementName
      },
      children
    )
  }

  MarkdownElement.displayName = `Markdown${tagName.charAt(0).toUpperCase()}${tagName.slice(1)}`
  return MarkdownElement
}

function createMarkdownSvg(slots: MarkdownSlots, components: MarkdownComponents) {
  return function MarkdownSvg({ children, node: _node, ...props }: MarkdownElementProps) {
    const name = props['data-df-icon'] ?? props.dataDfIcon
    const customSlot =
      typeof name === 'string' ? getMarkdownIconSlot(slots, name as MarkdownIconName) : undefined
    if (customSlot) {
      return createElement(customSlot, {
        size: Number(props.width ?? 16),
        className: typeof props.className === 'string' ? props.className : undefined,
        'aria-hidden': props['aria-hidden'] as boolean | 'true' | 'false' | undefined
      })
    }

    const { ['data-df-icon']: _dataDfIcon, dataDfIcon: _dataDfIconCamel, ...svgProps } = props
    return createElement(intrinsicOverride(components, 'svg') ?? 'svg', svgProps, children)
  }
}

function createMarkdownFigcaption(slots: MarkdownSlots, components: MarkdownComponents) {
  return function MarkdownFigcaption({ children, node: _node, ...props }: MarkdownElementProps) {
    const Caption = props['data-df-slot'] === 'caption' ? getMarkdownCaptionSlot(slots) : undefined
    if (Caption) {
      return createElement(Caption, {
        children,
        className: typeof props.className === 'string' ? props.className : undefined,
        'data-df-slot': typeof props['data-df-slot'] === 'string' ? props['data-df-slot'] : undefined
      })
    }
    return createElement(intrinsicOverride(components, 'figcaption') ?? 'figcaption', props, children)
  }
}

function createMarkdownDiv(
  classNames: MarkdownClassNames,
  components: MarkdownComponents,
  urlTransform?: MarkdownUrlTransform
) {
  return function MarkdownDiv({ children, node, ...props }: MarkdownElementProps) {
    const component = componentFromProps(props)
    const Override = component ? componentOverride(components, component) : undefined
    if (component === 'callout') {
      const Component = Override ?? MarkdownCallout
      return createElement(Component, {
        ...props,
        className: mergeClassNames(props.className, classNames.callout),
        children
      })
    }
    if (component === 'tabs' || component === 'code-group') {
      return createElement(MarkdownTabs, {
        ...props,
        className: mergeClassNames(props.className, classNames.tabs),
        kind: component,
        component: Override as ComponentType<MarkdownTabsProps> | undefined,
        children
      })
    }
    const extension =
      component &&
      createExtensionComponent(component, { ...props, node }, children, classNames, components, urlTransform)
    if (extension) return extension
    return createElement(
      intrinsicOverride(components, 'div') ?? 'div',
      {
        ...props,
        ...(component ? { 'data-df-component': component } : {})
      },
      children
    )
  }
}

function createMarkdownSemanticExtension(
  tagName: 'aside' | 'section' | 'span',
  classNames: MarkdownClassNames,
  components: MarkdownComponents,
  urlTransform?: MarkdownUrlTransform
) {
  return function MarkdownSemanticExtension({ children, node, ...props }: MarkdownElementProps) {
    const component = componentFromProps(props)
    const Override = component ? componentOverride(components, component) : undefined
    if (component === 'callout') {
      const Component = Override ?? MarkdownCallout
      return createElement(Component, {
        ...props,
        className: mergeClassNames(props.className, classNames.callout),
        children
      })
    }
    if (component === 'tabs' || component === 'code-group') {
      return createElement(MarkdownTabs, {
        ...props,
        className: mergeClassNames(props.className, classNames.tabs),
        kind: component,
        component: Override as ComponentType<MarkdownTabsProps> | undefined,
        children
      })
    }
    const extension =
      component &&
      createExtensionComponent(component, { ...props, node }, children, classNames, components, urlTransform)
    if (extension) return extension
    const isFootnotes =
      tagName === 'section' &&
      (props['data-df-element'] === 'footnotes' || props.dataDfElement === 'footnotes')
    return createElement(
      intrinsicOverride(components, tagName) ?? tagName,
      {
        ...props,
        className: isFootnotes ? mergeClassNames(props.className, classNames.footnotes) : props.className,
        ...(isFootnotes ? { 'data-df-element': 'footnotes' } : {}),
        ...(component ? { 'data-df-component': component } : {})
      },
      children
    )
  }
}

function createMarkdownFigure(
  classNames: MarkdownClassNames,
  components: MarkdownComponents,
  urlTransform?: MarkdownUrlTransform
) {
  return function MarkdownFigure({ children, node, ...props }: MarkdownElementProps) {
    const component = componentFromProps(props)
    if (component && ['code-block', 'table', 'image', 'terminal'].includes(component)) {
      const classNameKey = component === 'code-block' ? 'codeBlock' : (component as keyof MarkdownClassNames)
      const className = classNames[classNameKey]
      const Override = componentOverride(components, component)
      if (Override) {
        const semanticProps = semanticOverrideProps(
          component,
          { ...props, className: mergeClassNames(props.className, className) },
          children
        )
        return createElement(Override, transformComponentUrlProps(component, semanticProps, urlTransform))
      }
      if (component === 'code-block')
        return createElement(MarkdownCodeBlock, {
          ...props,
          className: mergeClassNames(props.className, className),
          children
        })
      if (component === 'table')
        return createElement(MarkdownTable, {
          ...props,
          className: mergeClassNames(props.className, className),
          children
        })
      if (component === 'image')
        return createElement(MarkdownImage, {
          ...props,
          className: mergeClassNames(props.className, className),
          children
        })
      if (component === 'terminal')
        return createElement(MarkdownTerminal, {
          ...props,
          node,
          className: mergeClassNames(props.className, className),
          children
        })
      return createElement(
        intrinsicOverride(components, 'figure') ?? 'figure',
        { ...props, className: mergeClassNames(props.className, className), 'data-df-component': component },
        children
      )
    }
    return createElement(
      intrinsicOverride(components, 'figure') ?? 'figure',
      {
        ...props,
        ...(component ? { 'data-df-component': component } : {})
      },
      children
    )
  }
}

function createMarkdownOrderedList(classNames: MarkdownClassNames, components: MarkdownComponents) {
  return function MarkdownOrderedList({ children, node: _node, ...props }: MarkdownElementProps) {
    const component = componentFromProps(props)
    if (component === 'steps') {
      const Component = componentOverride(components, component) ?? MarkdownSteps
      return createElement(Component, {
        ...props,
        className: mergeClassNames(props.className, classNames.steps),
        children
      })
    }
    return createElement(
      intrinsicOverride(components, 'ol') ?? 'ol',
      {
        ...props,
        className: mergeClassNames(props.className, classNames.list),
        ...(component ? { 'data-df-component': component } : {})
      },
      children
    )
  }
}

function createMarkdownDetails(classNames: MarkdownClassNames, components: MarkdownComponents) {
  return function MarkdownMappedDetails({ children, node, ...props }: MarkdownElementProps) {
    const Component =
      componentOverride(components, 'details') ?? intrinsicOverride(components, 'details') ?? MarkdownDetails
    return createElement(Component, {
      ...props,
      node,
      className: mergeClassNames(props.className, classNames.details),
      children
    })
  }
}

/**
 * Shared structural map for Markdown HAST and MDX SSR.
 *
 * The map adds stable semantic hooks. Visual styling stays in tokens/CSS;
 * interactive state lives in React components and static React Islands.
 */
export function createMarkdownComponentMap(
  classNames: MarkdownClassNames = {},
  slots: MarkdownSlots = {},
  components: MarkdownComponents = {},
  urlTransform?: MarkdownUrlTransform
): MarkdownComponentMap {
  return {
    h1: createMarkdownElement('h1', 'heading', classNames, components, urlTransform),
    h2: createMarkdownElement('h2', 'heading', classNames, components, urlTransform),
    h3: createMarkdownElement('h3', 'heading', classNames, components, urlTransform),
    h4: createMarkdownElement('h4', 'heading', classNames, components, urlTransform),
    h5: createMarkdownElement('h5', 'heading', classNames, components, urlTransform),
    h6: createMarkdownElement('h6', 'heading', classNames, components, urlTransform),
    p: createMarkdownElement('p', 'paragraph', classNames, components, urlTransform),
    a: createMarkdownElement('a', 'link', classNames, components, urlTransform),
    ul: createMarkdownElement('ul', 'list', classNames, components, urlTransform),
    ol: createMarkdownOrderedList(classNames, components),
    li: createMarkdownElement('li', 'listItem', classNames, components, urlTransform),
    blockquote: createMarkdownElement('blockquote', 'blockquote', classNames, components),
    hr: createMarkdownElement('hr', 'horizontalRule', classNames, components),
    strong: createMarkdownElement('strong', 'strong', classNames, components),
    em: createMarkdownElement('em', 'emphasis', classNames, components),
    del: createMarkdownElement('del', 'strikethrough', classNames, components),
    mark: createMarkdownElement('mark', 'highlight', classNames, components),
    kbd: createMarkdownElement('kbd', 'keyboard', classNames, components),
    sup: createMarkdownElement('sup', 'superscript', classNames, components),
    sub: createMarkdownElement('sub', 'subscript', classNames, components),
    code: createMarkdownElement('code', 'inlineCode', classNames, components),
    div: createMarkdownDiv(classNames, components, urlTransform),
    aside: createMarkdownSemanticExtension('aside', classNames, components, urlTransform),
    section: createMarkdownSemanticExtension('section', classNames, components, urlTransform),
    span: createMarkdownSemanticExtension('span', classNames, components, urlTransform),
    pre: createMarkdownElement('pre', 'code', classNames, components),
    table: createMarkdownElement('table', 'table', classNames, components),
    thead: createMarkdownElement('thead', 'tableHead', classNames, components),
    tbody: createMarkdownElement('tbody', 'tableBody', classNames, components),
    tr: createMarkdownElement('tr', 'tableRow', classNames, components),
    th: createMarkdownElement('th', 'tableHeader', classNames, components),
    td: createMarkdownElement('td', 'tableCell', classNames, components),
    input: createMarkdownElement('input', 'taskCheckbox', classNames, components),
    figure: createMarkdownFigure(classNames, components, urlTransform),
    img: createMarkdownElement('img', 'image', classNames, components, urlTransform),
    video: createMarkdownElement('video', 'video', classNames, components, urlTransform),
    audio: createMarkdownElement('audio', 'audio', classNames, components, urlTransform),
    iframe: createMarkdownElement('iframe', 'embed', classNames, components, urlTransform),
    dl: createMarkdownElement('dl', 'definitionList', classNames, components),
    dt: createMarkdownElement('dt', 'definitionTerm', classNames, components),
    dd: createMarkdownElement('dd', 'definitionDescription', classNames, components),
    summary: createMarkdownElement('summary', 'summary', classNames, components),
    figcaption: createMarkdownFigcaption(slots, components),
    svg: createMarkdownSvg(slots, components),
    details: createMarkdownDetails(classNames, components),
    MarkdownCallout,
    MarkdownTabs,
    MarkdownSteps,
    MarkdownCodeBlock,
    MarkdownCopySnippet,
    MarkdownTable,
    MarkdownImage,
    MarkdownDetails,
    MarkdownTerminal,
    MarkdownFileTree,
    MarkdownGallery,
    MarkdownCardGrid,
    MarkdownApiBlock,
    MarkdownAside,
    MarkdownBadge,
    Callout: MarkdownCallout,
    Tabs: MarkdownTabs,
    CodeGroup: MarkdownTabs,
    Steps: MarkdownSteps,
    CodeBlock: MarkdownCodeBlock,
    CopySnippet: MarkdownCopySnippet,
    Table: MarkdownTable,
    Image: MarkdownImage,
    Details: MarkdownDetails,
    Terminal: MarkdownTerminal,
    FileTree: MarkdownFileTree,
    Gallery: MarkdownGallery,
    CardGrid: MarkdownCardGrid,
    Api: MarkdownApiBlock,
    Aside: MarkdownAside,
    Badge: MarkdownBadge
  }
}

/** Add trusted MDX component names without letting lowercase tags bypass Markdown semantics. */
export function createMarkdownMdxComponentMap(
  classNames: MarkdownClassNames = {},
  slots: MarkdownSlots = {},
  components: MarkdownComponents & Record<string, ElementType> = {},
  urlTransform?: MarkdownUrlTransform
): MarkdownComponentMap {
  const componentMap = createMarkdownComponentMap(classNames, slots, components, urlTransform)
  for (const [name, component] of Object.entries(components)) {
    if (/^[A-Z]/.test(name)) componentMap[name] = component
  }
  return componentMap
}
