#!/usr/bin/env node

import { runCli } from './cliRunner'
import { logError } from './utils/logger'

const args = process.argv.slice(2)
runCli(args)
  .then((result) => {
    if (args[0] !== 'dev' || !process.send || !result || !('refresh' in result)) return
    let stopping = false
    const stop = () => {
      if (stopping) return
      stopping = true
      void result
        .close()
        .then(() => process.exit(0))
        .catch((error) => {
          logError(error instanceof Error ? error.message : String(error))
          process.exit(1)
        })
    }
    process.on('message', (message) => {
      if (!message || typeof message !== 'object' || !('type' in message)) return
      if (message.type === 'refresh') result.refresh()
      if (message.type === 'shutdown') stop()
    })
    process.once('disconnect', stop)
    process.send({ type: 'ready' })
  })
  .catch((error) => {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
