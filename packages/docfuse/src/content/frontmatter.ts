import { z } from 'zod'
import { publicResourceSchema } from '../config/publicResource'

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

export interface DocfuseFrontmatter {
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
    hero: heroSchema.optional(),
    features: z.array(featureSchema).optional()
  })
  .passthrough()

export function publicFrontmatterFor(frontmatter: DocfuseFrontmatter) {
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
