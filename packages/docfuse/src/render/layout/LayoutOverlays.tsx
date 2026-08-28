import type { ReactNode } from 'react'
import { Braces, Clipboard, ExternalLink, Heading2, SunMoon, Table2, Workflow, X } from 'lucide-react'
import { SearchIcon } from './LayoutHeader'
import { markdownGroupHash, type LayoutModel } from './model'

function QuickAction({
  href,
  action,
  icon,
  title,
  description
}: {
  href?: string
  action?: 'source' | 'theme'
  icon: ReactNode
  title: string
  description: string
}) {
  const content = (
    <>
      <span className="df-command-glyph" aria-hidden="true">
        {icon}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </>
  )
  return href ? (
    <a className="df-command-item" href={href}>
      {content}
    </a>
  ) : (
    <button className="df-command-item" type="button" data-docfuse-search-action={action}>
      {content}
    </button>
  )
}

function SearchModal({ model }: { model: LayoutModel }) {
  const { config, page, home, labels, content, markdownShowcaseHref, hasMarkdownShowcase } = model
  const groups = content.markdownElementGroups
  const quickActions = content.quickActions

  if (!config.search.enabled) return null
  return (
    <div
      className="df-search-modal"
      data-docfuse-search=""
      data-locale={page.locale}
      data-version={page.version}
      data-search-provider={model.searchProvider}
      data-search-index-url={model.searchIndexUrl}
      data-search-bundle-url={model.searchBundleUrl}
      data-empty-label={labels.searchEmpty}
      data-error-label={labels.searchUnavailable}
      hidden
    >
      <div className="df-search-backdrop" data-docfuse-search-close="" aria-hidden="true" />
      <div
        className="df-search-panel"
        role="dialog"
        aria-modal="true"
        aria-label={labels.search}
        tabIndex={-1}
      >
        <div className="df-search-field">
          <SearchIcon />
          <input
            className="df-search-input"
            type="search"
            placeholder={`${labels.search}...`}
            aria-label={labels.search}
          />
          <button
            className="df-search-close"
            type="button"
            data-docfuse-search-close=""
            aria-label={labels.close}
          >
            Esc
          </button>
        </div>
        <div className="df-search-body">
          <div className="df-search-default" data-docfuse-search-default="">
            <p className="df-search-section-label">{labels.quickActions}</p>
            {hasMarkdownShowcase ? (
              <>
                <QuickAction
                  href={`${markdownShowcaseHref}#${markdownGroupHash(groups, 'headings')}`}
                  icon={<Heading2 size={17} strokeWidth={2} />}
                  title={quickActions.headingsTitle}
                  description={quickActions.headingsDescription}
                />
                <QuickAction
                  href={`${markdownShowcaseHref}#${markdownGroupHash(groups, 'code')}`}
                  icon={<Braces size={17} strokeWidth={2} />}
                  title={quickActions.codeTitle}
                  description={quickActions.codeDescription}
                />
                <QuickAction
                  href={`${markdownShowcaseHref}#${markdownGroupHash(groups, 'tables')}`}
                  icon={<Table2 size={17} strokeWidth={2} />}
                  title={quickActions.tableTitle}
                  description={quickActions.tableDescription}
                />
                <QuickAction
                  href={`${markdownShowcaseHref}#${markdownGroupHash(groups, 'diagrams')}`}
                  icon={<Workflow size={17} strokeWidth={2} />}
                  title={quickActions.diagramTitle}
                  description={quickActions.diagramDescription}
                />
              </>
            ) : null}
            {!home ? (
              <QuickAction
                action="source"
                icon={<ExternalLink size={17} strokeWidth={2} />}
                title={labels.source}
                description={quickActions.sourceDescription}
              />
            ) : null}
            {config.theme.darkMode ? (
              <QuickAction
                action="theme"
                icon={<SunMoon size={17} strokeWidth={2} />}
                title={labels.theme}
                description={quickActions.themeDescription}
              />
            ) : null}
          </div>
          <div className="df-search-results" data-docfuse-search-results="" aria-live="polite" hidden />
        </div>
      </div>
    </div>
  )
}

function SourceSheet({ model }: { model: LayoutModel }) {
  const { home, labels, page } = model
  if (home) return null
  return (
    <div className="df-source-sheet" data-docfuse-source-sheet="" hidden>
      <div className="df-source-backdrop" data-docfuse-source-close="" aria-hidden="true" />
      <aside
        className="df-source-panel"
        role="dialog"
        aria-modal="true"
        aria-label={labels.source}
        tabIndex={-1}
      >
        <div className="df-source-head">
          <div>
            <p>{labels.source}</p>
            <span>{page.sourceRelativePath}</span>
          </div>
          <div className="df-source-actions">
            <button
              className="df-icon-button"
              type="button"
              data-docfuse-source-copy=""
              data-docfuse-action-success={labels.sourceCopied}
              aria-label={labels.copySource}
            >
              <Clipboard size={16} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              className="df-icon-button"
              type="button"
              data-docfuse-source-close=""
              aria-label={labels.close}
            >
              <X size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>
        <textarea
          data-docfuse-source-text=""
          aria-label={labels.source}
          spellCheck={false}
          readOnly
          defaultValue={model.rawSource}
        />
      </aside>
    </div>
  )
}

export function LayoutOverlays({ model }: { model: LayoutModel }) {
  return (
    <>
      <SearchModal model={model} />
      <SourceSheet model={model} />
    </>
  )
}
