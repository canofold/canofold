import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Code2,
  Copy,
  Download,
  FileText,
  Folder,
  Link2,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Table2,
  Workflow,
  X,
  type LucideIcon
} from 'lucide-react'
import { getMarkdownIconSlot, useMarkdownSlots, type MarkdownIconName } from '../../react/slots'

export type { MarkdownIconName } from '../../react/slots'

const icons: Record<MarkdownIconName, LucideIcon> = {
  copy: Copy,
  download: Download,
  code: Code2,
  maximize: Maximize2,
  minus: Minus,
  plus: Plus,
  reset: RotateCcw,
  sort: ChevronsUpDown,
  table: Table2,
  folder: Folder,
  file: FileText,
  workflow: Workflow,
  link: Link2,
  close: X,
  previous: ChevronLeft,
  next: ChevronRight
}

export function MarkdownIcon({
  name,
  size = 16,
  className
}: {
  name: MarkdownIconName
  size?: number
  className?: string
  direction?: 'asc' | 'desc'
}) {
  const CustomIcon = getMarkdownIconSlot(useMarkdownSlots(), name)
  if (CustomIcon) return <CustomIcon size={size} className={className} aria-hidden="true" />
  const Icon = icons[name]
  return <Icon className={className} size={size} strokeWidth={2} aria-hidden="true" />
}
