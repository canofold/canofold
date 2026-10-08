import { defineConfig } from 'tsup'
import { signalWatchBuild } from '../../scripts/watchSignal'

export default defineConfig((overrideOptions) => ({
  entry: { index: 'src/index.ts', 'demo-runtime': 'src/client.tsx' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  dts: true,
  clean: !overrideOptions.watch,
  splitting: false,
  sourcemap: true,
  external: ['canofold', 'vite'],
  onSuccess: () => signalWatchBuild('vite')
}))
