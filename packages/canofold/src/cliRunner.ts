import { buildOptionsFromArgs, initOptionsFromArgs, portFromArgs } from './cliArgs'

function printHelp() {
  console.log(`canofold

Commands:
  init [dir] [--locale <locale>] [--locales <locale,...>] [--docs-dir <path>]
                 Create or adopt documentation
  dev [--port <number>]
                 Start local docs server on a custom local port
  build [--no-cache]
                 Build static site, optionally ignoring the persistent cache
  clean          Remove generated output and the persistent build cache
  preview [--port <number>]
                 Preview .canofold/dist on a custom local port
  check          Run documentation checks
  deploy         Generate deployment guidance
`)
}

function assertArgumentCount(args: string[], maximum: number) {
  const unexpected = args[maximum]
  if (unexpected !== undefined) throw new Error(`Unknown option: ${unexpected}`)
}

export async function runCli(args: string[], cwd = process.cwd()) {
  const command = args[0] ?? 'help'
  if (command === 'help' || command === '--help' || command === '-h') {
    assertArgumentCount(args, 1)
    printHelp()
    return
  }

  if (command === 'init') {
    const { runInit } = await import('./commands/init')
    return runInit({ cwd, ...initOptionsFromArgs(args) })
  }

  if (command === 'build') {
    const { runBuild } = await import('./commands/build')
    return runBuild({ cwd, ...buildOptionsFromArgs(args) })
  }

  if (command === 'clean') {
    assertArgumentCount(args, 1)
    const { runClean } = await import('./commands/clean')
    return runClean({ cwd })
  }

  if (command === 'dev') {
    const { runDev } = await import('./commands/dev')
    return runDev({ cwd, port: portFromArgs(args) })
  }

  if (command === 'preview') {
    const { runPreview } = await import('./commands/preview')
    const port = portFromArgs(args)
    return runPreview({ cwd, port })
  }

  if (command === 'check') {
    assertArgumentCount(args, 1)
    const { runCheck } = await import('./commands/check')
    return runCheck({ cwd })
  }

  if (command === 'deploy') {
    assertArgumentCount(args, 1)
    const { runDeploy } = await import('./commands/deploy')
    return runDeploy({ cwd })
  }

  throw new Error(`Unknown command: ${command}`)
}
