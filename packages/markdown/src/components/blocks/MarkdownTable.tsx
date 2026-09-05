import { cloneElement, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { DEFAULT_MARKDOWN_LABELS } from '../../compiler/defaultLabels'
import { MarkdownCopyButton, MarkdownDownloadButton } from '../shared/MarkdownActions'
import { MarkdownIcon } from '../shared/MarkdownIcon'
import {
  elementChildren,
  elementTag,
  markdownDomProps,
  mergeMarkdownClasses,
  reactText,
  stringProp
} from '../shared/reactText'
import type { MarkdownReactElement } from '../shared/reactText'
import { MarkdownDialogPortal, useMarkdownDialog } from '../shared/MarkdownDialog'

export interface MarkdownTableProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  children?: ReactNode
  tableTitle?: string
  copyLabel?: string
  copyFailureLabel?: string
  downloadLabel?: string
  zoomLabel?: string
  closeLabel?: string
  sortLabel?: string
}

interface InternalMarkdownTableProps extends MarkdownTableProps {
  inner?: boolean
  serializedTable?: string
}

type SortState = { column: number; direction: 'asc' | 'desc' } | null
type AnyElement = MarkdownReactElement

function tableFromChildren(children: ReactNode): AnyElement | undefined {
  return elementChildren(children).find((child): child is AnyElement => elementTag(child) === 'table')
}

function rowsOf(section: AnyElement | undefined) {
  return section
    ? (elementChildren(section.props.children).filter((row) => elementTag(row) === 'tr') as AnyElement[])
    : []
}

function cellsOf(row: AnyElement) {
  return elementChildren(row.props.children).filter(
    (cell) => elementTag(cell) === 'th' || elementTag(cell) === 'td'
  ) as AnyElement[]
}

function sectionOf(table: AnyElement, type: 'thead' | 'tbody') {
  return elementChildren(table.props.children).find(
    (child): child is AnyElement => elementTag(child) === type
  )
}

