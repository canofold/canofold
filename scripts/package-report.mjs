import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execPnpmSync } from './lib/packageManager.mjs'

const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packages = [
  {
    name: '@docfuse/markdown',
    root: join(workspace, 'packages/markdown'),
    compressedBudget: 400 * 1024,
    // Declarations, file-tree icons (27 SVG), runtime chunks and CSS.
    fileCountBudget: 135
  },
  {
    name: 'docfuse',
    root: join(workspace, 'packages/docfuse'),
    compressedBudget: 192 * 1024,
    fileCountBudget: 45
  },
  {
    name: '@docfuse/plugins',
    root: join(workspace, 'packages/plugins'),
    compressedBudget: 400 * 1024,
    // Twenty KaTeX fonts plus one declaration and runtime per public plugin
    // subpath. The build intentionally emits no shared chunks or source maps.
    fileCountBudget: 50
  }
]
const temporaryRoot = await mkdtemp(join(tmpdir(), 'docfuse-package-report-'))

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
    const forbidden = files.filter((file) =>
      /(?:^|\/)(?:src|scripts|tests?)(?:\/|$)|\.test\.|tsconfig|vite\.config/.test(file)
    )
    const missingRequiredFiles = [
      'package/LICENSE',
      'package/README.md',
      'package/README.zh-CN.md',
      'package/package.json'
    ].filter((file) => !files.includes(file))
    const publishedSourceMaps = files.filter((file) => file.endsWith('.map'))

    if (compressedBytes > packageConfig.compressedBudget) {
      failures.push(
        `${packageConfig.name}: ${compressedBytes} compressed bytes exceeds ${packageConfig.compressedBudget}`
      )
    }
    if (files.length > packageConfig.fileCountBudget) {
      failures.push(`${packageConfig.name}: ${files.length} files exceeds ${packageConfig.fileCountBudget}`)
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
      files: files.length,
      fileBudget: packageConfig.fileCountBudget
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
