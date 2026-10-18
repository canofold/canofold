import type { ContentSource, SourceDocument } from 'canofold'
import {
  OpenApiDocument,
  object,
  pointerToken,
  fieldLocation,
  type Json,
  type Location,
  type ObjectValue
} from './document'

export interface OpenApiOptions {
  id: string
  entry: string
  root: string
  version: string
  locale: string
  base: string
  /** Exact API paths and/or tags. When both are set, both must match. */
  include?: { paths?: string[]; tags?: string[] }
}

const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const
const text = (value: Json | undefined) => (typeof value === 'string' ? value : '')
const array = (value: Json | undefined): Json[] => (Array.isArray(value) ? value : [])
const strings = (value: Json | undefined) =>
  array(value).filter((item): item is string => typeof item === 'string')
const escape = (value: string) => value.replace(/[\\`*_{}\[\]<>()#+.!|:~&$-]/g, '\\$&')

function jsonBlock(value: Json) {
  const content = JSON.stringify(value, null, 2)
  let length = 3
  for (const match of content.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1)
  const fence = '`'.repeat(length)
  return `${fence}json\n${content}\n${fence}`
}

/** Lossless portable encoding: title, operationId, tags and discovery order cannot move a URL. */
function operationPath(method: string, path: string) {
  if (Buffer.byteLength(path) > 1024) throw new Error('OpenAPI path exceeds 1024 UTF-8 bytes')
  const encoded = Buffer.from(path, 'utf8').toString('hex')
  return `${method}/${encoded.match(/.{1,64}/g)!.join('/')}/`
}

function labels(locale: string) {
  return locale === 'zh'
    ? {
        overview: '接口概览',
        version: 'API 版本',
        parameters: '参数',
        request: '请求体',
        responses: '响应',
        security: '认证要求',
        servers: '服务器',
        schemes: '认证方案',
        deprecated: '此接口已弃用。',
        none: '规范未声明。',
        public: '无需认证。',
        references: '来源引用',
        schemas: '引用的数据结构',
        name: '名称',
        location: '位置',
        required: '必填',
        description: '说明',
        yes: '是',
        no: '否'
      }
    : {
        overview: 'API overview',
        version: 'API version',
        parameters: 'Parameters',
        request: 'Request body',
        responses: 'Responses',
        security: 'Security requirements',
        servers: 'Servers',
        schemes: 'Security schemes',
        deprecated: 'This operation is deprecated.',
        none: 'Not declared in the specification.',
        public: 'No authentication required.',
        references: 'Source references',
        schemas: 'Referenced schemas',
        name: 'Name',
        location: 'In',
        required: 'Required',
        description: 'Description',
        yes: 'Yes',
        no: 'No'
      }
}

function selection(options: OpenApiOptions) {
  for (const [key, items] of Object.entries(options.include ?? {})) {
    if (
      !['paths', 'tags'].includes(key) ||
      !Array.isArray(items) ||
      !items.length ||
      items.some((item) => typeof item !== 'string' || !item.trim()) ||
      new Set(items).size !== items.length
    ) {
      throw new Error('openapi include must contain nonempty, unique paths/tags arrays')
    }
  }
}

/** Official local-only content adapter. It is not a Markdown plugin or a request-execution client. */
export function openapi(input: OpenApiOptions): ContentSource {
  const options: OpenApiOptions = structuredClone(input)
  selection(options)
  return {
    id: options.id,
    root: options.root,
    entry: options.entry,
    version: options.version,
    locale: options.locale,
    base: options.base,
    kind: 'openapi',
    revision: '1',
    cacheKey: options.include ?? {},
    async load(context) {
      const document = new OpenApiDocument(context)
      const entry = await document.open()
      const title = text(object(entry.value.info).title)
      const apiVersion = text(object(entry.value.info).version)
      const copy = labels(options.locale)
      const operations: SourceDocument[] = []
      const matchedPaths = new Set<string>()
      const matchedTags = new Set<string>()
      const schemes: ObjectValue = Object.create(null)
      for (const [name, value] of Object.entries(object(object(entry.value.components).securitySchemes))) {
        schemes[name] = (
          await document.resolve(value, {
            ...entry.location,
            pointer: `/components/securitySchemes/${pointerToken(name)}`
          })
        ).value
      }
      let generatedBytes = 0
      for (const [path, item] of Object.entries(object(entry.value.paths)).sort(([a], [b]) =>
        a.localeCompare(b)
      )) {
        if (!path.startsWith('/')) continue
        const pathLocation = { ...entry.location, pointer: `/paths/${pointerToken(path)}` }
        const pathItem = await document.resolve(item, pathLocation, true)
        for (const method of methods) {
          const operation = object(pathItem.value[method])
          if (!pathItem.value[method]) continue
          const tags = strings(operation.tags)
          if (options.include?.paths && !options.include.paths.includes(path)) continue
          if (options.include?.tags && !options.include.tags.some((tag) => tags.includes(tag))) continue
          matchedPaths.add(path)
          tags.forEach((tag) => matchedTags.add(tag))
          const operationLocation: Location = fieldLocation(pathItem, method)
          const parameters = new Map<string, ObjectValue>()
          for (const owner of [pathItem, { value: operation, location: operationLocation }]) {
            const declared = new Set<string>()
            for (const [index, parameter] of array(owner.value.parameters).entries()) {
              const resolved = await document.resolve(parameter, {
                ...fieldLocation(owner, 'parameters'),
                pointer: `${fieldLocation(owner, 'parameters').pointer}/${index}`
              })
              const key = JSON.stringify([resolved.value.in, resolved.value.name])
              if (declared.has(key))
                document.fail('Duplicate parameter in the same declaration', resolved.location)
              declared.add(key)
              parameters.set(key, resolved.value)
            }
          }
          const requestBody =
            operation.requestBody === undefined
              ? undefined
              : (
                  await document.resolve(operation.requestBody, {
                    ...operationLocation,
                    pointer: `${operationLocation.pointer}/requestBody`
                  })
                ).value
          const responses: ObjectValue = Object.create(null)
          for (const [status, response] of Object.entries(object(operation.responses))) {
            if (status.startsWith('x-')) {
              responses[status] = response
              continue
            }
            responses[status] = (
              await document.resolve(response, {
                ...operationLocation,
                pointer: `${operationLocation.pointer}/responses/${pointerToken(status)}`
              })
            ).value
          }
          const security = operation.security ?? entry.value.security ?? []
          for (const requirement of array(security)) {
            for (const name of Object.keys(object(requirement))) {
              if (!Object.hasOwn(schemes, name))
                document.fail(`Unknown security scheme: ${name}`, operationLocation)
            }
          }
          const declaredServers = operation.servers ?? pathItem.value.servers ?? entry.value.servers
          const servers = array(declaredServers).length ? declaredServers! : [{ url: '/' }]
          const serversSource = !array(declaredServers).length
            ? 'default'
            : operation.servers !== undefined
              ? 'operation'
              : pathItem.value.servers !== undefined
                ? 'path'
                : entry.value.servers !== undefined
                  ? 'document'
                  : 'default'
          const effective = {
            ...operation,
            parameters: [...parameters.values()],
            responses,
            ...(declaredServers !== undefined ? { servers: declaredServers } : {}),
            ...(requestBody ? { requestBody } : {})
          }
          await document.validate(
            {
              openapi: entry.value.openapi!,
              info: entry.value.info!,
              components: { securitySchemes: schemes },
              paths: { [path]: { [method]: effective } }
            },
            operationLocation,
            true
          )
          const schemas = document.schemasFor([operationLocation, fieldLocation(pathItem, 'parameters')])
          const usedSchemes = Object.fromEntries(
            [...new Set(array(security).flatMap((requirement) => Object.keys(object(requirement))))].map(
              (name) => [name, schemes[name]!]
            )
          )
          const operationTitle = `${method.toUpperCase()} ${path}`
          const summary = text(operation.summary)
          const description = text(operation.description)
          const facts: ObjectValue = {
            type: 'operation',
            method: method.toUpperCase(),
            path,
            apiVersion,
            ...(operation.operationId !== undefined ? { operationId: operation.operationId } : {}),
            summary,
            description,
            tags,
            deprecated: operation.deprecated === true,
            parameters: [...parameters.values()],
            ...(requestBody ? { requestBody } : {}),
            responses,
            security,
            securitySchemes: usedSchemes,
            servers,
            serversSource,
            provenance: document.display(operationLocation),
            schemas
          }
          const sections = [
            `# ${escape(operationTitle)}`,
            ...(summary ? [escape(summary)] : []),
            ...(description ? [escape(description)] : []),
            ...(facts.deprecated ? [copy.deprecated] : []),
            `## ${copy.parameters}`,
            ...(parameters.size
              ? [
                  `| ${copy.name} | ${copy.location} | ${copy.required} | ${copy.description} |\n| --- | --- | --- | --- |\n` +
                    [...parameters.values()]
                      .map(
                        (parameter) =>
                          `| ${escape(text(parameter.name))} | ${escape(text(parameter.in))} | ${parameter.required === true ? copy.yes : copy.no} | ${escape(text(parameter.description)).replace(/\r?\n/g, ' ')} |`
                      )
                      .join('\n'),
                  jsonBlock([...parameters.values()])
                ]
              : [copy.none]),
            `## ${copy.request}`,
            requestBody ? jsonBlock(requestBody) : copy.none,
            `## ${copy.responses}`,
            jsonBlock(responses),
            `## ${copy.security}`,
            array(security).length ? jsonBlock(security) : copy.public,
            ...(Object.keys(usedSchemes).length ? [`## ${copy.schemes}`, jsonBlock(usedSchemes)] : []),
            `## ${copy.servers}`,
            jsonBlock(servers),
            `## ${copy.references}`,
            escape(document.display(operationLocation)),
            ...(schemas.length ? [`## ${copy.schemas}`, ...schemas.map((schema) => jsonBlock(schema))] : [])
          ]
          const body = sections.join('\n\n') + '\n'
          generatedBytes += Buffer.byteLength(body) + Buffer.byteLength(JSON.stringify(facts))
          if (operations.length >= 10_000 || generatedBytes > 64 * 1024 * 1024)
            document.fail('Derived OpenAPI output exceeds resource limits', operationLocation)
          operations.push({
            key: `${method.toUpperCase()} ${path}`,
            path: operationPath(method, path),
            pointer: Object.hasOwn(object(item), method)
              ? `${pathLocation.pointer}/${method}`
              : pathLocation.pointer,
            title: operationTitle,
            description: summary || description || operationTitle,
            tags,
            group: tags[0],
            body,
            facts
          })
        }
      }
      for (const path of options.include?.paths ?? [])
        if (!matchedPaths.has(path))
          document.fail(`Selected path has no matching operations: ${path}`, entry.location)
      for (const tag of options.include?.tags ?? [])
        if (!matchedTags.has(tag))
          document.fail(`Selected tag has no matching operations: ${tag}`, entry.location)
      const overview: SourceDocument = {
        key: 'overview',
        path: '',
        pointer: '',
        title,
        description: text(object(entry.value.info).description) || `${title} — ${copy.overview}`,
        order: -1,
        tags: [],
        body:
          [
            `# ${escape(title)}`,
            `${copy.version}: ${escape(apiVersion)}`,
            ...(text(object(entry.value.info).description)
              ? [escape(text(object(entry.value.info).description))]
              : []),
            ...operations.map(
              (operation) => `- [${escape(operation.title)}](${context.routeBase}${operation.path})`
            )
          ].join('\n\n') + '\n',
        facts: { type: 'overview', info: object(entry.value.info), operationCount: operations.length }
      }
      return [overview, ...operations]
    }
  }
}
