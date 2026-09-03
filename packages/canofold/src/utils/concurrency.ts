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
  let failure: unknown
  const workerCount = Math.min(Math.floor(concurrency), items.length)
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length && failure === undefined) {
        const index = cursor++
        try {
          results[index] = await transform(items[index]!, index)
        } catch (error) {
          failure ??= error
        }
      }
    })
  )
  if (failure) throw failure
  return results
}
