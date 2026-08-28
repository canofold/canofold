import type { CSSProperties, ReactNode } from 'react'
import { ChevronDown, Code2, Eye } from 'lucide-react'
import type { SidebarItem } from '../../content/types'
import { publicPathFor } from '../../seo/urls'
import { markdownLabelsFor } from '../layoutContent'
import { navItemIsActive } from './LayoutHeader'
import type { LayoutModel } from './model'

function sidebarContainsRoute(item: SidebarItem, routePath: string): boolean {
  return item.type === 'link'
    ? item.routePath === routePath
    : item.items.some((child) => sidebarContainsRoute(child, routePath))
}

function sidebarDepthStyle(depth: number) {
  return { '--df-sidebar-indent': `${Math.min(depth, 4) * 10}px` } as CSSProperties
}

function SidebarEntry({ item, model, depth = 0 }: { item: SidebarItem; model: LayoutModel; depth?: number }) {
  const depthProps = { 'data-depth': depth, style: sidebarDepthStyle(depth) }
  if (item.type === 'link') {
    const active = item.routePath === model.page.routePath
    return (
      <a
        {...depthProps}
        className={active ? 'df-sidebar-link df-sidebar-link-active' : 'df-sidebar-link'}
        href={publicPathFor(model.config, item.routePath)}
        aria-current={active ? 'page' : undefined}
        data-docfuse-sidebar-link=""
      >
        {item.title}
      </a>
    )
  }

  const active = sidebarContainsRoute(item, model.page.routePath)
  return (
    <details className="df-sidebar-subgroup" open={active || !item.collapsed} data-depth={depth}>
      <summary className="df-sidebar-subgroup-title" style={sidebarDepthStyle(depth)}>
        {item.title}
        <ChevronDown className="df-chevron" size={12} strokeWidth={2.5} aria-hidden="true" />
      </summary>
      <div className="df-sidebar-subgroup-items">
        {item.items.map((child, index) => (
          <SidebarEntry
            key={child.type === 'link' ? child.routePath : child.segment || index}
            item={child}
            model={model}
            depth={depth + 1}
          />
        ))}
      </div>
    </details>
  )
}

