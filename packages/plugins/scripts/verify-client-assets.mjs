import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const clientEntries = ['kroki', 'mermaid', 'plantuml']
const staticImportPattern = /^\s*(?:import|export)\s+(?!\()[^\n]*?\sfrom\s*['"]([^'"]+)['"]/gm
const sideEffectImportPattern = /^\s*import\s*['"]([^'"]+)['"]/gm
const literalDynamicImportPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g

for (const entry of clientEntries) {
  const filePath = resolve(`dist/client/${entry}.js`)
  const source = await readFile(filePath, 'utf8')

  const imports = [
    ...source.matchAll(staticImportPattern),
    ...source.matchAll(sideEffectImportPattern),
    ...source.matchAll(literalDynamicImportPattern)
  ].map((match) => match[1])
  const unresolvedImport = imports.find(
    (specifier) => !specifier.startsWith('http:') && !specifier.startsWith('https:')
  )

  if (unresolvedImport) {
    throw new Error(
      `${filePath} imports ${JSON.stringify(unresolvedImport)}. Client plugin assets must be self-contained.`
    )
  }
}
