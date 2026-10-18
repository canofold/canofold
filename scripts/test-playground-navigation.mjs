import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execPnpmSync } from './lib/packageManager.mjs'
import { writeNavigationFixture } from './lib/navigationFixture.mjs'

const workspace = fileURLToPath(new URL('..', import.meta.url))
const playground = resolve(process.argv[2] ?? join(workspace, '../vite-component-playground'))
const cli = join(playground, 'node_modules/canofold/dist/cli.js')
await mkdir(join(playground, '.canofold'), { recursive: true })
const site = await mkdtemp(join(playground, '.canofold/navigation-'))
try {
  await writeNavigationFixture(site)
  execFileSync(process.execPath, [cli, 'build', '--no-cache'], { cwd: site, stdio: 'inherit' })
  execPnpmSync(['exec', 'playwright', 'test', ...process.argv.slice(3)], {
    cwd: workspace,
    stdio: 'inherit',
    env: {
      ...process.env,
      CANOFOLD_NAVIGATION_SITE: site,
      CANOFOLD_NAVIGATION_CLI: cli,
      CANOFOLD_NAVIGATION_MODE: 'playground'
    }
  })
} finally {
  await rm(site, { recursive: true, force: true })
}
