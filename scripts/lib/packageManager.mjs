export function packageManagerCommandFor(platform = process.platform) {
  return platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
}

export const pnpmCommand = packageManagerCommandFor()
