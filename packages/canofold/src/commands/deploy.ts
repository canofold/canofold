import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadConfig } from '../config/load'
import { logInfo } from '../utils/logger'
import { pathExists, resolveOutputRoot } from '../utils/paths'

function quoteNginxValue(value: string) {
  return `"${value.replace(/[\\"$]/g, '\\$&')}"`
}

type PackageManager = 'npm' | 'pnpm' | 'yarn'

async function detectPackageManager(cwd: string): Promise<PackageManager> {
  if (await pathExists(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (await pathExists(join(cwd, 'yarn.lock'))) return 'yarn'
  try {
    const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as {
      packageManager?: unknown
    }
    if (typeof pkg.packageManager === 'string') {
      if (pkg.packageManager.startsWith('pnpm@')) return 'pnpm'
      if (pkg.packageManager.startsWith('yarn@')) return 'yarn'
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
  }
  return 'npm'
}

function createGuides(
  outputDir: string,
  basePath: string,
  packageManager: PackageManager
): Record<string, string> {
  const outputPath = outputDir.replaceAll('\\', '/')
  const nginxRoot = quoteNginxValue(`/var/www/canofold/${outputPath.replace(/^\/+/, '')}`)
  const nginxBasePattern = basePath.replace(/\/$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const nginxLocation =
    basePath === '/'
      ? `  location / {
    try_files $uri $uri/ =404;
  }`
      : `  location = ${basePath.replace(/\/$/, '')} {
    return 308 ${basePath};
  }

  location ${basePath} {
    rewrite ^${nginxBasePattern}/(.*)$ /$1 break;
    try_files $uri $uri/ =404;
  }

  location / {
    return 404;
  }`
  const quotedOutputPath = JSON.stringify(outputPath)
  const buildCommand = {
    npm: 'npm exec -- canofold build',
    pnpm: 'pnpm exec canofold build',
    yarn: 'yarn exec canofold build'
  }[packageManager]
  const shared = `Deploy directory:

\`\`\`txt
${outputPath}
\`\`\`

Serve this directory at URL path \`${basePath}\`.

Canofold does not provide hosting, permissions, accounts, analytics, or server runtime.
`

  return {
    'README.md': `# Canofold Deployment

${shared}

Supported static hosts:

- GitHub Pages
- Cloudflare Pages
- Vercel
- Netlify
- Nginx
- Object storage
`,
    'github-pages.md': `# GitHub Pages

${shared}

Use \`${outputPath}\` as the published static artifact.
`,
    'github-pages.yml': `name: Deploy Canofold

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  pages:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: actions/configure-pages@v5
      - name: Install dependencies
        shell: bash
        run: |
          if [[ -f pnpm-lock.yaml ]]; then
            corepack enable
            pnpm install --frozen-lockfile
          elif [[ -f yarn.lock ]]; then
            corepack enable
            yarn install --immutable
          elif [[ -f package-lock.json ]]; then
            npm ci
          elif [[ -f package.json ]]; then
            npm install
          fi
      - name: Build documentation
        shell: bash
        run: |
          if [[ -f pnpm-lock.yaml ]]; then
            pnpm exec canofold build
          elif [[ -f yarn.lock ]]; then
            yarn exec canofold build
          elif [[ -f package.json ]]; then
            npm exec -- canofold build
          else
            echo "Add canofold to package.json before deploying" >&2
            exit 1
          fi
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ${quotedOutputPath}
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`,
    'cloudflare-pages.md': `# Cloudflare Pages

${shared}

Set the output directory to \`${outputPath}\`.
`,
    'vercel.md': `# Vercel

${shared}

Use \`${outputPath}\` as the output directory.
`,
    'vercel.json': `{
  "outputDirectory": ${quotedOutputPath}
}
`,
    'netlify.md': `# Netlify

${shared}

Use \`${outputPath}\` as the publish directory.
`,
    'netlify.toml': `[build]
  publish = ${quotedOutputPath}
  command = ${JSON.stringify(buildCommand)}
`,
    'nginx.md': `# Nginx

${shared}

Serve \`${outputPath}\` as a static directory.
`,
    'nginx.conf': `# NOTE: Update the 'root' path below to match your server's document root.
# The default /var/www/canofold/ is a placeholder — adjust it to where you
# copied the built output (the contents of the '${outputPath}' directory).
server {
  listen 80;
  server_name _;
  root ${nginxRoot};
  index index.html;
  error_page 404 /404.html;

  location = /404.html {
    internal;
  }

${nginxLocation}
}
`
  }
}

export async function runDeploy({ cwd }: { cwd: string }) {
  const config = await loadConfig(cwd)
  const outputRoot = resolveOutputRoot(cwd, config.outputDir)
  if (!(await pathExists(join(outputRoot, 'index.html')))) {
    throw new Error(
      `Build output not found at ${config.outputDir}. Run canofold build before canofold deploy.`
    )
  }

  const deployDir = join(cwd, '.canofold/deploy')
  const packageManager = await detectPackageManager(cwd)
  await mkdir(deployDir, { recursive: true })
  for (const [file, content] of Object.entries(
    createGuides(config.outputDir, config.basePath, packageManager)
  )) {
    await writeFile(join(deployDir, file), content)
  }
  logInfo(`Wrote deployment guides to ${deployDir}`)
}
