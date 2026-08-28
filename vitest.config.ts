import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

const repoRoot = fileURLToPath(new URL('.', import.meta.url))
const fromRoot = (path: string) => resolve(repoRoot, path)
const docfusePackage = JSON.parse(
  readFileSync(new URL('./packages/docfuse/package.json', import.meta.url), 'utf8')
) as { version: string }

export default defineConfig({
  define: {
    __DOCFUSE_VERSION__: JSON.stringify(docfusePackage.version)
  },
  resolve: {
    alias: [
      {
        find: /^@docfuse\/markdown\/server\/analyze$/,
        replacement: fromRoot('packages/markdown/src/server/analyze.ts')
      },
      { find: /^@docfuse\/markdown\/client$/, replacement: fromRoot('packages/markdown/src/client.ts') },
      { find: /^@docfuse\/markdown\/theme$/, replacement: fromRoot('packages/markdown/src/theme.ts') },
      { find: /^@docfuse\/markdown\/server$/, replacement: fromRoot('packages/markdown/src/server.ts') },
      { find: /^@docfuse\/markdown$/, replacement: fromRoot('packages/markdown/src/index.ts') }
    ]
  },
  test: {
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx', 'scripts/**/*.test.ts'],
    environment: 'node',
    // Shiki's first-run highlighter init (grammars + themes) is slow.
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      all: true,
      include: [
        'packages/markdown/src/**/*.{ts,tsx}',
        'packages/docfuse/src/**/*.{ts,tsx}',
        'packages/plugins/src/**/*.{ts,tsx}'
      ],
      // cli.ts is a shebang-only process adapter exercised by the child-process smoke test.
      exclude: ['**/*.test.{ts,tsx}', 'packages/docfuse/src/cli.ts'],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      skipFull: true,
      thresholds: {
        statements: 93,
        branches: 85,
        functions: 92,
        lines: 93,
        'packages/docfuse/src/extensions/host.ts': {
          statements: 96,
          branches: 90,
          functions: 100,
          lines: 96
        },
        'packages/docfuse/src/render/playgroundClient.tsx': {
          statements: 85,
          branches: 60,
          functions: 100,
          lines: 85
        },
        'packages/docfuse/src/server/staticServer.ts': {
          statements: 90,
          branches: 80,
          functions: 90,
          lines: 90
        },
        'packages/docfuse/src/build/cache.ts': {
          statements: 80,
          branches: 75,
          functions: 90,
          lines: 80
        },
        'packages/docfuse/src/build/state.ts': {
          statements: 93,
          branches: 87,
          functions: 100,
          lines: 93
        },
        'packages/docfuse/src/config/publicResource.ts': {
          statements: 80,
          branches: 80,
          functions: 100,
          lines: 80
        },
        'packages/docfuse/src/render/renderMdx.tsx': {
          statements: 75,
          branches: 90,
          functions: 100,
          lines: 75
        },
        'packages/markdown/src/client/nativeBehaviors.ts': {
          statements: 80,
          branches: 70,
          functions: 85,
          lines: 80
        },
        'packages/markdown/src/compiler/syntaxFeatures.ts': {
          statements: 100,
          branches: 90,
          functions: 100,
          lines: 100
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
          statements: 92,
          branches: 75,
          functions: 100,
          lines: 92
        },
        'packages/plugins/src/reading-time/index.ts': {
          statements: 100,
          branches: 88,
          functions: 100,
          lines: 100
        },
        'packages/plugins/src/shared/diagram.ts': {
          statements: 100,
          branches: 93,
          functions: 100,
          lines: 100
        }
      }
    }
  }
})
