import { execFileSync } from 'node:child_process'

export function packageManagerInvocationFor(args, platform = process.platform, commandShell = 'cmd.exe') {
  if (platform === 'win32') {
    return {
      command: commandShell || 'cmd.exe',
      args: ['/d', '/s', '/c', 'pnpm.cmd', ...args]
    }
  }

  return { command: 'pnpm', args }
}

export function execPnpmSync(args, options) {
  const invocation = packageManagerInvocationFor(args)
  return execFileSync(invocation.command, invocation.args, options)
}
