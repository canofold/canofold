import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  version as reactVersion,
  type ElementType,
  type HTMLAttributes,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactElement,
  type ReactNode
} from 'react'
import { MarkdownIcon } from '../shared/MarkdownIcon'
import { markdownDomProps, mergeMarkdownClasses } from '../shared/reactText'

export interface MarkdownTabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children?: ReactNode
  kind?: 'tabs' | 'code-group'
}

type InternalMarkdownTabsProps = MarkdownTabsProps & {
  component?: ElementType<MarkdownTabsProps>
}

function attribute(props: object, name: string, camelName: string) {
  const values = props as Record<string, unknown>
  return values[name] ?? values[camelName]
}

function isElementWithProps(node: ReactNode): node is ReactElement<Record<string, unknown>> {
  return isValidElement(node)
}

function tabValue(element: ReactElement<Record<string, unknown>>) {
  return String(attribute(element.props, 'data-df-tab', 'dataDfTab') ?? '')
}

function panelValue(element: ReactElement<Record<string, unknown>>) {
  return String(attribute(element.props, 'data-df-tab-panel', 'dataDfTabPanel') ?? '')
}

function tabListChildren(element: ReactElement<Record<string, unknown>>) {
  return Children.toArray(element.props.children as ReactNode).filter(isElementWithProps)
}

function isDisabledTrigger(element: ReactElement<Record<string, unknown>>) {
  return element.props.disabled === true || element.props['aria-disabled'] === 'true'
}

function isSelectedTrigger(element: ReactElement<Record<string, unknown>>) {
  return element.props['aria-selected'] === true || element.props['aria-selected'] === 'true'
}

function elementRef<T extends HTMLElement>(element: ReactElement<Record<string, unknown>>) {
  const major = Number.parseInt(reactVersion, 10)
  return major >= 19
    ? (element.props.ref as React.Ref<T> | undefined)
    : (element as ReactElement & { ref?: React.Ref<T> }).ref
}

function revealTab(list: HTMLElement, trigger: HTMLElement, behavior: ScrollBehavior = 'smooth') {
  if (typeof list.scrollTo !== 'function') return
  const start = trigger.offsetLeft
  const end = start + trigger.offsetWidth
  if (start < list.scrollLeft) list.scrollTo({ left: start, behavior })
  else if (end > list.scrollLeft + list.clientWidth) {
    list.scrollTo({ left: end - list.clientWidth, behavior })
  }
}

function enhanceTabs(
  children: ReactNode,
  activeValue: string,
  setActiveValue: (value: string) => void,
  triggerRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>,
  tabListRef: MutableRefObject<HTMLElement | null>,
  idPrefix: string
) {
  const nodes = Children.toArray(children)
  const tabListIndex = nodes.findIndex((node) => isElementWithProps(node) && node.props.role === 'tablist')
  if (tabListIndex < 0) return children

  const tabList = nodes[tabListIndex] as ReactElement<Record<string, unknown>>
  const triggers = tabListChildren(tabList)
  if (!triggers.length) return children
  const triggerValues = triggers.map((trigger, index) => tabValue(trigger) || `tab-${index + 1}`)
  const enabledIndices = triggers.flatMap((trigger, index) => (isDisabledTrigger(trigger) ? [] : [index]))
  const activate = (value: string, focus = false) => {
    if (!value) return
    setActiveValue(value)
    queueMicrotask(() => {
      const trigger = triggerRefs.current[value]
      if (!trigger) return
      revealTab(tabListRef.current ?? trigger.parentElement ?? trigger, trigger)
      if (focus) trigger.focus()
    })
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const enabledPosition = enabledIndices.indexOf(index)
    if (enabledPosition < 0 || enabledIndices.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    const nextIndex =
      event.key === 'Home'
        ? enabledIndices[0]
        : event.key === 'End'
          ? enabledIndices.at(-1)
          : enabledIndices[
              (enabledPosition +
                (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) +
                enabledIndices.length) %
                enabledIndices.length
            ]
    if (nextIndex === undefined) return
    const nextValue = triggerValues[nextIndex]
    if (nextValue) activate(nextValue, true)
  }
  const enhancedTriggers = triggers.map((trigger, index) => {
    const value = triggerValues[index] ?? `tab-${index + 1}`
    const active = value === activeValue
    const originalClick = trigger.props.onClick as
      ((event: React.MouseEvent<HTMLButtonElement>) => void) | undefined
    const originalKeyDown = trigger.props.onKeyDown as
      ((event: KeyboardEvent<HTMLButtonElement>) => void) | undefined
    const originalRef = elementRef<HTMLButtonElement>(trigger)
    return cloneElement(trigger, {
      id: `${idPrefix}-tab-${index + 1}`,
      'aria-controls': `${idPrefix}-panel-${index + 1}`,
      'aria-selected': active ? 'true' : 'false',
      tabIndex: active ? 0 : -1,
      ref: (node: HTMLButtonElement | null) => {
        triggerRefs.current[value] = node
        if (typeof originalRef === 'function') originalRef(node)
        else if (originalRef && 'current' in originalRef) originalRef.current = node
      },
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        originalClick?.(event)
        if (event.defaultPrevented) return
        event.stopPropagation()
        activate(value)
      },
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        originalKeyDown?.(event)
        if (!event.defaultPrevented) handleKeyDown(event, index)
      }
    })
  })
  const originalTabListRef = elementRef<HTMLElement>(tabList)
  const enhancedTabList = cloneElement(tabList, {
    children: enhancedTriggers,
    ref: (node: HTMLElement | null) => {
      tabListRef.current = node
      if (typeof originalTabListRef === 'function') originalTabListRef(node)
      else if (originalTabListRef && 'current' in originalTabListRef) originalTabListRef.current = node
    }
  })
  return nodes.map((node, index) => {
    if (index === tabListIndex) return enhancedTabList
    if (!isElementWithProps(node) || node.props.role !== 'tabpanel') return node
    const panelIndex = nodes
      .filter((candidate) => isElementWithProps(candidate) && candidate.props.role === 'tabpanel')
      .indexOf(node)
    const value = panelValue(node) || triggerValues[panelIndex] || ''
    return cloneElement(node, {
      id: `${idPrefix}-panel-${panelIndex + 1}`,
      'aria-labelledby': `${idPrefix}-tab-${panelIndex + 1}`,
      hidden: value !== activeValue
    })
  })
}

