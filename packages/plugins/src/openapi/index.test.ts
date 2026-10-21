import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { trackedMkdtemp, createMockConfig } from '../../../canofold/test/fixtures'
import { buildContentGraph } from '../../../canofold/src/content/graph'
import { createContentCollection } from '../../../canofold/src/ai/contentContract'
import { createMarkdownRenderer } from '@canofold/markdown/server'
import { renderToStaticMarkup } from 'react-dom/server'
import { openapi } from './index'
import { math } from '../math'

const specification = () => ({
  openapi: '3.1.0',
  info: { title: 'Pet API', version: '2.4' },
  paths: {
    '/pets': {
      get: { summary: 'List pets', tags: ['pets', 'read'], responses: { '200': { description: 'OK' } } }
    }
  }
})

async function fixture(spec: unknown = specification()) {
  const cwd = await trackedMkdtemp(join(tmpdir(), 'canofold-openapi-'))
  await mkdir(join(cwd, 'docs/api'), { recursive: true })
  await writeFile(join(cwd, 'docs/index.md'), '# Home')
  await writeFile(join(cwd, 'docs/api/openapi.json'), JSON.stringify(spec))
  const source = openapi({
    id: 'pet-api',
    root: 'docs/api',
    entry: 'docs/api/openapi.json',
    base: '/api/',
    locale: 'zh',
    version: 'current'
  })
  const config = createMockConfig({ sources: [source] })
  return { cwd, source, config, graph: () => buildContentGraph(cwd, config) }
}

