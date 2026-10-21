/** One long technical document, not many small pages or blank padding. */
export function createReadingDocument(sections) {
  const blocks = Array.from({ length: sections }, (_, index) => {
    const description =
      '真实技术文档包含 **强调**、[站内链接](/)、`inline code`，以及 English API descriptions。读取和更新应当保留内容完整性。'
    const code = Array.from(
      { length: 16 },
      (_, line) =>
        `export const value${index}_${line} = { label: 'Document ${index}', enabled: true, count: ${line} }`
    ).join('\n')
    const rows = Array.from(
      { length: 8 },
      (_, row) => `| Item ${index}-${row} | ${row} | Technical data |`
    ).join('\n')
    return `## Section ${index}

${description.repeat(6)}

\`\`\`ts
${code}
\`\`\`

| Name | Value | Description |
| --- | --- | --- |
${rows}

- First item
- Second item
  - Nested detail

:::tip Reading contract
Keep the complete document searchable and selectable.
:::
`
  })
  return `---
title: Long ${sections}
description: Technical Markdown reading benchmark
---

# Long ${sections}

${blocks.join('\n')}
End marker ${sections}
`
}
