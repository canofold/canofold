import {
  Children,
  cloneElement,
  isValidElement,
  useState,
  type HTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode
} from 'react'
import { markdownDomProps, mergeMarkdownClasses, reactText } from '../shared/reactText'
import type { MarkdownReactElement } from '../shared/reactText'
import { MarkdownIcon } from '../shared/MarkdownIcon'

export interface MarkdownFileTreeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children?: ReactNode
}

type InternalMarkdownFileTreeProps = MarkdownFileTreeProps

function elementTypeName(node: MarkdownReactElement) {
  if (typeof node.type === 'string') return node.type
  const displayName = (node.type as { displayName?: string }).displayName ?? ''
  return displayName.startsWith('Markdown') ? displayName.slice('Markdown'.length).toLowerCase() : ''
}

function isWhitespaceNode(node: ReactNode) {
  return typeof node === 'string' && !node.trim()
}

function enhanceNode(
  node: ReactNode,
  path: string,
  open: Record<string, boolean>,
  setOpen: (path: string, value: boolean) => void
): ReactNode {
  if (!isValidElement(node)) return node
  const element = node as MarkdownReactElement
  const children = Children.toArray(element.props.children).filter((child) => !isWhitespaceNode(child))
  const isFile =
    element.props['data-cf-file-tree-file'] !== undefined || element.props.dataCfFileTreeFile !== undefined
  const isBranch =
    element.props['data-cf-file-tree-branch'] !== undefined ||
    element.props.dataCfFileTreeBranch !== undefined
  const isCurrent =
    element.props['aria-current'] === 'page' ||
    element.props['aria-current'] === true ||
    element.props['data-cf-current'] !== undefined ||
    element.props.dataCfCurrent !== undefined
  const triggerIndex = isBranch
    ? children.findIndex(
        (child) => isValidElement(child) && elementTypeName(child as MarkdownReactElement) === 'button'
      )
    : -1
  const contentIndex = isBranch
    ? children.findIndex(
        (child) => isValidElement(child) && elementTypeName(child as MarkdownReactElement) === 'ul'
      )
    : -1
  const explicitPath = String(
    element.props['data-cf-file-tree-path'] ?? element.props.dataCfFileTreePath ?? ''
  )
  const branchLabel =
    triggerIndex >= 0 ? reactText((children[triggerIndex] as MarkdownReactElement).props.children) : ''
  const branchPath = explicitPath || `${path}:${branchLabel.trim().toLowerCase()}`
  const authoredExpanded =
    triggerIndex >= 0 ? (children[triggerIndex] as MarkdownReactElement).props['aria-expanded'] : undefined
  const expanded = isBranch
    ? (open[branchPath] ?? (authoredExpanded !== false && authoredExpanded !== 'false'))
    : true
  const enhancedChildren = children.map((child, index) => {
    const childPath = `${path}.${index}`
    if (isBranch && index === triggerIndex && isValidElement(child)) {
      const trigger = child as MarkdownReactElement
      const onClick = trigger.props.onClick
      const triggerChildren = Children.toArray(trigger.props.children)
      const hasFolderIcon = triggerChildren.some(
        (triggerChild) =>
          isValidElement(triggerChild) &&
          ((triggerChild as MarkdownReactElement).props['data-cf-slot'] === 'folder-icon' ||
            (triggerChild as MarkdownReactElement).props.dataCfSlot === 'folder-icon')
      )
      return cloneElement(trigger, {
        className: mergeMarkdownClasses('cf-file-tree-folder', trigger.props.className),
        'data-cf-action': 'toggle-file-tree',
        'data-cf-file-tree-toggle': '',
        'aria-expanded': String(expanded),
        children: hasFolderIcon
          ? triggerChildren
          : [
              <span key="folder-icon" className="cf-file-tree-folder-icon" data-cf-slot="folder-icon">
                <MarkdownIcon name="folder" />
              </span>,
              ...triggerChildren
            ],
        onClick: (event: MouseEvent<HTMLButtonElement>) => {
          if (typeof onClick === 'function') onClick(event)
          if (!event.defaultPrevented) setOpen(branchPath, !expanded)
        }
      })
    }
    if (isBranch && index === contentIndex && isValidElement(child)) {
      const content = enhanceNode(child, childPath, open, setOpen)
      return (
        <div
          key={`${branchPath}-children`}
          className="cf-file-tree-children"
          data-cf-state={expanded ? 'expanded' : 'collapsed'}
          aria-hidden={expanded ? undefined : 'true'}
          inert={expanded ? undefined : true}
        >
          {content}
        </div>
      )
    }
    return enhanceNode(child, childPath, open, setOpen)
  })
  const hasFileIcon = children.some(
    (child) =>
      isValidElement(child) &&
      ((child as MarkdownReactElement).props['data-cf-slot'] === 'file-icon' ||
        (child as MarkdownReactElement).props.dataCfSlot === 'file-icon')
  )
  const nextChildren =
    isFile && !hasFileIcon
      ? [
          <span key="file-icon" className="cf-file-tree-file-icon" data-cf-slot="file-icon">
            <MarkdownIcon name="file" />
          </span>,
          ...enhancedChildren
        ]
      : enhancedChildren
  return cloneElement(element, {
    ...(isFile || isBranch
      ? {
          className: mergeMarkdownClasses(
            [
              isFile ? 'cf-file-tree-file' : '',
              isBranch ? 'cf-file-tree-branch' : '',
              isCurrent ? 'cf-file-tree-current' : ''
            ]
              .filter(Boolean)
              .join(' '),
            element.props.className
          )
        }
      : {}),
    ...(isBranch
      ? {
          'data-cf-state': expanded ? 'expanded' : 'collapsed',
          'data-cf-file-tree-path': branchPath
        }
      : {}),
    children: nextChildren
  })
}

export function MarkdownFileTree(props: MarkdownFileTreeProps): ReactNode
/** @internal */
export function MarkdownFileTree(props: InternalMarkdownFileTreeProps): ReactNode
export function MarkdownFileTree({ children, ...props }: InternalMarkdownFileTreeProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const content = Children.toArray(children)
    .filter((child) => !isWhitespaceNode(child))
    .map((child, index) =>
      enhanceNode(child, String(index), open, (path, value) =>
        setOpen((current) => ({ ...current, [path]: value }))
      )
    )
  const slottedContent = Children.map(content, (child) =>
    isValidElement(child)
      ? cloneElement(child as ReactElement<Record<string, unknown>>, { 'data-cf-slot': 'content' })
      : child
  )
  const cleanProps = markdownDomProps(props)
  return (
    <div
      {...cleanProps}
      className={mergeMarkdownClasses('cf-file-tree', props.className)}
      data-cf-component="file-tree"
      data-cf-slot="root"
      data-cf-behavior="file-tree"
    >
      {slottedContent}
    </div>
  )
}