function Sidebar({ model }: { model: LayoutModel }) {
  const { config, labels, navItems, sidebarGroups } = model
  const sidebarKey = [model.page.version, model.page.locale, model.page.group].join(':')
  return (
    <aside className="df-sidebar" data-docfuse-sidebar="" data-docfuse-sidebar-key={sidebarKey}>
      {navItems.length > 0 ? (
        <nav className="df-sidebar-primary-nav" aria-label={labels.primaryNavigation}>
          {navItems.map((item) => {
            const active = navItemIsActive(model, item.routePath)
            const external = /^https?:\/\//.test(item.routePath)
            return (
              <a
                key={item.routePath}
                className={
                  active
                    ? 'df-sidebar-primary-link df-sidebar-primary-link-active'
                    : 'df-sidebar-primary-link'
                }
                href={publicPathFor(config, item.routePath)}
                aria-current={active ? 'page' : undefined}
                data-docfuse-sidebar-link=""
                {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
              >
                {item.title}
              </a>
            )
          })}
        </nav>
      ) : null}
      <nav className="df-sidebar-nav" aria-label={labels.docsNavigation}>
        {sidebarGroups.map((group, index) => (
          <div key={group.segment || index} className="df-sidebar-items df-sidebar-root">
            {group.items.map((item, itemIndex) => (
              <SidebarEntry
                key={item.type === 'link' ? item.routePath : item.segment || itemIndex}
                item={item}
                model={model}
                depth={0}
              />
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}

function PageFooter({ model }: { model: LayoutModel }) {
  const { editHref, labels, page } = model
  const updated = new Intl.DateTimeFormat(page.locale, { dateStyle: 'medium' }).format(
    new Date(page.lastUpdated)
  )
  return (
    <footer className="df-page-footer">
      <div className="df-page-meta">
        <div className="df-page-meta-actions">
          {editHref ? <a href={editHref}>{labels.edit}</a> : null}
          <button className="df-page-source" type="button" data-docfuse-source-open="" aria-haspopup="dialog">
            {labels.source}
          </button>
        </div>
        <span>
          {labels.updated} {updated}
        </span>
      </div>
      <nav className="df-doc-pagination" aria-label={labels.pageNavigation}>
        {page.previous ? (
          <a className="df-doc-pagination-link" href={publicPathFor(model.config, page.previous.routePath)}>
            <span className="df-doc-pagination-label">{labels.previous}</span>
            <strong className="df-doc-pagination-title">{page.previous.title}</strong>
          </a>
        ) : (
          <span />
        )}
        {page.next ? (
          <a
            className="df-doc-pagination-link df-doc-pagination-link-next"
            href={publicPathFor(model.config, page.next.routePath)}
          >
            <span className="df-doc-pagination-label">{labels.next}</span>
            <strong className="df-doc-pagination-title">{page.next.title}</strong>
          </a>
        ) : null}
      </nav>
    </footer>
  )
}

function Outline({ model }: { model: LayoutModel }) {
  const { config, labels, outlineHeadings } = model
  const advertisement = config.advertising
  return (
    <aside className="df-outline" data-docfuse-outline="" aria-label={labels.onThisPage}>
      {outlineHeadings.length > 0 ? (
        <nav className="df-outline-nav">
          {outlineHeadings.map((heading) => (
            <a
              key={heading.slug}
              className={`df-outline-link df-outline-link-${heading.level}`}
              data-docfuse-outline-link=""
              href={`#${heading.slug}`}
            >
              {heading.text}
            </a>
          ))}
        </nav>
      ) : null}
      {advertisement ? (
        <a
          className="df-outline-ad"
          href={publicPathFor(config, advertisement.href)}
          target="_blank"
          rel="sponsored noopener noreferrer"
          aria-label={advertisement.alt}
        >
          <span>{advertisement.label ?? labels.advertisement}</span>
          <img src={publicPathFor(config, advertisement.image)} alt={advertisement.alt} loading="lazy" />
        </a>
      ) : null}
    </aside>
  )
}

function Playground({ model, children }: { model: LayoutModel; children: ReactNode }) {
  const { config, labels, page } = model
  const source = page.body.trim()
  const markdownLabels = {
    ...markdownLabelsFor(page.locale, config.i18n.messages),
    ...config.markdown.labels
  }
  return (
    <div className="df-shell df-shell-playground">
      <div className="df-sidebar-backdrop" data-docfuse-sidebar-backdrop="" aria-hidden="true" hidden />
      <Sidebar model={model} />
      <main
        id="docfuse-main"
        className="df-main df-playground-main"
        tabIndex={-1}
        data-pagefind-body={page.search ? '' : undefined}
      >
        <div
          className="df-playground"
          data-docfuse-playground=""
          data-docfuse-playground-labels={JSON.stringify(markdownLabels)}
          data-docfuse-playground-preview-label={labels.preview}
          data-view="preview"
        >
          <button
            className="df-playground-toggle"
            type="button"
            data-docfuse-playground-toggle=""
            data-source-label={labels.source}
            data-preview-label={labels.preview}
            aria-label={labels.source}
            title={labels.source}
          >
            <Code2 className="df-playground-toggle-source" size={18} strokeWidth={2} aria-hidden="true" />
            <Eye className="df-playground-toggle-preview" size={18} strokeWidth={2} aria-hidden="true" />
          </button>
          <section
            className="df-playground-pane df-playground-source"
            aria-label={labels.source}
            data-pagefind-ignore=""
          >
            <textarea
              defaultValue={source}
              aria-label={labels.source}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              data-docfuse-playground-source=""
            />
          </section>
          <div
            className="df-playground-resizer"
            role="separator"
            aria-label={`${labels.source} / ${labels.preview}`}
            aria-orientation="vertical"
            aria-valuemin={25}
            aria-valuemax={75}
            aria-valuenow={45}
            tabIndex={0}
            data-docfuse-playground-resizer=""
          />
          <section className="df-playground-pane df-playground-preview" aria-label={labels.preview}>
            <div className="df-playground-preview-scroll" data-docfuse-playground-preview="">
              {children}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

export function LayoutDocument({ model, children }: { model: LayoutModel; children: ReactNode }) {
  if (model.page.frontmatter.layout === 'playground') {
    return <Playground model={model}>{children}</Playground>
  }
  return (
    <div className="df-shell">
      <div className="df-sidebar-backdrop" data-docfuse-sidebar-backdrop="" aria-hidden="true" hidden />
      <Sidebar model={model} />
      <main
        id="docfuse-main"
        className="df-main"
        tabIndex={-1}
        data-pagefind-body={model.page.search ? '' : undefined}
      >
        {children}
        <PageFooter model={model} />
      </main>
      <Outline model={model} />
    </div>
  )
}
