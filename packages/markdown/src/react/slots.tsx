import { createContext, createElement, useContext, type ComponentType, type ReactNode } from 'react'

export type MarkdownIconName =
  | 'copy'
  | 'download'
  | 'code'
  | 'maximize'
  | 'minus'
  | 'plus'
  | 'reset'
  | 'sort'
  | 'table'
  | 'folder'
  | 'file'
  | 'workflow'
  | 'link'
  | 'close'
  | 'previous'
  | 'next'

export interface MarkdownIconSlotProps {
  name: MarkdownIconName
  size?: number
  className?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}

export interface MarkdownCaptionSlotProps {
  children?: ReactNode
  className?: string
  'data-cf-slot'?: string
}

export interface MarkdownSlots {
  CopyIcon?: ComponentType<MarkdownIconSlotProps>
  DownloadIcon?: ComponentType<MarkdownIconSlotProps>
  MaximizeIcon?: ComponentType<MarkdownIconSlotProps>
  CodeIcon?: ComponentType<MarkdownIconSlotProps>
  MinusIcon?: ComponentType<MarkdownIconSlotProps>
  PlusIcon?: ComponentType<MarkdownIconSlotProps>
  ResetIcon?: ComponentType<MarkdownIconSlotProps>
  SortIcon?: ComponentType<MarkdownIconSlotProps>
  TableIcon?: ComponentType<MarkdownIconSlotProps>
  FolderIcon?: ComponentType<MarkdownIconSlotProps>
  FileIcon?: ComponentType<MarkdownIconSlotProps>
  WorkflowIcon?: ComponentType<MarkdownIconSlotProps>
  LinkIcon?: ComponentType<MarkdownIconSlotProps>
  CloseIcon?: ComponentType<MarkdownIconSlotProps>
  PreviousIcon?: ComponentType<MarkdownIconSlotProps>
  NextIcon?: ComponentType<MarkdownIconSlotProps>
  ImageCaption?: ComponentType<MarkdownCaptionSlotProps>
}

const slotForIcon: Record<MarkdownIconName, keyof MarkdownSlots> = {
  copy: 'CopyIcon',
  download: 'DownloadIcon',
  code: 'CodeIcon',
  maximize: 'MaximizeIcon',
  minus: 'MinusIcon',
  plus: 'PlusIcon',
  reset: 'ResetIcon',
  sort: 'SortIcon',
  table: 'TableIcon',
  folder: 'FolderIcon',
  file: 'FileIcon',
  workflow: 'WorkflowIcon',
  link: 'LinkIcon',
  close: 'CloseIcon',
  previous: 'PreviousIcon',
  next: 'NextIcon'
}

const EMPTY_MARKDOWN_SLOTS: MarkdownSlots = Object.freeze({})
const MarkdownSlotsContext = createContext<MarkdownSlots>(EMPTY_MARKDOWN_SLOTS)

export function MarkdownSlotsProvider({ slots, children }: { slots?: MarkdownSlots; children: ReactNode }) {
  return createElement(MarkdownSlotsContext.Provider, { value: slots ?? EMPTY_MARKDOWN_SLOTS }, children)
}

export function useMarkdownSlots() {
  return useContext(MarkdownSlotsContext)
}

export function getMarkdownIconSlot(slots: MarkdownSlots | undefined, name: MarkdownIconName) {
  const Slot = slots?.[slotForIcon[name]] as ComponentType<MarkdownIconSlotProps> | undefined
  return Slot
    ? (props: Omit<MarkdownIconSlotProps, 'name'>) => createElement(Slot, { ...props, name })
    : undefined
}

export function getMarkdownCaptionSlot(slots: MarkdownSlots | undefined) {
  return slots?.ImageCaption
}
