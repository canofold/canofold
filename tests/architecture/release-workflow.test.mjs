import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

test('release workflow accepts tags only from main history', async () => {
  const workflow = await readFile(join(root, '.github/workflows/release.yml'), 'utf8')
  const checkout = workflow.indexOf('uses: actions/checkout@v7')
  const sourceCheck = workflow.indexOf('name: Verify release tag source')
  const dependencies = workflow.indexOf('name: Install dependencies')

  assert.match(workflow, /fetch-depth: 0/)
  assert.match(workflow, /git merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/)
  assert.match(workflow, /Release tag must point to a commit reachable from main/)
  assert.ok(checkout !== -1 && sourceCheck !== -1 && dependencies !== -1)
  assert.ok(checkout < sourceCheck && sourceCheck < dependencies)
})
