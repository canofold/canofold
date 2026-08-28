import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = resolve(packageRoot, 'src')
const outputRoot = resolve(packageRoot, 'dist')
const tokens = await readFile(resolve(sourceRoot, 'tokens.css'), 'utf8')
const sourceFileIcons = resolve(sourceRoot, 'assets/file-icons')
const outputFileIcons = resolve(outputRoot, 'file-icons')
await mkdir(outputRoot, { recursive: true })
await writeFile(resolve(outputRoot, 'theme.css'), tokens)
await rm(resolve(outputRoot, 'math.css'), { force: true })
await rm(resolve(outputRoot, 'fonts'), { recursive: true, force: true })
await rm(outputFileIcons, { recursive: true, force: true })
await mkdir(outputFileIcons, { recursive: true })
for (const filename of await readdir(sourceFileIcons)) {
  await copyFile(resolve(sourceFileIcons, filename), resolve(outputFileIcons, filename))
}
