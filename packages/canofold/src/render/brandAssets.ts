import { access, copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveOutputPath } from '../utils/paths'
import { BUILT_IN_BRAND_OUTPUT_PATHS } from '../brand'

async function brandSourceRoot() {
  const candidates = [
    fileURLToPath(new URL('../assets/brand/', import.meta.url)),
    fileURLToPath(new URL('./brand/', import.meta.url))
  ]
  for (const candidate of candidates) {
    try {
      await access(join(candidate, 'logo-light.webp'))
      return candidate
    } catch {
      // Source builds and published builds keep the same assets in different relative locations.
    }
  }
  throw new Error('Canofold built-in brand assets are missing')
}

export async function copyBuiltInBrandAssets(outputRoot: string) {
  const sourceRoot = await brandSourceRoot()
  await Promise.all(
    BUILT_IN_BRAND_OUTPUT_PATHS.map(async (outputPath) => {
      const target = resolveOutputPath(outputRoot, outputPath, `built-in brand asset ${outputPath}`)
      await mkdir(dirname(target), { recursive: true })
      await copyFile(join(sourceRoot, outputPath.split('/').at(-1)!), target)
    })
  )
}
