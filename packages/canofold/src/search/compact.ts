import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tokenize } from './tokenize'
import type { SearchProvider, SearchProviderContext } from './types'

const SEARCH_EXCERPT_LENGTH = 320

function createSearchIndex(context: SearchProviderContext, version: string, locale: string) {
  const { graph, publicPathFor } = context
  const postings = new Map<string, number[]>()
  const docs = graph.pages
    .filter((page) => page.version === version && page.locale === locale && page.search)
    .map((page, documentId) => {
      const tags = Array.isArray(page.frontmatter.tags)
        ? page.frontmatter.tags.filter((tag): tag is string => typeof tag === 'string')
        : []
      const codeSnippet = page.codeExamples
        .map((example) => example.code.slice(0, 300))
        .join(' ')
        .slice(0, 2000)
      const searchable = `${page.title} ${page.description} ${tags.join(' ')} ${page.searchText} ${codeSnippet}`
      for (const token of tokenize(searchable)) {
        const documents = postings.get(token)
        if (documents) documents.push(documentId)
        else postings.set(token, [documentId])
      }
      return {
        title: page.title,
        description: page.description,
        routePath: publicPathFor(page.routePath),
        excerpt: page.searchText.slice(0, SEARCH_EXCERPT_LENGTH),
        tags
      }
    })

  return {
    version,
    locale,
    docs,
    postings: Object.fromEntries([...postings.entries()].sort(([left], [right]) => left.localeCompare(right)))
  }
}

export const compactSearchProvider: SearchProvider = {
  id: 'compact',
  client: 'compact',
  async write(context) {
    const { graph, outputRoot } = context
    const searchDir = join(outputRoot, 'search')
    await rm(searchDir, { recursive: true, force: true })
    await mkdir(searchDir, { recursive: true })

    for (const version of graph.versions) {
      for (const locale of graph.locales) {
        const versionSearchDir = version.id === graph.currentVersion ? searchDir : join(searchDir, version.id)
        await mkdir(versionSearchDir, { recursive: true })
        await writeFile(
          join(versionSearchDir, `${locale}.json`),
          JSON.stringify(createSearchIndex(context, version.id, locale), null, 2)
        )
      }
    }
    await rm(join(outputRoot, 'pagefind'), { recursive: true, force: true })
  }
}
