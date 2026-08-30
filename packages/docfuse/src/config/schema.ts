import type { MarkdownFeatureOptions, MarkdownLabels, MarkdownPlugin } from '@docfuse/markdown'
import type {
  MarkdownThemeColors,
  MarkdownThemeGeometry,
  MarkdownThemeLayout,
  MarkdownThemeMotion,
  MarkdownThemeTypography
} from '@docfuse/markdown/theme'
import { z } from 'zod'
import { assertRoutePath, canonicalRoutePath } from '../content/routes'
import type { SearchProvider } from '../search/types'
import { THEME_BASE_COLORS } from './constants'
import { publicResourceSchema } from './publicResource'
import {
  type DocfuseLayoutLabels,
  type DocfuseConfigInput,
  type DocfuseMarkdownElementGroupId,
  type DocfuseNotFoundMessages,
  type DocfuseQuickActionMessages,
  type DocfuseJsonValue
} from './types'

type OptionalStringShape<T> = {
  [Key in keyof T]-?: z.ZodOptional<z.ZodString>
}

type OptionalBooleanShape<T> = {
  [Key in keyof T]-?: z.ZodOptional<z.ZodBoolean>
}

const themeColorsSchema = z
  .object({
    canvas: z.string().optional(),
    foreground: z.string().optional(),
    text: z.string().optional(),
    muted: z.string().optional(),
    mutedSubtle: z.string().optional(),
    surface: z.string().optional(),
    surfaceSecondary: z.string().optional(),
    surfaceSoft: z.string().optional(),
    surfaceElevated: z.string().optional(),
    border: z.string().optional(),
    borderStrong: z.string().optional(),
    hairline: z.string().optional(),
    primary: z.string().optional(),
    primarySoft: z.string().optional(),
    primaryForeground: z.string().optional(),
    primaryDeep: z.string().optional(),
    accent: z.string().optional(),
    info: z.string().optional(),
    infoDeep: z.string().optional(),
    success: z.string().optional(),
    successDeep: z.string().optional(),
    warning: z.string().optional(),
    warningDeep: z.string().optional(),
    danger: z.string().optional(),
    dangerDeep: z.string().optional(),
    codeBackground: z.string().optional(),
    codeForeground: z.string().optional(),
    overlay: z.string().optional(),
    shadow: z.string().optional(),
    shadowSmall: z.string().optional()
  } satisfies OptionalStringShape<MarkdownThemeColors>)
  .strict()
  .optional()

const themeTypographySchema = z
  .object({
    displayFont: z.string().min(1).optional(),
    sansFont: z.string().min(1).optional(),
    monoFont: z.string().min(1).optional(),
    bodySize: z.string().min(1).optional(),
    bodyLineHeight: z.string().min(1).optional(),
    headingLineHeight: z.string().min(1).optional(),
    heading1Size: z.string().min(1).optional(),
    heading2Size: z.string().min(1).optional(),
    heading3Size: z.string().min(1).optional(),
    heading4Size: z.string().min(1).optional(),
    heading5Size: z.string().min(1).optional(),
    heading6Size: z.string().min(1).optional()
  } satisfies OptionalStringShape<MarkdownThemeTypography>)
  .strict()
  .optional()

const themeLayoutSchema = z
  .object({
    readingWidth: z.string().min(1).optional(),
    contentWidth: z.string().min(1).optional(),
    gutter: z.string().min(1).optional()
  } satisfies OptionalStringShape<MarkdownThemeLayout>)
  .strict()
  .optional()

const themeGeometrySchema = z
  .object({
    radiusSmall: z.string().min(1).optional(),
    radiusMedium: z.string().min(1).optional(),
    radiusLarge: z.string().min(1).optional(),
    radiusFull: z.string().min(1).optional()
  } satisfies OptionalStringShape<MarkdownThemeGeometry>)
  .strict()
  .optional()

const themeMotionSchema = z
  .object({
    durationFast: z.string().min(1).optional(),
    durationNormal: z.string().min(1).optional(),
    easing: z.string().min(1).optional()
  } satisfies OptionalStringShape<MarkdownThemeMotion>)
  .strict()
  .optional()

const markdownThemeSchema = z
  .object({
    colors: z
      .object({
        light: themeColorsSchema,
        dark: themeColorsSchema
      })
      .strict()
      .optional(),
    typography: themeTypographySchema,
    layout: themeLayoutSchema,
    geometry: themeGeometrySchema,
    motion: themeMotionSchema
  })
  .strict()

const markdownCodeSchema = z
  .object({
    themes: z
      .object({
        light: z.string().min(1).optional(),
        dark: z.string().min(1).optional()
      })
      .strict()
      .optional(),
    fallbackLanguage: z.string().min(1).optional(),
    unknownLanguage: z.enum(['warn', 'error', 'plain-text']).optional()
  })
  .strict()

const markdownFeatureSchema = z
  .object({
    callouts: z.boolean().optional(),
    tabs: z.boolean().optional(),
    codeGroups: z.boolean().optional(),
    steps: z.boolean().optional(),
    terminals: z.boolean().optional(),
    documentBlocks: z.boolean().optional(),
    tables: z.boolean().optional(),
    codeBlocks: z.boolean().optional()
  } satisfies OptionalBooleanShape<MarkdownFeatureOptions>)
  .strict()

