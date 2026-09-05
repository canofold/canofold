import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { runDeploy } from './deploy'

describe('runDeploy', () => {
  it('writes static deployment guidance', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-deploy-'))
    await mkdir(join(cwd, '.canofold/dist'), { recursive: true })
    await writeFile(join(cwd, '.canofold/dist/index.html'), '<!doctype html>')
    await runDeploy({ cwd })

    const guide = await readFile(join(cwd, '.canofold/deploy/README.md'), 'utf8')
    expect(guide).toContain('.canofold/dist')
    expect(guide).toContain('Cloudflare Pages')
    expect(guide).toContain('Canofold does not provide hosting')
    expect(await readFile(join(cwd, '.canofold/deploy/vercel.json'), 'utf8')).toContain('"outputDirectory"')
    expect(await readFile(join(cwd, '.canofold/deploy/netlify.toml'), 'utf8')).toContain(
      'publish = ".canofold/dist"'
    )
    const workflow = await readFile(join(cwd, '.canofold/deploy/github-pages.yml'), 'utf8')
    expect(workflow).toContain('pages: write')
    expect(workflow).toContain('id-token: write')
    expect(workflow).toContain('environment:')
    expect(workflow).toContain('actions/configure-pages@v5')
    expect(workflow).toContain('node-version: 22')
    expect(workflow).toContain('url: ${{ steps.deployment.outputs.page_url }}')
    expect(workflow).toContain('pnpm install --frozen-lockfile')
    expect(workflow).toContain('yarn install --immutable')
    expect(workflow).toContain('npm ci')
    expect(workflow).toContain('pnpm exec canofold build')
    expect(workflow).toContain('npm exec -- canofold build')
    expect(workflow).not.toContain('npx --yes canofold@')
    expect(workflow).toContain('Add canofold to package.json before deploying')
    expect(await readFile(join(cwd, '.canofold/deploy/netlify.toml'), 'utf8')).toContain(
      'command = "npm exec -- canofold build"'
    )
  })

  it('includes the configured URL mount path in deployment guidance', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-deploy-base-'))
    await writeFile(join(cwd, 'canofold.config.ts'), `export default { basePath: '/project/' }`)
    await mkdir(join(cwd, '.canofold/dist'), { recursive: true })
    await writeFile(join(cwd, '.canofold/dist/index.html'), '<!doctype html>')

    await runDeploy({ cwd })

    expect(await readFile(join(cwd, '.canofold/deploy/README.md'), 'utf8')).toContain('/project/')
    expect(await readFile(join(cwd, '.canofold/deploy/nginx.conf'), 'utf8')).toContain('location /project/')
  })

  it.each([
    ['pnpm-lock.yaml', 'pnpm exec canofold build'],
    ['yarn.lock', 'yarn exec canofold build'],
    ['package-lock.json', 'npm exec -- canofold build']
  ])('uses the project package manager in Netlify guidance for %s', async (lockfile, command) => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-deploy-manager-'))
    await mkdir(join(cwd, '.canofold/dist'), { recursive: true })
    await writeFile(join(cwd, '.canofold/dist/index.html'), '<!doctype html>')
    await writeFile(join(cwd, lockfile), '')

    await runDeploy({ cwd })

    expect(await readFile(join(cwd, '.canofold/deploy/netlify.toml'), 'utf8')).toContain(
      `command = ${JSON.stringify(command)}`
    )
  })

  it('requires a build output before writing deploy files', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-deploy-'))
    await expect(runDeploy({ cwd })).rejects.toThrow('Run canofold build before canofold deploy')
  })

  it('uses the configured output directory in generated deployment files', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-deploy-'))
    await writeFile(join(cwd, 'canofold.config.ts'), `export default { outputDir: 'public docs' }`)
    await mkdir(join(cwd, 'public docs'), { recursive: true })
    await writeFile(join(cwd, 'public docs/index.html'), '<!doctype html>')

    await runDeploy({ cwd })

    expect(await readFile(join(cwd, '.canofold/deploy/vercel.json'), 'utf8')).toContain(
      '"outputDirectory": "public docs"'
    )
    expect(await readFile(join(cwd, '.canofold/deploy/github-pages.yml'), 'utf8')).toContain(
      'path: "public docs"'
    )
    expect(await readFile(join(cwd, '.canofold/deploy/netlify.toml'), 'utf8')).toContain(
      'publish = "public docs"'
    )
    expect(await readFile(join(cwd, '.canofold/deploy/nginx.conf'), 'utf8')).toContain(
      'root "/var/www/canofold/public docs";'
    )
  })
})
