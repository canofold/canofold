import { readFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { filesUnder } from './lib/files.mjs'

const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)))
const outputRoot = resolve(process.argv[2] ?? join(workspace, 'site/.canofold/dist'))
const failures = []

function routeFor(path) {
  const outputPath = relative(outputRoot, path).split(sep).join('/')
  if (outputPath === 'index.html') return '/'
  if (outputPath.endsWith('/index.html')) return `/${outputPath.slice(0, -'index.html'.length)}`
  return `/${outputPath}`
}

function accessibleName(element) {
  const document = element.ownerDocument
  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy) {
    const label = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .join(' ')
      .trim()
    if (label) return label
  }
  const ariaLabel = element.getAttribute('aria-label')?.trim()
  if (ariaLabel) return ariaLabel
  if (element.id) {
    const explicit = [...document.querySelectorAll('label[for]')].find(
      (label) => label.getAttribute('for') === element.id
    )
    if (explicit?.textContent?.trim()) return explicit.textContent.trim()
  }
  const wrappingLabel = element.closest('label')?.textContent?.trim()
  if (wrappingLabel) return wrappingLabel
  const imageAlt = element.querySelector('img[alt]')?.getAttribute('alt')?.trim()
  return element.textContent?.trim() || imageAlt || ''
}

const htmlFiles = (await filesUnder(outputRoot)).filter((path) => path.endsWith('.html'))
const pages = new Map()
for (const path of htmlFiles) {
  const route = routeFor(path)
  const html = await readFile(path, 'utf8')
  const document = new JSDOM(html, { url: `https://canofold.invalid${route}` }).window.document
  pages.set(route, { document, path })
}

for (const [route, { document }] of pages) {
  if (!document.querySelector('[data-canofold-page-root]')) continue
  const fail = (message) => failures.push(`${route}: ${message}`)

  if (!document.documentElement.lang.trim()) fail('html[lang] is required')
  if (!document.title.trim()) fail('a non-empty title is required')
  if (!document.querySelector('meta[name="viewport"]')) fail('viewport metadata is required')
  if (!document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim()) {
    fail('a non-empty meta description is required')
  }

  const mains = document.querySelectorAll('main')
  if (mains.length !== 1) fail(`expected exactly one main landmark, found ${mains.length}`)
  if (document.querySelectorAll('h1').length !== 1) {
    fail(`expected exactly one h1, found ${document.querySelectorAll('h1').length}`)
  }
  const skipLink = document.querySelector('a.cf-skip-link[href="#canofold-main"]')
  if (!skipLink || !document.getElementById('canofold-main'))
    fail('skip-to-content link and target are required')

  const ids = new Set()
  for (const element of document.querySelectorAll('[id]')) {
    if (ids.has(element.id)) fail(`duplicate id ${JSON.stringify(element.id)}`)
    ids.add(element.id)
  }

  for (const image of document.querySelectorAll('img')) {
    if (!image.hasAttribute('alt')) fail(`image is missing alt: ${image.getAttribute('src') ?? '<inline>'}`)
  }
  for (const element of document.querySelectorAll('button, input, select, textarea, [role="button"]')) {
    if (!accessibleName(element)) {
      fail(`${element.tagName.toLowerCase()} is missing an accessible name`)
    }
  }
  for (const dialog of document.querySelectorAll('[role="dialog"], dialog')) {
    if (!accessibleName(dialog)) fail('dialog is missing an accessible name')
  }

  for (const link of document.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href')
    if (!href) continue
    if (!accessibleName(link)) fail(`link ${JSON.stringify(href)} is missing an accessible name`)
    if (/^javascript:/i.test(href)) fail(`javascript URL is forbidden: ${href}`)
    if (link.target === '_blank' && !/\bnoopener\b|\bnoreferrer\b/.test(link.rel)) {
      fail(`target=_blank link must set noopener or noreferrer: ${href}`)
    }
    if (/^(?:https?:|mailto:|tel:|data:)/i.test(href)) continue

    const target = new URL(href, `https://canofold.invalid${route}`)
    const targetRoute = target.pathname.endsWith('/')
      ? target.pathname
      : target.pathname.endsWith('.html')
        ? target.pathname
        : `${target.pathname}/`
    const targetPage = pages.get(targetRoute)
    if (!targetPage) {
      fail(`internal link target does not exist: ${href}`)
      continue
    }
    if (target.hash && !targetPage.document.getElementById(decodeURIComponent(target.hash.slice(1)))) {
      fail(`internal fragment does not exist: ${href}`)
    }
  }
}

console.log(`Audited ${pages.size} HTML files under ${outputRoot}`)
if (failures.length) {
  console.error(`Site audit failed with ${failures.length} issue(s):`)
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exitCode = 1
}
