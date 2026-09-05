import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

const repoRoot = fileURLToPath(new URL('.', import.meta.url))
const fromRoot = (path: string) => resolve(repoRoot, path)
const canofoldPackage = JSON.parse(
  readFileSync(new URL('./packages/canofold/package.json', import.meta.url), 'utf8')
) as { version: string }

export default defineConfig({
  define: {
    __CANOFOLD_VERSION__: JSON.stringify(canofoldPackage.version)
  },
  resolve: {
    alias: [
      {
        find: /^@canofold\/markdown\/server\/analyze$/,
        replacement: fromRoot('packages/markdown/src/server/analyze.ts')
      },
      { find: /^@canofold\/markdown\/client$/, replacement: fromRoot('packages/markdown/src/client.ts') },
      { find: /^@canofold\/markdown\/theme$/, replacement: fromRoot('packages/markdown/src/theme.ts') },
      { find: /^@canofold\/markdown\/server$/, replacement: fromRoot('packages/markdown/src/server.ts') },
      { find: /^@canofold\/markdown$/, replacement: fromRoot('packages/markdown/src/index.ts') }
    ]
  },
  test: {
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx', 'scripts/**/*.test.ts'],
    environment: 'node',
    // Shiki's first-run highlighter init (grammars + themes) is slow.
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: [
        'packages/markdown/src/**/*.{ts,tsx}',
        'packages/canofold/src/**/*.{ts,tsx}',
        'packages/plugins/src/**/*.{ts,tsx}'
      ],
      // cli.ts is a shebang-only process adapter exercised by the child-process smoke test.
      exclude: ['**/*.test.{ts,tsx}', 'packages/canofold/src/cli.ts'],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      skipFull: true,
      // Vitest 4 always uses AST-aware remapping. Keep the exact Node 22
      // remapped baseline here so coverage remains a no-regression gate.
      thresholds: {
        statements: 89.7,
        branches: 81.56,
        functions: 92.87,
        lines: 92.46,
        'packages/canofold/src/extensions/host.ts': {
          statements: 94.11,
          branches: 88.88,
          functions: 100,
          lines: 96.69
        },
        'packages/canofold/src/render/playgroundClient.tsx': {
          statements: 88.3,
          branches: 64.13,
          functions: 96.87,
          lines: 92.05
        },
        'packages/canofold/src/server/staticServer.ts': {
          statements: 88.51,
          branches: 78.57,
          functions: 92.85,
          lines: 90.44
        },
        'packages/canofold/src/build/cache.ts': {
          statements: 72.66,
          branches: 73.26,
          functions: 84.61,
          lines: 79.33
        },
        'packages/canofold/src/build/state.ts': {
          statements: 94.59,
          branches: 82.22,
          functions: 96.66,
          lines: 93.54
        },
        'packages/canofold/src/config/publicResource.ts': {
          statements: 80,
          branches: 80,
          functions: 100,
          lines: 80
        },
        'packages/canofold/src/render/renderMdx.tsx': {
          statements: 53.57,
          branches: 15.38,
          functions: 77.77,
          lines: 56
        },
        'packages/markdown/src/client/nativeBehaviors.ts': {
          statements: 79.34,
          branches: 64.39,
          functions: 87.03,
          lines: 83.25
        },
        'packages/markdown/src/compiler/syntaxFeatures.ts': {
          statements: 94.82,
          branches: 90,
          functions: 100,
          lines: 97.95
        },
        'packages/markdown/src/react/semanticOverrideProps.ts': {
          statements: 100,
          branches: 65,
          functions: 100,
          lines: 100
        },
        'packages/markdown/src/react/urlTransform.tsx': {
          statements: 90,
          branches: 79,
          functions: 100,
          lines: 90
        },
        'packages/plugins/src/client/mermaid.ts': {
          statements: 82.35,
          branches: 73.33,
          functions: 82.6,
          lines: 89.28
        },
        'packages/plugins/src/reading-time/index.ts': {
          statements: 95.91,
          branches: 88,
          functions: 100,
          lines: 100
        },
        'packages/plugins/src/shared/diagram.ts': {
          statements: 92.3,
          branches: 93,
          functions: 100,
          lines: 100
        }
      }
    }
  }
})
