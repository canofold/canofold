import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import { trackedMkdtemp } from '../../test/fixtures'
import { acquireProjectLock } from './projectLock'

it('allows only one simultaneous dev owner while keeping build ownership independent', async () => {
  const root = await trackedMkdtemp(join(tmpdir(), 'canofold-dev-contenders-'))
  const contenders = await Promise.allSettled(
    Array.from({ length: 16 }, () => acquireProjectLock(root, 'dev'))
  )
  const owners = contenders.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
  onTestFinished(async () => {
    await Promise.all(owners.map((owner) => owner.release()))
  })
  expect(owners).toHaveLength(1)
  for (const result of contenders) {
    if (result.status === 'rejected') expect(result.reason.message).toMatch(/Canofold dev.*already running/)
  }
  const build = await acquireProjectLock(root, 'build')
  await build.release()
  await owners[0]!.assertOwned()
  await Promise.all([owners[0]!.release(), owners[0]!.release()])
  const restarted = await acquireProjectLock(root, 'dev')
  await restarted.release()
})

it('reclaims a freshly orphaned dev lock without waiting for expiry', async () => {
  const root = await trackedMkdtemp(join(tmpdir(), 'canofold-dev-orphan-'))
  await mkdir(root, { recursive: true })
  await writeFile(
    join(root, 'dev.lock'),
    JSON.stringify({
      ownerId: 'crashed',
      pid: 999_999_999,
      hostname: hostname(),
      createdAt: Date.now()
    })
  )
  const lock = await acquireProjectLock(root, 'dev')
  onTestFinished(() => lock.release())
  expect(JSON.parse(await readFile(join(root, 'dev.lock'), 'utf8')).ownerId).not.toBe('crashed')
  await lock.assertOwned()
})

it('renews an idle dev session beyond the stale-lock interval', async () => {
  const root = await trackedMkdtemp(join(tmpdir(), 'canofold-dev-heartbeat-'))
  vi.useFakeTimers()
  onTestFinished(() => {
    vi.useRealTimers()
  })
  const lock = await acquireProjectLock(root, 'dev')
  onTestFinished(() => lock.release())
  const before = (await stat(join(root, 'dev.lock'))).mtimeMs
  await vi.advanceTimersByTimeAsync(11 * 60 * 1000)
  await vi.waitFor(async () => {
    expect((await stat(join(root, 'dev.lock'))).mtimeMs).toBeGreaterThan(before)
  })
  await expect(acquireProjectLock(root, 'dev')).rejects.toThrow(/Canofold dev.*already running/)
  await lock.assertOwned()
})