const markdownLabelsSchema = z
  .object({
    copyCode: z.string().optional(),
    copyFailed: z.string().optional(),
    copySnippet: z.string().optional(),
    copyTerminal: z.string().optional(),
    terminalTitle: z.string().optional(),
    tabsTitle: z.string().optional(),
    tabItem: z.string().optional(),
    codeGroupTitle: z.string().optional(),
    codeGroupItem: z.string().optional(),
    taskCompleted: z.string().optional(),
    taskIncomplete: z.string().optional(),
    copySectionLink: z.string().optional(),
    tableTitle: z.string().optional(),
    copyTableCsv: z.string().optional(),
    downloadTableCsv: z.string().optional(),
    zoomTable: z.string().optional(),
    closeTablePreview: z.string().optional(),
    sortTableColumn: z.string().optional(),
    zoomImage: z.string().optional(),
    closeImagePreview: z.string().optional(),
    imageGallery: z.string().optional(),
    closeImageGallery: z.string().optional(),
    previousGalleryImage: z.string().optional(),
    nextGalleryImage: z.string().optional(),
    galleryThumbnails: z.string().optional(),
    galleryImage: z.string().optional()
  } satisfies OptionalStringShape<MarkdownLabels>)
  .strict()

const layoutLabelsSchema = z
  .object({
    skipToContent: z.string().optional(),
    search: z.string().optional(),
    searchEmpty: z.string().optional(),
    searchUnavailable: z.string().optional(),
    language: z.string().optional(),
    primaryNavigation: z.string().optional(),
    theme: z.string().optional(),
    openSidebar: z.string().optional(),
    onThisPage: z.string().optional(),
    edit: z.string().optional(),
    updated: z.string().optional(),
    previous: z.string().optional(),
    next: z.string().optional(),
    close: z.string().optional(),
    source: z.string().optional(),
    preview: z.string().optional(),
    copySource: z.string().optional(),
    sourceCopied: z.string().optional(),
    quickActions: z.string().optional(),
    github: z.string().optional(),
    docsNavigation: z.string().optional(),
    pageNavigation: z.string().optional(),
    advertisement: z.string().optional(),
    version: z.string().optional()
  } satisfies OptionalStringShape<DocfuseLayoutLabels>)
  .strict()

const quickActionMessagesSchema = z
  .object({
    headingsTitle: z.string().optional(),
    headingsDescription: z.string().optional(),
    codeTitle: z.string().optional(),
    codeDescription: z.string().optional(),
    tableTitle: z.string().optional(),
    tableDescription: z.string().optional(),
    diagramTitle: z.string().optional(),
    diagramDescription: z.string().optional(),
    sourceDescription: z.string().optional(),
    themeDescription: z.string().optional()
  } satisfies OptionalStringShape<DocfuseQuickActionMessages>)
  .strict()

const notFoundMessagesSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    home: z.string().optional()
  } satisfies OptionalStringShape<DocfuseNotFoundMessages>)
  .strict()

const markdownElementGroupMessagesSchema = z
  .object({
    label: z.string().optional(),
    detail: z.string().optional(),
    hash: z.string().optional()
  })
  .strict()

type OptionalMarkdownElementGroupShape = {
  [Key in DocfuseMarkdownElementGroupId]-?: z.ZodOptional<typeof markdownElementGroupMessagesSchema>
}

const markdownElementGroupsSchema = z
  .object({
    headings: markdownElementGroupMessagesSchema.optional(),
    inline: markdownElementGroupMessagesSchema.optional(),
    lists: markdownElementGroupMessagesSchema.optional(),
    callouts: markdownElementGroupMessagesSchema.optional(),
    code: markdownElementGroupMessagesSchema.optional(),
    tables: markdownElementGroupMessagesSchema.optional(),
    media: markdownElementGroupMessagesSchema.optional(),
    diagrams: markdownElementGroupMessagesSchema.optional(),
    disclosure: markdownElementGroupMessagesSchema.optional(),
    extensions: markdownElementGroupMessagesSchema.optional(),
    api: markdownElementGroupMessagesSchema.optional(),
    metadata: markdownElementGroupMessagesSchema.optional()
  } satisfies OptionalMarkdownElementGroupShape)
  .strict()

const localeMessagesSchema = z
  .object({
    labels: layoutLabelsSchema.optional(),
    brandTagline: z.string().optional(),
    quickActions: quickActionMessagesSchema.optional(),
    markdownElementGroups: markdownElementGroupsSchema.optional(),
    markdown: markdownLabelsSchema.optional(),
    notFound: notFoundMessagesSchema.optional()
  })
  .strict()

const absoluteRouteSchema = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      assertRoutePath(value)
      return true
    } catch {
      return false
    }
  }, 'Route must be a safe absolute path')
  .transform(canonicalRoutePath)

const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value)
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
  }, 'URL must use HTTP(S) without credentials, a query, or a hash')

