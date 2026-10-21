import { z } from 'zod'
import { LineCounter, parseDocument } from 'yaml'
import { publicResourceSchema } from '../config/publicResource'

/** Read the documented YAML header; never evaluate executable frontmatter. */
export function parseFrontmatter(input: string): { data: unknown; content: string } {
  const source = input.replace(/^\uFEFF/, '')
  const start = /^---[\t ]*\r?\n/.exec(source)
  if (!start) return { data: {}, content: source }
  const remaining = source.slice(start[0].length)
  const end = /^(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/m.exec(remaining)
  if (!end) throw new SyntaxError('Unterminated YAML frontmatter')
  const lineCounter = new LineCounter()
  const document = parseDocument(remaining.slice(0, end.index), {
    merge: true,
    lineCounter,
    prettyErrors: false
  })
  if (document.errors.length) {
    const error = document.errors[0]!
    const position = lineCounter.linePos(error.pos[0])
    throw Object.assign(new SyntaxError(error.message, { cause: error }), {
      line: position.line + 1,
      column: position.col
    })
  }
  try {
    return {
      data: document.toJS({ maxAliasCount: 100 }) ?? {},
      content: remaining.slice(end.index + end[0].length)
    }
  } catch (error) {
    // YAML reports unresolved/excessive aliases while materializing the data.
    // These are authored failures too, not a crashed tool or plugin.
    if (error instanceof ReferenceError) throw new SyntaxError(error.message, { cause: error })
    throw error
  }
}

export const homeIconNames = [
  'ai',
  'box',
  'code',
  'file',
  'file-code',
  'gauge',
  'globe',
  'layers',
  'rocket',
  'search',
  'sparkles',
  'terminal'
] as const

export type HomeIconName = (typeof homeIconNames)[number]

export interface CanofoldFrontmatter {
  title?: string
  seoTitle?: string
  description?: string
  createdAt?: string
  updatedAt?: string
  order?: number
  group?: string
  subgroup?: string
  collapsed?: boolean
  sidebar?: boolean
  layout?: 'document' | 'playground'
  status?: 'draft' | 'published'
  search?: boolean
  ai?: boolean
  tags?: string[]
  owner?: string
  /** Hash of the default-locale source content when this translation was reviewed. */
  translation?: { sourceHash: string }
  hero?: {
    accent?: string
    tagline?: string
    image?: string
    imageAlt?: string
    actions?: Array<{ text: string; link: string; primary?: boolean; icon?: HomeIconName }>
  }
  features?: Array<{
    icon?: HomeIconName
    image?: string
    title: string
    details: string
  }>
  [key: string]: unknown
}

const heroActionSchema = z
  .object({
    text: z.string().min(1),
    link: publicResourceSchema,
    primary: z.boolean().optional(),
    icon: z.enum(homeIconNames).optional()
  })
  .strict()

const heroSchema = z
  .object({
    accent: z.string().optional(),
    tagline: z.string().optional(),
    image: publicResourceSchema.optional(),
    imageAlt: z.string().optional(),
    actions: z
      .array(heroActionSchema)
      .refine((actions) => actions.filter((action) => action.primary).length <= 1, {
        message: 'Home page hero actions can contain at most one primary action'
      })
      .optional()
  })
  .strict()

const featureSchema = z
  .object({
    icon: z.enum(homeIconNames).optional(),
    image: publicResourceSchema.optional(),
    title: z.string().min(1),
    details: z.string().min(1)
  })
  .strict()

const isoDateSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      z.string().date().safeParse(value).success ||
      z.string().datetime({ offset: true }).safeParse(value).success,
    'Expected an ISO 8601 date'
  )

const frontmatterDateSchema = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString() : value),
  isoDateSchema.transform((value) => new Date(value).toISOString())
)

export const frontmatterSchema = z
  .object({
    title: z.string().optional(),
    seoTitle: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    createdAt: frontmatterDateSchema.optional(),
    updatedAt: frontmatterDateSchema.optional(),
    order: z.number().finite().optional(),
    group: z.string().optional(),
    subgroup: z.string().optional(),
    collapsed: z.boolean().optional(),
    sidebar: z.boolean().optional(),
    layout: z.enum(['document', 'playground']).optional(),
    status: z.enum(['draft', 'published']).optional(),
    search: z.boolean().optional(),
    ai: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    owner: z.string().optional(),
    translation: z
      .object({ sourceHash: z.string().regex(/^sha256:[a-f0-9]{64}$/) })
      .strict()
      .optional(),
    hero: heroSchema.optional(),
    features: z.array(featureSchema).optional()
  })
  .passthrough()

export function publicFrontmatterFor(frontmatter: CanofoldFrontmatter) {
  const keys = [
    'title',
    'description',
    'createdAt',
    'updatedAt',
    'order',
    'group',
    'subgroup',
    'tags',
    'owner'
  ] as const
  return Object.fromEntries(
    keys.flatMap((key) => (frontmatter[key] === undefined ? [] : [[key, frontmatter[key]]]))
  )
}
