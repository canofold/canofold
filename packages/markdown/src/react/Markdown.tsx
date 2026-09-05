import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import type { Components as HastComponents } from 'hast-util-to-jsx-runtime'
import {
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
  type HTMLAttributes,
  type ReactNode
} from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { createMarkdownComponentMap, type MarkdownClassNames, type MarkdownComponents } from './componentMap'
import { stableJson } from '../compiler/stableJson'
import type { PreparedMarkdown, RenderMarkdownOptions } from '../compiler/types'
import { MarkdownSlotsProvider, type MarkdownSlots } from './slots'
import { MarkdownUrlTransformProvider, type MarkdownUrlTransform } from './urlTransform'

export interface MarkdownRootProps extends Omit<
  HTMLAttributes<HTMLElement>,
  'children' | 'dangerouslySetInnerHTML'
> {
  /** Render element. Defaults to `div`. */
  as?: ElementType
  /** Stable root marker used by Canofold Islands and host automation. */
  'data-cf-root'?: string
  /** @internal Identifies whether React or the static enhancer owns interactions. */
  'data-cf-runtime'?: 'react' | 'static'
  classNames?: MarkdownClassNames
  /** Local visual slots used by the React component map. */
  slots?: MarkdownSlots
  /** Transform authored URL properties without scanning rendered HTML. */
  urlTransform?: MarkdownUrlTransform
}

export interface MarkdownProps extends MarkdownRootProps {
  /** Markdown source. The compiler is intentionally hidden from callers. */
  source: string
  /** Compiler options; visual tokens and interaction labels remain configurable. */
  options?: RenderMarkdownOptions
  /** Optional callback invoked when browser-side preparation fails. */
  onError?: (error: unknown) => void
  /** Optional callback invoked after prepared output has committed to the DOM. */
  onReady?: () => void
  /** Optional content shown while preparing or after preparation fails. */
  fallback?: ReactNode
  /** Keep the last prepared document visible while a newer source is compiling. */
  retainPrevious?: boolean
  /** Intrinsic element overrides for structured Markdown output. */
  components?: MarkdownComponents
}

interface MarkdownDocumentProps extends MarkdownRootProps {
  /** Prepared HAST document produced by the package's internal compiler. */
  document: PreparedMarkdown['document']
  /** Optional intrinsic tag replacements for host-level customization. */
  components?: MarkdownComponents
}

function cx(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}

interface MarkdownRootContentProps extends MarkdownRootProps {
  children: ReactNode
}

/** Shared root contract for Markdown and MDX React output. */
export function MarkdownRoot({
  as: Tag = 'div',
  className,
  classNames,
  slots,
  urlTransform,
  children,
  'data-cf-root': rootMarker = 'markdown',
  ...props
}: MarkdownRootContentProps) {
  return createElement(MarkdownUrlTransformProvider, {
    transform: urlTransform,
    children: createElement(MarkdownSlotsProvider, {
      slots,
      children: createElement(
        Tag,
        {
          ...props,
          className: cx('cf-content', classNames?.root, className),
          'data-cf-root': rootMarker,
          'data-cf-runtime': props['data-cf-runtime'] ?? 'react',
          'data-cf-component': 'markdown'
        },
        children
      )
    })
  })
}

/** Render a prepared HAST tree as React elements. */
export function MarkdownDocument({
  document,
  classNames,
  components,
  slots,
  urlTransform,
  ...props
}: MarkdownDocumentProps) {
  const componentMap = useMemo(
    () => createMarkdownComponentMap(classNames, slots, components, urlTransform) as HastComponents,
    [classNames, components, slots, urlTransform]
  )
  const children = useMemo(
    () =>
      toJsxRuntime(document, {
        Fragment,
        jsx,
        jsxs,
        components: componentMap,
        passNode: true
      }),
    [componentMap, document]
  )

  return (
    <MarkdownRoot {...props} classNames={classNames} slots={slots} urlTransform={urlTransform}>
      {children}
    </MarkdownRoot>
  )
}

function serializeOptions(options: RenderMarkdownOptions | undefined): string | undefined {
  return stableJson(options ?? {})
}

const clientPreparationCache = new Map<string, Promise<PreparedMarkdown>>()
const CLIENT_CACHE_LIMIT = 32

function clientCacheKey(source: string, optionsKey: string | undefined) {
  return optionsKey === undefined ? undefined : `${optionsKey.length}:${optionsKey}\0${source}`
}

async function prepareForClient(
  source: string,
  options: RenderMarkdownOptions | undefined,
  optionsKey: string | undefined
) {
  const create = () =>
    import('../compiler/prepareMarkdown').then(({ prepareMarkdown }) => prepareMarkdown(source, options))
  const key = clientCacheKey(source, optionsKey)
  if (key === undefined) return create()
  const existing = clientPreparationCache.get(key)
  if (existing) {
    clientPreparationCache.delete(key)
    clientPreparationCache.set(key, existing)
    return existing
  }

  const request = create().catch((error) => {
    if (clientPreparationCache.get(key) === request) clientPreparationCache.delete(key)
    throw error
  })
  clientPreparationCache.set(key, request)
  while (clientPreparationCache.size > CLIENT_CACHE_LIMIT) {
    const oldest = clientPreparationCache.keys().next().value
    if (oldest === undefined) break
    clientPreparationCache.delete(oldest)
  }
  return request
}

/**
 * Render Markdown directly from source. Preparation remains an internal
 * implementation detail of the package's React entry point.
 */
export function Markdown({
  source,
  options,
  onError,
  onReady,
  fallback = null,
  retainPrevious = false,
  ...props
}: MarkdownProps) {
  const optionsKey = useMemo(() => serializeOptions(options), [options])
  const optionsIdentity: unknown = optionsKey ?? options ?? null
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const [state, setState] = useState<{
    source?: string
    optionsIdentity?: unknown
    prepared?: PreparedMarkdown
  }>({})

  useEffect(() => {
    let active = true
    if (!retainPrevious) setState({ source, optionsIdentity })

    void prepareForClient(source, options, optionsKey)
      .then((prepared) => {
        if (active) setState({ source, optionsIdentity, prepared })
      })
      .catch((error: unknown) => {
        if (!active) return
        onErrorRef.current?.(error)
        if (!retainPrevious) setState({ source, optionsIdentity })
      })

    return () => {
      active = false
    }
  }, [source, optionsIdentity, retainPrevious])

  const preparedIsCurrent =
    state.source === source && Object.is(state.optionsIdentity, optionsIdentity) && Boolean(state.prepared)

  useEffect(() => {
    if (preparedIsCurrent) onReadyRef.current?.()
  }, [preparedIsCurrent, state.prepared])

  if (!preparedIsCurrent) {
    if (retainPrevious && state.prepared) {
      return <MarkdownDocument document={state.prepared.document} data-cf-runtime="react" {...props} />
    }
    return fallback
  }
  if (!state.prepared) return fallback
  return <MarkdownDocument document={state.prepared.document} data-cf-runtime="react" {...props} />
}
