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
  return { '--cf-sidebar-indent': `${Math.min(depth, 4) * 10}px` } as CSSProperties
}

function SidebarEntry({ item, model, depth = 0 }: { item: SidebarItem; model: LayoutModel; depth?: number }) {
  const depthProps = { 'data-depth': depth, style: sidebarDepthStyle(depth) }
  if (item.type === 'link') {
    const active = item.routePath === model.page.routePath
    return (
      <a
        {...depthProps}
        className={active ? 'cf-sidebar-link cf-sidebar-link-active' : 'cf-sidebar-link'}
        href={publicPathFor(model.config, item.routePath)}
        aria-current={active ? 'page' : undefined}
        data-canofold-sidebar-link=""
      >
        {item.title}
      </a>
    )
  }

  const active = sidebarContainsRoute(item, model.page.routePath)
  return (
    <details className="cf-sidebar-subgroup" open={active || !item.collapsed} data-depth={depth}>
      <summary className="cf-sidebar-subgroup-title" style={sidebarDepthStyle(depth)}>
        {item.title}
        <ChevronDown className="cf-chevron" size={12} strokeWidth={2.5} aria-hidden="true" />
      </summary>
      <div className="cf-sidebar-subgroup-items">
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
    <aside className="cf-sidebar" data-canofold-sidebar="" data-canofold-sidebar-key={sidebarKey}>
      {navItems.length > 0 ? (
        <nav className="cf-sidebar-primary-nav" aria-label={labels.primaryNavigation}>
          {navItems.map((item) => {
            const active = navItemIsActive(model, item.routePath)
            const external = /^https?:\/\//.test(item.routePath)
            return (
              <a
                key={item.routePath}
                className={
                  active
                    ? 'cf-sidebar-primary-link cf-sidebar-primary-link-active'
                    : 'cf-sidebar-primary-link'
                }
                href={publicPathFor(config, item.routePath)}
                aria-current={active ? 'page' : undefined}
                data-canofold-sidebar-link=""
                {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
              >
                {item.title}
              </a>
            )
          })}
        </nav>
      ) : null}
      <nav className="cf-sidebar-nav" aria-label={labels.docsNavigation}>
        {sidebarGroups.map((group, index) => (
          <div key={group.segment || index} className="cf-sidebar-items cf-sidebar-root">
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
    <footer className="cf-page-footer">
      <div className="cf-page-meta">
        <div className="cf-page-meta-actions">
          {editHref ? <a href={editHref}>{labels.edit}</a> : null}
          <button
            className="cf-page-source"
            type="button"
            data-canofold-source-open=""
            aria-haspopup="dialog"
          >
            {labels.source}
          </button>
        </div>
        <span>
          {labels.updated} {updated}
        </span>
      </div>
      <nav className="cf-doc-pagination" aria-label={labels.pageNavigation}>
        {page.previous ? (
          <a className="cf-doc-pagination-link" href={publicPathFor(model.config, page.previous.routePath)}>
            <span className="cf-doc-pagination-label">{labels.previous}</span>
            <strong className="cf-doc-pagination-title">{page.previous.title}</strong>
          </a>
        ) : (
          <span />
        )}
        {page.next ? (
          <a
            className="cf-doc-pagination-link cf-doc-pagination-link-next"
            href={publicPathFor(model.config, page.next.routePath)}
          >
            <span className="cf-doc-pagination-label">{labels.next}</span>
            <strong className="cf-doc-pagination-title">{page.next.title}</strong>
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
    <aside className="cf-outline" data-canofold-outline="" aria-label={labels.onThisPage}>
      {outlineHeadings.length > 0 ? (
        <nav className="cf-outline-nav">
          {outlineHeadings.map((heading) => (
            <a
              key={heading.slug}
              className={`cf-outline-link cf-outline-link-${heading.level}`}
              data-canofold-outline-link=""
              href={`#${heading.slug}`}
            >
              {heading.text}
            </a>
          ))}
        </nav>
      ) : null}
      {advertisement ? (
        <a
          className="cf-outline-ad"
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
    <div className="cf-shell cf-shell-playground">
      <div className="cf-sidebar-backdrop" data-canofold-sidebar-backdrop="" aria-hidden="true" hidden />
      <Sidebar model={model} />
      <main
        id="canofold-main"
        className="cf-main cf-playground-main"
        tabIndex={-1}
        data-pagefind-body={page.search ? '' : undefined}
      >
        <div
          className="cf-playground"
          data-canofold-playground=""
          data-canofold-playground-labels={JSON.stringify(markdownLabels)}
          data-canofold-playground-preview-label={labels.preview}
          data-view="preview"
        >
          <button
            className="cf-playground-toggle"
            type="button"
            data-canofold-playground-toggle=""
            data-source-label={labels.source}
            data-preview-label={labels.preview}
            aria-label={labels.source}
            title={labels.source}
          >
            <Code2 className="cf-playground-toggle-source" size={18} strokeWidth={2} aria-hidden="true" />
            <Eye className="cf-playground-toggle-preview" size={18} strokeWidth={2} aria-hidden="true" />
          </button>
          <section
            className="cf-playground-pane cf-playground-source"
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
              data-canofold-playground-source=""
            />
          </section>
          <div
            className="cf-playground-resizer"
            role="separator"
            aria-label={`${labels.source} / ${labels.preview}`}
            aria-orientation="vertical"
            aria-valuemin={25}
            aria-valuemax={75}
            aria-valuenow={45}
            tabIndex={0}
            data-canofold-playground-resizer=""
          />
          <section className="cf-playground-pane cf-playground-preview" aria-label={labels.preview}>
            <div className="cf-playground-preview-scroll" data-canofold-playground-preview="">
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
    <div className="cf-shell">
      <div className="cf-sidebar-backdrop" data-canofold-sidebar-backdrop="" aria-hidden="true" hidden />
      <Sidebar model={model} />
      <main
        id="canofold-main"
        className="cf-main"
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
