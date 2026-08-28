import type { MarkdownBehaviorName } from '../compiler/assets'
import { copyMarkdownText } from '../shared/copyText'

const COPY_ACTION_BEHAVIORS: Partial<Record<string, MarkdownBehaviorName>> = {
  'copy-code': 'code-toolbar',
  'copy-snippet': 'copy-snippet',
  'copy-terminal': 'terminal-toolbar',
  'copy-section-link': 'heading'
}

/** Behaviors implemented through reversible delegated DOM enhancement. */
export const NATIVE_MARKDOWN_BEHAVIOR_NAMES = [
  'code-toolbar',
  'copy-snippet',
  'terminal-toolbar',
  'heading',
  'tabs',
  'details',
  'file-tree'
] as const satisfies readonly MarkdownBehaviorName[]

const FEEDBACK_DURATION_MS = 1600
const enhancementStates = new WeakMap<ParentNode, NativeEnhancementState>()

interface NativeEnhancementState {
  owners: number
  behaviorOwners: Map<MarkdownBehaviorName, number>
  details: WeakSet<HTMLDetailsElement>
  tabs: WeakSet<HTMLElement>
  tabOverflow: WeakSet<HTMLElement>
  fileTrees: WeakSet<HTMLButtonElement>
  cleanup: Array<() => void>
  behaviorCleanup: Map<MarkdownBehaviorName, Array<() => void>>
  feedback: Map<HTMLElement, { behavior: MarkdownBehaviorName; timer: number; restore: () => void }>
}

function ownsBehavior(state: NativeEnhancementState, behavior: MarkdownBehaviorName) {
  return (state.behaviorOwners.get(behavior) ?? 0) > 0
}

function restoreAttribute(element: Element, name: string, value: string | null) {
  if (value === null) element.removeAttribute(name)
  else element.setAttribute(name, value)
}

function attributeRestorer(element: Element, names: readonly string[]) {
  const values = names.map((name) => [name, element.getAttribute(name)] as const)
  return () => values.forEach(([name, value]) => restoreAttribute(element, name, value))
}

function addBehaviorCleanup(
  state: NativeEnhancementState,
  behavior: MarkdownBehaviorName,
  cleanup: () => void
) {
  const cleanups = state.behaviorCleanup.get(behavior) ?? []
  cleanups.push(cleanup)
  state.behaviorCleanup.set(behavior, cleanups)
}

function cleanupBehavior(state: NativeEnhancementState, behavior: MarkdownBehaviorName) {
  state.feedback.forEach((active, button) => {
    if (active.behavior !== behavior) return
    window.clearTimeout(active.timer)
    active.restore()
    state.feedback.delete(button)
  })
  state.behaviorCleanup
    .get(behavior)
    ?.splice(0)
    .reverse()
    .forEach((cleanup) => cleanup())
  state.behaviorCleanup.delete(behavior)
}

function eventTarget(root: ParentNode) {
  return root as ParentNode & EventTarget
}

function matchingElements<T extends Element>(root: ParentNode, selector: string): T[] {
  const own = root instanceof Element && root.matches(selector) ? [root as T] : []
  return [...own, ...root.querySelectorAll<T>(selector)].filter(
    (element) => !element.closest('[data-df-runtime="react"]')
  )
}

function closestWithin<T extends Element>(root: ParentNode, target: Element, selector: string): T | null {
  const match = target.closest<T>(selector)
  if (!match) return null
  return root instanceof Element && match !== root && !root.contains(match) ? null : match
}

function setInert(element: HTMLElement, inert: boolean) {
  if (inert) element.setAttribute('inert', '')
  else element.removeAttribute('inert')
}

function syncDetails(details: HTMLDetailsElement) {
  details.dataset.dfEnhanced = 'true'
  const content = details.querySelector<HTMLElement>('[data-df-slot="content"]')
  if (content) setInert(content, !details.open)
}

function initializeDetails(root: ParentNode, state: NativeEnhancementState) {
  for (const details of matchingElements<HTMLDetailsElement>(root, '[data-df-behavior="details"]')) {
    if (state.details.has(details)) continue
    state.details.add(details)
    const restoreDetails = attributeRestorer(details, ['data-df-enhanced'])
    const content = details.querySelector<HTMLElement>('[data-df-slot="content"]')
    const restoreContent = content ? attributeRestorer(content, ['inert']) : () => undefined
    const onToggle = () => syncDetails(details)
    syncDetails(details)
    details.addEventListener('toggle', onToggle)
    addBehaviorCleanup(state, 'details', () => {
      details.removeEventListener('toggle', onToggle)
      restoreDetails()
      restoreContent()
      state.details.delete(details)
    })
  }
}

