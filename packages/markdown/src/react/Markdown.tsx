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
import {
  createMarkdownComponentMap,
  type MarkdownClassNames,
  type MarkdownComponents
} from './componentMap.js'
import { stableJson } from '../compiler/stableJson.js'
import type { PreparedMarkdown, RenderMarkdownOptions } from '../compiler/types.js'
import { MarkdownSlotsProvider, type MarkdownSlots } from './slots.js'
import { MarkdownUrlTransformProvider, type MarkdownUrlTransform } from './urlTransform.js'
import { createPreparationCache, markdownDocumentWeight } from '../compiler/preparationCache.js'
import { staticTokens } from './staticTokens.js'

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
  /** @internal JSX factories for already serialized static tokens. */
  runtime?: { jsx: typeof jsx; jsxs: typeof jsxs }
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
export function MarkdownDocument(input: MarkdownDocumentProps) {
  const { document, classNames, components, slots, urlTransform, runtime, ...props } = input
  const compacted = useMemo(
    () => (runtime || components ? { document, runtime } : staticTokens(document)),
    [document, components, runtime]
  )
  const componentMap = useMemo(
    () => createMarkdownComponentMap(classNames, slots, components, urlTransform) as HastComponents,
    [classNames, components, slots, urlTransform]
  )
  const children = useMemo(
    () =>
      toJsxRuntime(compacted.document, {
        Fragment,
        jsx: compacted.runtime?.jsx ?? jsx,
        jsxs: compacted.runtime?.jsxs ?? jsxs,
        components: componentMap,
        passNode: true
      }),
    [componentMap, compacted]
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

interface PreparedClientMarkdown {
  document: PreparedMarkdown['document']
  runtime?: ReturnType<typeof staticTokens>['runtime']
}

const clientPreparationCache = createPreparationCache<PreparedClientMarkdown>(
  32,
  16 * 1024 * 1024,
  (value) => markdownDocumentWeight(value.document) + (value.runtime?.retainedBytes ?? 0)
)
interface PendingPreparation {
  controller: AbortController
  promise: Promise<PreparedClientMarkdown>
  owners: number
  settled: boolean
}
const pendingClientPreparations = new Map<string, PendingPreparation>()

function clientCacheKey(source: string, optionsKey: string | undefined, customComponents: boolean) {
  return optionsKey === undefined
    ? undefined
    : `${customComponents ? 'raw' : 'tokens'}:${optionsKey.length}:${optionsKey}\0${source}`
}

function prepareForClient(
  source: string,
  options: RenderMarkdownOptions | undefined,
  optionsKey: string | undefined,
  customComponents: boolean
) {
  const key = clientCacheKey(source, optionsKey, customComponents)
  let pending = key === undefined ? undefined : pendingClientPreparations.get(key)
  if (!pending) {
    const controller = new AbortController()
    const create = () =>
      import('../compiler/prepareMarkdown.js').then(async ({ prepareMarkdown }) => {
        controller.signal.throwIfAborted()
        const { document } = await prepareMarkdown(source, options, {
          warnedLanguages: new Set(),
          signal: controller.signal
        })
        controller.signal.throwIfAborted()
        // Rendering already compacts inert tokens. Retain that result rather
        // than also keeping the much larger original token tree and analysis.
        return customComponents ? { document } : staticTokens(document)
      })
    pending = {
      controller,
      promise: clientPreparationCache.get(key, create),
      owners: 0,
      settled: false
    }
    if (key !== undefined) pendingClientPreparations.set(key, pending)
    const entry = pending
    const settle = () => {
      entry.settled = true
      if (key !== undefined && pendingClientPreparations.get(key) === entry) {
        pendingClientPreparations.delete(key)
      }
    }
    void entry.promise.then(settle, settle)
  }
  const entry = pending
  entry.owners++
  return {
    promise: entry.promise,
    release() {
      entry.owners--
      if (entry.owners || entry.settled) return
      entry.controller.abort()
      if (key !== undefined && pendingClientPreparations.get(key) === entry) {
        pendingClientPreparations.delete(key)
        clientPreparationCache.delete(key)
      }
    }
  }
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
  const customComponents = Boolean(props.components)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const [state, setState] = useState<{
    source?: string
    optionsIdentity?: unknown
    customComponents?: boolean
    prepared?: PreparedClientMarkdown
  }>({})

  useEffect(() => {
    let active = true
    if (!retainPrevious) setState({ source, optionsIdentity })

    const preparation = prepareForClient(source, options, optionsKey, customComponents)
    void preparation.promise
      .then((prepared) => {
        if (active) setState({ source, optionsIdentity, customComponents, prepared })
      })
      .catch((error: unknown) => {
        if (!active) return
        onErrorRef.current?.(error)
        if (!retainPrevious) setState({ source, optionsIdentity })
      })

    return () => {
      active = false
      preparation.release()
    }
  }, [source, optionsIdentity, retainPrevious, customComponents])

  const preparedIsCurrent =
    state.source === source &&
    Object.is(state.optionsIdentity, optionsIdentity) &&
    state.customComponents === customComponents &&
    Boolean(state.prepared)

  useEffect(() => {
    if (preparedIsCurrent) onReadyRef.current?.()
  }, [preparedIsCurrent, state.prepared])

  if (!preparedIsCurrent) {
    if (retainPrevious && state.prepared && state.customComponents === customComponents) {
      return <MarkdownDocument {...state.prepared} data-cf-runtime="react" {...props} />
    }
    return fallback
  }
  if (!state.prepared) return fallback
  return <MarkdownDocument {...state.prepared} data-cf-runtime="react" {...props} />
}
