export const CHECK_RULE_IDS = [
  'code-block-language',
  'directive-syntax',
  'frontmatter-title',
  'frontmatter-description',
  'broken-link',
  'broken-image',
  'broken-heading',
  'duplicate-heading',
  'missing-translation',
  'stale-translation'
] as const

export type CheckRuleId = (typeof CHECK_RULE_IDS)[number]
export type CheckRuleLevel = 'off' | 'warning' | 'error'
