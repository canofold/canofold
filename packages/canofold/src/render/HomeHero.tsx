import {
  Bot,
  Box,
  Code2,
  FileCode2,
  FileText,
  Gauge,
  Globe2,
  Layers3,
  Rocket,
  Search,
  Sparkles,
  SquareTerminal,
  type LucideIcon
} from 'lucide-react'
import type { HomeIconName } from '../content/frontmatter'
import type { DocPage } from '../content/types'
import type { CanofoldConfig } from '../config/types'
import { publicPathFor } from '../seo/urls'

const homeIcons: Record<HomeIconName, LucideIcon> = {
  ai: Bot,
  box: Box,
  code: Code2,
  file: FileText,
  'file-code': FileCode2,
  gauge: Gauge,
  globe: Globe2,
  layers: Layers3,
  rocket: Rocket,
  search: Search,
  sparkles: Sparkles,
  terminal: SquareTerminal
}

function HomeIcon({ name, className }: { name?: HomeIconName; className?: string }) {
  if (!name) return null
  const Icon = homeIcons[name]
  return <Icon aria-hidden="true" className={className} strokeWidth={1.8} />
}

/** Frontmatter-driven landing page for locale index pages. */
export function HomeHero({ page, config }: { page: DocPage; config: CanofoldConfig }) {
  const hero = page.frontmatter.hero ?? {}
  const features = page.frontmatter.features ?? []
  const actions = hero.actions ?? []

  return (
    <>
      <section className={`cf-hero${hero.image ? ' cf-hero-with-visual' : ''}`}>
        <div className="cf-hero-copy">
          <h1 className="cf-hero-title">{page.title}</h1>
          {hero.accent ? <p className="cf-hero-accent">{hero.accent}</p> : null}
          {hero.tagline ? <p className="cf-hero-tagline">{hero.tagline}</p> : null}
          {actions.length > 0 ? (
            <div className="cf-hero-actions">
              {actions.map((action) => (
                <a
                  key={action.link}
                  className={`cf-btn ${action.primary ? 'cf-btn-primary' : 'cf-btn-secondary'}`}
                  href={publicPathFor(config, action.link)}
                >
                  <HomeIcon name={action.icon} />
                  {action.text}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        {hero.image ? (
          <div className="cf-hero-visual">
            <img
              src={publicPathFor(config, hero.image)}
              alt={hero.imageAlt ?? ''}
              decoding="async"
              fetchPriority="high"
            />
          </div>
        ) : null}
      </section>

      {features.length > 0 ? (
        <section className="cf-feature-section">
          <div className="cf-features">
            {features.map((feature, index) => (
              <article key={`${feature.title}-${index}`} className="cf-feature">
                {feature.image || feature.icon ? (
                  <div className="cf-feature-icon">
                    {feature.image ? (
                      <img
                        src={publicPathFor(config, feature.image)}
                        alt=""
                        width="32"
                        height="32"
                        decoding="async"
                      />
                    ) : (
                      <HomeIcon name={feature.icon} />
                    )}
                  </div>
                ) : null}
                <h3>{feature.title}</h3>
                <p>{feature.details}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}
