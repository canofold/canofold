import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  createPollingWatcher,
  installSignalCleanup,
  runCommand,
  startIncrementalBuildState
} from './packageBuildWatcher.mjs'
import { packageFunction } from './packageModules.mjs'
import { packageManagerInvocationFor } from '../lib/packageManager.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const packageRoot = join(repoRoot, 'packages/markdown')
const statePath = join(repoRoot, '.canofold-dev/markdown.json')
const require = createRequire(join(packageRoot, 'package.json'))
const viteRoot = dirname(require.resolve('vite/package.json'))
const viteModule = await import(pathToFileURL(join(viteRoot, 'dist/node/index.js')).href)
const viteBuild = packageFunction(viteModule, 'build')
const stateController = await startIncrementalBuildState({
  packageName: 'markdown',
  statePath,
  workspaceId: process.env.CANOFOLD_DEV_WORKSPACE_ID,
  settleMs: 500,
  onError: (error) => console.error('[canofold:markdown]', error)
})

function connectViteWatcher(watcher, task) {
  watcher.on('event', (event) => {
    if (event.code === 'START') stateController.start(task)
    if (event.code === 'END') stateController.succeed(task)
    if (event.code === 'ERROR') stateController.fail(task, event.error)
    if (event.code === 'BUNDLE_END') {
      void event.result.close().catch((error) => stateController.fail(task, error))
    }
  })
  return watcher
}

async function startViteWatcher(configFile, task) {
  const result = await viteBuild({
    root: packageRoot,
    configFile,
    mode: 'development',
    logLevel: 'warn',
    build: {
      emptyOutDir: false,
      // Development output shares the publishable dist directory. Keeping
      // source maps here would leak them into pnpm pack while dev is running.
      sourcemap: false,
      watch: {
        chokidar: {
          usePolling: true,
          interval: 250
        }
      }
    }
  })
  if (!('on' in result) || !('close' in result)) {
    throw new Error(`Vite did not create a watcher for ${task}`)
  }
  return connectViteWatcher(result, task)
}

function createCssScheduler(build) {
  let active
  let pending = false
  let closed = false
  const launch = () => {
    if (closed) return Promise.resolve()
    if (active) {
      pending = true
      return active
    }
    active = (async () => {
      stateController.start('css')
      try {
        await build()
        stateController.succeed('css')
      } catch (error) {
        stateController.fail('css', error)
      } finally {
        active = undefined
        if (pending && !closed) {
          pending = false
          void launch()
        }
      }
    })()
    return active
  }
  return {
    start: launch,
    schedule() {
      if (active) pending = true
      else void launch()
    },
    async close() {
      closed = true
      pending = false
      await active
    }
  }
}

const cssScheduler = createCssScheduler(async () => {
  const pnpm = packageManagerInvocationFor([
    '--dir',
    packageRoot,
    'exec',
    'tailwindcss',
    '-i',
    './src/tailwind.css',
    '-o',
    './dist/base.css',
    '--minify'
  ])
  await runCommand(pnpm.command, pnpm.args, { cwd: repoRoot })
  await runCommand(process.execPath, [join(packageRoot, 'scripts/build-css.mjs')], { cwd: repoRoot })
})
let cssWatcher
const viteWatchers = []
try {
  cssWatcher = await createPollingWatcher([join(packageRoot, 'src')])
  cssWatcher.on('all', () => cssScheduler.schedule())
  cssWatcher.on('error', (error) => stateController.fail('css', error))
  viteWatchers.push(await startViteWatcher(join(packageRoot, 'vite.config.ts'), 'library'))
  viteWatchers.push(await startViteWatcher(join(packageRoot, 'vite.client.config.ts'), 'client'))
  await cssScheduler.start()
} catch (error) {
  stateController.fail('startup', error)
  await cssWatcher?.close()
  await Promise.all(viteWatchers.map((watcher) => watcher.close()))
  await cssScheduler.close()
  await stateController.close()
  throw error
}

const controller = {
  invalidateState: () => stateController.invalidateState(),
  async close() {
    await cssWatcher?.close()
    await Promise.all(viteWatchers.map((watcher) => watcher.close()))
    await cssScheduler.close()
    await stateController.close()
  }
}

installSignalCleanup(controller)
