import { ChevronDown, Languages, Moon, PanelLeft, Search, Sun } from 'lucide-react'
import { localeNameFor } from '../layoutContent'
import { publicPathFor } from '../../seo/urls'
import type { LayoutModel } from './model'

function BrandMark() {
  return (
    <svg className="cf-brand-mark" width="32" height="32" viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id="cf-brand-top" x1="90" y1="60" x2="400" y2="260" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1768FF" />
          <stop offset="0.5" stopColor="#119BFA" />
          <stop offset="1" stopColor="#18D8D3" />
        </linearGradient>
        <linearGradient id="cf-brand-fold" x1="70" y1="220" x2="210" y2="300" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2C7BFF" />
          <stop offset="1" stopColor="#554FF5" />
        </linearGradient>
        <linearGradient
          id="cf-brand-bottom"
          x1="200"
          y1="270"
          x2="90"
          y2="460"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#554FF5" />
          <stop offset="0.62" stopColor="#7845FA" />
          <stop offset="1" stopColor="#8637F5" />
        </linearGradient>
        <mask id="cf-brand-spark-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <rect width="512" height="512" fill="#fff" />
          <path
            d="M112 201C117 229 139 251 167 256C139 261 117 283 112 311C107 283 85 261 57 256C85 251 107 229 112 201Z"
            fill="#000"
          />
        </mask>
      </defs>
      <g mask="url(#cf-brand-spark-cut)" fill="none" strokeLinejoin="round">
        <path
          d="M348 138A150 150 0 0 0 107 243"
          stroke="url(#cf-brand-top)"
          strokeWidth="86"
          strokeLinecap="round"
        />
        <path
          d="M78 256C118 228 158 228 208 256"
          stroke="url(#cf-brand-fold)"
          strokeWidth="70"
          strokeLinecap="round"
        />
        <path
          d="M107 269A150 150 0 0 0 348 374"
          stroke="url(#cf-brand-bottom)"
          strokeWidth="86"
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
      <Sun className="cf-icon-sun" size={18} strokeWidth={2} aria-hidden="true" />
      <Moon className="cf-icon-moon" size={18} strokeWidth={2} aria-hidden="true" />
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
    <header className={home ? 'cf-header cf-header-home' : 'cf-header'}>
      <div className="cf-header-inner">
        {!home && hasSidebarItems ? (
          <button
            className="cf-sidebar-toggle"
            type="button"
            data-canofold-sidebar-open=""
            data-canofold-sidebar-open-label={labels.openSidebar}
            data-canofold-sidebar-close-label={labels.close}
            aria-label={labels.openSidebar}
            aria-expanded="false"
          >
            <PanelLeft size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
        <a className="cf-brand" href={localeRoot} aria-label={config.title}>
          {config.theme.logo ? (
            <>
              <img
                className={config.theme.logoDark ? 'cf-brand-logo cf-brand-logo-light' : 'cf-brand-logo'}
                src={publicPathFor(config, config.theme.logo)}
                alt={config.title}
              />
              {config.theme.logoDark ? (
                <img
                  className="cf-brand-logo cf-brand-logo-dark"
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
            className="cf-search-trigger"
            type="button"
            data-canofold-search-open=""
            aria-haspopup="dialog"
            aria-label={labels.search}
          >
            <SearchIcon size={15} />
            <span>{labels.search}</span>
            <kbd className="cf-kbd">⌘K</kbd>
          </button>
        ) : null}

        <div className="cf-header-right">
          {navItems.length > 0 ? (
            <nav className="cf-header-nav" aria-label={labels.primaryNavigation}>
              {navItems.map((item) => {
                const active = navItemIsActive(model, item.routePath)
                const external = /^https?:\/\//.test(item.routePath)
                return (
                  <a
                    key={item.routePath}
                    className={active ? 'cf-header-link cf-header-link-active' : 'cf-header-link'}
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
            <details className="cf-menu cf-version-menu" data-canofold-menu="">
              <summary className="cf-version-badge" aria-label={labels.version}>
                <span>{versionLabel}</span>
                <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
              </summary>
              <div className="cf-menu-list">
                {versionOptions.map((option) => (
                  <a
                    key={option.id}
                    className={
                      option.id === page.version ? 'cf-menu-item cf-menu-item-active' : 'cf-menu-item'
                    }
                    href={publicPathFor(config, option.routePath)}
                  >
                    <span>{option.label}</span>
                  </a>
                ))}
              </div>
            </details>
          ) : (
            <span className="cf-version-badge">{versionLabel}</span>
          )}

          {languageOptions.length > 1 ? (
            <details className="cf-menu cf-lang" data-canofold-menu="">
              <summary className="cf-icon-button cf-lang-trigger" aria-label={labels.language}>
                <Languages size={19} strokeWidth={1.9} aria-hidden="true" />
                <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
              </summary>
              <div className="cf-menu-list cf-language-menu-list">
                {languageOptions.map((option) => (
                  <a
                    key={option.locale}
                    className={
                      option.locale === page.locale
                        ? 'cf-menu-item cf-language-menu-item cf-menu-item-active'
                        : 'cf-menu-item cf-language-menu-item'
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
              className="cf-icon-button"
              type="button"
              data-canofold-theme-toggle=""
              aria-label={labels.theme}
            >
              <ThemeIcon />
            </button>
          ) : null}

          {config.github ? (
            <a
              className="cf-icon-button cf-github-link"
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
        <div className="cf-progress" aria-hidden="true">
          <span data-canofold-progress="" />
        </div>
      ) : null}
    </header>
  )
}

export { SearchIcon }
