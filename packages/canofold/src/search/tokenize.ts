export function tokenize(input: string) {
  const lower = input.toLowerCase()
  const english = lower.match(/[a-z0-9]+/g) ?? []
  const cjkTokens: string[] = []

  for (const match of lower.matchAll(/\p{Script=Han}+/gu)) {
    const chars = Array.from(match[0])
    cjkTokens.push(...chars)
    for (let index = 0; index < chars.length - 1; index += 1) {
      const first = chars[index]
      const second = chars[index + 1]
      if (first && second) cjkTokens.push(first + second)
    }
  }

  return Array.from(new Set([...english, ...cjkTokens]))
}
