import type { MarkdownClassNames } from '@canofold/markdown'
import { createMarkdownRenderer, type MarkdownAssets, type MarkdownRenderer } from '@canofold/markdown/server'
import type { RenderMarkdownOptions } from '@canofold/markdown'
import type { MarkdownUrlTransform } from '@canofold/markdown'
import type { ElementType, ReactNode } from 'react'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { isDocsImportSpecifier, prepareMdxSource, type DocsImportSpecifier } from '../markdown/importBoundary'
import { loadLocalComponentBundle } from './localComponents'

interface RenderedMdx {
  content: ReactNode
  assets: MarkdownAssets
}

function mergeAssets(...values: MarkdownAssets[]): MarkdownAssets {
  return {
    behaviors: [...new Set(values.flatMap((value) => value.behaviors))],
    math: values.some((value) => value.math),
    pluginClients: [
      ...new Map(values.flatMap((value) => value.pluginClients).map((asset) => [asset.id, asset])).values()
    ],
    pluginStyles: [
      ...new Map(values.flatMap((value) => value.pluginStyles).map((asset) => [asset.id, asset])).values()
    ]
  }
}

function bindImports(
  imports: ReturnType<typeof prepareMdxSource>['imports'],
  localComponents: Record<string, unknown>
) {
  const namespaces = {
    react: React,
    'react/jsx-runtime': jsxRuntime
  } satisfies Record<DocsImportSpecifier, Record<string, unknown>>
  const bound: Record<string, unknown> = { ...localComponents }
  for (const declaration of imports) {
    if (!isDocsImportSpecifier(declaration.specifier)) continue
    const namespace = namespaces[declaration.specifier] as Record<string, unknown>
    for (const binding of declaration.bindings) {
      if (binding.namespace) {
        bound[binding.local] = namespace
        continue
      }
      if (binding.imported === 'default' && declaration.specifier === 'react') {
        bound[binding.local] = namespace.default ?? namespace
        continue
      }
      if (!Object.hasOwn(namespace, binding.imported)) {
        throw new Error(
          `Module ${JSON.stringify(declaration.specifier)} does not export ${JSON.stringify(binding.imported)}`
        )
      }
      bound[binding.local] = namespace[binding.imported]
    }
  }
  return bound
}

export async function renderMdxResult(
  source: string,
  sourcePath?: string,
  projectRoot?: string,
  options?: RenderMarkdownOptions,
  classNames?: MarkdownClassNames,
  urlTransform?: MarkdownUrlTransform,
  renderer: MarkdownRenderer = createMarkdownRenderer()
): Promise<RenderedMdx> {
  const preparedSource = prepareMdxSource(source)
  const { components: localComponents, assets: localAssets } = await loadLocalComponentBundle(
    preparedSource.imports,
    sourcePath,
    projectRoot,
    options?.plugins
  )
  const rendered = await renderer.renderMdx(preparedSource.source, {
    markdown: options,
    classNames,
    urlTransform,
    as: 'article',
    components: {
      ...bindImports(preparedSource.imports, localComponents)
    } as Record<string, ElementType>
  })
  return {
    content: rendered.content,
    assets: mergeAssets(rendered.assets, localAssets)
  }
}
