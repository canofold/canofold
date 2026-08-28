import { copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  createPollingWatcher,
  installSignalCleanup,
  startPackageBuildWatcher
} from './packageBuildWatcher.mjs'
import { packageFunction } from './packageModules.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const packageRoot = join(repoRoot, 'packages/docfuse')
const statePath = join(repoRoot, '.docfuse-dev/docfuse.json')
const outputRoot = join(packageRoot, 'dist')
const watchPaths = [
  join(packageRoot, 'src'),
  join(packageRoot, 'package.json'),
  join(packageRoot, 'tsconfig.json'),
  join(packageRoot, 'tsup.config.ts'),
  join(repoRoot, 'tsconfig.base.json')
]
process.chdir(packageRoot)
const require = createRequire(join(packageRoot, 'package.json'))
const tsupModule = await import(pathToFileURL(require.resolve('tsup')).href)
const tsupBuild = packageFunction(tsupModule, 'build')

const controller = await startPackageBuildWatcher({
  packageName: 'docfuse',
  statePath,
  workspaceId: process.env.DOCFUSE_DEV_WORKSPACE_ID,
  watchPaths,
  createWatcher: createPollingWatcher,
  build: async () => {
    await tsupBuild({
      config: join(packageRoot, 'tsup.config.ts'),
      dts: false,
      clean: true,
      silent: true
    })
    await copyFile(join(packageRoot, 'src/render/styles.input.css'), join(outputRoot, 'styles.input.css'))
  },
  onError: (error) => console.error('[docfuse:docfuse]', error)
})

installSignalCleanup(controller)
