export async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  transform: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    throw new Error('Concurrency must be a positive finite number')
  }
  const results = new Array<R>(items.length)
  let cursor = 0
  let failed = false
  let failure: unknown
  const workerCount = Math.min(Math.floor(concurrency), items.length)
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length && !failed) {
        const index = cursor++
        try {
          results[index] = await transform(items[index]!, index)
        } catch (error) {
          if (!failed) {
            failed = true
            failure = error
          }
        }
      }
    })
  )
  if (failed) throw failure
  return results
}
