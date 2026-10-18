import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'

const site = process.env.CANOFOLD_NAVIGATION_SITE
const cli = process.env.CANOFOLD_NAVIGATION_CLI
const mode = process.env.CANOFOLD_NAVIGATION_MODE
if (!site || !cli)
  throw new Error('Run test:site-browser or test:playground-navigation to prepare the consumer')
if (mode !== 'packed' && mode !== 'playground') throw new Error('Missing navigation consumer mode')
const port = mode === 'packed' ? 4186 : 4185

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 3,
  outputDir: `test-results/navigation-${mode}`,
  reporter: [['line'], ['html', { open: 'never', outputFolder: `playwright-report/navigation-${mode}` }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: ['chromium', 'firefox', 'webkit'].map((browserName) => ({
    name: browserName,
    use: { browserName: browserName as 'chromium' | 'firefox' | 'webkit' }
  })),
  webServer: {
    command: `${JSON.stringify(process.execPath)} ${JSON.stringify(resolve(cli))} preview --port ${port}`,
    cwd: site,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 }
  }
})
