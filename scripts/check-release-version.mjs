import { readFileSync } from 'node:fs'

const tag = process.argv[2]

if (!tag || !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
  throw new Error('Release tag must use the v<semver> format')
}

const expectedVersion = tag.slice(1)
const packageFiles = [
  'packages/markdown/package.json',
  'packages/canofold/package.json',
  'packages/plugins/package.json'
]

for (const packageFile of packageFiles) {
  const packageJson = JSON.parse(readFileSync(packageFile, 'utf8'))
  if (packageJson.version !== expectedVersion) {
    throw new Error(
      `${packageJson.name} has version ${packageJson.version}; expected ${expectedVersion} from ${tag}`
    )
  }
}

const changelog = readFileSync('CHANGELOG.md', 'utf8')
if (!changelog.includes(`## ${expectedVersion} -`)) {
  throw new Error(`CHANGELOG.md has no ${expectedVersion} release section`)
}

console.log(`Release metadata matches ${tag}`)