export function MarkdownTabs(props: MarkdownTabsProps): ReactNode
/** @internal */
export function MarkdownTabs(props: InternalMarkdownTabsProps): ReactNode
export function MarkdownTabs({
  children,
  kind = 'tabs',
  component: Component,
  ...props
}: InternalMarkdownTabsProps) {
  const nodes = Children.toArray(children)
  const tabList = nodes.find(
    (item): item is ReactElement<Record<string, unknown>> =>
      isElementWithProps(item) && item.props.role === 'tablist'
  )
  const triggerValues = tabList
    ? tabListChildren(tabList).map((trigger, index) => tabValue(trigger) || `tab-${index + 1}`)
    : []
  const triggers = tabList ? tabListChildren(tabList) : []
  const authoredSelectedIndex = triggers.findIndex(
    (trigger) => isSelectedTrigger(trigger) && !isDisabledTrigger(trigger)
  )
  const firstEnabledIndex = triggers.findIndex((trigger) => !isDisabledTrigger(trigger))
  const initialValue =
    triggerValues[authoredSelectedIndex >= 0 ? authoredSelectedIndex : firstEnabledIndex] ?? ''
  const [selectedValue, setSelectedValue] = useState(initialValue)
  const activeValue = triggerValues.includes(selectedValue) ? selectedValue : initialValue
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const tabListRef = useRef<HTMLElement | null>(null)
  const [canScrollStart, setCanScrollStart] = useState(false)
  const [canScrollEnd, setCanScrollEnd] = useState(false)
  const generatedId = useId().replace(/:/g, '')
  const serializedId = String(attribute(props, 'data-df-tabs-id', 'dataDfTabsId') ?? '')
  const idPrefix = serializedId || `df-tabs-${generatedId}`
  const content = enhanceTabs(children, activeValue, setSelectedValue, triggerRefs, tabListRef, idPrefix)
  useEffect(() => {
    if (kind !== 'code-group') return
    const list = tabListRef.current
    if (!list) return
    const update = () => {
      const maximum = Math.max(0, list.scrollWidth - list.clientWidth)
      setCanScrollStart(maximum > 1 && list.scrollLeft > 1)
      setCanScrollEnd(maximum > 1 && list.scrollLeft < maximum - 1)
    }
    update()
    list.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
    observer?.observe(list)
    return () => {
      list.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [children, kind])
  const scrollFiles = (direction: -1 | 1) => {
    const list = tabListRef.current
    if (!list || typeof list.scrollBy !== 'function') return
    list.scrollBy({
      left: direction * Math.max(180, list.clientWidth * 0.72),
      behavior: 'smooth'
    })
  }
  const cleanProps = markdownDomProps(props)
  const className = mergeMarkdownClasses(
    kind === 'code-group' ? 'df-tabs df-code-group' : 'df-tabs',
    props.className
  )
  if (Component) {
    return (
      <Component
        {...cleanProps}
        className={className}
        kind={kind}
        data-df-component={kind}
        data-df-slot="root"
        data-df-behavior="tabs"
        data-df-tabs-id={idPrefix}
      >
        {content}
      </Component>
    )
  }
  return (
    <div
      {...cleanProps}
      className={className}
      data-df-component={kind}
      data-df-slot="root"
      data-df-behavior="tabs"
      data-df-tabs-id={idPrefix}
    >
      {kind === 'code-group' ? (
        <button
          type="button"
          className="df-code-tabs-scroll df-code-tabs-scroll-start"
          data-df-action="scroll-code-tabs"
          data-df-direction="-1"
          aria-label="Previous code files"
          hidden={!canScrollStart}
          onClick={() => scrollFiles(-1)}
        >
          <MarkdownIcon name="previous" size={18} />
        </button>
      ) : null}
      {content}
      {kind === 'code-group' ? (
        <button
          type="button"
          className="df-code-tabs-scroll df-code-tabs-scroll-end"
          data-df-action="scroll-code-tabs"
          data-df-direction="1"
          aria-label="Next code files"
          hidden={!canScrollEnd}
          onClick={() => scrollFiles(1)}
        >
          <MarkdownIcon name="next" size={18} />
        </button>
      ) : null}
    </div>
  )
}
