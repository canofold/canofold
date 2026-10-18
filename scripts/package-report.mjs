import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execPnpmSync } from './lib/packageManager.mjs'

const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packages = [
  {
    name: '@canofold/themes',
    root: join(workspace, 'packages/themes'),
    compressedBudget: 24 * 1024,
    cssSourcePackage: true
  },
  {
    name: '@canofold/markdown',
    root: join(workspace, 'packages/markdown'),
    compressedBudget: 400 * 1024
  },
  {
    name: 'canofold',
    root: join(workspace, 'packages/canofold'),
    compressedBudget: 192 * 1024
  },
  {
    name: '@canofold/vite',
    root: join(workspace, 'packages/vite'),
    compressedBudget: 32 * 1024
  },
  {
    name: '@canofold/plugins',
    root: join(workspace, 'packages/plugins'),
    compressedBudget: 400 * 1024
  }
]
const temporaryRoot = await mkdtemp(join(tmpdir(), 'canofold-package-report-'))

try {
  const rows = []
  const failures = []

  for (const packageConfig of packages) {
    const manifest = JSON.parse(await readFile(join(packageConfig.root, 'package.json'), 'utf8'))
    const destination = join(temporaryRoot, packageConfig.name.replaceAll('/', '-'))
    await mkdir(destination)
    execPnpmSync(['pack', '--pack-destination', destination], {
      cwd: packageConfig.root,
      stdio: 'pipe'
    })
    const tarballName = (await readdir(destination)).find((name) => name.endsWith('.tgz'))
    if (!tarballName) throw new Error(`${packageConfig.name} tarball was not created`)

    const tarball = join(destination, tarballName)
    const compressedBytes = (await stat(tarball)).size
    const files = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean)
    const forbidden = files.filter((file) => {
      if (packageConfig.cssSourcePackage && /^package\/src\/.*\.css$/.test(file)) return false
      return /(?:^|\/)(?:src|scripts|tests?)(?:\/|$)|\.test\.|tsconfig|vite\.config/.test(file)
    })
    const missingRequiredFiles = [
      'package/LICENSE',
      'package/README.md',
      'package/README.zh-CN.md',
      'package/package.json'
    ].filter((file) => !files.includes(file))
    const publishedSourceMaps = files.filter((file) => file.endsWith('.map'))
    // Count is informational: public entries, shared chunks and required assets
    // determine the package layout, not an arbitrary maximum number of files.
    const exportTargets = new Set(
      Object.values(manifest.exports ?? {}).flatMap((target) =>
        typeof target === 'string' ? [target] : Object.values(target)
      )
    )
    for (const target of exportTargets) {
      if (!files.includes(posix.join('package', target))) {
        failures.push(`${packageConfig.name}: published export target is missing: ${target}`)
      }
    }
    for (const file of files.filter((file) => file.endsWith('.js'))) {
      const source = execFileSync('tar', ['-xOf', tarball, file], { encoding: 'utf8' })
      for (const [, reference] of source.matchAll(/^\/\/# sourceMappingURL=(.+)$/gm)) {
        if (!reference.startsWith('data:') && !files.includes(posix.join(posix.dirname(file), reference))) {
          failures.push(`${packageConfig.name}: ${file} references missing source map ${reference}`)
        }
      }
    }

    if (compressedBytes > packageConfig.compressedBudget) {
      failures.push(
        `${packageConfig.name}: ${compressedBytes} compressed bytes exceeds ${packageConfig.compressedBudget}`
      )
    }
    if (forbidden.length) {
      failures.push(`${packageConfig.name}: unexpected implementation files: ${forbidden.join(', ')}`)
    }
    if (missingRequiredFiles.length) {
      failures.push(`${packageConfig.name}: missing package files: ${missingRequiredFiles.join(', ')}`)
    }
    if (publishedSourceMaps.length) {
      failures.push(`${packageConfig.name}: published source maps: ${publishedSourceMaps.join(', ')}`)
    }
    if (!manifest.homepage || !manifest.repository?.url || !manifest.bugs?.url) {
      failures.push(`${packageConfig.name}: homepage, repository, and bugs metadata are required`)
    }

    rows.push({
      package: packageConfig.name,
      compressedKB: (compressedBytes / 1024).toFixed(2),
      budgetKB: (packageConfig.compressedBudget / 1024).toFixed(2),
      files: files.length
    })
  }

  console.table(rows)

  if (failures.length) {
    console.error('\nPackage budget failed:')
    failures.forEach((failure) => console.error(`- ${failure}`))
    process.exitCode = 1
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
