#!/usr/bin/env node

import { runCli } from './cliRunner'
import { logError } from './utils/logger'

runCli(process.argv.slice(2)).catch((error) => {
  logError(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
