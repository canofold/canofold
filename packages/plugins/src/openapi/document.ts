import { fileURLToPath, pathToFileURL } from 'node:url'
import { isAbsolute, relative } from 'node:path'
import { LineCounter, parseDocument, visit, isNode } from 'yaml'
import { visit as visitJson, printParseErrorCode } from 'jsonc-parser'
import { BaseResolver, Source, createConfig, lintDocument } from '@redocly/openapi-core'
import type { ContentSourceContext } from 'canofold'

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type ObjectValue = { [key: string]: Json }
export interface Location {
  file: string
  pointer: string
}
export interface LocatedObject {
  value: ObjectValue
  location: Location
  fields?: Record<string, Location>
}

export function fieldLocation(owner: LocatedObject, key: string): Location {
  return (
    owner.fields?.[key] ?? { ...owner.location, pointer: `${owner.location.pointer}/${pointerToken(key)}` }
  )
}

export function object(value: Json | undefined): ObjectValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : Object.create(null)
}

export function pointerToken(value: string) {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

function assertJson(
  value: unknown,
  depth = 0,
  ancestors = new Set<object>(),
  budget = { nodes: 0 }
): asserts value is Json {
  if (++budget.nodes > 1_000_000 || depth > 128) throw new Error('OpenAPI exceeds nesting/node limits')
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return
  if (!value || typeof value !== 'object' || ancestors.has(value)) {
    throw new Error('OpenAPI must contain finite JSON-compatible data, not cyclic YAML aliases')
  }
  ancestors.add(value)
  for (const item of Object.values(value)) assertJson(item, depth + 1, ancestors, budget)
  ancestors.delete(value)
}

/** Validate JSON without retaining a second syntax tree for a large input. */
function parseJson(raw: string, file: string): unknown {
  const scopes: Array<Set<string> | null> = []
  const begin = (object: boolean) => {
    if (scopes.length > 128) throw new Error(`${file}: OpenAPI exceeds nesting limit`)
    scopes.push(object ? new Set<string>() : null)
  }
  visitJson(
    raw,
    {
      onObjectBegin: () => begin(true),
      onArrayBegin: () => begin(false),
      onObjectEnd: () => {
        scopes.pop()
      },
      onArrayEnd: () => {
        scopes.pop()
      },
      onObjectProperty(key, _offset, _length, line, column) {
        const keys = scopes.at(-1)!
        if (keys.has(key)) throw new Error(`${file}:${line + 1}:${column + 1}: Map keys must be unique`)
        keys.add(key)
      },
      onError(error, _offset, _length, line, column) {
        throw new Error(`${file}:${line + 1}:${column + 1}: ${printParseErrorCode(error)}`)
      }
    },
    { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false }
  )
  return JSON.parse(raw)
}

function jsonPosition(raw: string, tokens: string[]) {
  let position = ''
  const locate = (
    _offset: number,
    _length: number,
    line: number,
    column: number,
    path: () => Array<string | number>
  ) => {
    const current = path()
    if (
      current.length === tokens.length &&
      current.every((token, index) => String(token) === tokens[index])
    ) {
      position = `:${line + 1}:${column + 1}`
    }
  }
  visitJson(
    raw,
    {
      onObjectBegin: locate,
      onArrayBegin: locate,
      onLiteralValue: (_value, ...location) => locate(...location)
    },
    { disallowComments: true, allowTrailingComma: false }
  )
  return position
}

const schemaMaps = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'])
const schemaArrays = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems'])
const schemaChildren = new Set([
  'not',
  'if',
  'then',
  'else',
  'items',
  'contains',
  'additionalProperties',
  'unevaluatedProperties',
  'unevaluatedItems',
  'propertyNames',
  'contentSchema',
  'additionalItems'
])
type NodeKind =
  | 'object'
  | 'schema'
  | 'components'
  | 'object-map'
  | 'paths-map'
  | 'responses-map'
  | 'schema-map'
  | 'example-map'
  | 'example'
  | 'link-map'
  | 'link'
const objectMaps: Record<string, NodeKind> = {
  paths: 'paths-map',
  responses: 'responses-map',
  headers: 'object-map',
  links: 'link-map',
  callbacks: 'object-map',
  content: 'object-map',
  encoding: 'object-map',
  webhooks: 'object-map'
}

/** Local JSON Reference graph, not a JSON Schema evaluator. Schema structure is retained, never flattened. */
export class OpenApiDocument {
  private files = new Map<string, { value: Json; raw: string }>()
  private resources = new Map<string, { value: Json; location: Location }>()
  private visited = new Set<string>()
  private indexed = new Set<string>()
  private discovered = new Set<string>()
  private schemaBases = new Map<string, string>()
  private references: Array<{ from: Location; to: Location; value: Json; schema: boolean }> = []
  private entryValue: ObjectValue = {}
  private validationConfigs = new Map<boolean, ReturnType<typeof createConfig>>()

  constructor(private context: ContentSourceContext) {}

  display(location: Location) {
    return `${relative(this.context.cwd, location.file).replace(/\\/g, '/')}#${location.pointer}`
  }

  fail(message: string, location: Location): never {
    const file = this.files.get(location.file)
    // Retain input bytes, not a second full syntax tree, during reference and
    // grammar analysis. Recreate positions only when reporting a failure.
    const tokens = location.pointer
      ? location.pointer
          .slice(1)
          .split('/')
          .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'))
      : []
    let position = ''
    if (file && location.file.endsWith('.json')) position = jsonPosition(file.raw, tokens)
    else if (file) {
      const lines = new LineCounter()
      const node = parseDocument(file.raw, { lineCounter: lines }).getIn(tokens, true)
      const offset = isNode(node) ? node.range?.[0] : undefined
      if (offset !== undefined) position = `:${lines.linePos(offset).line}:${lines.linePos(offset).col}`
    }
    throw new Error(`${this.display(location)}${position}: ${message}`)
  }

  private async load(file: string) {
    const existing = this.files.get(file)
    if (existing) return existing.value
    const raw = await this.context.read(file)
    let value: unknown
    if (file.endsWith('.json')) value = parseJson(raw, file)
    else {
      const syntax = parseDocument(raw, { uniqueKeys: true })
      if (syntax.errors.length)
        throw new Error(`${relative(this.context.root, file)}: ${syntax.errors[0]!.message}`)
      if (syntax.warnings.length)
        throw new Error(`${relative(this.context.root, file)}: ${syntax.warnings[0]!.message}`)
      visit(syntax, (_key, _node, path) => {
        if (path.length > 260) throw new Error(`${file}: OpenAPI exceeds nesting limit`)
      })
      value = syntax.toJS({ maxAliasCount: 50 })
    }
    assertJson(value)
    this.files.set(file, { value, raw })
    return value
  }

  private register(uri: string, value: Json, location: Location) {
    const previous = this.resources.get(uri)
    if (
      previous &&
      (previous.location.file !== location.file || previous.location.pointer !== location.pointer)
    ) {
      this.fail(`Duplicate schema resource identifier: ${uri}`, location)
    }
    this.resources.set(uri, { value, location })
  }

  private async target(ref: string, location: Location, base: string) {
    let url: URL
    try {
      url = new URL(ref, base)
    } catch {
      this.fail(`Invalid reference: ${ref}`, location)
    }
    const indexed = this.resources.get(url.href)
    const resource = this.resources.get(url.href.split('#')[0]!)
    // No remote fetch, URI credentials, query strings or non-file schemes, even on localhost.
    if (
      (!resource && !indexed && url.protocol !== 'file:') ||
      (!resource && !indexed && url.host) ||
      url.username ||
      url.password ||
      url.search ||
      /%2f|%5c|%00/i.test(url.pathname)
    ) {
      this.fail(`Only local references inside the source root are allowed: ${ref}`, location)
    }
    if (indexed) return indexed
    const file = resource?.location.file ?? fileURLToPath(new URL(url.href.split('#')[0]!))
    let value = resource?.value ?? (await this.load(file))
    if (!resource) {
      await this.walk(
        value,
        { file, pointer: '' },
        !object(value).openapi &&
          ['$id', '$anchor', '$dynamicAnchor', '$defs', 'type', 'properties', 'allOf', 'anyOf', 'oneOf'].some(
            (key) => Object.hasOwn(object(value), key)
          )
          ? 'schema'
          : 'object',
        pathToFileURL(file).href,
        false
      )
      const anchor = this.resources.get(url.href)
      if (anchor) return anchor
    }
    let pointer: string
    try {
      pointer = decodeURIComponent(url.hash.slice(1))
    } catch {
      this.fail(`Invalid reference fragment: ${ref}`, location)
    }
    if (pointer && !pointer.startsWith('/')) this.fail(`Unknown schema anchor: ${ref}`, location)
    for (const encoded of pointer ? pointer.slice(1).split('/') : []) {
      if (/~(?![01])/.test(encoded)) this.fail(`Invalid JSON pointer: ${ref}`, location)
      const token = encoded.replace(/~1/g, '/').replace(/~0/g, '~')
      if (!value || typeof value !== 'object' || !Object.hasOwn(value, token))
        this.fail(`Unresolved reference: ${ref}`, location)
      value = (value as ObjectValue)[token]!
    }
    return { value, location: { file, pointer: `${resource?.location.pointer ?? ''}${pointer}` } }
  }

  async resolve(value: Json | undefined, location: Location, pathItem = false): Promise<LocatedObject> {
    let current = { value: object(value), location }
    const seen = new Set<string>()
    const layers: LocatedObject[] = []
    while (typeof current.value.$ref === 'string') {
      const identity = this.display(current.location)
      if (seen.has(identity)) this.fail('Circular non-schema Reference Object', current.location)
      seen.add(identity)
      layers.push(current)
      const target = await this.target(
        current.value.$ref,
        current.location,
        pathToFileURL(current.location.file).href
      )
      current = { value: object(target.value), location: target.location }
    }
    const merged = { ...current.value }
    const fields: Record<string, Location> = Object.create(null)
    for (const key of Object.keys(merged)) fields[key] = fieldLocation(current, key)
    for (const layer of layers.reverse()) {
      const keys = pathItem
        ? Object.keys(layer.value).filter((key) => key !== '$ref')
        : this.entryValue.openapi?.toString().startsWith('3.1.')
          ? ['summary', 'description']
          : []
      for (const key of keys) {
        if (layer.value[key] === undefined) continue
        if (pathItem && Object.hasOwn(merged, key))
          this.fail(`Ambiguous Path Item $ref sibling: ${key}`, layer.location)
        Object.defineProperty(merged, key, {
          value: layer.value[key],
          enumerable: true,
          writable: true,
          configurable: true
        })
        fields[key] = fieldLocation(layer, key)
      }
    }
    return { ...current, value: merged, fields }
  }

  private async walk(
    value: Json,
    location: Location,
    kind: NodeKind,
    base = pathToFileURL(location.file).href,
    follow: boolean | 'local' = true
  ) {
    // Scalars cannot contain references or form traversal cycles. The parsed
    // JSON budget already counts them; retaining their pointers wastes memory.
    if (!value || typeof value !== 'object') return
    const schema = kind === 'schema'
    const identity = JSON.stringify([location.file, location.pointer, kind])
    const visited = follow === 'local' ? this.discovered : follow ? this.visited : this.indexed
    if (visited.has(identity)) return
    visited.add(identity)
    if (visited.size > 1_000_000) this.fail('Too many reference nodes', location)
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries())
        await this.walk(item, { ...location, pointer: `${location.pointer}/${index}` }, kind, base, follow)
      return
    }
    if (kind.endsWith('-map')) {
      const childKind =
        kind === 'schema-map'
          ? 'schema'
          : kind === 'example-map'
            ? 'example'
            : kind === 'link-map'
              ? 'link'
              : 'object'
      for (const [key, item] of Object.entries(value)) {
        if ((kind === 'paths-map' || kind === 'responses-map') && key.startsWith('x-')) continue
        await this.walk(
          item,
          { ...location, pointer: `${location.pointer}/${pointerToken(key)}` },
          childKind,
          base,
          follow
        )
      }
      return
    }
    let scopedBase = this.schemaBases.get(identity) ?? base
    if (schema && typeof value.$id === 'string' && !this.schemaBases.has(identity)) {
      try {
        scopedBase = new URL(value.$id, base).href
      } catch {
        this.fail('Invalid schema $id', location)
      }
      if (new URL(scopedBase).hash) this.fail('Schema $id must not contain a fragment', location)
      this.register(scopedBase, value, location)
    }
    if (schema) this.schemaBases.set(identity, scopedBase)
    for (const keyword of schema ? ['$anchor', '$dynamicAnchor'] : []) {
      if (typeof value[keyword] === 'string') {
        if (!/^[A-Za-z_][-A-Za-z0-9._]*$/.test(value[keyword])) this.fail(`Invalid ${keyword}`, location)
        this.register(`${scopedBase.split('#')[0]}#${value[keyword]}`, value, location)
      }
    }
    for (const keyword of follow ? (schema ? ['$ref', '$dynamicRef'] : ['$ref']) : []) {
      if (typeof value[keyword] === 'string') {
        if (follow === 'local') {
          let uri: URL
          try {
            uri = new URL(value[keyword], scopedBase)
          } catch {
            this.fail(`Invalid reference: ${value[keyword]}`, location)
          }
          if (uri.protocol !== 'file:') continue
        }
        const target = await this.target(value[keyword], location, scopedBase)
        if (follow === true)
          this.references.push({ from: location, to: target.location, value: target.value, schema })
        await this.walk(target.value, target.location, kind, pathToFileURL(target.location.file).href, false)
        await this.walk(target.value, target.location, kind, pathToFileURL(target.location.file).href, follow)
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith('x-') || key === '$ref' || key === '$dynamicRef') continue
      const childLocation = { ...location, pointer: `${location.pointer}/${pointerToken(key)}` }
      if (schema) {
        if (schemaMaps.has(key)) {
          await this.walk(child, childLocation, 'schema-map', scopedBase, follow)
        } else if (schemaArrays.has(key) || schemaChildren.has(key))
          await this.walk(child, childLocation, 'schema', scopedBase, follow)
      } else if (kind === 'components') {
        await this.walk(
          child,
          childLocation,
          key === 'schemas'
            ? 'schema-map'
            : key === 'examples'
              ? 'example-map'
              : key === 'links'
                ? 'link-map'
                : 'object-map',
          scopedBase,
          follow
        )
      } else if (
        key !== 'example' &&
        key !== 'security' &&
        !(kind === 'example' && ['value', 'externalValue'].includes(key)) &&
        !(kind === 'link' && ['parameters', 'requestBody'].includes(key))
      ) {
        const childKind =
          key === 'components'
            ? 'components'
            : key === 'schema'
              ? 'schema'
              : key === 'examples'
                ? 'example-map'
                : (objectMaps[key] ?? 'object')
        await this.walk(child, childLocation, childKind, scopedBase, follow)
      }
    }
  }

  /** Grammar validation uses only inputs already read by the semantic reference index. */
  async validate(value: ObjectValue, location: Location, resolvedOperation = false) {
    let configuration = this.validationConfigs.get(resolvedOperation)
    if (!configuration) {
      configuration = createConfig(
        {
          rules: {
            struct: 'error',
            ...(resolvedOperation ? { 'path-parameters-defined': 'error' as const } : {})
          }
        },
        // A regular input file cannot contain a config directory. Do not discover
        // project Redocly config or ignore files and silently change validation.
        { configPath: `${this.context.entry}/canofold-validation` }
      )
      this.validationConfigs.set(resolvedOperation, configuration)
    }
    const files = this.files
    const resources = this.resources
    const entry = this.context.entry
    const resolver = new (class extends BaseResolver {
      override async resolveDocument<T = unknown>(base: string | null, ref: string) {
        const url = new URL(ref, base && !isAbsolute(base) ? base : pathToFileURL(base ?? entry).href)
        const resource = resources.get(url.href)
        const file = url.protocol === 'file:' ? fileURLToPath(url) : undefined
        const input = resource ?? (file ? files.get(file) : undefined)
        if (!input) throw new Error(`Reference was not declared by the source: ${ref}`)
        const parsed = input.value
        return {
          source: new Source(resource ? url.href : file!, JSON.stringify(parsed)),
          parsed: parsed as T
        }
      }
    })()
    const problems = await lintDocument({
      document: { source: new Source(location.file, JSON.stringify(value)), parsed: value },
      config: await configuration,
      externalRefResolver: resolver
    })
    const error = problems.find((problem) => problem.severity === 'error')
    if (error) {
      const reported = error.location[0]
      const resource = reported ? this.resources.get(reported.source.absoluteRef) : undefined
      this.fail(
        error.message,
        resolvedOperation || !reported
          ? location
          : {
              file: resource?.location.file ?? reported.source.absoluteRef,
              pointer: `${resource?.location.pointer ?? ''}${(reported.pointer ?? '').replace(/^#/, '')}`
            }
      )
    }
  }

  async open() {
    this.entryValue = object(await this.load(this.context.entry))
    const location = { file: this.context.entry, pointer: '' }
    if (typeof this.entryValue.openapi !== 'string' || !/^3\.[01]\.\d+$/.test(this.entryValue.openapi)) {
      this.fail('Only OpenAPI 3.0.x and 3.1.x are supported', location)
    }
    await this.walk(this.entryValue, location, 'object', undefined, false)
    // Discover explicit local files before resolving URI identifiers in any order.
    // URI identifiers never grant network access and do not discover remote files.
    await this.walk(this.entryValue, location, 'object', undefined, 'local')
    await this.walk(this.entryValue, location, 'object')
    await this.validate(this.entryValue, location)
    return { value: this.entryValue, location }
  }

  /** Finite referenced schemas with authored composition and explicit source locations. */
  schemasFor(locations: Location[]): Json[] {
    const queue = [...locations]
    const seen = new Set<string>()
    const schemas = new Map<string, Json>()
    let bytes = 0
    for (let index = 0; index < queue.length; index++) {
      const location = queue[index]!
      const key = this.display(location)
      if (seen.has(key)) continue
      seen.add(key)
      for (const reference of this.references) {
        if (
          reference.from.file !== location.file ||
          !(
            reference.from.pointer === location.pointer ||
            reference.from.pointer.startsWith(`${location.pointer}/`)
          )
        )
          continue
        queue.push(reference.to)
        if (queue.length > 1_000_000) this.fail('Too many schema reference edges', location)
        const target = this.display(reference.to)
        if (reference.schema && !schemas.has(target)) {
          bytes += Buffer.byteLength(JSON.stringify(reference.value))
          if (bytes > 16 * 1024 * 1024) this.fail('Referenced schemas exceed representation limit', location)
          schemas.set(target, { source: target, schema: reference.value })
        }
      }
    }
    return [...schemas.values()]
  }
}