describe('OpenAPI content source', () => {
  it('reports YAML alias limits as recoverable source diagnostics', async () => {
    const { cwd, config, source } = await fixture()
    source.entry = 'docs/api/openapi.yaml'
    const aliases = Array(15).fill('*a').join(', ')
    const copies = Array(15).fill('*b').join(', ')
    await writeFile(
      join(cwd, source.entry),
      `openapi: 3.1.0\ninfo: {title: Test, version: "1"}\npaths: {}\na: &a [one, two]\nb: &b [${aliases}]\nc: [${copies}]\n`
    )
    const diagnostics: import('../../../canofold/src/commands/check').CheckDiagnostic[] = []
    const graph = await buildContentGraph(cwd, config, undefined, { diagnostics })
    expect(graph.pages).toHaveLength(1)
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        ruleId: 'content-syntax',
        page: source.entry,
        message: expect.stringMatching(/alias/i)
      })
    )
  })
  it('locates a missing local reference at its authored owner and recovers when the file is added', async () => {
    const spec = specification()
    Object.assign(spec.paths['/pets'].get.responses['200'], { $ref: './response.yaml' })
    const { cwd, config } = await fixture(spec)
    const diagnostics: import('../../../canofold/src/commands/check').CheckDiagnostic[] = []
    await buildContentGraph(cwd, config, undefined, { diagnostics })
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        page: 'docs/api/openapi.json',
        sourcePointer: '/paths/~1pets/get/responses/200',
        message: expect.stringContaining('Referenced input not found')
      })
    )
    await writeFile(join(cwd, 'docs/api/response.yaml'), 'description: Recovered response\n')
    expect((await buildContentGraph(cwd, config)).pages).toHaveLength(3)
  })
  it('emits structured source locations alongside authored-file diagnostics without partial publication', async () => {
    const { cwd } = await fixture()
    await writeFile(
      join(cwd, 'docs/api/openapi.json'),
      '{"openapi":"3.1.0","info":{"title":42,"version":"1"},"paths":{}}'
    )
    // The direct adapter fixture uses the same host-owned diagnostic contract.
    const config = createMockConfig({
      sources: [
        openapi({
          id: 'pet-api',
          root: 'docs/api',
          entry: 'docs/api/openapi.json',
          base: '/api/',
          locale: 'zh',
          version: 'current'
        })
      ]
    })
    const diagnostics: import('../../../canofold/src/commands/check').CheckDiagnostic[] = []
    const graph = await buildContentGraph(cwd, config, undefined, { diagnostics })
    expect(graph.pages).toHaveLength(1)
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        page: 'docs/api/openapi.json',
        sourcePointer: '/info/title',
        line: 1,
        severity: 'error'
      })
    )
  })
  it('keeps dollar signs in specification text literal when the site enables math', async () => {
    const spec = specification()
    spec.paths['/pets'].get.summary = 'Price $x$ and $\\unknown{value}$ are API text'
    const { graph, config } = await fixture(spec)
    config.markdown.plugins = [math()]
    const page = (await graph()).pages.find((item) => item.origin?.key === 'GET /pets')!
    const rendered = await createMarkdownRenderer().render(page.body, { markdown: config.markdown })
    const html = renderToStaticMarkup(rendered.content)
    expect(html).toContain('Price $x$')
    expect(html).not.toContain('class="katex')
    expect(page.origin!.facts.summary).toBe(spec.paths['/pets'].get.summary)
  })
  it.each(['3.0.4', '3.1.0'])('emits one overview and one page per operation for %s', async (version) => {
    const spec = specification()
    spec.openapi = version
    const { graph, config } = await fixture(spec)
    const result = await graph()
    expect(result.pages).toHaveLength(3)
    const operation = result.pages.find((page) => page.origin?.key === 'GET /pets')!
    expect(operation.routePath).toBe('/api/get/2f70657473/')
    expect(operation.title).toBe('GET /pets')
    expect(operation.origin!.facts).toMatchObject({
      method: 'GET',
      path: '/pets',
      apiVersion: '2.4',
      tags: ['pets', 'read']
    })
    const collection = createContentCollection(config, result)
    expect(collection.schemaVersion).toBe(3)
    expect(collection.pages.find((page) => page.source.kind === 'openapi')!.representation.body).toBe(
      'source-derived-markdown'
    )
  })

  it('keeps stable operation identity across operationId, tags, title, order and base changes', async () => {
    const { cwd, graph, config } = await fixture()
    const before = createContentCollection(config, await graph()).pages.find(
      (page) => 'key' in page.source && page.source.key === 'GET /pets'
    )!
    const spec = specification()
    spec.paths['/pets'].get.summary = 'Renamed'
    spec.paths['/pets'].get.tags.reverse()
    await writeFile(join(cwd, 'docs/api/openapi.json'), JSON.stringify(spec))
    config.sources[0]!.base = '/reference/'
    const after = createContentCollection(config, await graph()).pages.find(
      (page) => 'key' in page.source && page.source.key === 'GET /pets'
    )!
    expect(after.id).toBe(before.id)
    expect(after.revision).not.toBe(before.revision)
  })

  it('resolves local parameter and response references, inherits and overrides by name/in', async () => {
    const spec = {
      ...specification(),
      security: [{ token: [] }],
      components: { securitySchemes: { token: { type: 'http', scheme: 'bearer' } } },
      paths: {
        '/pets/{id}': {
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          get: {
            security: [],
            parameters: [{ $ref: './parameter.yaml' }],
            responses: { '200': { $ref: './response.yaml' } }
          }
        }
      }
    }
    const { cwd, graph } = await fixture(spec)
    await writeFile(
      join(cwd, 'docs/api/parameter.yaml'),
      'name: id\nin: path\nrequired: true\ndescription: Overridden\nschema:\n  type: integer\n'
    )
    await writeFile(
      join(cwd, 'docs/api/response.yaml'),
      'description: Fine\ncontent:\n  application/json:\n    schema:\n      type: object\n      properties:\n        child:\n          $ref: "#/content/application~1json/schema"\n'
    )
    const operation = (await graph()).pages.find((page) => page.origin?.key === 'GET /pets/{id}')!
    expect(operation.origin!.facts).toMatchObject({
      security: [],
      parameters: [{ name: 'id', description: 'Overridden', schema: { type: 'integer' } }],
      responses: { '200': { description: 'Fine' } }
    })
    expect(operation.origin!.dependencies).toHaveLength(3)
  })

  it('does not treat example, extension or schema literal data as references or executable Markdown', async () => {
    const spec = {
      ...specification(),
      components: {
        schemas: {
          Pet: {
            type: 'object',
            properties: { example: { type: 'string' } },
            example: { $ref: 'https://no-fetch.invalid' },
            default: { $ref: '../never.json' },
            enum: [{ $ref: './data.json' }]
          }
        }
      },
      paths: {
        '/pets': {
          get: {
            summary: ':::demo{src="/evil.tsx"}',
            description: '<script>alert(1)</script>\n\n:::check',
            'x-extra': { $ref: 'http://127.0.0.1/' },
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    example: { $ref: './literal.json' },
                    schema: { $ref: '#/components/schemas/Pet' }
                  }
                }
              }
            }
          }
        }
      }
    }
    const { graph } = await fixture(spec)
    const page = (await graph()).pages.find((item) => item.origin?.key === 'GET /pets')!
    expect(page.demos).toEqual([])
    const rendered = await createMarkdownRenderer().render(page.body)
    const html = renderToStaticMarkup(rendered.content)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(page.origin!.dependencies).toHaveLength(1)
  })

  it.each([
    'https://example.com/api.json',
    'file:///etc/passwd',
    '../outside.json',
    './%2foutside.json',
    './missing.json'
  ])('rejects unsafe or missing references: %s', async (ref) => {
    const spec = { ...specification(), paths: { '/pets': { get: { responses: { '200': { $ref: ref } } } } } }
    const { graph } = await fixture(spec)
    await expect(graph()).rejects.toThrow()
  })

  it('distinguishes extensible maps, component names and literal Link payloads', async () => {
    const literal = { $ref: './not-an-input.json' }
    const spec = {
      ...specification(),
      components: {
        headers: { 'x-trace': { $ref: './header.json' } },
        links: {
          follow: {
            operationId: 'listPets',
            parameters: { payload: literal },
            requestBody: literal
          }
        }
      },
      paths: {
        'x-payload': literal,
        '/pets': {
          get: {
            operationId: 'listPets',
            responses: {
              'x-payload': literal,
              '200': {
                description: 'OK',
                headers: { 'x-trace': { $ref: '#/components/headers/x-trace' } },
                links: { follow: { $ref: '#/components/links/follow' } }
              }
            }
          }
        }
      }
    }
    const { cwd, graph } = await fixture(spec)
    await writeFile(join(cwd, 'docs/api/header.json'), '{"schema":{"type":"string"}}')
    const operation = (await graph()).pages.find((page) => page.origin?.key === 'GET /pets')!
    expect(operation.origin!.dependencies.map((dependency) => dependency.path)).toEqual([
      'docs/api/header.json',
      'docs/api/openapi.json'
    ])
  })

  it('uses default servers for an explicitly empty operation override', async () => {
    const spec = {
      ...specification(),
      servers: [{ url: 'https://example.test' }],
      paths: { '/pets': { get: { servers: [], responses: { '200': { description: 'OK' } } } } }
    }
    const { graph } = await fixture(spec)
    const operation = (await graph()).pages.find((page) => page.origin?.key === 'GET /pets')!
    expect(operation.origin!.facts).toMatchObject({ servers: [{ url: '/' }], serversSource: 'default' })
  })

  it('rejects duplicate YAML keys rather than silently choosing one declaration', async () => {
    const { cwd, source, graph } = await fixture()
    source.entry = 'docs/api/openapi.yaml'
    await writeFile(
      join(cwd, source.entry),
      'openapi: 3.1.0\ninfo:\n  title: One\n  title: Two\n  version: "1"\npaths: {}\n'
    )
    await expect(graph()).rejects.toThrow('Map keys must be unique')
  })

  it('rejects invalid versions, missing facts and malformed referenced objects', async () => {
    const { cwd, graph } = await fixture({ ...specification(), info: { title: 'No version' } })
    await expect(graph()).rejects.toThrow('`version` must be present')
    await writeFile(
      join(cwd, 'docs/api/openapi.json'),
      JSON.stringify({ ...specification(), openapi: '3.2.0' })
    )
    await expect(graph()).rejects.toThrow('Only OpenAPI')
    const spec = {
      ...specification(),
      paths: { '/pets': { get: { responses: { '200': { $ref: './invalid.json' } } } } }
    }
    await writeFile(join(cwd, 'docs/api/openapi.json'), JSON.stringify(spec))
    await writeFile(join(cwd, 'docs/api/invalid.json'), '{"notResponse":true}')
    await expect(graph()).rejects.toThrow()
    expect(await readFile(join(cwd, 'docs/api/invalid.json'), 'utf8')).toBe('{"notResponse":true}')
  })

  it('retains composition, boolean schemas and forward anchors without infinite expansion', async () => {
    const spec = {
      ...specification(),
      components: {
        schemas: {
          A: { $ref: '#node' },
          Node: {
            $anchor: 'node',
            type: 'object',
            properties: { next: { $ref: '#node' }, denied: false },
            allOf: [{ type: 'object', properties: { id: { type: ['string', 'null'] } } }]
          }
        }
      },
      paths: {
        '/pets': {
          get: {
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/A' } }
                }
              }
            }
          }
        }
      }
    }
    const { graph } = await fixture(spec)
    const page = (await graph()).pages.find((item) => item.origin?.key === 'GET /pets')!
    expect(page.origin!.facts.schemas).toHaveLength(2)
    expect(page.body).toContain('"allOf"')
    expect(page.body).toContain('"denied": false')
    expect(page.body.length).toBeLessThan(10000)
  })

  it('resolves local schema-resource identifiers without fetching their URI identifiers', async () => {
    const spec = {
      ...specification(),
      components: {
        schemas: {
          Node: {
            $id: 'https://schemas.example.invalid/node',
            type: 'object',
            properties: {
              child: { $ref: '#/properties/name' },
              name: { type: 'string' }
            }
          }
        }
      }
    }
    const { graph } = await fixture(spec)
    await expect(graph()).resolves.toBeDefined()
  })

  it('discovers local schema identifiers independently of reference declaration order', async () => {
    const { cwd, graph } = await fixture({
      ...specification(),
      components: {
        schemas: {
          First: { $ref: 'https://schemas.example.invalid/shared' },
          Later: { $ref: './shared.yaml' }
        }
      }
    })
    await writeFile(
      join(cwd, 'docs/api/shared.yaml'),
      '$id: https://schemas.example.invalid/shared\ntype: string\n'
    )
    await expect(graph()).resolves.toBeDefined()
  })

  it('intersects exact path/tag selectors without duplicating operations or accepting typos', async () => {
    const { cwd, config } = await fixture()
    config.sources = [
      openapi({
        id: 'pet-api',
        root: 'docs/api',
        entry: 'docs/api/openapi.json',
        base: '/api/',
        locale: 'zh',
        version: 'current',
        include: { paths: ['/pets'], tags: ['read', 'pets'] }
      })
    ]
    expect((await buildContentGraph(cwd, config)).pages).toHaveLength(3)
    config.sources = [
      openapi({
        id: 'pet-api',
        root: 'docs/api',
        entry: 'docs/api/openapi.json',
        base: '/api/',
        locale: 'zh',
        version: 'current',
        include: { tags: ['missing'] }
      })
    ]
    await expect(buildContentGraph(cwd, config)).rejects.toThrow('Selected tag has no matching operations')
    expect(() =>
      openapi({
        id: 'api',
        root: 'docs/api',
        entry: 'docs/api/openapi.json',
        base: '/api/',
        locale: 'zh',
        version: 'current',
        include: { paths: [] }
      })
    ).toThrow('nonempty')
  })

  it('keeps Unicode paths lossless and rejects oversized paths before emitting output', async () => {
    const path = `/宠物/${'long-name-'.repeat(10)}`
    const spec = { ...specification(), paths: { [path]: specification().paths['/pets'] } }
    const { cwd, graph } = await fixture(spec)
    const operation = (await graph()).pages.find((page) => page.origin?.key === `GET ${path}`)!
    const segments = operation.routePath.slice('/api/get/'.length, -1).split('/')
    expect(segments.every((segment) => segment.length <= 64)).toBe(true)
    expect(Buffer.from(segments.join(''), 'hex').toString('utf8')).toBe(path)
    await writeFile(
      join(cwd, 'docs/api/openapi.json'),
      JSON.stringify({
        ...specification(),
        paths: { [`/${'宠'.repeat(342)}`]: specification().paths['/pets'] }
      })
    )
    await expect(graph()).rejects.toThrow('1024 UTF-8 bytes')
  })

  it('rejects duplicate effective parameters and ambiguous Path Item reference siblings', async () => {
    const spec = {
      ...specification(),
      paths: { '/pets': { $ref: './path.yaml', get: specification().paths['/pets'].get } }
    }
    const { cwd, graph } = await fixture(spec)
    await writeFile(join(cwd, 'docs/api/path.yaml'), JSON.stringify(specification().paths['/pets']))
    await expect(graph()).rejects.toThrow('Ambiguous Path Item')
    await writeFile(
      join(cwd, 'docs/api/openapi.json'),
      JSON.stringify({
        ...specification(),
        paths: {
          '/pets': {
            get: {
              ...specification().paths['/pets'].get,
              parameters: [
                { name: 'limit', in: 'query', schema: { type: 'integer' } },
                { name: 'limit', in: 'query', schema: { type: 'integer' } }
              ]
            }
          }
        }
      })
    )
    await expect(graph()).rejects.toThrow(/Duplicate parameter|must be unique/)
  })

  it('bounds nesting and rejects cyclic YAML aliases without running validation indefinitely', async () => {
    const { cwd, source, graph } = await fixture()
    let nested: unknown = { type: 'string' }
    for (let index = 0; index < 130; index++) nested = { items: nested }
    await writeFile(
      join(cwd, source.entry),
      JSON.stringify({ ...specification(), components: { schemas: { Deep: nested } } })
    )
    await expect(graph()).rejects.toThrow(/nesting/)
    source.entry = 'docs/api/openapi.yaml'
    await writeFile(
      join(cwd, source.entry),
      'openapi: 3.1.0\ninfo: {title: Test, version: "1"}\npaths: {}\nx-data: &cycle {next: *cycle}\n'
    )
    await expect(graph()).rejects.toThrow(/cyclic YAML aliases|alias count/)
  })

  it('accepts 3.0 nullable composition without inventing a required type sibling', async () => {
    const { graph } = await fixture({
      ...specification(),
      openapi: '3.0.3',
      components: {
        schemas: { Account: { nullable: true, anyOf: [{ type: 'object' }, { type: 'string' }] } }
      }
    })
    await expect(graph()).resolves.toBeDefined()
  })

  it('reports authored YAML positions after lazily recreating diagnostic syntax', async () => {
    const { cwd, source, graph } = await fixture()
    source.entry = 'docs/api/openapi.yaml'
    await writeFile(
      join(cwd, source.entry),
      'openapi: 3.1.0\ninfo:\n  title: 42\n  version: "1"\npaths: {}\n'
    )
    await expect(graph()).rejects.toThrow(/docs\/api\/openapi\.yaml#\/info\/title:3:10:/)
  })

  it.each([
    '{"openapi":"3.1.0","openapi":"3.0.3","info":{"title":"API","version":"1"},"paths":{}}',
    '{"openapi":"3.1.0",/* comment */"info":{"title":"API","version":"1"},"paths":{}}',
    '{"openapi":"3.1.0","info":{"title":"API","version":"1"},"paths":{},}'
  ])('rejects non-strict or ambiguous JSON instead of using tolerant parser output', async (raw) => {
    const { cwd, source, graph } = await fixture()
    await writeFile(join(cwd, source.entry), raw)
    await expect(graph()).rejects.toThrow()
  })

  it('reports actual JSON value positions without allocating a YAML syntax tree', async () => {
    const { cwd, source, graph } = await fixture()
    await writeFile(
      join(cwd, source.entry),
      '{\n"openapi":"3.1.0",\n"info":{"title":42,"version":"1"},\n"paths":{}\n}'
    )
    await expect(graph()).rejects.toThrow(/docs\/api\/openapi\.json#\/info\/title:3:17:/)
  })
})