function csvValue(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function tableCsv(table: AnyElement | undefined) {
  if (!table) return ''
  const sections = elementChildren(table.props.children).filter(
    (child) => elementTag(child) === 'thead' || elementTag(child) === 'tbody'
  ) as AnyElement[]
  return sections
    .flatMap((section) =>
      rowsOf(section).map((row) =>
        cellsOf(row)
          .map((cell) => csvValue(reactText(cell.props.children)))
          .join(',')
      )
    )
    .join('\n')
}

function sortableTable(
  table: AnyElement | undefined,
  sort: SortState,
  sortLabel: string,
  onSort?: (column: number) => void
) {
  if (!table) return null
  const head = sectionOf(table, 'thead')
  const body = sectionOf(table, 'tbody')
  const headerRows = rowsOf(head)
  const headers = headerRows[0]
    ? cellsOf(headerRows[0]).map((cell, column) => {
        const active = sort?.column === column
        const direction = active ? sort.direction : undefined
        return cloneElement(cell, {
          'aria-sort': active ? (direction === 'asc' ? 'ascending' : 'descending') : undefined,
          children: (
            <button
              className="cf-sort-button"
              type="button"
              data-cf-action="sort-table"
              data-column={String(column)}
              data-sort={direction}
              aria-pressed={active ? 'true' : 'false'}
              aria-label={sortLabel.replace('{column}', String(column + 1))}
              title={sortLabel.replace('{column}', String(column + 1))}
              onClick={() => onSort?.(column)}
            >
              <span className="cf-sort-label">{cell.props.children}</span>
              <span className="cf-sort-icon" aria-hidden="true">
                <MarkdownIcon name="sort" direction={direction} />
              </span>
            </button>
          )
        })
      })
    : []
  const sortedRows = body
    ? rowsOf(body)
        .slice()
        .sort((left, right) => {
          if (!sort) return 0
          const a = reactText(cellsOf(left)[sort.column]?.props.children)
          const b = reactText(cellsOf(right)[sort.column]?.props.children)
          const result = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
          return sort.direction === 'asc' ? result : -result
        })
    : []
  const sections = elementChildren(table.props.children).map((child) => {
    if (elementTag(child) === 'thead' && headerRows[0])
      return cloneElement(child, {
        children: headerRows.map((row, index) =>
          index === 0 ? cloneElement(row, { children: headers }) : row
        )
      })
    if (elementTag(child) === 'tbody' && body && sort) return cloneElement(child, { children: sortedRows })
    return child
  })
  return cloneElement(table, { children: sections })
}

export function MarkdownTable(props: MarkdownTableProps): ReactNode
/** @internal */
export function MarkdownTable(props: InternalMarkdownTableProps): ReactNode
export function MarkdownTable({
  children,
  tableTitle: directTitle,
  copyLabel: directCopyLabel,
  copyFailureLabel: directCopyFailureLabel,
  downloadLabel: directDownloadLabel,
  zoomLabel: directZoomLabel,
  closeLabel: directCloseLabel,
  sortLabel: directSortLabel,
  serializedTable,
  inner = false,
  ...inputProps
}: InternalMarkdownTableProps) {
  const props = inputProps as Record<string, unknown>
  const table = tableFromChildren(children)
  const csv = useMemo(() => tableCsv(table), [table])
  const [sort, setSort] = useState<SortState>(null)
  const [preview, setPreview] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const title =
    directTitle ||
    stringProp(props, 'data-cf-table-title', 'dataCfTableTitle') ||
    DEFAULT_MARKDOWN_LABELS.tableTitle
  const copyLabel =
    directCopyLabel ||
    stringProp(props, 'data-cf-copy-label', 'dataCfCopyLabel') ||
    DEFAULT_MARKDOWN_LABELS.copyTableCsv
  const copyFailureLabel =
    directCopyFailureLabel ||
    stringProp(props, 'data-cf-copy-failure-label', 'dataCfCopyFailureLabel') ||
    DEFAULT_MARKDOWN_LABELS.copyFailed
  const downloadLabel =
    directDownloadLabel ||
    stringProp(props, 'data-cf-download-label', 'dataCfDownloadLabel') ||
    DEFAULT_MARKDOWN_LABELS.downloadTableCsv
  const zoomLabel =
    directZoomLabel ||
    stringProp(props, 'data-cf-zoom-label', 'dataCfZoomLabel') ||
    DEFAULT_MARKDOWN_LABELS.zoomTable
  const closeLabel =
    directCloseLabel ||
    stringProp(props, 'data-cf-close-label', 'dataCfCloseLabel') ||
    DEFAULT_MARKDOWN_LABELS.closeTablePreview
  const sortLabel =
    directSortLabel ||
    stringProp(props, 'data-cf-sort-label', 'dataCfSortLabel') ||
    DEFAULT_MARKDOWN_LABELS.sortTableColumn
  const tableData = serializedTable ?? stringProp(props, 'data-cf-table', 'dataCfTable')
  const className = mergeMarkdownClasses('cf-table-window', props.className)
  const { className: _className, ...rest } = markdownDomProps(props)
  const cycleSort = (column: number) =>
    setSort((current) =>
      current?.column === column
        ? current.direction === 'asc'
          ? { column, direction: 'desc' }
          : null
        : { column, direction: 'asc' }
    )
  const tableWithHandlers = sortableTable(table, sort, sortLabel, cycleSort)

  const closePreview = () => setPreview(false)
  const onDialogKeyDown = useMarkdownDialog({
    open: preview,
    close: closePreview,
    dialogRef,
    initialFocusRef: dialogRef,
    triggerRef
  })

  const previewContent =
    preview && tableWithHandlers ? (
      <MarkdownDialogPortal>
        <div
          ref={dialogRef}
          className="cf-table-preview"
          data-cf-slot="preview"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          onKeyDown={onDialogKeyDown}
        >
          <div
            className="cf-table-preview-backdrop"
            data-cf-action="close-table"
            aria-hidden="true"
            onClick={closePreview}
          />
          <div className="cf-table-preview-card">
            <div className="cf-table-preview-head">
              <strong>{title}</strong>
              <button
                ref={closeRef}
                className="cf-icon-button"
                type="button"
                data-cf-action="close-table"
                data-cf-slot="close"
                aria-label={closeLabel}
                onClick={closePreview}
              >
                <MarkdownIcon name="close" />
              </button>
            </div>
            <div className="cf-table-preview-body">
              <div className="cf-table-window">
                <div className="cf-data-table">{tableWithHandlers}</div>
              </div>
            </div>
          </div>
        </div>
      </MarkdownDialogPortal>
    ) : null
  const content = (
    <>
      <div className="cf-block-toolbar" data-cf-slot="toolbar">
        <span className="cf-block-title" data-cf-slot="title">
          <MarkdownIcon name="table" />
          <span>{title}</span>
        </span>
        <div className="cf-block-actions" data-cf-slot="actions">
          <MarkdownCopyButton
            value={csv}
            label={copyLabel}
            failureLabel={copyFailureLabel}
            action="copy-table"
          />
          <MarkdownDownloadButton
            value={csv}
            filename="table.csv"
            label={downloadLabel}
            action="download-table"
            contentType="text/csv;charset=utf-8"
          />
          <button
            ref={triggerRef}
            className="cf-block-button"
            type="button"
            data-cf-action="zoom-table"
            aria-label={zoomLabel}
            title={zoomLabel}
            aria-haspopup="dialog"
            onClick={() => setPreview(true)}
          >
            <MarkdownIcon name="maximize" />
          </button>
        </div>
      </div>
      <div className="cf-data-table" data-cf-slot="content">
        {tableWithHandlers ?? children}
      </div>
      {previewContent}
    </>
  )
  if (inner) return content
  return (
    <figure
      {...rest}
      className={className}
      data-cf-component="table"
      data-cf-slot="root"
      data-cf-island="table"
      data-cf-table-title={title}
      data-cf-copy-label={copyLabel}
      data-cf-copy-failure-label={copyFailureLabel}
      data-cf-download-label={downloadLabel}
      data-cf-zoom-label={zoomLabel}
      data-cf-close-label={closeLabel}
      data-cf-sort-label={sortLabel}
      data-cf-table={tableData || undefined}
    >
      {content}
    </figure>
  )
}
