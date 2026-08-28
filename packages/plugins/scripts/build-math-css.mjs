import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = resolve(packageRoot, 'dist')
const require = createRequire(import.meta.url)
const katexPath = require.resolve('katex/dist/katex.min.css')
let fontFallbackGroups = 0
const katex = (await readFile(katexPath, 'utf8')).replace(
  /src:url\((fonts\/[^)]+\.woff2)\) format\("woff2"\),url\(fonts\/[^)]+\.woff\) format\("woff"\),url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g,
  (_match, woff2Path) => {
    fontFallbackGroups += 1
    return `src:url(${woff2Path}) format("woff2")`
  }
)
if (fontFallbackGroups === 0) throw new Error('KaTeX font fallback rewrite matched no declarations')
if (/url\(fonts\/[^)]+\.(?:woff|ttf)\)/.test(katex))
  throw new Error('KaTeX CSS still references font formats that are not published')

const sourceFonts = resolve(dirname(katexPath), 'fonts')
const outputFonts = resolve(outputRoot, 'fonts')
await mkdir(outputRoot, { recursive: true })
await copyFile(resolve(packageRoot, 'src/diagram.css'), resolve(outputRoot, 'diagram.css'))
await writeFile(resolve(outputRoot, 'math.css'), `/* KaTeX */\n${katex}\n`)
await rm(outputFonts, { recursive: true, force: true })
await mkdir(outputFonts, { recursive: true })
for (const filename of await readdir(sourceFonts)) {
  if (filename.endsWith('.woff2'))
    await copyFile(resolve(sourceFonts, filename), resolve(outputFonts, filename))
}
