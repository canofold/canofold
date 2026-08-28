import { describe, expect, it } from 'vitest'
import { buildOptionsFromArgs, initOptionsFromArgs, portFromArgs } from './cliArgs'

describe('buildOptionsFromArgs', () => {
  it('supports a single --no-cache flag and rejects other options', () => {
    expect(buildOptionsFromArgs(['build'])).toEqual({ noCache: false })
    expect(buildOptionsFromArgs(['build', '--no-cache'])).toEqual({ noCache: true })
    expect(() => buildOptionsFromArgs(['build', '--no-cache', '--no-cache'])).toThrow(
      'Unknown option: --no-cache'
    )
    expect(() => buildOptionsFromArgs(['build', '--force'])).toThrow('Unknown option: --force')
  })
})

describe('portFromArgs', () => {
  it('returns undefined when --port is absent and parses a valid port', () => {
    expect(portFromArgs(['preview'])).toBeUndefined()
    expect(portFromArgs(['preview', '--port', '4173'])).toBe(4173)
  })

  it('rejects missing, option-like, and out-of-range values', () => {
    expect(() => portFromArgs(['preview', '--port'])).toThrow('Missing value for --port')
    expect(() => portFromArgs(['preview', '--port', '--help'])).toThrow('Missing value for --port')
    expect(() => portFromArgs(['preview', '--port', '65536'])).toThrow('Invalid port')
    expect(() => portFromArgs(['preview', '--port', '4173', '--open'])).toThrow('Unknown option: --open')
    expect(() => portFromArgs(['preview', '--port', '4173', '--port', '4174'])).toThrow(
      '--port may only be specified once'
    )
    expect(() => portFromArgs(['dev', '--watch-source'])).toThrow('Unknown option: --watch-source')
  })
})

describe('initOptionsFromArgs', () => {
  it('parses a project directory and language options in any order', () => {
    expect(
      initOptionsFromArgs([
        'init',
        '--locale',
        'en',
        'my-docs',
        '--locales',
        'en,zh',
        '--docs-dir',
        'handbook'
      ])
    ).toEqual({
      targetDir: 'my-docs',
      locale: 'en',
      locales: ['en', 'zh'],
      docsDir: 'handbook'
    })
  })

  it('rejects duplicate, missing, and invalid init options', () => {
    expect(() => initOptionsFromArgs(['init', '--locale'])).toThrow('Missing value for --locale')
    expect(() => initOptionsFromArgs(['init', '--locale', 'zh', '--locale', 'en'])).toThrow(
      '--locale may only be specified once'
    )
    expect(() => initOptionsFromArgs(['init', '--locales', 'zh,,en'])).toThrow(
      '--locales must be a comma-separated list'
    )
    expect(() => initOptionsFromArgs(['init', '--locales', 'zh,ZH'])).toThrow(
      '--locales must not contain duplicate locales'
    )
    expect(() => initOptionsFromArgs(['init', '--locale', 'en', '--locales', 'zh,ja'])).toThrow(
      '--locale en must be included in --locales'
    )
    expect(() => initOptionsFromArgs(['init', '--locale', 'not_a_locale'])).toThrow(
      'Invalid locale: not_a_locale'
    )
    expect(() => initOptionsFromArgs(['init', 'one', 'two'])).toThrow('Unknown option: two')
  })

  it('canonicalizes locale aliases before duplicate and inclusion checks', () => {
    expect(initOptionsFromArgs(['init', '--locale', 'iw', '--locales', 'he,en-us'])).toMatchObject({
      locale: 'he',
      locales: ['he', 'en-US']
    })
    expect(() => initOptionsFromArgs(['init', '--locales', 'iw,he'])).toThrow(
      '--locales must not contain duplicate locales'
    )
  })
})
