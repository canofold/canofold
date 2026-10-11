export function createDeterministicSummary({
  description,
  excerpt
}: {
  description: string
  excerpt: string
}) {
  return description.trim() || excerpt
}
