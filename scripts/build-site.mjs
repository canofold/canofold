import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)))
const args = ['build', ...process.argv.slice(2)]

execFileSync(process.execPath, [join(workspace, 'packages/canofold/dist/cli.js'), ...args], {
  cwd: join(workspace, 'site'),
  stdio: 'inherit'
})