function feedback(
  button: HTMLElement,
  success: boolean,
  enhancement: NativeEnhancementState,
  behavior: MarkdownBehaviorName,
  failureLabel?: string
) {
  let active = enhancement.feedback.get(button)
  if (active) {
    window.clearTimeout(active.timer)
    active.restore()
    enhancement.feedback.delete(button)
  }
  const restoreAttributes = attributeRestorer(button, [
    'data-df-idle-label',
    'data-df-copied',
    'data-df-copy-error',
    'aria-label',
    'title'
  ])
  const restoreClasses = attributeRestorer(button, ['class'])
  const live = button.querySelector<HTMLElement>('[aria-live]')
  const liveText = live?.textContent ?? ''
  const restore = () => {
    restoreAttributes()
    restoreClasses()
    if (live) live.textContent = liveText
  }
  const baseLabel = button.dataset.dfIdleLabel || button.getAttribute('aria-label') || ''
  button.dataset.dfIdleLabel = baseLabel
  button.classList.toggle('df-action-success', success)
  button.classList.toggle('df-action-error', !success)
  if (success) {
    button.dataset.dfCopied = 'true'
    delete button.dataset.dfCopyError
  } else {
    button.dataset.dfCopyError = 'true'
    delete button.dataset.dfCopied
  }
  const label = success ? `${baseLabel} ✓` : failureLabel || baseLabel
  button.setAttribute('aria-label', label)
  button.setAttribute('title', label)
  if (live) live.textContent = label
  const timer = window.setTimeout(() => {
    restore()
    enhancement.feedback.delete(button)
  }, FEEDBACK_DURATION_MS)
  enhancement.feedback.set(button, { behavior, timer, restore })
}

async function copyForAction(action: string, button: HTMLElement, state: NativeEnhancementState) {
  const behavior = COPY_ACTION_BEHAVIORS[action]
  if (!behavior || !ownsBehavior(state, behavior)) return
  const interaction = button.closest<HTMLElement>('[data-df-behavior], [data-df-island]')
  if (!interaction) return
  const value =
    action === 'copy-section-link'
      ? `${window.location.origin}${window.location.pathname}${window.location.search}${interaction.dataset.dfAnchor ?? ''}`
      : action === 'copy-snippet'
        ? (interaction.dataset.dfValue ?? '')
        : action === 'copy-code'
          ? (interaction.closest('.df-code')?.querySelector('pre')?.textContent ?? '')
          : action === 'copy-terminal'
            ? (interaction.closest('.df-terminal')?.querySelector('pre')?.textContent ?? '')
            : ''
  const success = await copyMarkdownText(value)
  if (!ownsBehavior(state, behavior)) return
  feedback(button, success, state, behavior, interaction.dataset.dfCopyFailureLabel)
}

function tabTriggers(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLButtonElement>('[role="tab"][data-df-tab]')]
}

function revealTab(trigger: HTMLElement) {
  const list = trigger.closest<HTMLElement>('[role="tablist"]')
  if (!list || typeof list.scrollTo !== 'function') return
  const start = trigger.offsetLeft
  const end = start + trigger.offsetWidth
  if (start < list.scrollLeft) list.scrollTo({ left: start, behavior: 'smooth' })
  else if (end > list.scrollLeft + list.clientWidth) {
    list.scrollTo({ left: end - list.clientWidth, behavior: 'smooth' })
  }
}

function syncTabOverflow(tabsRoot: HTMLElement) {
  const list = tabsRoot.querySelector<HTMLElement>(':scope > [role="tablist"]')
  const start = tabsRoot.querySelector<HTMLButtonElement>(
    ':scope > [data-df-action="scroll-code-tabs"][data-df-direction="-1"]'
  )
  const end = tabsRoot.querySelector<HTMLButtonElement>(
    ':scope > [data-df-action="scroll-code-tabs"][data-df-direction="1"]'
  )
  if (!list || !start || !end) return
  const maximum = Math.max(0, list.scrollWidth - list.clientWidth)
  start.hidden = maximum <= 1 || list.scrollLeft <= 1
  end.hidden = maximum <= 1 || list.scrollLeft >= maximum - 1
}