const siteOriginSchema = httpUrlSchema.refine((value) => new URL(value).pathname === '/', {
  message: 'siteUrl must be an HTTP(S) origin without a path'
})

const versionIdSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/, 'Version id must be a safe portable slug')

const searchSchema = z
  .object({
    enabled: z.boolean().optional(),
    provider: z
      .union([
        z.literal('compact'),
        z.custom<SearchProvider>(
          (value) =>
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value) &&
            typeof (value as { id?: unknown }).id === 'string' &&
            ((value as { client?: unknown }).client === 'compact' ||
              (value as { client?: unknown }).client === 'pagefind') &&
            typeof (value as { write?: unknown }).write === 'function',
          'search.provider must be compact or a SearchProvider object'
        )
      ])
      .optional()
  })
  .strict()

const jsonValueSchema: z.ZodType<DocfuseJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema)
  ])
)

const markdownPluginNamePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

// Plugin entries carry remark/rehype functions, so a structural custom check
// replaces a strict object schema here. Deep validation happens in the
// Markdown compiler's normalizeOptions.
const markdownPluginSchema = z.custom<MarkdownPlugin>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { name?: unknown }).name === 'string' &&
    markdownPluginNamePattern.test((value as { name: string }).name),
  'markdown.plugins entries must be plugin objects with a lowercase kebab-case name'
)

const extensionSchema = z
  .object({
    resolve: z
      .string()
      .min(1)
      .regex(/^\.[\\/]/, 'Extension resolve must be a project-relative path beginning with ./'),
    options: z.record(z.string(), jsonValueSchema).optional()
  })
  .strict()

export const configInputSchema: z.ZodType<DocfuseConfigInput> = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    siteUrl: siteOriginSchema.optional(),
    basePath: absoluteRouteSchema
      .refine((value) => value.endsWith('/'), 'basePath must end with /')
      .optional(),
    editUrl: httpUrlSchema.optional(),
    github: httpUrlSchema.optional(),
    requiredVersion: z.string().optional(),
    docsDir: z.string().optional(),
    outputDir: z.string().optional(),
    styles: z.array(z.string().min(1)).optional(),
    layout: z
      .object({
        header: z.boolean().optional()
      })
      .strict()
      .optional(),
    markdown: z
      .object({
        html: z.enum(['trusted', 'sanitize', 'strip']).optional(),
        code: markdownCodeSchema.optional(),
        features: markdownFeatureSchema.optional(),
        labels: markdownLabelsSchema.optional(),
        plugins: z.array(markdownPluginSchema).optional()
      })
      .strict()
      .optional(),
    theme: z
      .object({
        logo: publicResourceSchema.optional(),
        logoDark: publicResourceSchema.optional(),
        favicon: publicResourceSchema.optional(),
        accentColor: z.string().optional(),
        darkMode: z.boolean().optional(),
        radius: z.union([z.number(), z.string()]).optional(),
        baseColor: z.enum(THEME_BASE_COLORS).optional(),
        sidebarWidth: z.union([z.number(), z.string()]).optional(),
        outlineWidth: z.union([z.number(), z.string()]).optional(),
        tokens: markdownThemeSchema.optional()
      })
      .strict()
      .optional(),
    search: searchSchema.optional(),
    extensions: z.array(extensionSchema).optional(),
    navigation: z
      .record(
        z.string(),
        z.array(
          z
            .object({
              text: z.string().min(1),
              link: publicResourceSchema
            })
            .strict()
        )
      )
      .optional(),
    versions: z
      .object({
        current: versionIdSchema,
        items: z
          .array(
            z
              .object({
                id: versionIdSchema,
                label: z.string().min(1),
                docsDir: z.string().min(1),
                base: absoluteRouteSchema
              })
              .strict()
          )
          .min(1)
      })
      .strict()
      .optional(),
    redirects: z.record(absoluteRouteSchema, absoluteRouteSchema).optional(),
    advertising: z
      .object({
        image: publicResourceSchema,
        href: publicResourceSchema,
        alt: z.string().min(1),
        label: z.string().min(1).optional()
      })
      .strict()
      .optional(),
    i18n: z
      .object({
        defaultLocale: z.string().optional(),
        locales: z.array(z.string().min(1)).min(1).optional(),
        localeNames: z.record(z.string(), z.string().min(1)).optional(),
        messages: z.record(z.string(), localeMessagesSchema).optional()
      })
      .strict()
      .optional(),
    ai: z
      .object({
        llmsTxt: z.boolean().optional(),
        llmsFullTxt: z.boolean().optional(),
        markdownIndex: z.boolean().optional(),
        pageSummaries: z.boolean().optional(),
        codeExamples: z.boolean().optional(),
        chunkSizeBytes: z
          .number()
          .int()
          .min(16 * 1024)
          .max(4 * 1024 * 1024)
          .optional(),
        llmsFullMaxBytes: z
          .number()
          .int()
          .min(16 * 1024)
          .max(1024 * 1024 * 1024)
          .optional(),
        llmsFullOverflow: z.enum(['manifest', 'error']).optional(),
        versions: z.enum(['current', 'all']).optional()
      })
      .strict()
      .optional()
  })
  .strict()
