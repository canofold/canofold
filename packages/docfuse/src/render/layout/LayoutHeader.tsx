import { ChevronDown, Languages, Moon, PanelLeft, Search, Sun } from 'lucide-react'
import { localeNameFor } from '../layoutContent'
import { publicPathFor } from '../../seo/urls'
import type { LayoutModel } from './model'

function BrandMark() {
  return (
    <svg className="df-brand-mark" width="32" height="32" viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id="df-brand-top" x1="80" y1="70" x2="430" y2="245" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1768FF" />
          <stop offset="0.48" stopColor="#119BFA" />
          <stop offset="1" stopColor="#18D8D3" />
        </linearGradient>
        <linearGradient id="df-brand-mid" x1="215" y1="255" x2="440" y2="245" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2C7BFF" />
          <stop offset="1" stopColor="#1768F4" />
        </linearGradient>
        <linearGradient
          id="df-brand-bottom"
          x1="215"
          y1="292"
          x2="92"
          y2="445"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#554FF5" />
          <stop offset="0.62" stopColor="#7845FA" />
          <stop offset="1" stopColor="#8637F5" />
        </linearGradient>
        <mask id="df-brand-spark-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <rect width="512" height="512" fill="#fff" />
          <path
            d="M220 245C225 273 247 295 275 300C247 305 225 327 220 355C215 327 193 305 165 300C193 295 215 273 220 245Z"
            fill="#000"
          />
        </mask>
      </defs>
      <g mask="url(#df-brand-spark-cut)" fill="none" strokeLinejoin="round">
        <path
          d="M173 321C128 321 101 296 101 255V159C101 112 134 79 181 79H242C322 79 383 120 420 184"
          stroke="url(#df-brand-top)"
          strokeWidth="82"
          strokeLinecap="round"
        />
        <path
          d="M213 286C241 247 279 225 327 225H427"
          stroke="url(#df-brand-mid)"
          strokeWidth="70"
          strokeLinecap="round"
        />
        <path
          d="M220 296C248 333 238 371 207 402C176 433 137 444 101 444"
          stroke="url(#df-brand-bottom)"
          strokeWidth="72"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}

function SearchIcon({ size = 16 }: { size?: number }) {
  return <Search size={size} strokeWidth={2} aria-hidden="true" />
}

function ThemeIcon() {
  return (
    <>
      <Sun className="df-icon-sun" size={18} strokeWidth={2} aria-hidden="true" />
      <Moon className="df-icon-moon" size={18} strokeWidth={2} aria-hidden="true" />
    </>
  )
}

export function navItemIsActive(model: LayoutModel, routePath: string): boolean {
  const navSegments = routePath.split('/').filter(Boolean)
  return (
    routePath.startsWith('/') &&
    (model.page.routePath === routePath ||
      model.page.routePath.startsWith(routePath) ||
      (model.page.group !== '' && navSegments.includes(model.page.group)))
  )
}

export function LayoutHeader({ model }: { model: LayoutModel }) {
  const {
    config,
    page,
    home,
    labels,
    localeRoot,
    navItems,
    versionLabel,
    versionOptions,
    languageOptions,
    hasSidebarItems
  } = model

  return (
    <header className={home ? 'df-header df-header-home' : 'df-header'}>
      <div className="df-header-inner">
        {!home && hasSidebarItems ? (
          <button
            className="df-sidebar-toggle"
            type="button"
            data-docfuse-sidebar-open=""
            data-docfuse-sidebar-open-label={labels.openSidebar}
            data-docfuse-sidebar-close-label={labels.close}
            aria-label={labels.openSidebar}
            aria-expanded="false"
          >
            <PanelLeft size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
        <a className="df-brand" href={localeRoot} aria-label={config.title}>
          {config.theme.logo ? (
            <>
              <img
                className={config.theme.logoDark ? 'df-brand-logo df-brand-logo-light' : 'df-brand-logo'}
                src={publicPathFor(config, config.theme.logo)}
                alt={config.title}
              />
              {config.theme.logoDark ? (
                <img
                  className="df-brand-logo df-brand-logo-dark"
                  src={publicPathFor(config, config.theme.logoDark)}
                  alt={config.title}
                />
              ) : null}
            </>
          ) : (
            <BrandMark />
          )}
        </a>

        {config.search.enabled ? (
          <button
            className="df-search-trigger"
            type="button"
            data-docfuse-search-open=""
            aria-haspopup="dialog"
            aria-label={labels.search}
          >
            <SearchIcon size={15} />
            <span>{labels.search}</span>
            <kbd className="df-kbd">⌘K</kbd>
          </button>
        ) : null}

        <div className="df-header-right">
          {navItems.length > 0 ? (
            <nav className="df-header-nav" aria-label={labels.primaryNavigation}>
              {navItems.map((item) => {
                const active = navItemIsActive(model, item.routePath)
                const external = /^https?:\/\//.test(item.routePath)
                return (
                  <a
                    key={item.routePath}
                    className={active ? 'df-header-link df-header-link-active' : 'df-header-link'}
                    href={publicPathFor(config, item.routePath)}
                    aria-current={active ? 'page' : undefined}
                    {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
                  >
                    {item.title}
                  </a>
                )
              })}
            </nav>
          ) : null}

          {versionOptions.length > 1 ? (
            <details className="df-menu df-version-menu" data-docfuse-menu="">
              <summary className="df-version-badge" aria-label={labels.version}>
                <span>{versionLabel}</span>
                <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
              </summary>
              <div className="df-menu-list">
                {versionOptions.map((option) => (
                  <a
                    key={option.id}
                    className={
                      option.id === page.version ? 'df-menu-item df-menu-item-active' : 'df-menu-item'
                    }
                    href={publicPathFor(config, option.routePath)}
                  >
                    <span>{option.label}</span>
                  </a>
                ))}
              </div>
            </details>
          ) : (
            <span className="df-version-badge">{versionLabel}</span>
          )}

          {languageOptions.length > 1 ? (
            <details className="df-menu df-lang" data-docfuse-menu="">
              <summary className="df-icon-button df-lang-trigger" aria-label={labels.language}>
                <Languages size={19} strokeWidth={1.9} aria-hidden="true" />
                <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
              </summary>
              <div className="df-menu-list df-language-menu-list">
                {languageOptions.map((option) => (
                  <a
                    key={option.locale}
                    className={
                      option.locale === page.locale
                        ? 'df-menu-item df-language-menu-item df-menu-item-active'
                        : 'df-menu-item df-language-menu-item'
                    }
                    href={publicPathFor(config, option.routePath)}
                    lang={option.locale}
                    aria-current={option.locale === page.locale ? 'page' : undefined}
                  >
                    {localeNameFor(option.locale, config.i18n.localeNames)}
                  </a>
                ))}
              </div>
            </details>
          ) : null}

          {config.theme.darkMode ? (
            <button
              className="df-icon-button"
              type="button"
              data-docfuse-theme-toggle=""
              aria-label={labels.theme}
            >
              <ThemeIcon />
            </button>
          ) : null}

          {config.github ? (
            <a
              className="df-icon-button df-github-link"
              href={config.github}
              target="_blank"
              rel="noreferrer"
              aria-label={labels.github}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05a9.36 9.36 0 0 1 5 0c1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2z" />
              </svg>
            </a>
          ) : null}
        </div>
      </div>
      {!home ? (
        <div className="df-progress" aria-hidden="true">
          <span data-docfuse-progress="" />
        </div>
      ) : null}
    </header>
  )
}

export { SearchIcon }
