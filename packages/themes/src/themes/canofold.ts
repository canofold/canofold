import { defineTheme } from '../defineTheme'

export const canofold = defineTheme({
  id: 'canofold',
  name: { zh: 'Canofold', en: 'Canofold' },
  styles: ['@canofold/themes/canofold.css', '@canofold/themes/canofold-site.css'],
  appearances: [
    { id: 'light', name: { zh: '浅色', en: 'Light' }, colorScheme: 'light' },
    { id: 'dark', name: { zh: '深色', en: 'Dark' }, colorScheme: 'dark' }
  ]
})