function initializeTabOverflow(root: ParentNode, state: NativeEnhancementState) {
  for (const tabsRoot of matchingElements<HTMLElement>(root, '.df-code-group[data-df-behavior="tabs"]')) {
    if (state.tabOverflow.has(tabsRoot)) continue
    const list = tabsRoot.querySelector<HTMLElement>(':scope > [role="tablist"]')
    if (!list) continue
    state.tabOverflow.add(tabsRoot)
    const controls = [
      ...tabsRoot.querySelectorAll<HTMLElement>(':scope > [data-df-action="scroll-code-tabs"]')
    ]
    const restoreControls = controls.map((control) => attributeRestorer(control, ['hidden']))
    const update = () => syncTabOverflow(tabsRoot)
    list.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
    observer?.observe(list)
    update()
    addBehaviorCleanup(state, 'tabs', () => {
      list.removeEventListener('scroll', update)
      observer?.disconnect()
      restoreControls.forEach((restore) => restore())
      state.tabOverflow.delete(tabsRoot)
    })
  }
}

function activateTab(
  root: HTMLElement,
  trigger: HTMLButtonElement,
  state: NativeEnhancementState,
  focus = false
) {
  if (trigger.disabled || trigger.getAttribute('aria-disabled') === 'true') return
  const triggers = tabTriggers(root)
  const panels = [...root.querySelectorAll<HTMLElement>('[role="tabpanel"][data-df-tab-panel]')]
  if (!state.tabs.has(root)) {
    state.tabs.add(root)
    const restoreTriggers = triggers.map((candidate) =>
      attributeRestorer(candidate, ['aria-selected', 'tabindex'])
    )
    const restorePanels = panels.map((panel) => attributeRestorer(panel, ['hidden']))
    addBehaviorCleanup(state, 'tabs', () => {
      ;[...restoreTriggers, ...restorePanels].forEach((restore) => restore())
      state.tabs.delete(root)
    })
  }
  const value = trigger.dataset.dfTab ?? ''
  triggers.forEach((candidate) => {
    const selected = candidate === trigger
    candidate.setAttribute('aria-selected', String(selected))
    candidate.tabIndex = selected ? 0 : -1
  })
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.dfTabPanel !== value
  })
  revealTab(trigger)
  if (focus) trigger.focus()
}

function handleTabsKey(
  root: HTMLElement,
  trigger: HTMLButtonElement,
  event: KeyboardEvent,
  state: NativeEnhancementState
) {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
  if (!keys.includes(event.key)) return
  const triggers = tabTriggers(root).filter(
    (candidate) => !candidate.disabled && candidate.getAttribute('aria-disabled') !== 'true'
  )
  const index = triggers.indexOf(trigger)
  if (index < 0 || !triggers.length) return
  event.preventDefault()
  const next =
    event.key === 'Home'
      ? triggers[0]
      : event.key === 'End'
        ? triggers.at(-1)
        : triggers[
            (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + triggers.length) %
              triggers.length
          ]
  if (next) activateTab(root, next, state, true)
}

function toggleFileTree(button: HTMLButtonElement, state: NativeEnhancementState) {
  const branch = button.closest<HTMLElement>('[data-df-file-tree-branch]')
  const content = branch?.querySelector<HTMLElement>(':scope > .df-file-tree-children, :scope > ul')
  if (!branch || !content) return
  if (!state.fileTrees.has(button)) {
    state.fileTrees.add(button)
    const restoreButton = attributeRestorer(button, ['aria-expanded'])
    const restoreBranch = attributeRestorer(branch, ['data-df-state'])
    const restoreContent = attributeRestorer(content, ['data-df-state', 'aria-hidden', 'inert'])
    addBehaviorCleanup(state, 'file-tree', () => {
      restoreButton()
      restoreBranch()
      restoreContent()
      state.fileTrees.delete(button)
    })
  }
  const expanded = button.getAttribute('aria-expanded') !== 'false'
  const nextExpanded = !expanded
  button.setAttribute('aria-expanded', String(nextExpanded))
  branch.dataset.dfState = nextExpanded ? 'expanded' : 'collapsed'
  content.dataset.dfState = nextExpanded ? 'expanded' : 'collapsed'
  if (nextExpanded) content.removeAttribute('aria-hidden')
  else content.setAttribute('aria-hidden', 'true')
  setInert(content, !nextExpanded)
}

