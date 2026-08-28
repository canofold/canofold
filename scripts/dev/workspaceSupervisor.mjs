import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export function pipePrefixedOutput(stream, target, prefix) {
  let pending = ''
  const flush = (includePartial = false) => {
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) target.write(`${prefix} ${line}\n`)
    if (includePartial && pending) {
      target.write(`${prefix} ${pending}\n`)
      pending = ''
    }
  }
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    pending += chunk
    flush()
  })
  stream.once('end', () => flush(true))
}

function stopChild(child, timeoutMs = 5_000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolveStop) => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      child.off('exit', finish)
      child.off('close', finish)
      resolveStop()
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
    }, timeoutMs)
    child.once('exit', finish)
    child.once('close', finish)
    child.kill('SIGTERM')
  })
}

export function createWorkspaceSupervisor({
  processes,
  spawnProcess = spawn,
  stdout = process.stdout,
  stderr = process.stderr,
  onUnexpectedExit = () => {}
}) {
  const children = []
  let closing = false

  try {
    for (const processConfig of processes) {
      const child = spawnProcess(processConfig.command, processConfig.args, {
        cwd: processConfig.cwd,
        env: processConfig.env,
        stdio: ['inherit', 'pipe', 'pipe']
      })
      children.push({ ...processConfig, child })
      if (child.stdout) pipePrefixedOutput(child.stdout, stdout, `[${processConfig.name}]`)
      if (child.stderr) pipePrefixedOutput(child.stderr, stderr, `[${processConfig.name}]`)
      child.once('error', (error) => {
        if (!closing) onUnexpectedExit(processConfig.name, error)
      })
      child.once('exit', (code, signal) => {
        if (!closing) {
          onUnexpectedExit(
            processConfig.name,
            new Error(`${processConfig.name} exited unexpectedly (${signal ?? code ?? 'unknown'})`)
          )
        }
      })
    }
  } catch (error) {
    closing = true
    for (const { child } of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    }
    throw error
  }

  return {
    async close() {
      if (closing) return
      closing = true
      await Promise.all(children.map(({ child }) => stopChild(child)))
    }
  }
}

export function workspaceProcessConfigs({
  debug = false,
  port = process.env.PORT,
  env = process.env,
  workspaceId = randomUUID()
} = {}) {
  const sharedEnv = { ...env, DOCFUSE_DEV_WORKSPACE_ID: workspaceId }
  if (debug) sharedEnv.DOCFUSE_DEV_INSPECT = env.DOCFUSE_DEV_INSPECT || '9230'
  else delete sharedEnv.DOCFUSE_DEV_INSPECT
  if (port) sharedEnv.PORT = port
  return [
    {
      name: 'markdown',
      command: process.execPath,
      args: [join(repoRoot, 'scripts/dev/watchMarkdown.mjs')],
      cwd: repoRoot,
      env: sharedEnv
    },
    {
      name: 'docfuse',
      command: process.execPath,
      args: [join(repoRoot, 'scripts/dev/watchDocfuse.mjs')],
      cwd: repoRoot,
      env: sharedEnv
    },
    {
      name: 'site',
      command: process.execPath,
      args: [join(repoRoot, 'scripts/dev/runLinkedSite.mjs')],
      cwd: repoRoot,
      env: sharedEnv
    }
  ]
}
