import { z } from 'zod'
import { assertRoutePath, canonicalRoutePath } from '../content/routes'

export const publicResourceSchema = z
  .string()
  .min(1)
  .refine((value) => {
    if (value.startsWith('/')) {
      if (value.startsWith('//')) return false
      try {
        assertRoutePath(value)
        return true
      } catch {
        return false
      }
    }
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && !url.username && !url.password
    } catch {
      return false
    }
  }, 'Resource must be an absolute site path or HTTPS URL')
  .transform((value) => (value.startsWith('/') ? canonicalRoutePath(value) : value))
