import { defineConfig } from 'tsup'
import { signalWatchBuild } from '../../scripts/watchSignal'

export default defineConfig((overrideOptions) => ({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  clean: !overrideOptions.watch,
  splitting: false,
  sourcemap: false,
  onSuccess: () => signalWatchBuild('themes')
}))