function createState(root: ParentNode): NativeEnhancementState {
  const state: NativeEnhancementState = {
    owners: 0,
    behaviorOwners: new Map(),
    details: new WeakSet(),
    tabs: new WeakSet(),
    tabOverflow: new WeakSet(),
    fileTrees: new WeakSet(),
    cleanup: [],
    behaviorCleanup: new Map(),
    feedback: new Map()
  }
  const target = eventTarget(root)
  const onClick = (event: Event) => {
    if (!(event.target instanceof Element)) return
    if (event.target.closest('[data-df-runtime="react"]')) return
    const summary = closestWithin<HTMLElement>(
      root,
      event.target,
      'details[data-df-behavior="details"] > summary'
    )
    const details = summary?.parentElement as HTMLDetailsElement | undefined
    if (details && ownsBehavior(state, 'details')) {
      queueMicrotask(() => {
        if (ownsBehavior(state, 'details')) syncDetails(details)
      })
    }
    const tab = closestWithin<HTMLButtonElement>(root, event.target, '[role="tab"][data-df-tab]')
    const tabsRoot = tab?.closest<HTMLElement>('[data-df-behavior="tabs"]')
    if (tab && tabsRoot && ownsBehavior(state, 'tabs')) {
      event.preventDefault()
      activateTab(tabsRoot, tab, state)
      return
    }
    const tabScroll = closestWithin<HTMLButtonElement>(
      root,
      event.target,
      '[data-df-action="scroll-code-tabs"]'
    )
    const tabScrollRoot = tabScroll?.closest<HTMLElement>('.df-code-group[data-df-behavior="tabs"]')
    const tabList = tabScrollRoot?.querySelector<HTMLElement>(':scope > [role="tablist"]')
    if (tabScroll && tabScrollRoot && tabList && ownsBehavior(state, 'tabs')) {
      event.preventDefault()
      if (typeof tabList.scrollBy === 'function') {
        tabList.scrollBy({
          left: Number(tabScroll.dataset.dfDirection || 1) * Math.max(180, tabList.clientWidth * 0.72),
          behavior: 'smooth'
        })
      }
      return
    }
    const treeToggle = closestWithin<HTMLButtonElement>(
      root,
      event.target,
      '[data-df-action="toggle-file-tree"]'
    )
    if (treeToggle && ownsBehavior(state, 'file-tree')) {
      event.preventDefault()
      toggleFileTree(treeToggle, state)
      return
    }
    const action = closestWithin<HTMLElement>(root, event.target, '[data-df-action]')
    if (action?.dataset.dfAction) void copyForAction(action.dataset.dfAction, action, state)
  }
  const onKeyDown = (event: Event) => {
    if (!(event instanceof KeyboardEvent) || !(event.target instanceof HTMLButtonElement)) return
    if (event.target.closest('[data-df-runtime="react"]')) return
    const tabsRoot = event.target.closest<HTMLElement>('[data-df-behavior="tabs"]')
    if (tabsRoot && ownsBehavior(state, 'tabs')) handleTabsKey(tabsRoot, event.target, event, state)
  }
  target.addEventListener('click', onClick)
  target.addEventListener('keydown', onKeyDown)
  state.cleanup.push(() => target.removeEventListener('click', onClick))
  state.cleanup.push(() => target.removeEventListener('keydown', onKeyDown))
  return state
}

export function enhanceNativeMarkdown(root: ParentNode, behaviors: readonly MarkdownBehaviorName[]) {
  const state = enhancementStates.get(root) ?? createState(root)
  enhancementStates.set(root, state)
  const ownedBehaviors = [...new Set(behaviors)]
  state.owners += 1
  ownedBehaviors.forEach((behavior) =>
    state.behaviorOwners.set(behavior, (state.behaviorOwners.get(behavior) ?? 0) + 1)
  )
  if (ownsBehavior(state, 'details')) initializeDetails(root, state)
  if (ownsBehavior(state, 'tabs')) initializeTabOverflow(root, state)

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    state.owners -= 1
    ownedBehaviors.forEach((behavior) => {
      const owners = (state.behaviorOwners.get(behavior) ?? 1) - 1
      if (owners > 0) state.behaviorOwners.set(behavior, owners)
      else {
        state.behaviorOwners.delete(behavior)
        cleanupBehavior(state, behavior)
      }
    })
    if (state.owners > 0) return
    state.cleanup.splice(0).forEach((cleanup) => cleanup())
    enhancementStates.delete(root)
  }
}
