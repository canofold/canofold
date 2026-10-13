import { describe, expect, it } from 'vitest'
import { resolveExternalDiagramServer } from './externalDiagramService'

describe('external diagram service configuration', () => {
  it.each(['', '   ', '/', '///', 'https://', 'kroki.example', 'ftp://kroki.example'])(
    'rejects an invalid server value %j',
    (server) => {
      expect(() => resolveExternalDiagramServer('Diagram', server)).toThrow(
        'Diagram server must be an HTTP(S) base URL without a query or fragment.'
      )
    }
  )

  it.each([
    'https://kroki.example/path?',
    'https://kroki.example/path?token=secret',
    'https://kroki.example/path#',
    'https://kroki.example/path#anchor'
  ])('rejects base URLs with a query or fragment: %s', (server) => {
    expect(() => resolveExternalDiagramServer('Diagram', server)).toThrow(
      'Diagram server must be an HTTP(S) base URL without a query or fragment.'
    )
  })

  it.each([
    [undefined, ''],
    ['https://kroki.example/', 'https://kroki.example'],
    [' http://localhost:8000/kroki/// ', 'http://localhost:8000/kroki']
  ])('normalizes %j to %j', (server, expected) => {
    expect(resolveExternalDiagramServer('Diagram', server)).toBe(expected)
  })
})
